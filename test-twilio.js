require('dotenv').config();

const accountSid = 'AC7d45cbb4e7d23ab47f7337fad91302e7';
const authToken = 'b03f4f09fdcebcaec803761ebc9ae72b';
const verifyServiceSid = 'VA694aaa79bb0ac0cb447d2a18b7859f2f';

const client = require('twilio')(accountSid, authToken);

async function testTwilioVerify() {
  try {
    console.log('🧪 Testing Twilio Verify Service...');
    console.log('Account SID:', accountSid);
    console.log('Verify Service SID:', verifyServiceSid);
    
    // Test phone number (replace with your actual test number)
    const testPhoneNumber = '+919666180813'; // Your number from the example
    
    console.log('\n📱 Sending OTP to:', testPhoneNumber);
    
    // Send verification
    const verification = await client.verify.v2
      .services(verifyServiceSid)
      .verifications
      .create({
        to: testPhoneNumber,
        channel: 'sms'
      });
    
    console.log('✅ OTP sent successfully!');
    console.log('Verification SID:', verification.sid);
    console.log('Status:', verification.status);
    console.log('Valid until:', verification.validUntil);
    
    console.log('\n🔢 Please enter the OTP you received to test verification...');
    console.log('You can test verification with:');
    console.log(`node -e "
      const client = require('twilio')('${accountSid}', '${authToken}');
      client.verify.v2.services('${verifyServiceSid}')
        .verificationChecks
        .create({to: '${testPhoneNumber}', code: 'YOUR_OTP_HERE'})
        .then(check => console.log('Verification result:', check.status));
    "`);
    
  } catch (error) {
    console.error('❌ Twilio test failed:', error.message);
    
    if (error.code === 20003) {
      console.log('💡 This error usually means invalid credentials.');
    } else if (error.code === 21211) {
      console.log('💡 This error usually means invalid phone number format.');
    } else if (error.code === 21408) {
      console.log('💡 This error usually means permission denied or invalid service SID.');
    }
  }
}

// Run the test
testTwilioVerify();
