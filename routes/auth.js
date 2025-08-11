const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { generateToken, loginRateLimit, registerRateLimit } = require('../middleware/auth');
const router = express.Router();

// Validation middleware
const validatePhoneNumber = [
  body('phoneNumber')
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Please enter a valid Indian mobile number (10 digits starting with 6-9)')
];

const validatePassword = [
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
];

const validateRegistration = [
  ...validatePhoneNumber,
  ...validatePassword,
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
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
    .withMessage('Invalid farming type')
];

const validateLogin = [
  ...validatePhoneNumber,
  ...validatePassword
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

// @route   POST /api/auth/register
// @desc    Register new user with password
// @access  Public
router.post('/register', registerRateLimit, validateRegistration, handleValidationErrors, async (req, res) => {
  try {
    const { phoneNumber, password, name, preferredLanguage, location, farmingType, email } = req.body;

    // Normalize phone number
    const phone = phoneNumber.replace(/\D/g, '');

    // Check if user already exists
    const existingUser = await User.findOne({ phoneNumber: phone });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User already exists with this phone number',
        code: 'USER_EXISTS'
      });
    }

    // Create new user
    const userData = {
      phoneNumber: phone,
      password,
      name,
      email,
      preferredLanguage: preferredLanguage || 'english',
      location: location || {},
      farmingType: farmingType || [],
      isVerified: true,
      lastLogin: new Date()
    };

    const user = new User(userData);
    await user.save();

    // Generate JWT token
    const token = generateToken(user._id);

    // Prepare response data (exclude password)
    const responseUser = {
      id: user._id,
      phoneNumber: user.phoneNumber,
      name: user.name,
      email: user.email,
      preferredLanguage: user.preferredLanguage,
      location: user.location,
      farmingType: user.farmingType,
      subscription: user.subscription,
      usage: user.usage,
      role: user.role,
      isVerified: user.isVerified,
      createdAt: user.createdAt
    };

    console.log(`✅ New user registered: ${user.name} (${phone})`);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: responseUser,
        token,
        tokenType: 'Bearer'
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'User already exists with this phone number',
        code: 'DUPLICATE_USER'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user with phone number and password
// @access  Public
router.post('/login', loginRateLimit, validateLogin, handleValidationErrors, async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;

    // Normalize phone number
    const phone = phoneNumber.replace(/\D/g, '');

    // Find user
    const user = await User.findOne({ phoneNumber: phone });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Invalid phone number or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    
    // Reset monthly usage if needed
    const resetNeeded = user.resetMonthlyUsage();
    await user.save();

    // Generate JWT token
    const token = generateToken(user._id);

    // Prepare response data (exclude password)
    const responseUser = {
      id: user._id,
      phoneNumber: user.phoneNumber,
      name: user.name,
      email: user.email,
      preferredLanguage: user.preferredLanguage,
      location: user.location,
      farmingType: user.farmingType,
      subscription: user.subscription,
      usage: user.usage,
      role: user.role,
      isVerified: user.isVerified,
      lastLogin: user.lastLogin,
      profile: user.profile,
      preferences: user.preferences
    };

    console.log(`✅ User logged in: ${user.name} (${phone})`);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: responseUser,
        token,
        tokenType: 'Bearer',
        usageReset: resetNeeded
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/auth/check-phone
// @desc    Check if phone number is registered
// @access  Public
router.get('/check-phone/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;

    // Validate phone number format
    if (!/^[6-9]\d{9}$/.test(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format',
        code: 'INVALID_PHONE_FORMAT'
      });
    }

    const user = await User.findOne({ phoneNumber }).select('phoneNumber name isActive');
    
    res.status(200).json({
      success: true,
      data: {
        phoneNumber,
        exists: !!user,
        isActive: user?.isActive || false,
        name: user?.name || null
      }
    });

  } catch (error) {
    console.error('Check phone error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check phone number'
    });
  }
});

// @route   GET /api/auth/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile', require('../middleware/auth').authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    
    // Prepare response data (exclude password)
    const responseUser = {
      id: user._id,
      phoneNumber: user.phoneNumber,
      name: user.name,
      email: user.email,
      preferredLanguage: user.preferredLanguage,
      location: user.location,
      farmingType: user.farmingType,
      subscription: user.subscription,
      usage: user.usage,
      role: user.role,
      isVerified: user.isVerified,
      lastLogin: user.lastLogin,
      profile: user.profile,
      preferences: user.preferences,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    };

    res.status(200).json({
      success: true,
      data: {
        user: responseUser
      }
    });

  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
});

module.exports = router;