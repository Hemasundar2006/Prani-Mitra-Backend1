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
  // Phone number validation
  ...validatePhoneNumber,
  
  // Password validation with strength requirements
  body('password')
    .isLength({ min: 6, max: 128 })
    .withMessage('Password must be between 6 and 128 characters')
    .matches(/^(?=.*[a-zA-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one letter and one number'),
  
  // Confirm password validation
  body('confirmPassword')
    .notEmpty()
    .withMessage('Please confirm your password')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),
  
  // Name validation
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Name can only contain letters and spaces'),
  
  // Email validation (optional but must be valid if provided)
  body('email')
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage('Please enter a valid email address')
    .normalizeEmail(),
  
  // Language validation
  body('preferredLanguage')
    .optional()
    .isIn(['english', 'hindi', 'telugu'])
    .withMessage('Language must be english, hindi, or telugu'),
  
  // Location validation
  body('location')
    .optional()
    .isObject()
    .withMessage('Location must be an object'),
  
  body('location.state')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('State name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('State name can only contain letters and spaces'),
  
  body('location.district')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('District name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('District name can only contain letters and spaces'),
  
  body('location.village')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Village name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Village name can only contain letters and spaces'),
  
  body('location.pincode')
    .optional({ checkFalsy: true })
    .matches(/^[1-9][0-9]{5}$/)
    .withMessage('Pincode must be 6 digits and cannot start with 0'),
  
  // Farming types validation
  body('farmingTypes')
    .optional()
    .isArray()
    .withMessage('Farming types must be an array')
    .custom((value) => {
      if (Array.isArray(value) && value.length > 5) {
        throw new Error('Cannot select more than 5 farming types');
      }
      return true;
    }),
  
  body('farmingTypes.*')
    .optional()
    .isIn(['crops', 'dairy', 'poultry', 'goats', 'sheep', 'fishery', 'mixed'])
    .withMessage('Invalid farming type. Must be one of: crops, dairy, poultry, goats, sheep, fishery, mixed'),
  
  // Custom validation for required fields
  body()
    .custom((value, { req }) => {
      const { phoneNumber, password, confirmPassword, name } = req.body;
      
      // Check for required fields
      if (!phoneNumber) {
        throw new Error('Phone number is required');
      }
      if (!password) {
        throw new Error('Password is required');
      }
      if (!confirmPassword) {
        throw new Error('Password confirmation is required');
      }
      if (!name || name.trim() === '') {
        throw new Error('Name is required');
      }
      
      return true;
    })
];

const validateLogin = [
  body('identifier')
    .notEmpty()
    .withMessage('Email or phone number is required')
    .custom((value) => {
      // Check if it's a valid email or phone number
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      const isPhone = /^[6-9]\d{9}$/.test(value.replace(/\D/g, ''));
      
      if (!isEmail && !isPhone) {
        throw new Error('Please enter a valid email address or Indian mobile number (10 digits starting with 6-9)');
      }
      return true;
    }),
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
// @validation Comprehensive validation including:
//           - Phone: Indian mobile format (10 digits, starts with 6-9)
//           - Password: Min 6 chars, contains letter & number
//           - Name: 2-100 chars, letters and spaces only
//           - Email: Valid format (optional)
//           - Location: Valid Indian pincode format (optional)
//           - FarmingTypes: Max 5 types from predefined list (optional)
router.post('/register', registerRateLimit, validateRegistration, handleValidationErrors, async (req, res) => {
  try {
    const { phoneNumber, password, name, preferredLanguage, location, farmingTypes, email } = req.body;

    // Normalize and validate phone number
    const phone = phoneNumber.replace(/\D/g, '');
    
    // Additional server-side validation
    if (!/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Indian mobile number format',
        code: 'INVALID_PHONE_FORMAT'
      });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
        code: 'WEAK_PASSWORD'
      });
    }

    // Validate name
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Name must be at least 2 characters long',
        code: 'INVALID_NAME'
      });
    }

    // Validate email if provided
    if (email && email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address',
        code: 'INVALID_EMAIL'
      });
    }

    // Validate farming types if provided
    if (farmingTypes && Array.isArray(farmingTypes)) {
      const validTypes = ['crops', 'dairy', 'poultry', 'goats', 'sheep', 'fishery', 'mixed'];
      const invalidTypes = farmingTypes.filter(type => !validTypes.includes(type));
      
      if (invalidTypes.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid farming types: ${invalidTypes.join(', ')}`,
          code: 'INVALID_FARMING_TYPES'
        });
      }

      if (farmingTypes.length > 5) {
        return res.status(400).json({
          success: false,
          message: 'Cannot select more than 5 farming types',
          code: 'TOO_MANY_FARMING_TYPES'
        });
      }
    }

    // Validate location if provided
    if (location && typeof location === 'object') {
      const { state, district, village, pincode } = location;
      
      if (pincode && !/^[1-9][0-9]{5}$/.test(pincode)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid pincode format',
          code: 'INVALID_PINCODE'
        });
      }
    }

    // Check if user already exists
    const existingUser = await User.findOne({ phoneNumber: phone });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User already exists with this phone number',
        code: 'USER_EXISTS'
      });
    }

    // Check if email is already registered (if provided)
    if (email && email.trim()) {
      const existingEmailUser = await User.findOne({ email: email.trim().toLowerCase() });
      if (existingEmailUser) {
        return res.status(409).json({
          success: false,
          message: 'Email address is already registered',
          code: 'EMAIL_EXISTS'
        });
      }
    }

    // Create new user with sanitized data
    const userData = {
      phoneNumber: phone,
      password,
      name: trimmedName,
      email: email ? email.trim().toLowerCase() : undefined,
      preferredLanguage: preferredLanguage || 'english',
      location: location || {},
      farmingType: farmingTypes || [], // Map farmingTypes to farmingType for database
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
      error: process.env.NODE_ENV === 'production' ? error.message : undefined
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user with email or phone number and password
// @access  Public
// @validation Accepts either email or phone number as identifier
router.post('/login', loginRateLimit, validateLogin, handleValidationErrors, async (req, res) => {
  try {
    const { identifier, password } = req.body;

    // Determine if identifier is email or phone number
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier);
    const isPhone = /^[6-9]\d{9}$/.test(identifier.replace(/\D/g, ''));

    let user;
    let searchField;
    let searchValue;

    if (isEmail) {
      // Search by email
      searchField = 'email';
      searchValue = identifier.toLowerCase().trim();
      user = await User.findOne({ email: searchValue });
    } else if (isPhone) {
      // Search by phone number
      searchField = 'phoneNumber';
      searchValue = identifier.replace(/\D/g, '');
      user = await User.findOne({ phoneNumber: searchValue });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address or phone number',
        code: 'INVALID_IDENTIFIER_FORMAT'
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Invalid credentials',
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

    console.log(`✅ User logged in: ${user.name} (${searchField}: ${searchValue})`);

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
      error: process.env.NODE_ENV === 'production' ? error.message : undefined
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