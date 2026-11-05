const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ['user', 'assistant'], required: true },
  text: { type: String, maxlength: 8000, required: true },
  audioMetadata: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const conversationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  service: { type: String, required: true, enum: ['farming', 'crop_advice', 'animal_health', 'weather', 'government_schemes', 'market_prices', 'general'] },
  language: { type: String, required: true, enum: ['english', 'hindi', 'telugu'] },
  messages: { type: [messageSchema], default: [] },
  summary: { type: String, maxlength: 4000 },
  duration: { type: Number, min: 0, max: 86400 },
  audioMetadata: { type: mongoose.Schema.Types.Mixed },
  saved: { type: Boolean, default: false },
  bookmarked: { type: Boolean, default: false }
}, { timestamps: true });

conversationSchema.index({ userId: 1, createdAt: -1 });
module.exports = mongoose.model('Conversation', conversationSchema);
