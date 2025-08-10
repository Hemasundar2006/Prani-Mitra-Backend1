// SMS Service - Using only Twilio and Mock services

// Import the production Twilio service
const productionSMS = require('./send_sms');

// Twilio SMS Service
class TwilioService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.phoneNumber = process.env.TWILIO_PHONE_NUMBER;
    
    if (this.accountSid && this.authToken && this.accountSid.startsWith('AC')) {
      this.client = require('twilio')(this.accountSid, this.authToken);
      console.log('✅ TwilioService initialized with production SMS');
    } else {
      console.warn('⚠️ TwilioService: Invalid credentials, will use fallback');
    }
  }

  async sendSMS(phoneNumber, purpose) {
    try {
      // Use the production SMS service
      const result = await productionSMS.sendSMS(phoneNumber, purpose);
      return {
        success: result.success,
        messageId: result.messageId,
        response: result
      };
    } catch (error) {
      console.error('❌ Twilio SMS Error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendOTP(phoneNumber, otp) {
    try {
      // Use the production SMS service for OTP
      const result = await productionSMS.sendOTP(phoneNumber, otp);
      return {
        success: result.success,
        messageId: result.messageId,
        response: result
      };
    } catch (error) {
      console.error('❌ Twilio OTP Error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async verifyOTP(phoneNumber, otp) {
    // Since we're using direct SMS instead of Twilio Verify,
    // OTP verification is handled by our local OTP model
    console.log('🔍 Twilio OTP verification delegated to local system');
    return {
      success: true,
      status: 'local_verification',
      message: 'OTP verification handled by local system'
    };
  }

  async getDeliveryStatus(messageId) {
    try {
      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      const message = await this.client.messages(messageId).fetch();
      
      return {
        success: true,
        status: {
          status: message.status,
          errorCode: message.errorCode,
          errorMessage: message.errorMessage
        }
      };
    } catch (error) {
      console.error('Twilio Status Error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// SMS Service Factory
class SMSService {
  constructor() {
    // Determine which service to use - only Twilio or Mock
    // Check if Twilio is properly configured
    const hasTwilio = process.env.TWILIO_ACCOUNT_SID && 
                      process.env.TWILIO_AUTH_TOKEN &&
                      process.env.TWILIO_ACCOUNT_SID.startsWith('AC') &&
                      process.env.TWILIO_AUTH_TOKEN.length > 20;
    
    if (hasTwilio) {
      this.provider = new TwilioService();
      this.providerName = 'Twilio';
      console.log('✅ Twilio SMS service configured');
    } else {
      console.warn('⚠️  Twilio not configured. Using mock service for development.');
      console.warn('Twilio configured:', hasTwilio);
      this.provider = new MockSMSService();
      this.providerName = 'Mock';
    }
    
    console.log(`📱 SMS Service initialized with provider: ${this.providerName}`);
  }

  async sendSMS(phoneNumber, purpose, templateId = null) {
    console.log(`Sending SMS via ${this.providerName} to ${phoneNumber}`);
    return this.provider.sendSMS(phoneNumber, purpose, templateId);
  }

  async sendOTP(phoneNumber, otp) {
    console.log(`📤 Sending OTP via ${this.providerName} to ${phoneNumber}`);
    const result = await this.provider.sendOTP(phoneNumber, otp);
    
    // Add provider info to response
    return {
      ...result,
      provider: this.providerName
    };
  }

  async getDeliveryStatus(messageId) {
    return this.provider.getDeliveryStatus(messageId);
  }

  // Send call summary SMS
  async sendCallSummary(phoneNumber, callSummary) {
    const message = `${callSummary}\n\nFor support: ${process.env.TOLL_FREE_NUMBER || '1800-123-4567'}`;
    return this.sendSMS(phoneNumber, message);
  }

  // Send subscription notification
  async sendSubscriptionNotification(phoneNumber, type, data) {
    let message = '';
    
    switch (type) {
      case 'activation':
        message = `Welcome to Prani Mitra Premium! Your ${data.plan} plan is now active. Enjoy unlimited calls and expert advice.`;
        break;
      case 'expiry_warning':
        message = `Your Prani Mitra subscription expires in ${data.daysLeft} days. Renew now to continue enjoying premium services.`;
        break;
      case 'expired':
        message = `Your Prani Mitra subscription has expired. Renew now to continue accessing premium features.`;
        break;
      case 'renewal':
        message = `Your Prani Mitra subscription has been renewed successfully. Thank you for continuing with us!`;
        break;
      default:
        message = `Prani Mitra notification: ${data.message}`;
    }
    
    return this.sendSMS(phoneNumber, message);
  }

  // Send emergency alert
  async sendEmergencyAlert(phoneNumber, alertMessage) {
    const message = `🚨 EMERGENCY ALERT 🚨\n${alertMessage}\n\nImmediate action required. Call ${process.env.TOLL_FREE_NUMBER || '1800-123-4567'} for assistance.`;
    return this.sendSMS(phoneNumber, message);
  }
}

// Mock SMS Service for development
class MockSMSService {
  async sendSMS(phoneNumber, purpose, templateId = null) {
    console.log('=== MOCK SMS ===');
    console.log(`To: ${phoneNumber}`);
    console.log(`Message: ${purpose}`);
    if (templateId) console.log(`Template ID: ${templateId}`);
    console.log('================');
    
    return {
      success: true,
      messageId: `mock_${Date.now()}`,
      response: { type: 'success', message: 'Mock SMS sent' }
    };
  }

  async sendOTP(phoneNumber, otp) {
    console.log('=== MOCK OTP SMS ===');
    console.log(`To: ${phoneNumber}`);
    console.log(`OTP: ${otp}`);
    console.log('===================');
    
    return {
      success: true,
      messageId: `mock_otp_${Date.now()}`,
      response: { type: 'success', message: 'Mock OTP sent' }
    };
  }

  async getDeliveryStatus(messageId) {
    return {
      success: true,
      status: { status: 'delivered' }
    };
  }
}

// Create singleton instance
const smsService = new SMSService();

// Export functions
module.exports = {
  sendSMS: (phoneNumber, purpose, templateId) => smsService.sendSMS(phoneNumber, purpose, templateId),
  sendOTP: (phoneNumber, otp) => smsService.sendOTP(phoneNumber, otp),
  sendCallSummary: (phoneNumber, callSummary) => smsService.sendCallSummary(phoneNumber, callSummary),
  sendSubscriptionNotification: (phoneNumber, type, data) => smsService.sendSubscriptionNotification(phoneNumber, type, data),
  sendEmergencyAlert: (phoneNumber, alertMessage) => smsService.sendEmergencyAlert(phoneNumber, alertMessage),
  getDeliveryStatus: (messageId) => smsService.getDeliveryStatus(messageId),
  getProviderName: () => smsService.providerName
};
