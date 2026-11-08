const mongoose = require('mongoose');

const supportContactSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  phone: { type: String, required: true, trim: true, maxlength: 30 },
  category: { type: String, required: true, enum: ['veterinarian', 'animal-hospital', 'agriculture-officer', 'support'] },
  address: { type: String, required: true, trim: true, maxlength: 300 },
  location: { type: { type: String, enum: ['Point'], required: true }, coordinates: { type: [Number], required: true } },
  verified: { type: Boolean, default: false, index: true },
  available: { type: Boolean, default: true }
}, { timestamps: true });

supportContactSchema.index({ location: '2dsphere' });
module.exports = mongoose.model('SupportContact', supportContactSchema);
