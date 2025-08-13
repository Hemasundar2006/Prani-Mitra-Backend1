const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function createAdminUser() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/prani-mitra', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ 
      $or: [
        { email: 'hemasundarmaroti@gmail.com' },
        { phoneNumber: '9999999999' } // Using a dummy phone number for admin
      ]
    });

    if (existingAdmin) {
      console.log('⚠️  Admin user already exists:');
      console.log(`   Email: ${existingAdmin.email}`);
      console.log(`   Role: ${existingAdmin.role}`);
      console.log(`   Name: ${existingAdmin.name}`);
      
      // Update role to admin if not already
      if (existingAdmin.role !== 'admin') {
        existingAdmin.role = 'admin';
        await existingAdmin.save();
        console.log('✅ Updated existing user to admin role');
      }
      
      return;
    }

    // Create admin user
    const adminUser = new User({
      phoneNumber: '9999999999', // Dummy phone number for admin
      password: 'Ammananna@123',
      name: 'Admin User',
      email: 'hemasundarmaroti@gmail.com',
      preferredLanguage: 'english',
      role: 'admin',
      isVerified: true,
      isActive: true,
      subscription: {
        status: 'active',
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        autoRenewal: true
      },
      usage: {
        totalCalls: 0,
        monthlyCallsUsed: 0,
        lastResetDate: new Date()
      },
      profile: {
        experience: '10+years'
      },
      preferences: {
        notifications: {
          sms: true,
          email: true,
          whatsapp: true
        },
        timezone: 'Asia/Kolkata'
      }
    });

    await adminUser.save();
    
    console.log('✅ Admin user created successfully!');
    console.log('📧 Email: hemasundarmaroti@gmail.com');
    console.log('🔑 Password: Ammananna@123');
    console.log('👤 Role: admin');
    console.log('📱 Phone: 9999999999 (dummy)');
    console.log('✅ Verified: true');
    console.log('✅ Active: true');
    console.log('💳 Subscription: active (1 year)');

  } catch (error) {
    console.error('❌ Error creating admin user:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the script
createAdminUser();
