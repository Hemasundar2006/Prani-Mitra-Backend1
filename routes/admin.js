const express = require('express');
const { body, query, validationResult } = require('express-validator');
const User = require('../models/User');
const Call = require('../models/Call');
const Payment = require('../models/Payment');
const Voucher = require('../models/Voucher');
const Plan = require('../models/Plan');
const Content = require('../models/Content');
const { authenticateToken, requireAdmin, requireAdminOrSupport } = require('../middleware/auth');
// SMS notifications removed - using password-based authentication
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

// @route   GET /api/admin/farmers/pending
// @desc    List farmers with pending/rejected/approved status (filter by approvalStatus)
// @access  Private/Admin
router.get('/farmers/pending', authenticateToken, requireAdminOrSupport, async (req, res) => {
  try {
    const { status = '0', page = 1, limit = 20, search } = req.query;

    const filter = { role: 'farmer' };
    if (['0', '1', '2'].includes(String(status))) {
      filter.approvalStatus = parseInt(status, 10);
    }
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password -__v')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(filter)
    ]);

    return res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          total
        }
      }
    });
  } catch (error) {
    console.error('List pending farmers error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch farmers' });
  }
});

// @route   PUT /api/admin/farmers/:userId/approve-status
// @desc    Update farmer approval status using 0,1,2 (0=pending,1=approved,2=rejected)
// @access  Private/Admin
router.put('/farmers/:userId/approve-status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, reason } = req.body; // status expected 0/1/2

    if (![0, 1, 2].includes(Number(status))) {
      return res.status(400).json({ success: false, message: 'Invalid status. Use 0,1,2' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (user.role !== 'farmer') {
      return res.status(400).json({ success: false, message: 'Only farmer accounts can be approved/rejected' });
    }

    user.approvalStatus = Number(status);
    if (status === 1) {
      user.isVerified = true;
      user.isActive = true;
      user.approval.approvedAt = new Date();
      user.approval.approvedBy = req.userId;
      user.approval.rejectionReason = undefined;
      user.approval.rejectedAt = undefined;
      user.approval.rejectedBy = undefined;
    } else if (status === 2) {
      user.isVerified = false;
      user.isActive = false;
      user.approval.rejectedAt = new Date();
      user.approval.rejectedBy = req.userId;
      user.approval.rejectionReason = reason;
    } else {
      // pending
      user.isVerified = false;
      user.approval.approvedAt = undefined;
      user.approval.approvedBy = undefined;
      user.approval.rejectedAt = undefined;
      user.approval.rejectedBy = undefined;
      user.approval.rejectionReason = undefined;
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Approval status updated',
      data: {
        userId: user._id,
        approvalStatus: user.approvalStatus,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error('Update approval status error:', error);
    return res.status(500).json({ success: false, message: 'Failed to update approval status' });
  }
});

// @route   GET /api/admin/dashboard
// @desc    Get admin dashboard statistics
// @access  Private/Admin
router.get('/dashboard', authenticateToken, requireAdminOrSupport, async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    
    switch (period) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    // Get user statistics
    const [totalUsers, newUsers, activeSubscriptions, freeUsers] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: startDate } }),
      User.countDocuments({ 'subscription.status': 'active' }),
      User.countDocuments({ 'subscription.status': 'free' })
    ]);

    // Get call statistics
    const [totalCalls, recentCalls, completedCalls, emergencyCalls] = await Promise.all([
      Call.countDocuments(),
      Call.countDocuments({ createdAt: { $gte: startDate } }),
      Call.countDocuments({ 'callDetails.status': 'completed', createdAt: { $gte: startDate } }),
      Call.countDocuments({ isEmergency: true, createdAt: { $gte: startDate } })
    ]);

    // Get payment statistics
    const [totalRevenue, recentPayments, successfulPayments] = await Promise.all([
      Payment.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Payment.countDocuments({ createdAt: { $gte: startDate } }),
      Payment.countDocuments({ status: 'paid', createdAt: { $gte: startDate } })
    ]);

    // Get content statistics
    const [totalContent, publishedContent, draftContent] = await Promise.all([
      Content.countDocuments(),
      Content.countDocuments({ status: 'published' }),
      Content.countDocuments({ status: 'draft' })
    ]);

    // Get voucher statistics
    const [totalVouchers, activeVouchers, usedVouchers] = await Promise.all([
      Voucher.countDocuments(),
      Voucher.countDocuments({ isActive: true }),
      Voucher.countDocuments({ 'usage.totalUsed': { $gt: 0 } })
    ]);

    // Calculate growth rates
    const previousPeriodStart = new Date(startDate);
    previousPeriodStart.setTime(startDate.getTime() - (now.getTime() - startDate.getTime()));

    const [prevNewUsers, prevCalls, prevPayments] = await Promise.all([
      User.countDocuments({ 
        createdAt: { $gte: previousPeriodStart, $lt: startDate } 
      }),
      Call.countDocuments({ 
        createdAt: { $gte: previousPeriodStart, $lt: startDate } 
      }),
      Payment.countDocuments({ 
        status: 'paid',
        createdAt: { $gte: previousPeriodStart, $lt: startDate } 
      })
    ]);

    const userGrowth = prevNewUsers > 0 ? ((newUsers - prevNewUsers) / prevNewUsers) * 100 : 0;
    const callGrowth = prevCalls > 0 ? ((recentCalls - prevCalls) / prevCalls) * 100 : 0;
    const paymentGrowth = prevPayments > 0 ? ((successfulPayments - prevPayments) / prevPayments) * 100 : 0;

    // Get recent activity
    const recentActivity = await Call.find()
      .populate('userId', 'name phoneNumber')
      .sort({ createdAt: -1 })
      .limit(10)
      .select('callId queryType language callDetails.status isEmergency createdAt');

    // Get top performing content
    const topContent = await Content.find({ status: 'published' })
      .sort({ 'engagement.views': -1 })
      .limit(5)
      .select('title slug engagement.views engagement.likes type category');

    const dashboardData = {
      overview: {
        users: {
          total: totalUsers,
          new: newUsers,
          growth: Math.round(userGrowth * 100) / 100,
          active: activeSubscriptions,
          free: freeUsers
        },
        calls: {
          total: totalCalls,
          recent: recentCalls,
          completed: completedCalls,
          emergency: emergencyCalls,
          growth: Math.round(callGrowth * 100) / 100,
          completionRate: recentCalls > 0 ? Math.round((completedCalls / recentCalls) * 100) : 0
        },
        revenue: {
          total: totalRevenue[0]?.total || 0,
          recentPayments,
          successful: successfulPayments,
          growth: Math.round(paymentGrowth * 100) / 100,
          successRate: recentPayments > 0 ? Math.round((successfulPayments / recentPayments) * 100) : 0
        },
        content: {
          total: totalContent,
          published: publishedContent,
          drafts: draftContent
        },
        vouchers: {
          total: totalVouchers,
          active: activeVouchers,
          used: usedVouchers
        }
      },
      recentActivity: recentActivity.map(call => ({
        id: call._id,
        callId: call.callId,
        user: call.userId?.name || 'Unknown',
        phoneNumber: call.userId?.phoneNumber,
        queryType: call.queryType,
        language: call.language,
        status: call.callDetails.status,
        isEmergency: call.isEmergency,
        createdAt: call.createdAt
      })),
      topContent: topContent.map(content => ({
        id: content._id,
        title: content.title.en,
        slug: content.slug,
        type: content.type,
        category: content.category,
        views: content.engagement.views,
        likes: content.engagement.likes
      })),
      period
    };

    res.status(200).json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data'
    });
  }
});

// @route   GET /api/admin/analytics/users
// @desc    Get detailed user analytics
// @access  Private/Admin
router.get('/analytics/users', authenticateToken, requireAdminOrSupport, async (req, res) => {
  try {
    const { period = '30d', groupBy = 'date' } = req.query;
    
    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    
    switch (period) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    // Define group stage based on groupBy parameter
    let groupStage = { _id: null };
    
    if (groupBy === 'date') {
      groupStage._id = {
        $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
      };
    } else if (groupBy === 'language') {
      groupStage._id = '$preferredLanguage';
    } else if (groupBy === 'location') {
      groupStage._id = '$location.state';
    } else if (groupBy === 'farmingType') {
      groupStage._id = { $arrayElemAt: ['$farmingType', 0] };
    } else if (groupBy === 'subscription') {
      groupStage._id = '$subscription.status';
    }

    const analytics = await User.aggregate([
      { $match: { createdAt: { $gte: startDate, $lte: now } } },
      {
        $group: {
          ...groupStage,
          totalUsers: { $sum: 1 },
          verifiedUsers: {
            $sum: {
              $cond: [{ $eq: ['$isVerified', true] }, 1, 0]
            }
          },
          activeUsers: {
            $sum: {
              $cond: [{ $eq: ['$isActive', true] }, 1, 0]
            }
          },
          premiumUsers: {
            $sum: {
              $cond: [{ $eq: ['$subscription.status', 'active'] }, 1, 0]
            }
          },
          avgCallsPerUser: { $avg: '$usage.totalCalls' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get subscription distribution
    const subscriptionStats = await User.aggregate([
      {
        $group: {
          _id: '$subscription.status',
          count: { $sum: 1 },
          avgCallsUsed: { $avg: '$usage.monthlyCallsUsed' }
        }
      }
    ]);

    // Get location distribution
    const locationStats = await User.aggregate([
      { $match: { 'location.state': { $exists: true, $ne: null } } },
      {
        $group: {
          _id: '$location.state',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Get farming type distribution
    const farmingTypeStats = await User.aggregate([
      { $unwind: '$farmingType' },
      {
        $group: {
          _id: '$farmingType',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        analytics,
        subscriptionStats,
        locationStats,
        farmingTypeStats,
        period,
        groupBy
      }
    });

  } catch (error) {
    console.error('Get user analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user analytics'
    });
  }
});

// @route   POST /api/admin/vouchers
// @desc    Create new voucher
// @access  Private/Admin
router.post('/vouchers', authenticateToken, requireAdmin, [
  body('code').trim().isLength({ min: 4, max: 20 }).isAlphanumeric(),
  body('name').trim().notEmpty(),
  body('type').isIn(['percentage', 'fixed', 'free_trial']),
  body('value').isFloat({ min: 0 }),
  body('validity').isInt({ min: 1, max: 365 }),
  body('usageLimit').isInt({ min: 1 }),
  body('applicablePlans').optional().isArray(),
  body('isActive').optional().isBoolean(),
  body('isPublic').optional().isBoolean()
], handleValidationErrors, async (req, res) => {
  try {
    const voucherData = {
      ...req.body,
      code: req.body.code.toUpperCase(),
      createdBy: req.userId
    };

    const existingVoucher = await Voucher.findOne({ code: voucherData.code });
    if (existingVoucher) {
      return res.status(409).json({ success: false, message: 'Voucher code already exists' });
    }

    const voucher = new Voucher(voucherData);
    await voucher.save();

    res.status(201).json({ success: true, message: 'Voucher created successfully', data: { voucher } });
  } catch (error) {
    console.error('Create voucher error:', error);
    res.status(500).json({ success: false, message: 'Failed to create voucher' });
  }
});

// Development endpoint for voucher creation (no auth required)
router.post('/vouchers/dev', [
  body('code')
    .trim()
    .isLength({ min: 4, max: 20 })
    .isAlphanumeric()
    .withMessage('Voucher code must be 4-20 alphanumeric characters'),
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Voucher name is required'),
  body('type')
    .isIn(['percentage', 'fixed', 'free_trial'])
    .withMessage('Invalid voucher type'),
  body('value')
    .isFloat({ min: 0 })
    .withMessage('Value must be a positive number'),
  body('validity')
    .isInt({ min: 1, max: 365 })
    .withMessage('Validity must be between 1 and 365 days'),
  body('usageLimit')
    .isInt({ min: 1 })
    .withMessage('Usage limit must be a positive integer'),
  body('applicablePlans')
    .optional()
    .isArray()
    .withMessage('Applicable plans must be an array'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
  body('isPublic')
    .optional()
    .isBoolean()
    .withMessage('isPublic must be a boolean')
], handleValidationErrors, async (req, res) => {
  try {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        message: 'Development endpoint not available in production'
      });
    }

    const voucherData = {
      ...req.body,
      code: req.body.code.toUpperCase(),
      createdBy: '507f1f77bcf86cd799439011' // Dummy admin user ID for development
    };

    // Check if voucher code already exists
    const existingVoucher = await Voucher.findOne({ code: voucherData.code });
    if (existingVoucher) {
      return res.status(409).json({
        success: false,
        message: 'Voucher code already exists'
      });
    }

    const voucher = new Voucher(voucherData);
    await voucher.save();

    console.log(`✅ Development voucher created: ${voucher.code} (${voucher.name})`);

    res.status(201).json({
      success: true,
      message: 'Voucher created successfully (Development mode)',
      data: { 
        voucher,
        note: 'This endpoint is for development only'
      }
    });

  } catch (error) {
    console.error('Create voucher error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create voucher',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/admin/vouchers
// @desc    Get all vouchers
// @access  Private/Admin
router.get('/vouchers', authenticateToken, requireAdminOrSupport, [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['active', 'inactive', 'expired'])
    .withMessage('Invalid status'),
  query('type')
    .optional()
    .isIn(['percentage', 'fixed', 'free_trial'])
    .withMessage('Invalid type')
], handleValidationErrors, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      type,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter
    const filter = {};
    
    if (status === 'active') {
      filter.isActive = true;
      filter['validity.startDate'] = { $lte: new Date() };
      filter['validity.endDate'] = { $gte: new Date() };
    } else if (status === 'inactive') {
      filter.isActive = false;
    } else if (status === 'expired') {
      filter['validity.endDate'] = { $lt: new Date() };
    }
    
    if (type) filter.type = type;
    
    if (search) {
      filter.$or = [
        { code: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } }
      ];
    }

    // Get vouchers with pagination
    const vouchers = await Voucher.find(filter)
      .populate('createdBy', 'name')
      .populate('applicablePlans', 'name displayName')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalVouchers = await Voucher.countDocuments(filter);
    const totalPages = Math.ceil(totalVouchers / parseInt(limit));

    // Add computed fields
    const enrichedVouchers = vouchers.map(voucher => ({
      ...voucher.toObject(),
      isCurrentlyValid: voucher.isCurrentlyValid,
      remainingUsage: voucher.remainingUsage,
      usagePercentage: voucher.usage.totalLimit ? 
        Math.round((voucher.usage.totalUsed / voucher.usage.totalLimit) * 100) : 0
    }));

    res.status(200).json({
      success: true,
      data: {
        vouchers: enrichedVouchers,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalVouchers,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get vouchers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vouchers'
    });
  }
});

// @route   PUT /api/admin/vouchers/:voucherId
// @desc    Update voucher
// @access  Private/Admin
router.put('/vouchers/:voucherId', authenticateToken, requireAdmin, [
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Voucher name cannot be empty'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
  body('usage.totalLimit')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Total limit must be a positive integer')
], handleValidationErrors, async (req, res) => {
  try {
    const { voucherId } = req.params;
    const updates = req.body;

    const voucher = await Voucher.findByIdAndUpdate(
      voucherId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: 'Voucher not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Voucher updated successfully',
      data: { voucher }
    });

  } catch (error) {
    console.error('Update voucher error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update voucher'
    });
  }
});

// @route   PUT /api/admin/users/:userId/subscription
// @desc    Update user subscription (Admin only)
// @access  Private/Admin
router.put('/users/:userId/subscription', authenticateToken, requireAdmin, [
  body('planId')
    .optional()
    .isMongoId()
    .withMessage('Valid plan ID is required'),
  body('status')
    .optional()
    .isIn(['free', 'active', 'expired', 'cancelled'])
    .withMessage('Invalid subscription status'),
  body('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Reason must not exceed 200 characters')
], handleValidationErrors, async (req, res) => {
  try {
    const { userId } = req.params;
    const { planId, status, endDate, reason } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Validate plan if provided
    if (planId) {
      const plan = await Plan.findById(planId);
      if (!plan) {
        return res.status(404).json({
          success: false,
          message: 'Plan not found'
        });
      }
      user.subscription.planId = planId;
    }

    if (status) user.subscription.status = status;
    if (endDate) user.subscription.endDate = new Date(endDate);

    await user.save();

    // Send notification to user
    if (status && user.preferences?.notifications?.sms !== false) {
      try {
        let notificationType = 'renewal';
        let notificationData = { plan: 'subscription' };

        if (status === 'active') {
          notificationType = 'activation';
        } else if (status === 'cancelled' || status === 'expired') {
          notificationType = 'expired';
        }

        // SMS notifications removed - subscription status updated
        console.log(`✅ Subscription ${notificationType} for user ${user.phoneNumber}`);
      } catch (error) {
        console.error('Subscription update error:', error);
      }
    }

    res.status(200).json({
      success: true,
      message: 'User subscription updated successfully',
      data: {
        userId: user._id,
        subscription: user.subscription,
        reason
      }
    });

  } catch (error) {
    console.error('Update user subscription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user subscription'
    });
  }
});

// @route   PUT /api/admin/users/:userId/status
// @desc    Update user status (Admin only)
// @access  Private/Admin
router.put('/users/:userId/status', authenticateToken, requireAdmin, [
  body('isActive')
    .isBoolean()
    .withMessage('isActive must be a boolean'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Reason must not exceed 200 characters')
], handleValidationErrors, async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive, reason } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { isActive },
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
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: {
        userId: user._id,
        isActive: user.isActive,
        reason
      }
    });

  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status'
    });
  }
});

// @route   GET /api/admin/export/users
// @desc    Export users data (Admin only)
// @access  Private/Admin
router.get('/export/users', authenticateToken, requireAdmin, [
  query('format')
    .optional()
    .isIn(['json', 'csv'])
    .withMessage('Format must be json or csv'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date format'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format')
], handleValidationErrors, async (req, res) => {
  try {
    const { format = 'json', startDate, endDate, status } = req.query;

    // Build filter
    const filter = {};
    if (startDate && endDate) {
      filter.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    if (status) filter['subscription.status'] = status;

    const users = await User.find(filter)
      .select('-__v')
      .lean();

    if (format === 'csv') {
      // Convert to CSV format
      const csv = convertToCSV(users);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=users-export.csv');
      res.send(csv);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=users-export.json');
      res.json({
        success: true,
        data: { users },
        exportedAt: new Date(),
        totalRecords: users.length
      });
    }

  } catch (error) {
    console.error('Export users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export users data'
    });
  }
});

// Helper function to convert data to CSV
function convertToCSV(data) {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvHeaders = headers.join(',');
  
  const csvRows = data.map(row => 
    headers.map(header => {
      const value = row[header];
      if (typeof value === 'object' && value !== null) {
        return JSON.stringify(value).replace(/"/g, '""');
      }
      return `"${String(value).replace(/"/g, '""')}"`;
    }).join(',')
  );
  
  return [csvHeaders, ...csvRows].join('\n');
}

// @route   GET /api/admin/verifications
// @desc    Get all user verifications with filtering
// @access  Private/Admin
router.get('/verifications', authenticateToken, requireAdminOrSupport, [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['pending', 'approved', 'rejected'])
    .withMessage('Status must be pending, approved, or rejected'),
  query('sortBy')
    .optional()
    .isIn(['submittedAt', 'reviewedAt', 'name', 'createdAt'])
    .withMessage('Invalid sort field'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc')
], handleValidationErrors, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      search,
      sortBy = 'submittedAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter
    const filter = {};
    
    if (status) {
      filter['verification.status'] = status;
    }
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } }
      ];
    }

    // Get users with verification data
    const users = await User.find(filter)
      .select('-password -__v')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .populate('verification.reviewedBy', 'name email')
      .lean();

    // Get total count for pagination
    const totalUsers = await User.countDocuments(filter);

    // Add computed fields
    const enrichedUsers = users.map(user => ({
      ...user,
      verificationStatus: user.verification?.status || 'pending',
      submittedAt: user.verification?.submittedAt,
      reviewedAt: user.verification?.reviewedAt,
      reviewedBy: user.verification?.reviewedBy,
      rejectionReason: user.verification?.rejectionReason,
      documents: user.verification?.documents || [],
      verificationNotes: user.verification?.notes,
      daysSinceSubmission: user.verification?.submittedAt ? 
        Math.floor((new Date() - new Date(user.verification.submittedAt)) / (1000 * 60 * 60 * 24)) : 0
    }));

    const totalPages = Math.ceil(totalUsers / parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        verifications: enrichedUsers,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalUsers,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Get verifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch verifications'
    });
  }
});

// @route   GET /api/admin/verifications/stats
// @desc    Get verification statistics
// @access  Private/Admin
router.get('/verifications/stats', authenticateToken, requireAdminOrSupport, async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    
    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    
    switch (period) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    // Get verification statistics
    const [
      totalPending,
      totalApproved,
      totalRejected,
      recentSubmissions,
      recentApprovals,
      recentRejections,
      avgProcessingTime
    ] = await Promise.all([
      User.countDocuments({ 'verification.status': 'pending' }),
      User.countDocuments({ 'verification.status': 'approved' }),
      User.countDocuments({ 'verification.status': 'rejected' }),
      User.countDocuments({ 
        'verification.submittedAt': { $gte: startDate } 
      }),
      User.countDocuments({ 
        'verification.status': 'approved',
        'verification.reviewedAt': { $gte: startDate } 
      }),
      User.countDocuments({ 
        'verification.status': 'rejected',
        'verification.reviewedAt': { $gte: startDate } 
      }),
      User.aggregate([
        {
          $match: {
            'verification.status': { $in: ['approved', 'rejected'] },
            'verification.submittedAt': { $exists: true },
            'verification.reviewedAt': { $exists: true }
          }
        },
        {
          $project: {
            processingTime: {
              $subtract: ['$verification.reviewedAt', '$verification.submittedAt']
            }
          }
        },
        {
          $group: {
            _id: null,
            avgProcessingTime: { $avg: '$processingTime' }
          }
        }
      ])
    ]);

    // Get pending verifications by age
    const pendingByAge = await User.aggregate([
      {
        $match: { 'verification.status': 'pending' }
      },
      {
        $project: {
          daysSinceSubmission: {
            $floor: {
              $divide: [
                { $subtract: [new Date(), '$verification.submittedAt'] },
                1000 * 60 * 60 * 24
              ]
            }
          }
        }
      },
      {
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $lte: ['$daysSinceSubmission', 1] }, then: '0-1 days' },
                { case: { $lte: ['$daysSinceSubmission', 3] }, then: '2-3 days' },
                { case: { $lte: ['$daysSinceSubmission', 7] }, then: '4-7 days' },
                { case: { $lte: ['$daysSinceSubmission', 14] }, then: '8-14 days' }
              ],
              default: '15+ days'
            }
          },
          count: { $sum: 1 }
        }
      }
    ]);

    const stats = {
      overview: {
        totalPending,
        totalApproved,
        totalRejected,
        totalVerifications: totalPending + totalApproved + totalRejected
      },
      recent: {
        submissions: recentSubmissions,
        approvals: recentApprovals,
        rejections: recentRejections
      },
      processing: {
        avgProcessingTimeHours: avgProcessingTime[0]?.avgProcessingTime ? 
          Math.round(avgProcessingTime[0].avgProcessingTime / (1000 * 60 * 60)) : 0
      },
      pendingByAge,
      period
    };

    res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Get verification stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch verification statistics'
    });
  }
});

// @route   PUT /api/admin/verifications/:userId/approve
// @desc    Approve user verification
// @access  Private/Admin
router.put('/verifications/:userId/approve', authenticateToken, requireAdmin, [
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must not exceed 500 characters')
], handleValidationErrors, async (req, res) => {
  try {
    const { userId } = req.params;
    const { notes } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.verification.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'User verification is not pending',
        code: 'VERIFICATION_NOT_PENDING'
      });
    }

    // Approve verification
    user.approveVerification(req.userId);
    if (notes) {
      user.verification.notes = notes;
    }
    
    await user.save();

    // Send approval notification email
    try {
      const emailService = require('../services/emailService');
      await emailService.sendVerificationApprovalEmail({
        to: user.email,
        name: user.name,
        language: user.preferredLanguage || 'english'
      });
    } catch (emailError) {
      console.error('Verification approval email error:', emailError);
      // Don't fail the request if email fails
    }

    console.log(`✅ Verification approved for user: ${user.name} (${user.email}) by admin: ${req.user.name}`);

    res.status(200).json({
      success: true,
      message: 'User verification approved successfully',
      data: {
        userId: user._id,
        name: user.name,
        email: user.email,
        verificationStatus: 'approved',
        reviewedAt: user.verification.reviewedAt,
        reviewedBy: req.user.name
      }
    });

  } catch (error) {
    console.error('Approve verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve verification'
    });
  }
});

// @route   PUT /api/admin/verifications/:userId/reject
// @desc    Reject user verification
// @access  Private/Admin
router.put('/verifications/:userId/reject', authenticateToken, requireAdmin, [
  body('rejectionReason')
    .notEmpty()
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Rejection reason must be between 10 and 500 characters'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes must not exceed 500 characters')
], handleValidationErrors, async (req, res) => {
  try {
    const { userId } = req.params;
    const { rejectionReason, notes } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.verification.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'User verification is not pending',
        code: 'VERIFICATION_NOT_PENDING'
      });
    }

    // Reject verification
    user.rejectVerification(req.userId, rejectionReason);
    if (notes) {
      user.verification.notes = notes;
    }
    
    await user.save();

    // Send rejection notification email
    try {
      const emailService = require('../services/emailService');
      await emailService.sendVerificationRejectionEmail({
        to: user.email,
        name: user.name,
        rejectionReason: rejectionReason,
        language: user.preferredLanguage || 'english'
      });
    } catch (emailError) {
      console.error('Verification rejection email error:', emailError);
      // Don't fail the request if email fails
    }

    console.log(`❌ Verification rejected for user: ${user.name} (${user.email}) by admin: ${req.user.name}`);

    res.status(200).json({
      success: true,
      message: 'User verification rejected successfully',
      data: {
        userId: user._id,
        name: user.name,
        email: user.email,
        verificationStatus: 'rejected',
        rejectionReason: rejectionReason,
        reviewedAt: user.verification.reviewedAt,
        reviewedBy: req.user.name
      }
    });

  } catch (error) {
    console.error('Reject verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject verification'
    });
  }
});

// @route   GET /api/admin/verifications/:userId
// @desc    Get specific user verification details
// @access  Private/Admin
router.get('/verifications/:userId', authenticateToken, requireAdminOrSupport, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select('-password -__v')
      .populate('verification.reviewedBy', 'name email')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const verificationDetails = {
      ...user,
      verificationStatus: user.verification?.status || 'pending',
      submittedAt: user.verification?.submittedAt,
      reviewedAt: user.verification?.reviewedAt,
      reviewedBy: user.verification?.reviewedBy,
      rejectionReason: user.verification?.rejectionReason,
      documents: user.verification?.documents || [],
      verificationNotes: user.verification?.notes,
      daysSinceSubmission: user.verification?.submittedAt ? 
        Math.floor((new Date() - new Date(user.verification.submittedAt)) / (1000 * 60 * 60 * 24)) : 0
    };

    res.status(200).json({
      success: true,
      data: {
        user: verificationDetails
      }
    });

  } catch (error) {
    console.error('Get verification details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch verification details'
    });
  }
});

// @route   GET /api/admin/users/farmers
// @desc    Get all users with farmer role
// @access  Private/Admin
router.get('/users/farmers', authenticateToken, requireAdminOrSupport, [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['active', 'inactive'])
    .withMessage('Status must be active or inactive'),
  query('subscription')
    .optional()
    .isIn(['free', 'active', 'expired', 'cancelled'])
    .withMessage('Invalid subscription status'),
  query('search')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search term must be between 1 and 100 characters'),
  query('sortBy')
    .optional()
    .isIn(['name', 'email', 'phoneNumber', 'createdAt', 'lastLogin'])
    .withMessage('Invalid sort field'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc')
], handleValidationErrors, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      subscription,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = { role: 'farmer' };

    // Add status filter
    if (status) {
      filter.isActive = status === 'active';
    }

    // Add subscription filter
    if (subscription) {
      filter.subscriptionStatus = subscription;
    }

    // Add search filter
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const [users, totalCount] = await Promise.all([
      User.find(filter)
        .select('-password -passwordResetToken -passwordResetExpires -setupToken -setupTokenExpires')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(filter)
    ]);

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / parseInt(limit));
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    // Format response
    const formattedUsers = users.map(user => ({
      id: user._id,
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      isActive: user.isActive,
      subscriptionStatus: user.subscriptionStatus,
      location: user.location,
      profilePicture: user.profilePicture,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      verificationStatus: user.verificationStatus,
      isVerified: user.isVerified
    }));

    res.json({
      success: true,
      message: 'Farmer users retrieved successfully',
      data: {
        users: formattedUsers,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNextPage,
          hasPrevPage,
          limit: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching farmer users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch farmer users',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @route   GET /api/admin/test
// @desc    Test endpoint to verify admin routes are working
// @access  Private/Admin
router.get('/test', authenticateToken, requireAdminOrSupport, (req, res) => {
  res.json({
    success: true,
    message: 'Admin routes are working!',
    timestamp: new Date().toISOString(),
    user: req.user
  });
});

// @route   GET /api/admin/farmers/dashboard
// @desc    Get farmers data formatted for admin dashboard
// @access  Private/Admin
router.get('/farmers/dashboard', authenticateToken, requireAdminOrSupport, [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['active', 'inactive', 'pending'])
    .withMessage('Status must be active, inactive, or pending'),
  query('verification')
    .optional()
    .isIn(['verified', 'unverified', 'pending'])
    .withMessage('Verification must be verified, unverified, or pending'),
  query('search')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search term must be between 1 and 100 characters'),
  query('sortBy')
    .optional()
    .isIn(['name', 'email', 'phoneNumber', 'createdAt', 'lastLogin'])
    .withMessage('Invalid sort field'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc')
], handleValidationErrors, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      verification,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object for farmers only
    const filter = { role: 'farmer' };

    // Add status filter
    if (status) {
      if (status === 'pending') {
        filter.isActive = { $exists: false };
      } else {
        filter.isActive = status === 'active';
      }
    }

    // Add verification filter
    if (verification) {
      if (verification === 'pending') {
        filter.isVerified = { $exists: false };
      } else {
        filter.isVerified = verification === 'verified';
      }
    }

    // Add search filter
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phoneNumber: { $regex: search, $options: 'i' } }
      ];
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const [farmers, totalCount] = await Promise.all([
      User.find(filter)
        .select('-password -passwordResetToken -passwordResetExpires -setupToken -setupTokenExpires')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(filter)
    ]);

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / parseInt(limit));
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    // Format response for dashboard
    const formattedFarmers = farmers.map(farmer => {
      // Generate truncated and full user ID
      const fullUserId = farmer._id.toString();
      const truncatedUserId = fullUserId.substring(0, 8) + '...' + fullUserId.substring(fullUserId.length - 4);
      
      // Determine plan subscription status
      const planStatus = farmer.subscriptionStatus || 'free';
      const planExpiration = farmer.subscriptionExpiresAt || null;
      
      // Determine verification status
      let verificationStatus = 'unverified';
      if (farmer.isVerified === true) {
        verificationStatus = 'verified';
      } else if (farmer.isVerified === false) {
        verificationStatus = 'pending';
      }

      return {
        // Basic Info
        name: farmer.name,
        email: farmer.email || null,
        phone: farmer.phoneNumber,
        avatar: farmer.profilePicture || null,
        
        // User ID
        userId: {
          truncated: truncatedUserId,
          full: fullUserId
        },
        
        // Plan Subscription
        planSubscription: {
          status: planStatus,
          planId: farmer.planId || null,
          expirationDate: planExpiration
        },
        
        // Created Date
        createdDate: farmer.createdAt,
        
        // Status
        isActive: farmer.isActive !== false, // Default to true if not set
        verificationStatus: verificationStatus,
        
        // Actions (these will be handled on frontend)
        actions: {
          canView: true,
          canApprove: verificationStatus === 'pending',
          canReject: verificationStatus === 'pending',
          canActivate: !farmer.isActive,
          canDeactivate: farmer.isActive !== false
        }
      };
    });

    res.json({
      success: true,
      message: 'Farmers dashboard data retrieved successfully',
      data: {
        farmers: formattedFarmers,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount,
          hasNextPage,
          hasPrevPage,
          limit: parseInt(limit)
        },
        summary: {
          total: totalCount,
          verified: farmers.filter(f => f.isVerified === true).length,
          pending: farmers.filter(f => f.isVerified === false || f.isVerified === undefined).length,
          active: farmers.filter(f => f.isActive !== false).length,
          inactive: farmers.filter(f => f.isActive === false).length
        }
      }
    });

  } catch (error) {
    console.error('Error fetching farmers dashboard data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch farmers dashboard data',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @route   POST /api/admin/farmers/:id/approve
// @desc    Approve a farmer's account
// @access  Private/Admin
router.post('/farmers/:id/approve', authenticateToken, requireAdminOrSupport, async (req, res) => {
  try {
    const { id } = req.params;

    const farmer = await User.findByIdAndUpdate(
      id,
      { 
        isVerified: true,
        isActive: true,
        verifiedAt: new Date()
      },
      { new: true }
    ).select('-password');

    if (!farmer) {
      return res.status(404).json({
        success: false,
        message: 'Farmer not found'
      });
    }

    if (farmer.role !== 'farmer') {
      return res.status(400).json({
        success: false,
        message: 'User is not a farmer'
      });
    }

    res.json({
      success: true,
      message: 'Farmer approved successfully',
      data: { farmer }
    });

  } catch (error) {
    console.error('Error approving farmer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve farmer',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// @route   POST /api/admin/farmers/:id/reject
// @desc    Reject a farmer's account
// @access  Private/Admin
router.post('/farmers/:id/reject', authenticateToken, requireAdminOrSupport, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const farmer = await User.findByIdAndUpdate(
      id,
      { 
        isVerified: false,
        isActive: false,
        rejectionReason: reason,
        rejectedAt: new Date()
      },
      { new: true }
    ).select('-password');

    if (!farmer) {
      return res.status(404).json({
        success: false,
        message: 'Farmer not found'
      });
    }

    if (farmer.role !== 'farmer') {
      return res.status(400).json({
        success: false,
        message: 'User is not a farmer'
      });
    }

    res.json({
      success: true,
      message: 'Farmer rejected successfully',
      data: { farmer }
    });

  } catch (error) {
    console.error('Error rejecting farmer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject farmer',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

module.exports = router;
