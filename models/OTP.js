const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true,
    match: [/^[6-9]\d{9}$/, 'Please enter a valid Indian mobile number']
  },
  otp: {
    type: String,
    required: true,
    length: 6
  },
  purpose: {
    type: String,
    enum: ['registration', 'login', 'password_reset', 'phone_verification'],
    required: true
  },
  attempts: {
    type: Number,
    default: 0,
    max: 3
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  expiresAt: {
    type: Date,
    required: true,
    default: function() {
      return new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
    }
  },
  smsDetails: {
    messageId: String,
    status: {
      type: String,
      enum: ['pending', 'sent', 'delivered', 'failed'],
      default: 'pending'
    },
    sentAt: Date,
    deliveredAt: Date
  },
  metadata: {
    ipAddress: String,
    userAgent: String,
    source: {
      type: String,
      enum: ['web', 'mobile', 'api'],
      default: 'web'
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries and automatic cleanup
otpSchema.index({ phoneNumber: 1, purpose: 1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index for automatic cleanup
otpSchema.index({ createdAt: 1 });

// Virtual to check if OTP is expired
otpSchema.virtual('isExpired').get(function() {
  return new Date() > this.expiresAt;
});

// Virtual to check if OTP is still valid
otpSchema.virtual('isValid').get(function() {
  return !this.isExpired && !this.isVerified && this.attempts < 3;
});

// Method to generate random 6-digit OTP
otpSchema.statics.generateOTP = function() {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Method to create new OTP
otpSchema.statics.createOTP = async function(phoneNumber, purpose, metadata = {}) {
  try {
    // Invalidate any existing OTPs for this phone number and purpose
    await this.updateMany(
      { phoneNumber, purpose, isVerified: false },
      { isVerified: true } // Mark as verified to prevent reuse
    );

    // Generate new OTP
    const otpCode = this.generateOTP();
    
    const otp = new this({
      phoneNumber,
      otp: otpCode,
      purpose,
      metadata
    });

    await otp.save();
    return { success: true, otp: otpCode, otpId: otp._id };
  } catch (error) {
    console.error('Error creating OTP:', error);
    return { success: false, error: error.message };
  }
};

// Method to verify OTP
otpSchema.statics.verifyOTP = async function(phoneNumber, otpCode, purpose) {
  try {
    const otpRecord = await this.findOne({
      phoneNumber,
      purpose,
      isVerified: false
    }).sort({ createdAt: -1 });

    if (!otpRecord) {
      return { success: false, message: 'OTP not found or already used' };
    }

    if (otpRecord.isExpired) {
      return { success: false, message: 'OTP has expired' };
    }

    if (otpRecord.attempts >= 3) {
      return { success: false, message: 'Maximum verification attempts exceeded' };
    }

    // Increment attempts
    otpRecord.attempts += 1;

    if (otpRecord.otp !== otpCode) {
      await otpRecord.save();
      return { 
        success: false, 
        message: 'Invalid OTP',
        attemptsLeft: 3 - otpRecord.attempts
      };
    }

    // Mark as verified
    otpRecord.isVerified = true;
    await otpRecord.save();

    return { success: true, message: 'OTP verified successfully' };
  } catch (error) {
    console.error('Error verifying OTP:', error);
    return { success: false, error: error.message };
  }
};

// Method to check if phone number has recent OTP
otpSchema.statics.hasRecentOTP = async function(phoneNumber, purpose, timeWindow = 2 * 60 * 1000) {
  const recentTime = new Date(Date.now() - timeWindow);
  
  const recentOTP = await this.findOne({
    phoneNumber,
    purpose,
    createdAt: { $gte: recentTime }
  });

  return !!recentOTP;
};

// Method to get OTP statistics
otpSchema.statics.getOTPStats = async function(phoneNumber, startDate, endDate) {
  const matchStage = { phoneNumber };
  
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
        _id: '$purpose',
        totalRequests: { $sum: 1 },
        successfulVerifications: {
          $sum: {
            $cond: [{ $eq: ['$isVerified', true] }, 1, 0]
          }
        },
        avgAttempts: { $avg: '$attempts' }
      }
    }
  ]);
};

// Pre-save middleware
otpSchema.pre('save', function(next) {
  // Set sentAt timestamp when SMS status changes to sent
  if (this.isModified('smsDetails.status') && this.smsDetails.status === 'sent') {
    this.smsDetails.sentAt = new Date();
  }
  
  // Set deliveredAt timestamp when SMS status changes to delivered
  if (this.isModified('smsDetails.status') && this.smsDetails.status === 'delivered') {
    this.smsDetails.deliveredAt = new Date();
  }
  
  next();
});

module.exports = mongoose.model('OTP', otpSchema);
