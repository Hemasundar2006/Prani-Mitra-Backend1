const mongoose = require('mongoose');

const recordingAnalysisSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  language: { type: String, enum: ['English', 'Hindi', 'Telugu'], required: true },
  service: { type: String, enum: ['animal-health', 'farming', 'nutrition', 'schemes', 'general'], required: true },
  transcript: { type: String, required: true, maxlength: 8000 },
  summary: { type: String, required: true, maxlength: 4000 },
  immediateAction: { type: String, required: true, maxlength: 4000 },
  urgency: { type: String, enum: ['normal', 'warning', 'urgent'], required: true },
  response: { type: String, required: true, maxlength: 8000 },
  duration: { type: Number, min: 0, max: 3600 },
  audioFormat: { type: String, default: 'wav' },
  audioSampleRate: { type: Number, default: 24000 },
  createdAt: { type: Date, default: Date.now }
});

recordingAnalysisSchema.index({ userId: 1, createdAt: -1 });
module.exports = mongoose.model('RecordingAnalysis', recordingAnalysisSchema);
