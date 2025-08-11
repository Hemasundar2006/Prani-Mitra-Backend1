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
  body('validity.startDate')
    .isISO8601()
    .withMessage('Invalid start date format'),
  body('validity.endDate')
    .isISO8601()
    .withMessage('Invalid end date format'),
  body('usage.totalLimit')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Total limit must be a positive integer'),
  body('usage.perUserLimit')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Per user limit must be a positive integer')
], handleValidationErrors, async (req, res) => {
  try {
    const voucherData = {
      ...req.body,
      code: req.body.code.toUpperCase(),
      createdBy: req.userId
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

    res.status(201).json({
      success: true,
      message: 'Voucher created successfully',
      data: { voucher }
    });

  } catch (error) {
    console.error('Create voucher error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create voucher'
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

module.exports = router;
