const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const OTP = require('../models/OTP');
const { generateToken, otpRateLimit, loginRateLimit } = require('../middleware/auth');
const { sendOTP } = require('../services/smsService');
const router = express.Router();

// Validation middleware
const validatePhoneNumber = [
  body('phoneNumber')
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Please enter a valid Indian mobile number (10 digits starting with 6-9)')
];

const validateOTP = [
  body('otp')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('OTP must be a 6-digit number')
];

const validateRegistration = [
  ...validatePhoneNumber,
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

// @route   POST /api/auth/send-otp
// @desc    Send OTP to phone number
// @access  Public
router.post('/send-otp', otpRateLimit, validatePhoneNumber, handleValidationErrors, async (req, res) => {
  try {
    const { phoneNumber, purpose = 'login' } = req.body;
    
    // Normalize phone number (remove any spaces, dashes, etc.)
    const phone = phoneNumber.replace(/\D/g, '');
    
    // Additional validation for normalized phone
    if (!/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format',
        code: 'INVALID_PHONE_FORMAT'
      });
    }

    const metadata = {
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      source: req.get('X-Source') || 'web'
    };

    // Check if there's a recent OTP request
    const hasRecentOTP = await OTP.hasRecentOTP(phone, purpose);
    if (hasRecentOTP) {
      return res.status(429).json({
        success: false,
        message: 'Please wait before requesting another OTP',
        code: 'RECENT_OTP_EXISTS',
        retryAfter: 60 // seconds
      });
    }

    // For registration, check if user already exists
    if (purpose === 'registration') {
      const existingUser = await User.findOne({ phoneNumber: phone });
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'User already exists with this phone number',
          code: 'USER_EXISTS'
        });
      }
    }

    // For login, check if user exists
    if (purpose === 'login') {
      const user = await User.findOne({ phoneNumber: phone });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'No account found with this phone number',
          code: 'USER_NOT_FOUND'
        });
      }

      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Account is deactivated',
          code: 'ACCOUNT_DEACTIVATED'
        });
      }
    }

    // Create OTP
    const otpResult = await OTP.createOTP(phone, purpose, metadata);
    if (!otpResult.success) {
      console.error('OTP creation failed:', otpResult.error);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate OTP',
        code: 'OTP_CREATION_FAILED'
      });
    }

    // Send SMS using normalized phone number
    const smsResult = await sendOTP(phone, otpResult.otp);
    
    // Update OTP record with SMS details
    if (otpResult.otpId) {
      await OTP.findByIdAndUpdate(otpResult.otpId, {
        'smsDetails.messageId': smsResult.messageId || null,
        'smsDetails.status': smsResult.success ? 'sent' : 'failed',
        'smsDetails.sentAt': new Date(),
        'smsDetails.provider': smsResult.provider || 'unknown',
        'smsDetails.errorMessage': smsResult.error || null
      });
    }

    if (!smsResult.success) {
      console.error('SMS sending failed:', smsResult.error);
      return res.status(500).json({
        success: false,
        message: 'Failed to send OTP',
        code: 'SMS_FAILED',
        error: process.env.NODE_ENV === 'development' ? smsResult.error : undefined
      });
    }

    // Log successful OTP send
    console.log(`✅ OTP sent successfully to ${phone} for ${purpose}`);

    res.status(200).json({
      success: true,
      message: 'OTP sent successfully',
      data: {
        phoneNumber: phone,
        purpose,
        expiresIn: 600, // 10 minutes in seconds
        messageId: smsResult.messageId,
        provider: smsResult.provider
      }
    });

  } catch (error) {
    console.error('❌ Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP',
      code: 'INTERNAL_SERVER_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/auth/register
// @desc    Register new user with OTP verification
// @access  Public
router.post('/register', loginRateLimit, [...validateRegistration, ...validateOTP], handleValidationErrors, async (req, res) => {
  try {
    const { phoneNumber, otp, name, preferredLanguage, location, farmingType, email } = req.body;

    // Verify OTP
    const otpVerification = await OTP.verifyOTP(phoneNumber, otp, 'registration');
    if (!otpVerification.success) {
      return res.status(400).json({
        success: false,
        message: otpVerification.message,
        code: 'OTP_VERIFICATION_FAILED',
        attemptsLeft: otpVerification.attemptsLeft
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ phoneNumber });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User already exists with this phone number',
        code: 'USER_EXISTS'
      });
    }

    // Create new user
    const userData = {
      phoneNumber,
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

    // Prepare response data
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
      message: 'Registration failed'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user with OTP verification
// @access  Public
router.post('/login', loginRateLimit, [...validatePhoneNumber, ...validateOTP], handleValidationErrors, async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;

    // Verify OTP
    const otpVerification = await OTP.verifyOTP(phoneNumber, otp, 'login');
    if (!otpVerification.success) {
      return res.status(400).json({
        success: false,
        message: otpVerification.message,
        code: 'OTP_VERIFICATION_FAILED',
        attemptsLeft: otpVerification.attemptsLeft
      });
    }

    // Find user
    const user = await User.findOne({ phoneNumber });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this phone number',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated',
        code: 'ACCOUNT_DEACTIVATED'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    
    // Reset monthly usage if needed
    const resetNeeded = user.resetMonthlyUsage();
    await user.save();

    // Generate JWT token
    const token = generateToken(user._id);

    // Prepare response data
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
      message: 'Login failed'
    });
  }
});

// @route   POST /api/auth/verify-phone
// @desc    Verify phone number with OTP
// @access  Public
router.post('/verify-phone', [...validatePhoneNumber, ...validateOTP], handleValidationErrors, async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;

    // Verify OTP
    const otpVerification = await OTP.verifyOTP(phoneNumber, otp, 'phone_verification');
    if (!otpVerification.success) {
      return res.status(400).json({
        success: false,
        message: otpVerification.message,
        code: 'OTP_VERIFICATION_FAILED',
        attemptsLeft: otpVerification.attemptsLeft
      });
    }

    res.status(200).json({
      success: true,
      message: 'Phone number verified successfully',
      data: {
        phoneNumber,
        verified: true
      }
    });

  } catch (error) {
    console.error('Phone verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Phone verification failed'
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

module.exports = router;
