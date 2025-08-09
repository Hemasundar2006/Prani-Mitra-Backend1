const express = require('express');
const { body, validationResult } = require('express-validator');
const Plan = require('../models/Plan');
const { authenticateToken, requireAdmin, optionalAuth } = require('../middleware/auth');
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

// @route   GET /api/plans
// @desc    Get all active plans
// @access  Public
router.get('/', optionalAuth, async (req, res) => {
  try {
    const language = req.query.language || req.user?.preferredLanguage || 'english';
    
    const plans = await Plan.getActivePlans(language);
    
    res.status(200).json({
      success: true,
      data: { plans }
    });

  } catch (error) {
    console.error('Get plans error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch plans'
    });
  }
});

// @route   GET /api/plans/:planId
// @desc    Get specific plan details
// @access  Public
router.get('/:planId', optionalAuth, async (req, res) => {
  try {
    const { planId } = req.params;
    const language = req.query.language || req.user?.preferredLanguage || 'english';
    
    const plan = await Plan.findById(planId);
    
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }

    if (!plan.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Plan is not available'
      });
    }

    const planData = plan.getLocalizedDetails(language);
    
    res.status(200).json({
      success: true,
      data: { plan: planData }
    });

  } catch (error) {
    console.error('Get plan error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch plan details'
    });
  }
});

// Admin routes for plan management

// @route   POST /api/plans
// @desc    Create new plan (Admin only)
// @access  Private/Admin
router.post('/', authenticateToken, requireAdmin, [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Plan name is required'),
  body('displayName.en')
    .trim()
    .notEmpty()
    .withMessage('English display name is required'),
  body('displayName.hi')
    .trim()
    .notEmpty()
    .withMessage('Hindi display name is required'),
  body('displayName.te')
    .trim()
    .notEmpty()
    .withMessage('Telugu display name is required'),
  body('description.en')
    .trim()
    .notEmpty()
    .withMessage('English description is required'),
  body('description.hi')
    .trim()
    .notEmpty()
    .withMessage('Hindi description is required'),
  body('description.te')
    .trim()
    .notEmpty()
    .withMessage('Telugu description is required'),
  body('price.monthly')
    .isFloat({ min: 0 })
    .withMessage('Monthly price must be a positive number'),
  body('price.yearly')
    .isFloat({ min: 0 })
    .withMessage('Yearly price must be a positive number'),
  body('planType')
    .isIn(['free', 'basic', 'premium', 'enterprise'])
    .withMessage('Invalid plan type'),
  body('limits.callLimit')
    .isInt({ min: 0 })
    .withMessage('Call limit must be a positive integer'),
  body('limits.callDurationLimit')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Call duration limit must be a positive integer'),
  body('limits.smsLimit')
    .optional()
    .isInt({ min: 0 })
    .withMessage('SMS limit must be a positive integer')
], handleValidationErrors, async (req, res) => {
  try {
    const planData = req.body;
    
    // Check if plan name already exists
    const existingPlan = await Plan.findOne({ name: planData.name });
    if (existingPlan) {
      return res.status(409).json({
        success: false,
        message: 'Plan with this name already exists'
      });
    }

    const plan = new Plan(planData);
    await plan.save();
    
    res.status(201).json({
      success: true,
      message: 'Plan created successfully',
      data: { plan }
    });

  } catch (error) {
    console.error('Create plan error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create plan'
    });
  }
});

// @route   PUT /api/plans/:planId
// @desc    Update plan (Admin only)
// @access  Private/Admin
router.put('/:planId', authenticateToken, requireAdmin, [
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Plan name cannot be empty'),
  body('displayName.en')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('English display name cannot be empty'),
  body('displayName.hi')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Hindi display name cannot be empty'),
  body('displayName.te')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Telugu display name cannot be empty'),
  body('price.monthly')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Monthly price must be a positive number'),
  body('price.yearly')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Yearly price must be a positive number'),
  body('planType')
    .optional()
    .isIn(['free', 'basic', 'premium', 'enterprise'])
    .withMessage('Invalid plan type'),
  body('limits.callLimit')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Call limit must be a positive integer'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
], handleValidationErrors, async (req, res) => {
  try {
    const { planId } = req.params;
    const updates = req.body;
    
    const plan = await Plan.findByIdAndUpdate(
      planId,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Plan updated successfully',
      data: { plan }
    });

  } catch (error) {
    console.error('Update plan error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update plan'
    });
  }
});

// @route   DELETE /api/plans/:planId
// @desc    Delete plan (Admin only)
// @access  Private/Admin
router.delete('/:planId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { planId } = req.params;
    
    const plan = await Plan.findByIdAndUpdate(
      planId,
      { isActive: false },
      { new: true }
    );

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Plan deactivated successfully'
    });

  } catch (error) {
    console.error('Delete plan error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete plan'
    });
  }
});

// @route   GET /api/plans/admin/all
// @desc    Get all plans including inactive (Admin only)
// @access  Private/Admin
router.get('/admin/all', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const plans = await Plan.find({})
      .sort({ sortOrder: 1, createdAt: -1 });
    
    res.status(200).json({
      success: true,
      data: { plans }
    });

  } catch (error) {
    console.error('Get all plans error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch plans'
    });
  }
});

module.exports = router;
