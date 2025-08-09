const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  displayName: {
    en: { type: String, required: true },
    hi: { type: String, required: true },
    te: { type: String, required: true }
  },
  description: {
    en: { type: String, required: true },
    hi: { type: String, required: true },
    te: { type: String, required: true }
  },
  price: {
    monthly: {
      type: Number,
      required: true,
      min: 0
    },
    yearly: {
      type: Number,
      required: true,
      min: 0
    }
  },
  features: [{
    name: {
      en: String,
      hi: String,
      te: String
    },
    included: {
      type: Boolean,
      default: true
    }
  }],
  limits: {
    callLimit: {
      type: Number,
      required: true,
      min: 0
    },
    callDurationLimit: {
      type: Number, // in minutes
      default: 30
    },
    smsLimit: {
      type: Number,
      default: 100
    },
    prioritySupport: {
      type: Boolean,
      default: false
    }
  },
  planType: {
    type: String,
    enum: ['free', 'basic', 'premium', 'enterprise'],
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  metadata: {
    color: {
      type: String,
      default: '#007bff'
    },
    icon: String,
    badge: String,
    popular: {
      type: Boolean,
      default: false
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

// Index for efficient queries
planSchema.index({ planType: 1, isActive: 1 });
planSchema.index({ sortOrder: 1 });

// Virtual for monthly discount percentage
planSchema.virtual('yearlyDiscount').get(function() {
  const monthlyTotal = this.price.monthly * 12;
  const yearlyPrice = this.price.yearly;
  return Math.round(((monthlyTotal - yearlyPrice) / monthlyTotal) * 100);
});

// Method to get localized plan details
planSchema.methods.getLocalizedDetails = function(language = 'en') {
  const langCode = language === 'hindi' ? 'hi' : 
                   language === 'telugu' ? 'te' : 'en';
  
  return {
    id: this._id,
    name: this.name,
    displayName: this.displayName[langCode] || this.displayName.en,
    description: this.description[langCode] || this.description.en,
    price: this.price,
    features: this.features.map(feature => ({
      name: feature.name[langCode] || feature.name.en,
      included: feature.included
    })),
    limits: this.limits,
    planType: this.planType,
    metadata: this.metadata,
    yearlyDiscount: this.yearlyDiscount
  };
};

// Static method to get active plans
planSchema.statics.getActivePlans = function(language = 'en') {
  return this.find({ isActive: true })
    .sort({ sortOrder: 1, planType: 1 })
    .then(plans => plans.map(plan => plan.getLocalizedDetails(language)));
};

// Pre-save middleware
planSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Plan', planSchema);
