const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireAdminOrSupport } = require('../middleware/auth');
const { 
  sendSMS, 
  sendCallSummary, 
  sendSubscriptionNotification, 
  sendEmergencyAlert,
  getDeliveryStatus,
  getProviderName 
} = require('../services/smsService');
const router = express.Router();

// Helper function to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// @route   POST /api/sms/send
// @desc    Send custom SMS (Admin/Support only)
// @access  Private/Admin
router.post('/send', authenticateToken, requireAdminOrSupport, [
  body('phoneNumber')
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Please enter a valid Indian mobile number'),
  body('message')
    .trim()
    .notEmpty()
    .isLength({ max: 1000 })
    .withMessage('Message is required and must not exceed 1000 characters'),
  body('templateId')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Template ID too long')
], handleValidationErrors, async (req, res) => {
  try {
    const { phoneNumber, message, templateId } = req.body;

    const result = await sendSMS(phoneNumber, message, templateId);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'SMS sent successfully',
        data: {
          messageId: result.messageId,
          provider: getProviderName()
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send SMS',
        error: result.error
      });
    }

  } catch (error) {
    console.error('Send SMS error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send SMS'
    });
  }
});

// @route   POST /api/sms/send-bulk
// @desc    Send bulk SMS (Admin only)
// @access  Private/Admin
router.post('/send-bulk', authenticateToken, requireAdminOrSupport, [
  body('phoneNumbers')
    .isArray({ min: 1, max: 100 })
    .withMessage('Phone numbers must be an array with 1-100 numbers'),
  body('phoneNumbers.*')
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Each phone number must be a valid Indian mobile number'),
  body('message')
    .trim()
    .notEmpty()
    .isLength({ max: 1000 })
    .withMessage('Message is required and must not exceed 1000 characters'),
  body('templateId')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Template ID too long')
], handleValidationErrors, async (req, res) => {
  try {
    const { phoneNumbers, message, templateId } = req.body;

    const results = [];
    const batchSize = 10; // Process in batches to avoid overwhelming the SMS service

    for (let i = 0; i < phoneNumbers.length; i += batchSize) {
      const batch = phoneNumbers.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (phoneNumber) => {
        try {
          const result = await sendSMS(phoneNumber, message, templateId);
          return {
            phoneNumber,
            success: result.success,
            messageId: result.messageId,
            error: result.error
          };
        } catch (error) {
          return {
            phoneNumber,
            success: false,
            error: error.message
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add a small delay between batches
      if (i + batchSize < phoneNumbers.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    res.status(200).json({
      success: true,
      message: `Bulk SMS completed. ${successCount} sent, ${failureCount} failed.`,
      data: {
        total: results.length,
        successful: successCount,
        failed: failureCount,
        results,
        provider: getProviderName()
      }
    });

  } catch (error) {
    console.error('Send bulk SMS error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send bulk SMS'
    });
  }
});

// @route   POST /api/sms/send-call-summary
// @desc    Send call summary SMS (Admin/Support only)
// @access  Private/Admin
router.post('/send-call-summary', authenticateToken, requireAdminOrSupport, [
  body('phoneNumber')
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Please enter a valid Indian mobile number'),
  body('callSummary')
    .trim()
    .notEmpty()
    .isLength({ max: 2000 })
    .withMessage('Call summary is required and must not exceed 2000 characters')
], handleValidationErrors, async (req, res) => {
  try {
    const { phoneNumber, callSummary } = req.body;

    const result = await sendCallSummary(phoneNumber, callSummary);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Call summary SMS sent successfully',
        data: {
          messageId: result.messageId,
          provider: getProviderName()
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send call summary SMS',
        error: result.error
      });
    }

  } catch (error) {
    console.error('Send call summary SMS error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send call summary SMS'
    });
  }
});

// @route   POST /api/sms/send-subscription-notification
// @desc    Send subscription notification SMS (Admin/Support only)
// @access  Private/Admin
router.post('/send-subscription-notification', authenticateToken, requireAdminOrSupport, [
  body('phoneNumber')
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Please enter a valid Indian mobile number'),
  body('type')
    .isIn(['activation', 'expiry_warning', 'expired', 'renewal'])
    .withMessage('Invalid notification type'),
  body('data')
    .isObject()
    .withMessage('Data must be an object'),
  body('data.plan')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Plan name too long'),
  body('data.daysLeft')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Days left must be a positive integer')
], handleValidationErrors, async (req, res) => {
  try {
    const { phoneNumber, type, data } = req.body;

    const result = await sendSubscriptionNotification(phoneNumber, type, data);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Subscription notification SMS sent successfully',
        data: {
          messageId: result.messageId,
          type,
          provider: getProviderName()
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send subscription notification SMS',
        error: result.error
      });
    }

  } catch (error) {
    console.error('Send subscription notification SMS error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send subscription notification SMS'
    });
  }
});

// @route   POST /api/sms/send-emergency-alert
// @desc    Send emergency alert SMS (Admin/Support only)
// @access  Private/Admin
router.post('/send-emergency-alert', authenticateToken, requireAdminOrSupport, [
  body('phoneNumber')
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Please enter a valid Indian mobile number'),
  body('alertMessage')
    .trim()
    .notEmpty()
    .isLength({ max: 500 })
    .withMessage('Alert message is required and must not exceed 500 characters')
], handleValidationErrors, async (req, res) => {
  try {
    const { phoneNumber, alertMessage } = req.body;

    const result = await sendEmergencyAlert(phoneNumber, alertMessage);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Emergency alert SMS sent successfully',
        data: {
          messageId: result.messageId,
          provider: getProviderName()
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to send emergency alert SMS',
        error: result.error
      });
    }

  } catch (error) {
    console.error('Send emergency alert SMS error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send emergency alert SMS'
    });
  }
});

// @route   GET /api/sms/status/:messageId
// @desc    Get SMS delivery status
// @access  Private/Admin
router.get('/status/:messageId', authenticateToken, requireAdminOrSupport, async (req, res) => {
  try {
    const { messageId } = req.params;

    const result = await getDeliveryStatus(messageId);

    if (result.success) {
      res.status(200).json({
        success: true,
        data: {
          messageId,
          status: result.status,
          provider: getProviderName()
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to get delivery status',
        error: result.error
      });
    }

  } catch (error) {
    console.error('Get SMS status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get SMS delivery status'
    });
  }
});

// @route   GET /api/sms/provider-info
// @desc    Get SMS provider information
// @access  Private/Admin
router.get('/provider-info', authenticateToken, requireAdminOrSupport, (req, res) => {
  try {
    const providerInfo = {
      provider: getProviderName(),
      tollFreeNumber: process.env.TOLL_FREE_NUMBER || '1800-123-4567',
      senderId: process.env.MSG91_SENDER_ID || 'PRANMT',
      features: {
        otp: true,
        transactional: true,
        promotional: true,
        bulk: true,
        deliveryStatus: true
      },
      limits: {
        singleMessage: 1000, // characters
        bulkBatch: 100, // numbers per batch
        rateLimit: '100/hour' // messages per hour
      }
    };

    res.status(200).json({
      success: true,
      data: providerInfo
    });

  } catch (error) {
    console.error('Get provider info error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get provider information'
    });
  }
});

// @route   POST /api/sms/test
// @desc    Test SMS service (Admin only)
// @access  Private/Admin
router.post('/test', authenticateToken, requireAdminOrSupport, [
  body('phoneNumber')
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Please enter a valid Indian mobile number')
], handleValidationErrors, async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    const testMessage = `Test message from Prani Mitra SMS service. Sent at ${new Date().toLocaleString('en-IN')}. If you received this, the service is working correctly.`;

    const result = await sendSMS(phoneNumber, testMessage);

    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'Test SMS sent successfully',
        data: {
          messageId: result.messageId,
          provider: getProviderName(),
          testMessage
        }
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Test SMS failed',
        error: result.error,
        provider: getProviderName()
      });
    }

  } catch (error) {
    console.error('Test SMS error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test SMS'
    });
  }
});

module.exports = router;
