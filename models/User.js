const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    match: [/^[6-9]\d{9}$/, 'Please enter a valid Indian mobile number']
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  location: {
    state: { type: String, trim: true },
    district: { type: String, trim: true },
    village: { type: String, trim: true },
    pincode: { type: String, match: [/^\d{6}$/, 'Please enter a valid pincode'] }
  },
  preferredLanguage: {
    type: String,
    enum: ['english', 'hindi', 'telugu'],
    default: 'english'
  },
  farmingType: {
    type: [String],
    enum: ['crops', 'dairy', 'poultry', 'goats', 'sheep', 'fishery', 'mixed']
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  role: {
    type: String,
    enum: ['farmer', 'admin', 'support'],
    default: 'farmer'
  },
  subscription: {
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan'
    },
    status: {
      type: String,
      enum: ['free', 'active', 'expired', 'cancelled'],
      default: 'free'
    },
    startDate: Date,
    endDate: Date,
    autoRenewal: {
      type: Boolean,
      default: false
    }
  },
  usage: {
    totalCalls: {
      type: Number,
      default: 0
    },
    monthlyCallsUsed: {
      type: Number,
      default: 0
    },
    lastCallDate: Date,
    lastResetDate: {
      type: Date,
      default: Date.now
    }
  },
  profile: {
    avatar: String,
    dateOfBirth: Date,
    gender: {
      type: String,
      enum: ['male', 'female', 'other']
    },
    experience: {
      type: String,
      enum: ['beginner', '1-5years', '5-10years', '10+years']
    }
  },
  preferences: {
    notifications: {
      sms: {
        type: Boolean,
        default: true
      },
      email: {
        type: Boolean,
        default: false
      },
      whatsapp: {
        type: Boolean,
        default: true
      }
    },
    timezone: {
      type: String,
      default: 'Asia/Kolkata'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
userSchema.index({ phoneNumber: 1 });
userSchema.index({ 'subscription.status': 1 });
userSchema.index({ createdAt: -1 });

// Virtual for full name display
userSchema.virtual('displayName').get(function() {
  return this.name || `User ${this.phoneNumber.slice(-4)}`;
});

// Method to check if user has active subscription
userSchema.methods.hasActiveSubscription = function() {
  return this.subscription.status === 'active' && 
         this.subscription.endDate && 
         this.subscription.endDate > new Date();
};

// Method to check monthly call limit
userSchema.methods.canMakeCall = function(plan) {
  if (this.subscription.status === 'free') {
    return this.usage.monthlyCallsUsed < 10; // Free tier limit
  }
  
  if (!this.hasActiveSubscription()) {
    return false;
  }
  
  return plan ? this.usage.monthlyCallsUsed < plan.callLimit : true;
};

// Method to reset monthly usage
userSchema.methods.resetMonthlyUsage = function() {
  const now = new Date();
  const lastReset = this.usage.lastResetDate;
  
  if (!lastReset || 
      now.getMonth() !== lastReset.getMonth() || 
      now.getFullYear() !== lastReset.getFullYear()) {
    this.usage.monthlyCallsUsed = 0;
    this.usage.lastResetDate = now;
    return true;
  }
  
  return false;
};

// Pre-save middleware
userSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('User', userSchema);
