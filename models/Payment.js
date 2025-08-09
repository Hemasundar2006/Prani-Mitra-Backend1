const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan',
    required: true
  },
  orderId: {
    type: String,
    required: true,
    unique: true
  },
  razorpayOrderId: {
    type: String,
    required: true
  },
  razorpayPaymentId: String,
  razorpaySignature: String,
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR'
  },
  billingCycle: {
    type: String,
    enum: ['monthly', 'yearly'],
    required: true
  },
  status: {
    type: String,
    enum: ['created', 'pending', 'paid', 'failed', 'refunded', 'cancelled'],
    default: 'created'
  },
  paymentMethod: {
    type: String,
    enum: ['card', 'netbanking', 'wallet', 'upi', 'emi'],
    default: 'upi'
  },
  discounts: {
    couponCode: String,
    discountAmount: {
      type: Number,
      default: 0
    },
    discountPercentage: {
      type: Number,
      default: 0
    }
  },
  taxes: {
    gst: {
      type: Number,
      default: 0
    },
    totalTax: {
      type: Number,
      default: 0
    }
  },
  subscription: {
    startDate: Date,
    endDate: Date,
    autoRenewal: {
      type: Boolean,
      default: false
    }
  },
  customerDetails: {
    name: String,
    email: String,
    phoneNumber: String,
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      pincode: String,
      country: {
        type: String,
        default: 'IN'
      }
    }
  },
  invoiceDetails: {
    invoiceNumber: String,
    invoiceDate: Date,
    invoiceUrl: String
  },
  refund: {
    refundId: String,
    refundAmount: Number,
    refundDate: Date,
    refundReason: String,
    refundStatus: {
      type: String,
      enum: ['pending', 'processed', 'failed']
    }
  },
  metadata: {
    userAgent: String,
    ipAddress: String,
    device: String,
    source: {
      type: String,
      enum: ['web', 'mobile', 'api'],
      default: 'web'
    }
  },
  webhookEvents: [{
    eventType: String,
    eventData: mongoose.Schema.Types.Mixed,
    receivedAt: {
      type: Date,
      default: Date.now
    }
  }],
  notes: String,
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
paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ orderId: 1 });
paymentSchema.index({ razorpayOrderId: 1 });
paymentSchema.index({ razorpayPaymentId: 1 });
paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ 'subscription.endDate': 1 });

// Virtual for final amount after discounts and taxes
paymentSchema.virtual('finalAmount').get(function() {
  const baseAmount = this.amount;
  const discount = this.discounts.discountAmount || 0;
  const tax = this.taxes.totalTax || 0;
  return baseAmount - discount + tax;
});

// Method to generate invoice number
paymentSchema.methods.generateInvoiceNumber = function() {
  const date = new Date();
  const year = date.getFullYear().toString().substr(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const sequence = this._id.toString().substr(-6).toUpperCase();
  
  return `PM${year}${month}${sequence}`;
};

// Method to calculate subscription dates
paymentSchema.methods.calculateSubscriptionDates = function() {
  const startDate = new Date();
  let endDate = new Date();
  
  if (this.billingCycle === 'monthly') {
    endDate.setMonth(endDate.getMonth() + 1);
  } else if (this.billingCycle === 'yearly') {
    endDate.setFullYear(endDate.getFullYear() + 1);
  }
  
  this.subscription.startDate = startDate;
  this.subscription.endDate = endDate;
  
  return { startDate, endDate };
};

// Method to check if payment is successful
paymentSchema.methods.isSuccessful = function() {
  return this.status === 'paid' && this.razorpayPaymentId;
};

// Static method to get payment analytics
paymentSchema.statics.getAnalytics = function(startDate, endDate) {
  const matchStage = {};
  
  if (startDate && endDate) {
    matchStage.createdAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalPayments: { $sum: 1 },
        totalRevenue: { $sum: '$amount' },
        successfulPayments: {
          $sum: {
            $cond: [{ $eq: ['$status', 'paid'] }, 1, 0]
          }
        },
        totalSuccessfulRevenue: {
          $sum: {
            $cond: [
              { $eq: ['$status', 'paid'] }, 
              '$amount', 
              0
            ]
          }
        },
        paymentMethods: {
          $push: '$paymentMethod'
        },
        billingCycles: {
          $push: '$billingCycle'
        }
      }
    },
    {
      $project: {
        totalPayments: 1,
        totalRevenue: 1,
        successfulPayments: 1,
        totalSuccessfulRevenue: 1,
        successRate: {
          $multiply: [
            { $divide: ['$successfulPayments', '$totalPayments'] },
            100
          ]
        },
        avgTransactionValue: {
          $divide: ['$totalSuccessfulRevenue', '$successfulPayments']
        },
        paymentMethods: 1,
        billingCycles: 1
      }
    }
  ]);
};

// Pre-save middleware
paymentSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Generate invoice number if payment is successful and invoice number doesn't exist
  if (this.status === 'paid' && !this.invoiceDetails.invoiceNumber) {
    this.invoiceDetails.invoiceNumber = this.generateInvoiceNumber();
    this.invoiceDetails.invoiceDate = new Date();
  }
  
  next();
});

module.exports = mongoose.model('Payment', paymentSchema);
