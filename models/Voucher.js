const mongoose = require('mongoose');

const voucherSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    minlength: 4,
    maxlength: 20
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    en: String,
    hi: String,
    te: String
  },
  type: {
    type: String,
    enum: ['percentage', 'fixed', 'free_trial'],
    required: true
  },
  value: {
    type: Number,
    required: true,
    min: 0
  },
  maxDiscount: {
    type: Number,
    min: 0
  },
  minOrderAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  applicablePlans: [{
    type: String,
    enum: ['all', 'basic', 'premium', 'enterprise'],
    default: ['all']
  }],
  billingCycles: [{
    type: String,
    enum: ['monthly', 'yearly']
  }],
  usageLimit: {
    type: Number,
    required: true,
    min: 1,
    default: 100
  },
  usage: {
    totalLimit: {
      type: Number,
      min: 1
    },
    perUserLimit: {
      type: Number,
      default: 1,
      min: 1
    },
    totalUsed: {
      type: Number,
      default: 0
    },
    userUsage: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      usedCount: {
        type: Number,
        default: 0
      },
      lastUsed: Date
    }]
  },
  validity: {
    type: Number,
    required: true,
    min: 1,
    max: 365,
    default: 30
  },
  conditions: {
    firstTimeUser: {
      type: Boolean,
      default: false
    },
    userTypes: [{
      type: String,
      enum: ['farmer', 'admin', 'support']
    }],
    locations: [{
      state: String,
      districts: [String]
    }],
    farmingTypes: [{
      type: String,
      enum: ['crops', 'dairy', 'poultry', 'goats', 'sheep', 'fishery', 'mixed']
    }]
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  metadata: {
    campaign: String,
    source: String,
    category: {
      type: String,
      enum: ['welcome', 'seasonal', 'loyalty', 'referral', 'festival', 'special']
    },
    priority: {
      type: Number,
      default: 0
    }
  },
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

// Indexes for efficient queries
voucherSchema.index({ code: 1 });
voucherSchema.index({ isActive: 1, usageLimit: 1 });
voucherSchema.index({ 'usage.totalUsed': 1, 'usage.totalLimit': 1 });
voucherSchema.index({ createdAt: -1 });

// Virtual for checking if voucher is currently valid
voucherSchema.virtual('isCurrentlyValid').get(function() {
  return this.isActive && this.usage.totalUsed < this.usageLimit;
});

// Virtual for remaining usage
voucherSchema.virtual('remainingUsage').get(function() {
  return Math.max(0, this.usageLimit - this.usage.totalUsed);
});

// Method to check if user can use this voucher
voucherSchema.methods.canUserUse = function(userId, user) {
  // Check if voucher is active and valid
  if (!this.isCurrentlyValid) {
    return { canUse: false, reason: 'Voucher is not currently valid' };
  }
  
  // Check total usage limit
  if (this.usage.totalUsed >= this.usageLimit) {
    return { canUse: false, reason: 'Voucher usage limit exceeded' };
  }
  
  // Check per user limit
  const userUsage = this.usage.userUsage.find(u => u.userId.toString() === userId.toString());
  if (userUsage && userUsage.usedCount >= this.usage.perUserLimit) {
    return { canUse: false, reason: 'User has reached usage limit for this voucher' };
  }
  
  // Check user type conditions
  if (this.conditions.userTypes.length > 0 && !this.conditions.userTypes.includes(user.role)) {
    return { canUse: false, reason: 'Voucher not applicable for your user type' };
  }
  
  // Check first time user condition
  if (this.conditions.firstTimeUser && user.subscription.status !== 'free') {
    return { canUse: false, reason: 'Voucher only for first-time users' };
  }
  
  // Check location conditions
  if (this.conditions.locations.length > 0) {
    const userState = user.location?.state;
    const userDistrict = user.location?.district;
    
    const locationMatch = this.conditions.locations.some(loc => {
      if (loc.state !== userState) return false;
      if (loc.districts.length === 0) return true;
      return loc.districts.includes(userDistrict);
    });
    
    if (!locationMatch) {
      return { canUse: false, reason: 'Voucher not applicable for your location' };
    }
  }
  
  // Check farming type conditions
  if (this.conditions.farmingTypes.length > 0) {
    const userFarmingTypes = user.farmingType || [];
    const hasMatchingType = this.conditions.farmingTypes.some(type => 
      userFarmingTypes.includes(type)
    );
    
    if (!hasMatchingType) {
      return { canUse: false, reason: 'Voucher not applicable for your farming type' };
    }
  }
  
  return { canUse: true };
};

// Method to calculate discount amount
voucherSchema.methods.calculateDiscount = function(orderAmount, billingCycle) {
  // Check minimum order amount
  if (orderAmount < this.minOrderAmount) {
    return { discount: 0, error: 'Order amount below minimum required' };
  }
  
  // Check billing cycle applicability
  if (this.billingCycles.length > 0 && !this.billingCycles.includes(billingCycle)) {
    return { discount: 0, error: 'Voucher not applicable for this billing cycle' };
  }
  
  let discount = 0;
  
  if (this.type === 'percentage') {
    discount = (orderAmount * this.value) / 100;
    if (this.maxDiscount && discount > this.maxDiscount) {
      discount = this.maxDiscount;
    }
  } else if (this.type === 'fixed') {
    discount = Math.min(this.value, orderAmount);
  } else if (this.type === 'free_trial') {
    discount = orderAmount; // Full discount for free trial
  }
  
  return { discount: Math.round(discount * 100) / 100 };
};

// Method to apply voucher usage
voucherSchema.methods.applyUsage = function(userId) {
  this.usage.totalUsed += 1;
  
  const userUsageIndex = this.usage.userUsage.findIndex(u => 
    u.userId.toString() === userId.toString()
  );
  
  if (userUsageIndex >= 0) {
    this.usage.userUsage[userUsageIndex].usedCount += 1;
    this.usage.userUsage[userUsageIndex].lastUsed = new Date();
  } else {
    this.usage.userUsage.push({
      userId: userId,
      usedCount: 1,
      lastUsed: new Date()
    });
  }
  
  return this.save();
};

// Static method to find applicable vouchers for user
voucherSchema.statics.findApplicableVouchers = function(userId, user, planType, billingCycle) {
  return this.find({
    isActive: true,
    $or: [
      { 'applicablePlans': 'all' },
      { 'applicablePlans': planType }
    ]
  }).then(vouchers => {
    return vouchers.filter(voucher => {
      const canUse = voucher.canUserUse(userId, user);
      return canUse.canUse;
    });
  });
};

// Pre-save middleware
voucherSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Voucher', voucherSchema);
