const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Call = require('../models/Call');
const Plan = require('../models/Plan');
const { authenticateToken, requireActiveSubscription, requireAdminOrSupport, callRateLimit } = require('../middleware/auth');
// SMS services removed - using password-based authentication
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

// Helper function to generate unique call ID
const generateCallId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return `CALL_${timestamp}_${random}`.toUpperCase();
};

// @route   POST /api/calls/initiate
// @desc    Initiate a new call
// @access  Private
router.post('/initiate', callRateLimit, authenticateToken, requireActiveSubscription, [
  body('phoneNumber')
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Please enter a valid Indian mobile number'),
  body('language')
    .isIn(['english', 'hindi', 'telugu'])
    .withMessage('Language must be english, hindi, or telugu'),
  body('queryType')
    .isIn(['animal_health', 'crop_guidance', 'nutrition', 'emergency', 'general'])
    .withMessage('Invalid query type'),
  body('location.state')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('State name too long'),
  body('location.district')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('District name too long')
], handleValidationErrors, async (req, res) => {
  try {
    const userId = req.userId;
    const user = req.user;
    const { phoneNumber, language, queryType, location, isEmergency } = req.body;

    // Get user's plan
    let plan = null;
    if (user.subscription.planId) {
      plan = await Plan.findById(user.subscription.planId);
    }

    // Check if user can make a call
    if (!user.canMakeCall(plan)) {
      let message = 'Call limit exceeded';
      let code = 'CALL_LIMIT_EXCEEDED';
      
      if (user.subscription.status === 'free') {
        message = 'Free tier monthly limit exceeded. Please upgrade to continue.';
        code = 'FREE_LIMIT_EXCEEDED';
      } else if (!user.hasActiveSubscription()) {
        message = 'Active subscription required';
        code = 'SUBSCRIPTION_REQUIRED';
      }
      
      return res.status(403).json({
        success: false,
        message,
        code,
        usage: {
          monthlyCallsUsed: user.usage.monthlyCallsUsed,
          limit: user.subscription.status === 'free' ? 10 : plan?.limits.callLimit
        }
      });
    }

    // Generate call ID
    const callId = generateCallId();

    // Create call record
    const call = new Call({
      userId,
      callId,
      phoneNumber,
      language,
      queryType,
      location: location || user.location || {},
      isEmergency: isEmergency || false,
      callDetails: {
        startTime: new Date(),
        status: 'initiated'
      }
    });

    await call.save();

    // Update user usage
    user.usage.totalCalls += 1;
    user.usage.monthlyCallsUsed += 1;
    user.usage.lastCallDate = new Date();
    await user.save();

    // Prepare response
    const callData = {
      callId: call.callId,
      id: call._id,
      phoneNumber: call.phoneNumber,
      language: call.language,
      queryType: call.queryType,
      isEmergency: call.isEmergency,
      status: call.callDetails.status,
      startTime: call.callDetails.startTime,
      tollFreeNumber: process.env.TOLL_FREE_NUMBER || '1800-123-4567',
      instructions: {
        en: 'Call the toll-free number and follow the voice prompts to connect with our AI assistant.',
        hi: 'टोल-फ्री नंबर पर कॉल करें और हमारे AI सहायक से जुड़ने के लिए वॉयस प्रॉम्प्ट का पालन करें।',
        te: 'టోల్-ఫ్రీ నంబర్‌కు కాల్ చేసి, మా AI అసిస్టెంట్‌తో కనెక్ట్ అవ్వడానికి వాయిస్ ప్రాంప్ట్‌లను అనుసరించండి।'
      }
    };

    res.status(201).json({
      success: true,
      message: 'Call initiated successfully',
      data: callData
    });

  } catch (error) {
    console.error('Initiate call error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to initiate call'
    });
  }
});

// @route   PUT /api/calls/:callId/connect
// @desc    Mark call as connected (used by telephony system)
// @access  Private/System
router.put('/:callId/connect', authenticateToken, [
  body('actualPhoneNumber')
    .optional()
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Please enter a valid Indian mobile number')
], handleValidationErrors, async (req, res) => {
  try {
    const { callId } = req.params;
    const { actualPhoneNumber } = req.body;

    const call = await Call.findOne({ 
      $or: [
        { _id: callId },
        { callId: callId }
      ]
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    // Update call status
    call.callDetails.status = 'connected';
    if (actualPhoneNumber) {
      call.phoneNumber = actualPhoneNumber;
    }
    
    await call.save();

    res.status(200).json({
      success: true,
      message: 'Call connected',
      data: {
        callId: call.callId,
        status: call.callDetails.status
      }
    });

  } catch (error) {
    console.error('Connect call error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to connect call'
    });
  }
});

// @route   PUT /api/calls/:callId/complete
// @desc    Complete call with AI response
// @access  Private/System
router.put('/:callId/complete', authenticateToken, [
  body('query.text')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Query text too long'),
  body('query.transcription')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Transcription too long'),
  body('response.text')
    .trim()
    .notEmpty()
    .isLength({ max: 5000 })
    .withMessage('Response text is required and must not exceed 5000 characters'),
  body('response.confidence')
    .optional()
    .isFloat({ min: 0, max: 1 })
    .withMessage('Confidence must be between 0 and 1'),
  body('aiMetadata.model')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Model name too long'),
  body('aiMetadata.processingTime')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Processing time must be a positive integer'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array')
], handleValidationErrors, async (req, res) => {
  try {
    const { callId } = req.params;
    const { query, response, aiMetadata, tags } = req.body;

    const call = await Call.findOne({ 
      $or: [
        { _id: callId },
        { callId: callId }
      ]
    }).populate('userId');

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    // Update call with response data
    call.query = {
      text: query?.text || '',
      transcription: query?.transcription || '',
      audioUrl: query?.audioUrl || ''
    };

    call.response = {
      text: response.text,
      confidence: response.confidence || 0.8,
      audioUrl: response.audioUrl || ''
    };

    call.callDetails.endTime = new Date();
    call.callDetails.status = 'completed';

    if (aiMetadata) {
      call.aiMetadata = {
        model: aiMetadata.model || 'unknown',
        version: aiMetadata.version || '1.0',
        processingTime: aiMetadata.processingTime || 0,
        tokens: aiMetadata.tokens || {}
      };
    }

    if (tags && Array.isArray(tags)) {
      call.tags = tags;
    }

    // Calculate cost if applicable
    if (call.userId.subscription.planId) {
      const plan = await Plan.findById(call.userId.subscription.planId);
      call.cost = call.calculateCost(plan);
    }

    await call.save();

    // SMS summary removed - call completed successfully
    console.log(`✅ Call completed for user ${call.phoneNumber}`);

    // Handle emergency cases
    if (call.isEmergency) {
      // Emergency alerts removed - logging emergency completion
      console.log(`🚨 Emergency call completed for ${call.phoneNumber}`);
    }

    res.status(200).json({
      success: true,
      message: 'Call completed successfully',
      data: {
        callId: call.callId,
        status: call.callDetails.status,
        duration: call.callDetails.duration,
        durationInMinutes: call.durationInMinutes,
        smsStatus: call.sms?.sent ? 'sent' : 'failed'
      }
    });

  } catch (error) {
    console.error('Complete call error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete call'
    });
  }
});

// @route   PUT /api/calls/:callId/fail
// @desc    Mark call as failed
// @access  Private/System
router.put('/:callId/fail', authenticateToken, [
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Reason must not exceed 200 characters'),
  body('errorCode')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Error code too long')
], handleValidationErrors, async (req, res) => {
  try {
    const { callId } = req.params;
    const { reason, errorCode } = req.body;

    const call = await Call.findOne({ 
      $or: [
        { _id: callId },
        { callId: callId }
      ]
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    // Update call status
    call.callDetails.status = 'failed';
    call.callDetails.endTime = new Date();
    
    if (reason || errorCode) {
      call.tags = call.tags || [];
      if (reason) call.tags.push(`failure_reason:${reason}`);
      if (errorCode) call.tags.push(`error_code:${errorCode}`);
    }

    await call.save();

    // Refund the call usage for failed calls
    const user = await User.findById(call.userId);
    if (user) {
      user.usage.monthlyCallsUsed = Math.max(0, user.usage.monthlyCallsUsed - 1);
      user.usage.totalCalls = Math.max(0, user.usage.totalCalls - 1);
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: 'Call marked as failed',
      data: {
        callId: call.callId,
        status: call.callDetails.status
      }
    });

  } catch (error) {
    console.error('Fail call error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update call status'
    });
  }
});

// @route   GET /api/calls/:callId/status
// @desc    Get call status
// @access  Private
router.get('/:callId/status', authenticateToken, async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.userId;

    const call = await Call.findOne({ 
      $or: [
        { _id: callId, userId },
        { callId: callId, userId }
      ]
    }).select('callId callDetails.status callDetails.startTime callDetails.endTime callDetails.duration isEmergency');

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    const statusData = {
      callId: call.callId,
      status: call.callDetails.status,
      startTime: call.callDetails.startTime,
      endTime: call.callDetails.endTime,
      duration: call.callDetails.duration,
      durationInMinutes: call.durationInMinutes,
      isEmergency: call.isEmergency
    };

    res.status(200).json({
      success: true,
      data: statusData
    });

  } catch (error) {
    console.error('Get call status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get call status'
    });
  }
});

// @route   POST /api/calls/:callId/resend-sms
// @desc    Resend SMS summary
// @access  Private
router.post('/:callId/resend-sms', authenticateToken, async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.userId;

    const call = await Call.findOne({ 
      $or: [
        { _id: callId, userId },
        { callId: callId, userId }
      ]
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found'
      });
    }

    if (call.callDetails.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Can only resend SMS for completed calls'
      });
    }

    // SMS functionality removed - call summary available in response
    console.log(`📱 SMS resend requested for call ${call._id} - functionality removed`);

    res.status(200).json({
      success: false,
      message: 'SMS functionality has been removed - using password-based authentication',
      data: {
        callId: call._id,
        summary: call.generateSMSSummary()
      }
    });

  } catch (error) {
    console.error('Resend SMS error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resend SMS'
    });
  }
});

// Admin routes

// @route   GET /api/calls/admin/analytics
// @desc    Get call analytics (Admin/Support only)
// @access  Private/Admin
router.get('/admin/analytics', authenticateToken, requireAdminOrSupport, async (req, res) => {
  try {
    const { startDate, endDate, groupBy } = req.query;

    // Build match stage
    const matchStage = {};
    if (startDate && endDate) {
      matchStage.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Define group stage based on groupBy parameter
    let groupStage = { _id: null };
    
    if (groupBy === 'date') {
      groupStage._id = {
        $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
      };
    } else if (groupBy === 'queryType') {
      groupStage._id = '$queryType';
    } else if (groupBy === 'language') {
      groupStage._id = '$language';
    } else if (groupBy === 'status') {
      groupStage._id = '$callDetails.status';
    }

    const analytics = await Call.aggregate([
      { $match: matchStage },
      {
        $group: {
          ...groupStage,
          totalCalls: { $sum: 1 },
          completedCalls: {
            $sum: {
              $cond: [{ $eq: ['$callDetails.status', 'completed'] }, 1, 0]
            }
          },
          failedCalls: {
            $sum: {
              $cond: [{ $eq: ['$callDetails.status', 'failed'] }, 1, 0]
            }
          },
          emergencyCalls: {
            $sum: {
              $cond: [{ $eq: ['$isEmergency', true] }, 1, 0]
            }
          },
          avgDuration: { $avg: '$callDetails.duration' },
          totalDuration: { $sum: '$callDetails.duration' },
          smsSuccessRate: {
            $avg: {
              $cond: [{ $eq: ['$sms.sent', true] }, 1, 0]
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Calculate additional metrics
    const summary = analytics.reduce((acc, item) => ({
      totalCalls: acc.totalCalls + item.totalCalls,
      completedCalls: acc.completedCalls + item.completedCalls,
      failedCalls: acc.failedCalls + item.failedCalls,
      emergencyCalls: acc.emergencyCalls + item.emergencyCalls,
      totalDuration: acc.totalDuration + item.totalDuration
    }), { totalCalls: 0, completedCalls: 0, failedCalls: 0, emergencyCalls: 0, totalDuration: 0 });

    summary.completionRate = summary.totalCalls > 0 ? 
      (summary.completedCalls / summary.totalCalls) * 100 : 0;
    summary.avgDurationMinutes = summary.totalCalls > 0 ? 
      (summary.totalDuration / summary.totalCalls) / 60 : 0;

    res.status(200).json({
      success: true,
      data: {
        summary,
        breakdown: analytics,
        groupBy: groupBy || 'none'
      }
    });

  } catch (error) {
    console.error('Get call analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch call analytics'
    });
  }
});

// @route   GET /api/calls/admin/recent
// @desc    Get recent calls (Admin/Support only)
// @access  Private/Admin
router.get('/admin/recent', authenticateToken, requireAdminOrSupport, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const status = req.query.status;
    const queryType = req.query.queryType;
    const emergency = req.query.emergency;

    // Build filter
    const filter = {};
    if (status) filter['callDetails.status'] = status;
    if (queryType) filter.queryType = queryType;
    if (emergency === 'true') filter.isEmergency = true;

    const calls = await Call.find(filter)
      .populate('userId', 'name phoneNumber preferredLanguage location')
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('-aiMetadata -__v');

    res.status(200).json({
      success: true,
      data: { calls }
    });

  } catch (error) {
    console.error('Get recent calls error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch recent calls'
    });
  }
});

module.exports = router;
