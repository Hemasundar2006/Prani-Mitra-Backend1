const express = require('express');
const { body, query, validationResult } = require('express-validator');
const User = require('../models/User');
const Call = require('../models/Call');
const Payment = require('../models/Payment');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Validation middleware
const validateUserUpdate = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please enter a valid email'),
  body('preferredLanguage')
    .optional()
    .isIn(['english', 'hindi', 'telugu'])
    .withMessage('Language must be english, hindi, or telugu'),
  body('location.state')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('State name too long'),
  body('location.district')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('District name too long'),
  body('location.village')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Village name too long'),
  body('location.pincode')
    .optional()
    .matches(/^\d{6}$/)
    .withMessage('Pincode must be 6 digits'),
  body('farmingType')
    .optional()
    .isArray()
    .withMessage('Farming type must be an array'),
  body('farmingType.*')
    .optional()
    .isIn(['crops', 'dairy', 'poultry', 'goats', 'sheep', 'fishery', 'mixed'])
    .withMessage('Invalid farming type'),
  body('profile.dateOfBirth')
    .optional()
    .isISO8601()
    .withMessage('Invalid date format'),
  body('profile.gender')
    .optional()
    .isIn(['male', 'female', 'other'])
    .withMessage('Invalid gender'),
  body('profile.experience')
    .optional()
    .isIn(['beginner', '1-5years', '5-10years', '10+years'])
    .withMessage('Invalid experience level')
];

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

// @route   GET /api/users/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    // Reset monthly usage if needed
    const resetNeeded = user.resetMonthlyUsage();
    if (resetNeeded) {
      await user.save();
    }

    const profileData = {
      id: user._id,
      phoneNumber: user.phoneNumber,
      name: user.name,
      email: user.email,
      preferredLanguage: user.preferredLanguage,
      location: user.location,
      farmingType: user.farmingType,
      subscription: user.subscription,
      usage: user.usage,
      profile: user.profile,
      preferences: user.preferences,
      role: user.role,
      isVerified: user.isVerified,
      isActive: user.isActive,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    res.status(200).json({
      success: true,
      data: { user: profileData }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
});

// @route   PUT /api/users/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', authenticateToken, validateUserUpdate, handleValidationErrors, async (req, res) => {
  try {
    const userId = req.userId;
    const updates = req.body;

    // Remove fields that shouldn't be updated via this endpoint
    delete updates.phoneNumber;
    delete updates.subscription;
    delete updates.usage;
    delete updates.role;
    delete updates.isVerified;
    delete updates.isActive;

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const profileData = {
      id: user._id,
      phoneNumber: user.phoneNumber,
      name: user.name,
      email: user.email,
      preferredLanguage: user.preferredLanguage,
      location: user.location,
      farmingType: user.farmingType,
      profile: user.profile,
      preferences: user.preferences,
      updatedAt: user.updatedAt
    };

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: profileData }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

// @route   GET /api/users/usage
// @desc    Get user usage statistics
// @access  Private
router.get('/usage', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { startDate, endDate } = req.query;

    // Get call analytics
    const callAnalytics = await Call.getAnalytics(userId, startDate, endDate);
    
    // Get current user usage
    const user = await User.findById(userId);
    user.resetMonthlyUsage(); // Ensure usage is current

    // Get recent calls
    const recentCalls = await Call.find({ userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('queryType language callDetails.duration callDetails.status createdAt');

    const usageData = {
      current: {
        monthlyCallsUsed: user.usage.monthlyCallsUsed,
        totalCalls: user.usage.totalCalls,
        lastCallDate: user.usage.lastCallDate,
        lastResetDate: user.usage.lastResetDate
      },
      subscription: {
        status: user.subscription.status,
        planId: user.subscription.planId,
        startDate: user.subscription.startDate,
        endDate: user.subscription.endDate,
        autoRenewal: user.subscription.autoRenewal,
        daysRemaining: user.subscription.endDate ? 
          Math.max(0, Math.ceil((user.subscription.endDate - new Date()) / (1000 * 60 * 60 * 24))) : 0
      },
      analytics: callAnalytics[0] || {
        totalCalls: 0,
        totalDurationMinutes: 0,
        avgDurationMinutes: 0,
        completionRate: 0
      },
      recentCalls: recentCalls.map(call => ({
        id: call._id,
        queryType: call.queryType,
        language: call.language,
        duration: call.callDetails.duration,
        status: call.callDetails.status,
        date: call.createdAt
      }))
    };

    res.status(200).json({
      success: true,
      data: usageData
    });

  } catch (error) {
    console.error('Get usage error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch usage statistics'
    });
  }
});

// @route   GET /api/users/calls
// @desc    Get user call history
// @access  Private
router.get('/calls', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const queryType = req.query.queryType;
    const status = req.query.status;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    // Build filter
    const filter = { userId };
    
    if (queryType) filter.queryType = queryType;
    if (status) filter['callDetails.status'] = status;
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    // Get calls with pagination
    const calls = await Call.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-aiMetadata -__v');

    // Get total count for pagination
    const totalCalls = await Call.countDocuments(filter);
    const totalPages = Math.ceil(totalCalls / limit);

    const callsData = calls.map(call => ({
      id: call._id,
      callId: call.callId,
      queryType: call.queryType,
      language: call.language,
      query: {
        text: call.query.text,
        transcription: call.query.transcription
      },
      response: {
        text: call.response.text,
        confidence: call.response.confidence
      },
      callDetails: call.callDetails,
      feedback: call.feedback,
      sms: {
        sent: call.sms.sent,
        sentAt: call.sms.sentAt,
        deliveryStatus: call.sms.deliveryStatus
      },
      isEmergency: call.isEmergency,
      tags: call.tags,
      createdAt: call.createdAt,
      durationInMinutes: call.durationInMinutes
    }));

    res.status(200).json({
      success: true,
      data: {
        calls: callsData,
        pagination: {
          currentPage: page,
          totalPages,
          totalCalls,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Get calls error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch call history'
    });
  }
});

// @route   GET /api/users/calls/:callId
// @desc    Get specific call details
// @access  Private
router.get('/calls/:callId', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { callId } = req.params;

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

    const callData = {
      id: call._id,
      callId: call.callId,
      phoneNumber: call.phoneNumber,
      language: call.language,
      queryType: call.queryType,
      query: call.query,
      response: call.response,
      callDetails: call.callDetails,
      feedback: call.feedback,
      sms: call.sms,
      location: call.location,
      cost: call.cost,
      tags: call.tags,
      isEmergency: call.isEmergency,
      followUpRequired: call.followUpRequired,
      followUpDate: call.followUpDate,
      createdAt: call.createdAt,
      updatedAt: call.updatedAt,
      durationInMinutes: call.durationInMinutes
    };

    res.status(200).json({
      success: true,
      data: { call: callData }
    });

  } catch (error) {
    console.error('Get call details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch call details'
    });
  }
});

// @route   PUT /api/users/calls/:callId/feedback
// @desc    Add feedback for a call
// @access  Private
router.put('/calls/:callId/feedback', authenticateToken, [
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('comment')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Comment must not exceed 500 characters'),
  body('helpful')
    .optional()
    .isBoolean()
    .withMessage('Helpful must be a boolean'),
  body('categories')
    .optional()
    .isArray()
    .withMessage('Categories must be an array'),
  body('categories.*')
    .optional()
    .isIn(['accurate', 'clear', 'relevant', 'timely'])
    .withMessage('Invalid feedback category')
], handleValidationErrors, async (req, res) => {
  try {
    const userId = req.userId;
    const { callId } = req.params;
    const { rating, comment, helpful, categories } = req.body;

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

    // Update feedback
    call.feedback = {
      rating,
      comment: comment || '',
      helpful: helpful !== undefined ? helpful : null,
      categories: categories || []
    };

    await call.save();

    res.status(200).json({
      success: true,
      message: 'Feedback added successfully',
      data: {
        feedback: call.feedback
      }
    });

  } catch (error) {
    console.error('Add feedback error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add feedback'
    });
  }
});

// @route   GET /api/users/payments
// @desc    Get user payment history
// @access  Private
router.get('/payments', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;

    // Build filter
    const filter = { userId };
    if (status) filter.status = status;

    // Get payments with pagination
    const payments = await Payment.find(filter)
      .populate('planId', 'name displayName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-razorpaySignature -webhookEvents -metadata -__v');

    // Get total count for pagination
    const totalPayments = await Payment.countDocuments(filter);
    const totalPages = Math.ceil(totalPayments / limit);

    const paymentsData = payments.map(payment => ({
      id: payment._id,
      orderId: payment.orderId,
      razorpayOrderId: payment.razorpayOrderId,
      razorpayPaymentId: payment.razorpayPaymentId,
      amount: payment.amount,
      currency: payment.currency,
      billingCycle: payment.billingCycle,
      status: payment.status,
      paymentMethod: payment.paymentMethod,
      plan: payment.planId,
      discounts: payment.discounts,
      taxes: payment.taxes,
      subscription: payment.subscription,
      invoiceDetails: payment.invoiceDetails,
      createdAt: payment.createdAt,
      finalAmount: payment.finalAmount
    }));

    res.status(200).json({
      success: true,
      data: {
        payments: paymentsData,
        pagination: {
          currentPage: page,
          totalPages,
          totalPayments,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment history'
    });
  }
});

// @route   PUT /api/users/preferences
// @desc    Update user preferences
// @access  Private
router.put('/preferences', authenticateToken, [
  body('notifications.sms')
    .optional()
    .isBoolean()
    .withMessage('SMS notification preference must be boolean'),
  body('notifications.email')
    .optional()
    .isBoolean()
    .withMessage('Email notification preference must be boolean'),
  body('notifications.whatsapp')
    .optional()
    .isBoolean()
    .withMessage('WhatsApp notification preference must be boolean'),
  body('timezone')
    .optional()
    .isString()
    .withMessage('Timezone must be a string')
], handleValidationErrors, async (req, res) => {
  try {
    const userId = req.userId;
    const preferences = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { preferences: { ...preferences } } },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Preferences updated successfully',
      data: {
        preferences: user.preferences
      }
    });

  } catch (error) {
    console.error('Update preferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update preferences'
    });
  }
});

// @route   DELETE /api/users/account
// @desc    Deactivate user account
// @access  Private
router.delete('/account', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;

    const user = await User.findByIdAndUpdate(
      userId,
      { 
        isActive: false,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Account deactivated successfully'
    });

  } catch (error) {
    console.error('Deactivate account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate account'
    });
  }
});

// Admin routes

// @route   GET /api/users
// @desc    Get all users (Admin only)
// @access  Private/Admin
router.get('/', authenticateToken, requireAdmin, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().trim().isLength({ max: 100 }).withMessage('Search term too long'),
  query('status').optional().isIn(['free', 'active', 'expired', 'cancelled']).withMessage('Invalid status'),
  query('role').optional().isIn(['farmer', 'admin', 'support']).withMessage('Invalid role')
], handleValidationErrors, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = req.query.search;
    const status = req.query.status;
    const role = req.query.role;
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    // Build filter
    const filter = {};
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status) filter['subscription.status'] = status;
    if (role) filter.role = role;

    // Get users with pagination
    const users = await User.find(filter)
      .sort({ [sortBy]: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-__v');

    // Get total count for pagination
    const totalUsers = await User.countDocuments(filter);
    const totalPages = Math.ceil(totalUsers / limit);

    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: page,
          totalPages,
          totalUsers,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
});

module.exports = router;
