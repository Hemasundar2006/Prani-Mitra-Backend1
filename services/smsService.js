const axios = require('axios');

// MSG91 SMS Service
class MSG91Service {
  constructor() {
    this.apiKey = process.env.MSG91_API_KEY;
    this.senderId = process.env.MSG91_SENDER_ID || 'PRANMT';
    this.route = process.env.MSG91_ROUTE || '4';
    this.baseUrl = 'https://api.msg91.com/api';
  }

  async sendSMS(phoneNumber, message, templateId = null) {
    try {
      const data = {
        sender: this.senderId,
        route: this.route,
        country: '91',
        sms: [{
          message: message,
          to: [phoneNumber]
        }]
      };

      if (templateId) {
        data.template_id = templateId;
      }

      const response = await axios.post(`${this.baseUrl}/sendhttp.php`, data, {
        headers: {
          'authkey': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: response.data.type === 'success',
        messageId: response.data.message || 'unknown',
        response: response.data
      };
    } catch (error) {
      console.error('MSG91 SMS Error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  async sendOTP(phoneNumber, otp) {
    try {
      const response = await axios.post(`${this.baseUrl}/sendotp.php`, {
        authkey: this.apiKey,
        mobile: phoneNumber,
        otp: otp,
        sender: this.senderId,
        message: `Your Prani Mitra verification code is ${otp}. Valid for 10 minutes. Do not share with anyone.`
      });

      return {
        success: response.data.type === 'success',
        messageId: response.data.message || 'unknown',
        response: response.data
      };
    } catch (error) {
      console.error('MSG91 OTP Error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }

  async getDeliveryStatus(messageId) {
    try {
      const response = await axios.post(`${this.baseUrl}/status.php`, {
        authkey: this.apiKey,
        message_id: messageId
      });

      return {
        success: true,
        status: response.data
      };
    } catch (error) {
      console.error('MSG91 Status Error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }
}

// Twilio SMS Service with Verify API
class TwilioService {
  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.phoneNumber = process.env.TWILIO_PHONE_NUMBER;
    this.verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID || 'VA694aaa79bb0ac0cb447d2a18b7859f2f';
    
    if (this.accountSid && this.authToken) {
      this.client = require('twilio')(this.accountSid, this.authToken);
    }
  }

  async sendSMS(phoneNumber, message) {
    try {
      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      const response = await this.client.messages.create({
        body: message,
        from: this.phoneNumber,
        to: `+91${phoneNumber}`
      });

      return {
        success: true,
        messageId: response.sid,
        response: response
      };
    } catch (error) {
      console.error('Twilio SMS Error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendOTP(phoneNumber, otp) {
    try {
      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      // Use Twilio Verify service to send OTP
      const verification = await this.client.verify.v2
        .services(this.verifyServiceSid)
        .verifications
        .create({
          to: `+91${phoneNumber}`,
          channel: 'sms'
        });

      return {
        success: true,
        messageId: verification.sid,
        response: verification
      };
    } catch (error) {
      console.error('Twilio Verify OTP Error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async verifyOTP(phoneNumber, otp) {
    try {
      if (!this.client) {
        throw new Error('Twilio client not initialized');
      }

      const verificationCheck = await this.client.verify.v2
        .services(this.verifyServiceSid)
        .verificationChecks
        .create({
          to: `+91${phoneNumber}`,
          code: otp
        });

      return {
        success: verificationCheck.status === 'approved',
        status: verificationCheck.status,
        response: verificationCheck
      };
    } catch (error) {
      console.error('Twilio Verify Check Error:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
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
    // Determine which service to use based on environment variables
    // Check if MSG91 is properly configured (not placeholder)
    const hasMSG91 = process.env.MSG91_API_KEY && 
                     process.env.MSG91_API_KEY !== 'your_msg91_api_key' && 
                     process.env.MSG91_API_KEY.length > 10;
    
    // Check if Twilio is properly configured
    const hasTwilio = process.env.TWILIO_ACCOUNT_SID && 
                      process.env.TWILIO_AUTH_TOKEN &&
                      process.env.TWILIO_ACCOUNT_SID.startsWith('AC') &&
                      process.env.TWILIO_AUTH_TOKEN.length > 20;
    
    if (hasTwilio) {
      this.provider = new TwilioService();
      this.providerName = 'Twilio';
      console.log('✅ Twilio SMS service configured');
    } else if (hasMSG91) {
      this.provider = new MSG91Service();
      this.providerName = 'MSG91';
      console.log('✅ MSG91 SMS service configured');
    } else {
      console.warn('⚠️  No SMS service properly configured. Using mock service.');
      console.warn('MSG91 configured:', hasMSG91);
      console.warn('Twilio configured:', hasTwilio);
      this.provider = new MockSMSService();
      this.providerName = 'Mock';
    }
    
    console.log(`📱 SMS Service initialized with provider: ${this.providerName}`);
  }

  async sendSMS(phoneNumber, message, templateId = null) {
    console.log(`Sending SMS via ${this.providerName} to ${phoneNumber}`);
    return this.provider.sendSMS(phoneNumber, message, templateId);
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
  async sendSMS(phoneNumber, message, templateId = null) {
    console.log('=== MOCK SMS ===');
    console.log(`To: ${phoneNumber}`);
    console.log(`Message: ${message}`);
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
  sendSMS: (phoneNumber, message, templateId) => smsService.sendSMS(phoneNumber, message, templateId),
  sendOTP: (phoneNumber, otp) => smsService.sendOTP(phoneNumber, otp),
  sendCallSummary: (phoneNumber, callSummary) => smsService.sendCallSummary(phoneNumber, callSummary),
  sendSubscriptionNotification: (phoneNumber, type, data) => smsService.sendSubscriptionNotification(phoneNumber, type, data),
  sendEmergencyAlert: (phoneNumber, alertMessage) => smsService.sendEmergencyAlert(phoneNumber, alertMessage),
  getDeliveryStatus: (messageId) => smsService.getDeliveryStatus(messageId),
  getProviderName: () => smsService.providerName
};
