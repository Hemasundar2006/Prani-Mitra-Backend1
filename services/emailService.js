const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    try {
      // Prefer configured SMTP (e.g., Gmail) whenever credentials are present
      if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
        const useGmail = (process.env.EMAIL_SERVICE || 'gmail').toLowerCase() === 'gmail';
        this.transporter = nodemailer.createTransport(
          useGmail
            ? {
                host: 'smtp.gmail.com',
                port: 465,
                secure: true,
                auth: {
                  user: process.env.EMAIL_USER,
                  pass: process.env.EMAIL_PASSWORD
                }
              }
            : {
                service: process.env.EMAIL_SERVICE,
                auth: {
                  user: process.env.EMAIL_USER,
                  pass: process.env.EMAIL_PASSWORD
                }
              }
        );
        console.log(`✅ Email transporter initialized with ${useGmail ? 'Gmail' : process.env.EMAIL_SERVICE}`);
      } else {
        // Fallback to Ethereal for development testing
        this.transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: process.env.ETHEREAL_USER || 'test@ethereal.email',
            pass: process.env.ETHEREAL_PASS || 'test123'
          }
        });
        console.log('⚠️ Using Ethereal email for development (no Gmail credentials found)');
      }
    } catch (error) {
      console.error('❌ Email transporter initialization error:', error);
    }
  }

  // Verify transporter configuration
  async verifyTransporter() {
    if (!this.transporter) {
      console.warn('⚠️ Email transporter not configured');
      return false;
    }

    try {
      await this.transporter.verify();
      console.log('✅ Email transporter verified successfully');
      return true;
    } catch (error) {
      console.error('❌ Email transporter verification failed:', error);
      return false;
    }
  }

  // Test email functionality
  async testEmail(toEmail = 'test@example.com') {
    try {
      if (!this.transporter) {
        return {
          success: false,
          error: 'Email transporter not configured'
        };
      }

      const testMailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@pranimitra.com',
        to: toEmail,
        subject: 'Prani Mitra - Email Service Test',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #4CAF50;">✅ Email Service Test Successful!</h2>
            <p>This is a test email to verify that the Prani Mitra email service is working correctly.</p>
            <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
            <p><strong>Environment:</strong> ${process.env.NODE_ENV || 'development'}</p>
          </div>
        `,
        text: 'Email Service Test Successful! This is a test email to verify that the Prani Mitra email service is working correctly.'
      };

      const result = await this.transporter.sendMail(testMailOptions);
      
      console.log(`✅ Test email sent successfully: ${result.messageId}`);
      
      return {
        success: true,
        messageId: result.messageId,
        email: toEmail
      };

    } catch (error) {
      console.error('❌ Test email error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Send welcome email
  async sendWelcomeEmail(userData) {
    try {
      const { name, email, phoneNumber, preferredLanguage = 'english' } = userData;

      if (!email) {
        console.log('No email provided for welcome email');
        return { success: false, message: 'No email address provided' };
      }

      const emailContent = this.generateWelcomeEmailContent(name, preferredLanguage);

      // Optional inline banner image (CID) if a local path is provided
      const attachments = [];
      if (process.env.WELCOME_BANNER_PATH) {
        attachments.push({
          filename: 'welcome-banner',
          path: process.env.WELCOME_BANNER_PATH,
          cid: 'welcomeBanner'
        });
      }

      const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@pranimitra.com',
        to: email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
      };

      if (attachments.length > 0) {
        mailOptions.attachments = attachments;
      }

      const result = await this.transporter.sendMail(mailOptions);
      
      console.log(`✅ Welcome email sent to ${email}: ${result.messageId}`);
      
      return {
        success: true,
        messageId: result.messageId,
        email: email
      };

    } catch (error) {
      console.error('Send welcome email error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Generate welcome email content
  generateWelcomeEmailContent(name, language = 'english') {
    const startupName = process.env.STARTUP_NAME || 'Prani Mitra';
    const tollFree = process.env.TOLL_FREE_NUMBER || '04041893203';
    const website = process.env.WEBSITE_URL || process.env.FRONTEND_URL || 'https://prani-mitra1.vercel.app';
    const bannerHTML = process.env.WELCOME_BANNER_PATH
      ? '<img src="cid:welcomeBanner" alt="Welcome banner" style="width:100%;max-width:100%;display:block;border-radius:8px;margin-bottom:16px;" />'
      : '';

    const templates = {
      english: {
        subject: `🌾 Welcome to ${startupName} – Your Farming Assistant in Your Language!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; background: #ffffff;">
            ${bannerHTML}
            <h2 style="margin: 0 0 16px; color: #2e7d32;">Namaskaram ${name},</h2>
            <p style="color: #444; line-height: 1.7; margin: 0 0 16px;">
              Welcome to <strong>${startupName}</strong> – your trusted voice-based farming helpdesk! We’re here to answer your farming questions, give you updates, and connect you to important schemes in your own language.
            </p>

            <h3 style="color: #1b5e20; margin: 24px 0 12px;">📞 How it works:</h3>
            <ol style="color: #444; line-height: 1.8; padding-left: 20px; margin: 0 0 8px;">
              <li>Call our toll-free number: <strong>${tollFree}</strong></li>
              <li>Select your language (తెలుగు / हिन्दी / English)</li>
              <li>Choose a service:</li>
            </ol>
            <ul style="color: #444; line-height: 1.8; margin: 8px 0 16px; padding-left: 20px;">
              <li>🌱 Crop Care advice</li>
              <li>🐄 Livestock help</li>
              <li>☀️ Weather updates</li>
              <li>🏛 Government schemes</li>
            </ul>

            <p style="color: #444; line-height: 1.7; margin: 16px 0;">
              💡 No internet needed. Just call and get instant answers from our AI-powered assistant, available 24/7.
            </p>

            <p style="color: #444; line-height: 1.7; margin: 16px 0;">
              We’re excited to support you in growing healthier crops, caring for your livestock, and staying informed.
            </p>

            <p style="color: #2e7d32; font-weight: bold; margin: 24px 0 8px;">Happy Farming,</p>
            <p style="color: #444; margin: 0 0 4px;">Team ${startupName}</p>
            <p style="color: #444; margin: 0 0 4px;">📞 Helpline: ${tollFree}</p>
            <p style="color: #444; margin: 0;">🌐 Website: <a href="${website}" style="color: #2e7d32; text-decoration: none;">${website}</a></p>
          </div>
        `,
        text: `
Namaskaram ${name},

Welcome to ${startupName} – your trusted voice-based farming helpdesk! We’re here to answer your farming questions, give you updates, and connect you to important schemes in your own language.

How it works:
1) Call our toll-free number: ${tollFree}
2) Select your language (తెలుగు / हिन्दी / English)
3) Choose a service:
   - 🌱 Crop Care advice
   - 🐄 Livestock help
   - ☀️ Weather updates
   - 🏛 Government schemes

No internet needed. Just call and get instant answers from our AI-powered assistant, available 24/7.

We’re excited to support you in growing healthier crops, caring for your livestock, and staying informed.

Happy Farming,
Team ${startupName}
📞 Helpline: ${tollFree}
🌐 Website: ${website}
        `
      },
      hindi: {
        subject: `🌾 ${startupName} में आपका स्वागत है – आपकी भाषा में कृषि सहायक!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; background: #ffffff;">
            ${bannerHTML}
            <h2 style="margin: 0 0 16px; color: #2e7d32;">नमस्ते ${name},</h2>
            <p style="color: #444; line-height: 1.7; margin: 0 0 16px;">
              <strong>${startupName}</strong> में आपका स्वागत है – आपका भरोसेमंद वॉइस-बेस्ड कृषि हेल्पडेस्क! हम आपकी खेती से जुड़ी समस्याओं के जवाब, अपडेट, और सरकारी योजनाओं की जानकारी आपकी अपनी भाषा में देते हैं।
            </p>

            <h3 style="color: #1b5e20; margin: 24px 0 12px;">📞 यह कैसे काम करता है:</h3>
            <ol style="color: #444; line-height: 1.8; padding-left: 20px; margin: 0 0 8px;">
              <li>हमारा टोल-फ्री नंबर डायल करें: <strong>${tollFree}</strong></li>
              <li>भाषा चुनें (తెలుగు / हिन्दी / English)</li>
              <li>सेवा चुनें:</li>
            </ol>
            <ul style="color: #444; line-height: 1.8; margin: 8px 0 16px; padding-left: 20px;">
              <li>🌱 फसल देखभाल सलाह</li>
              <li>🐄 पशुधन सहायता</li>
              <li>☀️ मौसम अपडेट</li>
              <li>🏛 सरकारी योजनाएँ</li>
            </ul>

            <p style="color: #444; line-height: 1.7; margin: 16px 0;">
              💡 इंटरनेट की ज़रूरत नहीं। बस कॉल करें और हमारे 24/7 AI सहायक से तुरंत जवाब पाएं।
            </p>

            <p style="color: #444; line-height: 1.7; margin: 16px 0;">
              स्वस्थ फसलों, पशुधन देखभाल और सही जानकारी के लिए हम हमेशा आपके साथ हैं।
            </p>

            <p style="color: #2e7d32; font-weight: bold; margin: 24px 0 8px;">शुभ खेती,</p>
            <p style="color: #444; margin: 0 0 4px;">टीम ${startupName}</p>
            <p style="color: #444; margin: 0 0 4px;">📞 हेल्पलाइन: ${tollFree}</p>
            <p style="color: #444; margin: 0;">🌐 वेबसाइट: <a href="${website}" style="color: #2e7d32; text-decoration: none;">${website}</a></p>
          </div>
        `,
        text: `
नमस्ते ${name},

${startupName} में आपका स्वागत है – आपका भरोसेमंद वॉइस-बेस्ड कृषि हेल्पडेस्क! हम आपकी खेती से जुड़ी समस्याओं के जवाब, अपडेट, और सरकारी योजनाओं की जानकारी आपकी अपनी भाषा में देते हैं।

यह कैसे काम करता है:
1) हमारा टोल-फ्री नंबर डायल करें: ${tollFree}
2) भाषा चुनें (తెలుగు / हिन्दी / English)
3) सेवा चुनें:
   - 🌱 फसल देखभाल सलाह
   - 🐄 पशुधन सहायता
   - ☀️ मौसम अपडेट
   - 🏛 सरकारी योजनाएँ

💡 इंटरनेट की ज़रूरत नहीं। बस कॉल करें और हमारे 24/7 AI सहायक से तुरंत जवाब पाएं।

स्वस्थ फसलों, पशुधन देखभाल और सही जानकारी के लिए हम हमेशा आपके साथ हैं।

शुभ खेती,
टीम ${startupName}
📞 हेल्पलाइन: ${tollFree}
🌐 वेबसाइट: ${website}
        `
      },
      telugu: {
        subject: `🌾 ${startupName} కు స్వాగతం – మీ భాషలో వ్యవసాయ సహాయకుడు!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; background: #ffffff;">
            ${bannerHTML}
            <h2 style="margin: 0 0 16px; color: #2e7d32;">నమస్కారం ${name},</h2>
            <p style="color: #444; line-height: 1.7; margin: 0 0 16px;">
              <strong>${startupName}</strong> కు స్వాగతం – మీ నమ్మకమైన వాయిస్-ఆధారిత వ్యవసాయ హెల్ప్‌డెస్క్! మీ ప్రశ్నలకు సమాధానాలు, తాజా సమాచారం, మరియు ప్రభుత్వ పథకాల గురించి మీ భాషలోనే అందిస్తాము.
            </p>

            <h3 style="color: #1b5e20; margin: 24px 0 12px;">📞 ఇది ఎలా పనిచేస్తుంది:</h3>
            <ol style="color: #444; line-height: 1.8; padding-left: 20px; margin: 0 0 8px;">
              <li>మా టోల్-ఫ్రీ నంబర్‌కు కాల్ చేయండి: <strong>${tollFree}</strong></li>
              <li>మీ భాష ఎంచుకోండి (తెలుగు / हिन्दी / English)</li>
              <li>సేవను ఎంచుకోండి:</li>
            </ol>
            <ul style="color: #444; line-height: 1.8; margin: 8px 0 16px; padding-left: 20px;">
              <li>🌱 పంట సంరక్షణ సూచనలు</li>
              <li>🐄 పశుసంవర్ధక సహాయం</li>
              <li>☀️ వాతావరణ అప్‌డేట్స్</li>
              <li>🏛 ప్రభుత్వ పథకాలు</li>
            </ul>

            <p style="color: #444; line-height: 1.7; margin: 16px 0;">
              💡 ఇంటర్నెట్ అవసరం లేదు. 24/7 అందుబాటులో ఉండే మా AI సహాయకుడి ద్వారా వెంటనే సమాధానాలు పొందండి.
            </p>

            <p style="color: #444; line-height: 1.7; margin: 16px 0;">
              ఆరోగ్యకరమైన పంటలు, పశుసంరక్షణ మరియు సరైన సమాచారం కోసం మేము ఎల్లప్పుడూ మీతో ఉంటాము.
            </p>

            <p style="color: #2e7d32; font-weight: bold; margin: 24px 0 8px;">శుభ వ్యవసాయం,</p>
            <p style="color: #444; margin: 0 0 4px;">Team ${startupName}</p>
            <p style="color: #444; margin: 0 0 4px;">📞 హెల్ప్‌లైన్: ${tollFree}</p>
            <p style="color: #444; margin: 0;">🌐 వెబ్‌సైట్: <a href="${website}" style="color: #2e7d32; text-decoration: none;">${website}</a></p>
          </div>
        `,
        text: `
నమస్కారం ${name},

${startupName} కు స్వాగతం – మీ నమ్మకమైన వాయిస్-ఆధారిత వ్యవసాయ హెల్ప్‌డెస్క్! మీ ప్రశ్నలకు సమాధానాలు, తాజా సమాచారం, మరియు ప్రభుత్వ పథకాల గురించి మీ భాషలోనే అందిస్తాము.

ఇది ఎలా పనిచేస్తుంది:
1) మా టోల్-ఫ్రీ నంబర్‌కు కాల్ చేయండి: ${tollFree}
2) మీ భాష ఎంచుకోండి (తెలుగు / हिन्दी / English)
3) సేవను ఎంచుకోండి:
   - 🌱 పంట సంరక్షణ సూచనలు
   - 🐄 పశుసంవర్ధక సహాయం
   - ☀️ వాతావరణ అప్‌డేట్స్
   - 🏛 ప్రభుత్వ పథకాలు

💡 ఇంటర్నెట్ అవసరం లేదు. 24/7 అందుబాటులో ఉండే మా AI సహాయకుడి ద్వారా వెంటనే సమాధానాలు పొందండి.

ఆరోగ్యకరమైన పంటలు, పశుసంరక్షణ మరియు సరైన సమాచారం కోసం మేము ఎల్లప్పుడూ మీతో ఉంటాము.

శుభ వ్యవసాయం,
Team ${startupName}
📞 హెల్ప్‌లైన్: ${tollFree}
🌐 వెబ్‌సైట్: ${website}
        `
      }
    };

    return templates[language] || templates.english;
  }
}

module.exports = new EmailService();
