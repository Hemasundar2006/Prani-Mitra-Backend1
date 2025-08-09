const mongoose = require('mongoose');

const callSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  callId: {
    type: String,
    required: true,
    unique: true
  },
  phoneNumber: {
    type: String,
    required: true
  },
  language: {
    type: String,
    enum: ['english', 'hindi', 'telugu'],
    required: true
  },
  queryType: {
    type: String,
    enum: ['animal_health', 'crop_guidance', 'nutrition', 'emergency', 'general'],
    required: true
  },
  query: {
    text: String,
    audioUrl: String,
    transcription: String
  },
  response: {
    text: String,
    audioUrl: String,
    confidence: {
      type: Number,
      min: 0,
      max: 1
    }
  },
  callDetails: {
    startTime: {
      type: Date,
      required: true
    },
    endTime: Date,
    duration: {
      type: Number, // in seconds
      default: 0
    },
    status: {
      type: String,
      enum: ['initiated', 'connected', 'completed', 'failed', 'abandoned'],
      default: 'initiated'
    }
  },
  aiMetadata: {
    model: String,
    version: String,
    processingTime: Number, // in milliseconds
    tokens: {
      input: Number,
      output: Number
    }
  },
  feedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: String,
    helpful: Boolean,
    categories: [String] // ['accurate', 'clear', 'relevant', 'timely']
  },
  sms: {
    sent: {
      type: Boolean,
      default: false
    },
    sentAt: Date,
    messageId: String,
    summary: String,
    deliveryStatus: {
      type: String,
      enum: ['pending', 'sent', 'delivered', 'failed'],
      default: 'pending'
    }
  },
  location: {
    state: String,
    district: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    }
  },
  cost: {
    type: Number,
    default: 0,
    min: 0
  },
  tags: [String],
  isEmergency: {
    type: Boolean,
    default: false
  },
  followUpRequired: {
    type: Boolean,
    default: false
  },
  followUpDate: Date,
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
callSchema.index({ userId: 1, createdAt: -1 });
callSchema.index({ callId: 1 });
callSchema.index({ phoneNumber: 1, createdAt: -1 });
callSchema.index({ queryType: 1, createdAt: -1 });
callSchema.index({ language: 1 });
callSchema.index({ 'callDetails.status': 1 });
callSchema.index({ isEmergency: 1, createdAt: -1 });

// Virtual for call duration in minutes
callSchema.virtual('durationInMinutes').get(function() {
  return Math.ceil(this.callDetails.duration / 60);
});

// Method to generate call summary for SMS
callSchema.methods.generateSMSSummary = function() {
  const queryTypeMap = {
    animal_health: 'Animal Health',
    crop_guidance: 'Crop Guidance', 
    nutrition: 'Nutrition',
    emergency: 'Emergency',
    general: 'General Query'
  };

  const summary = `Prani Mitra Call Summary
Type: ${queryTypeMap[this.queryType]}
Duration: ${this.durationInMinutes} min
Query: ${this.query.text?.substring(0, 100)}${this.query.text?.length > 100 ? '...' : ''}
Response: ${this.response.text?.substring(0, 150)}${this.response.text?.length > 150 ? '...' : ''}
Date: ${this.createdAt.toLocaleDateString('en-IN')}
Time: ${this.createdAt.toLocaleTimeString('en-IN')}

For more details, login to your Prani Mitra account.`;

  return summary;
};

// Method to calculate call cost
callSchema.methods.calculateCost = function(plan) {
  if (!plan || plan.planType === 'free') {
    return 0;
  }
  
  // Cost calculation logic can be customized
  const baseRate = 0.5; // Base rate per minute
  const duration = this.durationInMinutes;
  
  return Math.round(baseRate * duration * 100) / 100; // Round to 2 decimal places
};

// Static method to get call analytics
callSchema.statics.getAnalytics = function(userId, startDate, endDate) {
  const matchStage = { userId: mongoose.Types.ObjectId(userId) };
  
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
        totalCalls: { $sum: 1 },
        totalDuration: { $sum: '$callDetails.duration' },
        avgDuration: { $avg: '$callDetails.duration' },
        completedCalls: {
          $sum: {
            $cond: [{ $eq: ['$callDetails.status', 'completed'] }, 1, 0]
          }
        },
        queryTypes: {
          $push: '$queryType'
        },
        languages: {
          $push: '$language'
        }
      }
    },
    {
      $project: {
        totalCalls: 1,
        totalDurationMinutes: { $divide: ['$totalDuration', 60] },
        avgDurationMinutes: { $divide: ['$avgDuration', 60] },
        completionRate: { 
          $multiply: [
            { $divide: ['$completedCalls', '$totalCalls'] }, 
            100
          ] 
        },
        queryTypes: 1,
        languages: 1
      }
    }
  ]);
};

// Pre-save middleware
callSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Calculate duration if endTime is set
  if (this.callDetails.endTime && this.callDetails.startTime) {
    this.callDetails.duration = Math.floor(
      (this.callDetails.endTime - this.callDetails.startTime) / 1000
    );
  }
  
  next();
});

module.exports = mongoose.model('Call', callSchema);
