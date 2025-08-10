// Load environment variables
require('dotenv').config();

// Twilio SMS Service for Prani Mitra
const twilio = require("twilio");

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const phoneNumber = process.env.TWILIO_PHONE_NUMBER;

// Initialize Twilio client
let client = null;
if (accountSid && authToken && accountSid.startsWith('AC')) {
  client = twilio(accountSid, authToken);
  console.log('✅ Twilio SMS service initialized for production');
} else {
  console.warn('⚠️ Twilio credentials not configured properly');
}

// Production SMS functions
async function sendSMS(recipientNumber, message) {
  try {
    if (!client) {
      throw new Error('Twilio client not initialized. Check your credentials.');
    }

    // Format phone number for India
    const formattedNumber = recipientNumber.startsWith('+91') ? recipientNumber : `+91${recipientNumber}`;

    const response = await client.messages.create({
      body: message,
      from: phoneNumber, // Twilio phone number from env
      to: formattedNumber
    });

    console.log(`✅ SMS sent to ${formattedNumber}: ${response.sid}`);
    
    return {
      success: true,
      messageId: response.sid,
      status: response.status,
      to: response.to,
      from: response.from
    };
  } catch (error) {
    console.error(`❌ SMS failed to ${recipientNumber}:`, error.message);
    return {
      success: false,
      error: error.message,
      code: error.code
    };
  }
}

async function sendOTP(phoneNumber, otp) {
  const message = `Your Prani Mitra verification code is ${otp}. Valid for 10 minutes. Do not share with anyone.`;
  return await sendSMS(phoneNumber, message);
}

async function sendCallSummary(phoneNumber, summary) {
  const message = `Prani Mitra Call Summary:\n\n${summary}\n\nFor support: ${process.env.TOLL_FREE_NUMBER || '1800-123-4567'}`;
  return await sendSMS(phoneNumber, message);
}

async function sendWelcomeMessage(phoneNumber, name) {
  const message = `Welcome to Prani Mitra, ${name}! 🌾 Your account is now active. Call our toll-free number for expert farming advice anytime.`;
  return await sendSMS(phoneNumber, message);
}

async function sendSubscriptionAlert(phoneNumber, planName, expiryDate) {
  const message = `Your Prani Mitra ${planName} plan expires on ${expiryDate}. Renew now to continue enjoying premium services. Call ${process.env.TOLL_FREE_NUMBER || '1800-123-4567'}`;
  return await sendSMS(phoneNumber, message);
}

// Test function (for debugging only)
async function testTwilioConnection() {
  try {
    console.log('🧪 Testing Twilio Connection...');
    console.log('Account SID:', accountSid ? `${accountSid.substring(0, 10)}...` : 'Not set');
    console.log('Auth Token:', authToken ? `${authToken.substring(0, 8)}...` : 'Not set');
    console.log('Phone Number:', phoneNumber || 'Not set');

    if (!accountSid || !authToken || !phoneNumber) {
      console.error('❌ Missing Twilio credentials in .env file');
      console.log('\n📝 Please update your .env file with valid Twilio credentials:');
      console.log('TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxx');
      console.log('TWILIO_AUTH_TOKEN=your_auth_token_here');
      console.log('TWILIO_PHONE_NUMBER=+1xxxxxxxxxx');
      return;
    }

    if (!accountSid.startsWith('AC')) {
      console.error('❌ Invalid TWILIO_ACCOUNT_SID - should start with AC');
      return;
    }

    const client = twilio(accountSid, authToken);

    // First, test account access
    console.log('🔍 Testing account access...');
    try {
      const account = await client.api.accounts(accountSid).fetch();
      console.log('✅ Account access successful');
      console.log('Account Status:', account.status);
      console.log('Account Type:', account.type);
    } catch (accountError) {
      console.error('❌ Account access failed:', accountError.message);
      console.log('\n💡 Possible solutions:');
      console.log('1. Check your Account SID and Auth Token at https://console.twilio.com');
      console.log('2. Make sure your Twilio account is active');
      console.log('3. Verify you have SMS capabilities enabled');
      return;
    }

    // Test SMS sending
    console.log('\n📱 Testing SMS sending...');
    const result = await sendSMS("7569116458", "Hello, This is a test message from Prani Mitra backend! Your Twilio SMS is working perfectly.");
    
    if (result.success) {
      console.log('✅ SMS sent successfully!');
      console.log('Message SID:', result.messageId);
      console.log('Status:', result.status);
      console.log('To:', result.to);
      console.log('From:', result.from);
    } else {
      console.log('❌ SMS failed:', result.error);
    }

  } catch (error) {
    console.error('❌ SMS Error:', error.message);
    if (error.code) {
      console.error('Error Code:', error.code);
      
      // Provide specific error guidance
      switch (error.code) {
        case 20003:
          console.log('\n💡 Error 20003 - Authentication Error:');
          console.log('- Your Account SID or Auth Token is incorrect');
          console.log('- Get correct credentials from https://console.twilio.com');
          break;
        case 21211:
          console.log('\n💡 Error 21211 - Invalid Phone Number:');
          console.log('- The "To" phone number is not valid');
          console.log('- Make sure it includes country code (+91 for India)');
          break;
        case 21212:
          console.log('\n💡 Error 21212 - Invalid From Number:');
          console.log('- Your Twilio phone number is not valid');
          console.log('- Check your phone number in Twilio console');
          break;
        case 21614:
          console.log('\n💡 Error 21614 - Invalid From Number:');
          console.log('- The phone number is not owned by your account');
          console.log('- Purchase a phone number in Twilio console');
          break;
        default:
          console.log('\n💡 Check Twilio error documentation:', error.moreInfo);
      }
    }
    if (error.moreInfo) {
      console.error('More Info:', error.moreInfo);
    }
  }
}

// Export functions for use in other modules
module.exports = {
  sendSMS,
  sendOTP,
  sendCallSummary,
  sendWelcomeMessage,
  sendSubscriptionAlert,
  testTwilioConnection
};

// Run test only if this file is executed directly
if (require.main === module) {
  testTwilioConnection();
}