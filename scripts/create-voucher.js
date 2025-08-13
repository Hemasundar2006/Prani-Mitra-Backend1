const mongoose = require('mongoose');
const Voucher = require('../models/Voucher');
require('dotenv').config();

async function createTestVoucher() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/prani-mitra', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Test voucher data based on your structure
    const voucherData = {
      code: 'B5C6376J',
      name: 'sale',
      type: 'free_trial',
      value: 6,
      validity: 30,
      usageLimit: 100,
      applicablePlans: ['all'],
      isActive: true,
      isPublic: true,
      createdBy: '507f1f77bcf86cd799439011', // Dummy ObjectId - replace with actual admin user ID
      metadata: {
        campaign: 'sale_campaign',
        category: 'special'
      }
    };

    // Check if voucher already exists
    const existingVoucher = await Voucher.findOne({ code: voucherData.code });
    if (existingVoucher) {
      console.log('⚠️  Voucher already exists:');
      console.log(`   Code: ${existingVoucher.code}`);
      console.log(`   Name: ${existingVoucher.name}`);
      console.log(`   Type: ${existingVoucher.type}`);
      console.log(`   Usage: ${existingVoucher.usage.totalUsed}/${existingVoucher.usageLimit}`);
      return;
    }

    // Create voucher
    const voucher = new Voucher(voucherData);
    await voucher.save();
    
    console.log('✅ Voucher created successfully!');
    console.log('🎫 Code:', voucher.code);
    console.log('📝 Name:', voucher.name);
    console.log('💰 Type:', voucher.type);
    console.log('💎 Value:', voucher.value);
    console.log('⏰ Validity (days):', voucher.validity);
    console.log('📊 Usage Limit:', voucher.usageLimit);
    console.log('📋 Applicable Plans:', voucher.applicablePlans);
    console.log('✅ Active:', voucher.isActive);
    console.log('🌐 Public:', voucher.isPublic);

  } catch (error) {
    console.error('❌ Error creating voucher:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the script
createTestVoucher();
