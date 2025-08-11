const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: '30d'
  });
};

// Verify JWT token middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-__v');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token - user not found'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    req.user = user;
    req.userId = user._id;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

// Check if user is admin
const requireAdmin = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Authorization failed'
    });
  }
};

// Check if user is admin or support
const requireAdminOrSupport = async (req, res, next) => {
  try {
    if (!['admin', 'support'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Admin or support access required'
      });
    }
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Authorization failed'
    });
  }
};

// Check if user has active subscription or is in free tier
const requireActiveSubscription = async (req, res, next) => {
  try {
    const user = req.user;
    
    // Reset monthly usage if needed
    const resetNeeded = user.resetMonthlyUsage();
    if (resetNeeded) {
      await user.save();
    }
    
    // Allow free tier users with remaining calls
    if (user.subscription.status === 'free') {
      if (user.usage.monthlyCallsUsed >= 10) {
        return res.status(403).json({
          success: false,
          message: 'Free tier monthly limit exceeded. Please upgrade to continue.',
          code: 'FREE_LIMIT_EXCEEDED'
        });
      }
    } else if (!user.hasActiveSubscription()) {
      return res.status(403).json({
        success: false,
        message: 'Active subscription required',
        code: 'SUBSCRIPTION_REQUIRED'
      });
    }
    
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Subscription check failed'
    });
  }
};

// Optional authentication (for public endpoints that benefit from user context)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-__v');
      
      if (user && user.isActive) {
        req.user = user;
        req.userId = user._id;
      }
    }
    
    next();
  } catch (error) {
    // Continue without authentication for optional auth
    next();
  }
};

// Rate limiting for sensitive operations
const createRateLimit = (windowMs, max, message) => {
  const rateLimit = require('express-rate-limit');
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      message
    },
    standardHeaders: true,
    legacyHeaders: false
  });
};

// Specific rate limits
const loginRateLimit = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  10, // 10 login attempts per 15 minutes
  'Too many login attempts. Please try again later.'
);

const registerRateLimit = createRateLimit(
  60 * 60 * 1000, // 1 hour
  5, // 5 registration attempts per hour
  'Too many registration attempts. Please try again later.'
);

const callRateLimit = createRateLimit(
  60 * 1000, // 1 minute
  2, // 2 calls per minute
  'Too many call requests. Please wait before making another call.'
);

module.exports = {
  generateToken,
  authenticateToken,
  requireAdmin,
  requireAdminOrSupport,
  requireActiveSubscription,
  optionalAuth,
  loginRateLimit,
  registerRateLimit,
  callRateLimit
};
