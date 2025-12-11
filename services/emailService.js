const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  // Send contact form email to admin
  async sendContactFormEmail({ to, fromEmail, name, phone, category, subject, message }) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const safe = (v) => (typeof v === 'string' ? v.replace(/</g, '&lt;').replace(/>/g, '&gt;') : v);

      const mailOptions = {
        from: fromEmail ? `${safe(name)} <${fromEmail}>` : (process.env.EMAIL_USER || 'noreply@pranimitra.com'),
        to: to,
        subject: `[Contact] ${subject || 'New message from contact form'}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 16px;">
            <h2 style="margin: 0 0 12px;">📩 New Contact Message</h2>
            <p style="margin: 0 0 16px; color: #555;">You received a new message from the contact page.</p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="width: 160px; padding: 8px; background: #f6f6f6;">Name</td>
                <td style="padding: 8px;">${safe(name)}</td>
              </tr>
              <tr>
                <td style="width: 160px; padding: 8px; background: #f6f6f6;">Email</td>
                <td style="padding: 8px;">${safe(fromEmail || '-')}</td>
              </tr>
              <tr>
                <td style="width: 160px; padding: 8px; background: #f6f6f6;">Phone</td>
                <td style="padding: 8px;">${safe(phone || '-')}</td>
              </tr>
              <tr>
                <td style="width: 160px; padding: 8px; background: #f6f6f6;">Category</td>
                <td style="padding: 8px;">${safe(category || 'General Inquiry')}</td>
              </tr>
              <tr>
                <td style="width: 160px; padding: 8px; background: #f6f6f6;">Subject</td>
                <td style="padding: 8px;">${safe(subject || 'New Contact Message')}</td>
              </tr>
            </table>
            <div style="margin-top: 16px; padding: 12px; border: 1px solid #eee; border-radius: 6px; background: #fafafa; white-space: pre-wrap;">
              ${safe(message)}
            </div>
            <p style="margin-top: 16px; color: #999; font-size: 12px;">Sent at ${new Date().toLocaleString()}</p>
          </div>
        `
      };

      const result = await this.transporter.sendMail(mailOptions);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error('sendContactFormEmail error:', error);
      return { success: false, error: error.message };
    }
  }

  initializeTransporter() {
    try {
      // Prefer configured SMTP (e.g., Gmail) whenever credentials are present
      if (process.env.EMAIL_USER && (process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS)) {
        const useGmail = (process.env.EMAIL_SERVICE || 'gmail').toLowerCase() === 'gmail';
        this.transporter = nodemailer.createTransport(
          useGmail
            ? {
                host: 'smtp.gmail.com',
                port: 465,
                secure: true,
                auth: {
                  user: process.env.EMAIL_USER,
                  pass: process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS
                }
              }
            : {
                service: process.env.EMAIL_SERVICE,
                auth: {
                  user: process.env.EMAIL_USER,
                  pass: process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS
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
  async testEmail(toEmail = 'marothihemasundar03@gmail.com') {
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
      const { name, email, phoneNumber, preferredLanguage = 'english', role = 'farmer' } = userData;

      if (!email) {
        console.log('No email provided for welcome email');
        return { success: false, message: 'No email address provided' };
      }

      const emailContent = this.generateWelcomeEmailContent(name, preferredLanguage, role);

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

  // Generate welcome email content (role-aware)
  generateWelcomeEmailContent(name, language = 'english', role = 'farmer') {
    const startupName = process.env.STARTUP_NAME || 'Prani Mitra';
    const tollFree = process.env.TOLL_FREE_NUMBER || '04041893203';
    const website = process.env.WEBSITE_URL || process.env.FRONTEND_URL || 'https://prani-mitra1.vercel.app';
    const bannerHTML = process.env.WELCOME_BANNER_PATH
      ? '<img src="cid:welcomeBanner" alt="Welcome banner" style="width:100%;max-width:100%;display:block;border-radius:8px;margin-bottom:16px;" />'
      : '';

    // Admin professional template (English)
    if (role === 'admin') {
      return {
        subject: `👋 Welcome to ${startupName} Admin Portal`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; background: #ffffff;">
            ${bannerHTML}
            <h2 style="margin: 0 0 16px; color: #1e3a8a;">Welcome ${name},</h2>
            <p style="color: #444; line-height: 1.7; margin: 0 0 16px;">
              Your <strong>administrator account</strong> for <strong>${startupName}</strong> has been created successfully.
            </p>
            <h3 style="color: #1e3a8a; margin: 24px 0 12px;">Your access includes:</h3>
            <ul style="color: #444; line-height: 1.8; margin: 8px 0 16px; padding-left: 20px;">
              <li>📊 Dashboard analytics</li>
              <li>👥 User management</li>
              <li>🎟 Voucher and plan operations</li>
              <li>🧾 Exports and reports</li>
            </ul>
            <p style="color: #444; line-height: 1.7; margin: 16px 0;">
              For security, please do not share your credentials. If you need help, contact the core team.
            </p>
            <p style="color: #1e3a8a; font-weight: bold; margin: 24px 0 8px;">Regards,</p>
            <p style="color: #444; margin: 0 0 4px;">${startupName} Platform</p>
            <p style="color: #444; margin: 0 0 4px;">📞 Support: ${tollFree}</p>
            <p style="color: #444; margin: 0;">🌐 Admin: <a href="${website}/admin-dashboard" style="color: #1e3a8a; text-decoration: none;">${website}/admin-dashboard</a></p>
          </div>
        `,
        text: `Welcome ${name},\n\nYour administrator account for ${startupName} has been created successfully.\n\nAccess includes: dashboard analytics, user management, vouchers/plans, and exports. For security, do not share your credentials.\n\nRegards,\n${startupName} Platform\nSupport: ${tollFree}\nAdmin: ${website}/admin-dashboard`
      };
    }

    const templates = {
      english: {
        subject: `🌾 Welcome to ${startupName} – Your Farming Assistant in Your Language!`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; background: #ffffff;">
            ${bannerHTML}
            <h2 style="margin: 0 0 16px; color: #2e7d32;">Namaskaram ${name},</h2>
            <p style="color: #444; line-height: 1.7; margin: 0 0 16px;">
              Welcome to <strong>${startupName}</strong> – your trusted voice-based farming helpdesk! We're here to answer your farming questions, give you updates, and connect you to important schemes in your own language.
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
              <li>🏛 Government schemes</li>
            </ul>

            <p style="color: #444; line-height: 1.7; margin: 16px 0;">
              💡 No internet needed. Just call and get instant answers from our AI-powered assistant, available 24/7.
            </p>

            <p style="color: #444; line-height: 1.7; margin: 16px 0;">
              We're excited to support you in growing healthier crops, caring for your livestock, and staying informed.
            </p>

            <p style="color: #2e7d32; font-weight: bold; margin: 24px 0 8px;">Happy Farming,</p>
            <p style="color: #444; margin: 0 0 4px;">Team ${startupName}</p>
            <p style="color: #444; margin: 0 0 4px;">📞 Helpline: ${tollFree}</p>
            <p style="color: #444; margin: 0;">🌐 Website: <a href="${website}" style="color: #2e7d32; text-decoration: none;">${website}</a></p>
          </div>
        `,
        text: `
Namaskaram ${name},

Welcome to ${startupName} – your trusted voice-based farming helpdesk! We're here to answer your farming questions, give you updates, and connect you to important schemes in your own language.

How it works:
1) Call our toll-free number: ${tollFree}
2) Select your language (తెలుగు / हिन्दी / English)
3) Choose a service:
   - 🌱 Crop Care advice
   - 🐄 Livestock help
   - 🏛 Government schemes

No internet needed. Just call and get instant answers from our AI-powered assistant, available 24/7.

We're excited to support you in growing healthier crops, caring for your livestock, and staying informed.

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
టీమ్ ${startupName}
📞 హెల్ప్‌లైన్: ${tollFree}
🌐 వెబ్‌సైట్: ${website}
        `
      }
    };

    return templates[language] || templates.english;
  }

  // Generate login success email content
  generateLoginSuccessEmailContent(name, language = 'english', loginTime, deviceInfo, ipAddress) {
    const startupName = 'Prani Mitra';
    const tollFree = '1800-XXX-XXXX';
    const website = 'https://prani-mitra1.vercel.app';
    
    const formatTime = (date) => {
      return date.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    };

    const templates = {
      english: {
        subject: `Login Successful - ${startupName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; background: #ffffff;">
            <h2 style="margin: 0 0 16px; color: #2e7d32;">Hello ${name},</h2>
            <p style="color: #444; line-height: 1.7; margin: 0 0 16px;">
              You have successfully logged into your <strong>${startupName}</strong> account.
            </p>

            <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <h3 style="color: #1b5e20; margin: 0 0 12px;">Login Details:</h3>
              <p style="color: #444; margin: 4px 0;"><strong>Time:</strong> ${formatTime(loginTime)}</p>
              <p style="color: #444; margin: 4px 0;"><strong>Device:</strong> ${deviceInfo}</p>
              <p style="color: #444; margin: 4px 0;"><strong>IP Address:</strong> ${ipAddress}</p>
            </div>

            <p style="color: #444; line-height: 1.7; margin: 16px 0;">
              If this login was not authorized by you, please contact our support team immediately.
            </p>

            <p style="color: #2e7d32; font-weight: bold; margin: 24px 0 8px;">Happy Farming,</p>
            <p style="color: #444; margin: 0 0 4px;">Team ${startupName}</p>
            <p style="color: #444; margin: 0 0 4px;">📞 Helpline: ${tollFree}</p>
            <p style="color: #444; margin: 0;">🌐 Website: <a href="${website}" style="color: #2e7d32; text-decoration: none;">${website}</a></p>
          </div>
        `,
        text: `
Hello ${name},

You have successfully logged into your ${startupName} account.

Login Details:
- Time: ${formatTime(loginTime)}
- Device: ${deviceInfo}
- IP Address: ${ipAddress}

If this login was not authorized by you, please contact our support team immediately.

Happy Farming,
Team ${startupName}
📞 Helpline: ${tollFree}
🌐 Website: ${website}
        `
      },
      hindi: {
        subject: `लॉगिन सफल - ${startupName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; background: #ffffff;">
            <h2 style="margin: 0 0 16px; color: #2e7d32;">नमस्ते ${name},</h2>
            <p style="color: #444; line-height: 1.7; margin: 0 0 16px;">
              आपने अपने <strong>${startupName}</strong> खाते में सफलतापूर्वक लॉगिन किया है।
            </p>

            <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <h3 style="color: #1b5e20; margin: 0 0 12px;">लॉगिन विवरण:</h3>
              <p style="color: #444; margin: 4px 0;"><strong>समय:</strong> ${formatTime(loginTime)}</p>
              <p style="color: #444; margin: 4px 0;"><strong>डिवाइस:</strong> ${deviceInfo}</p>
              <p style="color: #444; margin: 4px 0;"><strong>आईपी पता:</strong> ${ipAddress}</p>
            </div>

            <p style="color: #444; line-height: 1.7; margin: 16px 0;">
              यदि यह लॉगिन आपके द्वारा अधिकृत नहीं था, तो कृपया तुरंत हमारी सहायता टीम से संपर्क करें।
            </p>

            <p style="color: #2e7d32; font-weight: bold; margin: 24px 0 8px;">खुशहाल खेती,</p>
            <p style="color: #444; margin: 0 0 4px;">टीम ${startupName}</p>
            <p style="color: #444; margin: 0 0 4px;">📞 हेल्पलाइन: ${tollFree}</p>
            <p style="color: #444; margin: 0;">🌐 वेबसाइट: <a href="${website}" style="color: #2e7d32; text-decoration: none;">${website}</a></p>
          </div>
        `,
        text: `
नमस्ते ${name},

आपने अपने ${startupName} खाते में सफलतापूर्वक लॉगिन किया है।

लॉगिन विवरण:
- समय: ${formatTime(loginTime)}
- डिवाइस: ${deviceInfo}
- आईपी पता: ${ipAddress}

यदि यह लॉगिन आपके द्वारा अधिकृत नहीं था, तो कृपया तुरंत हमारी सहायता टीम से संपर्क करें।

खुशहाल खेती,
टीम ${startupName}
📞 हेल्पलाइन: ${tollFree}
🌐 वेबसाइट: ${website}
        `
      },
      telugu: {
        subject: `లాగిన్ విజయవంతం - ${startupName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; background: #ffffff;">
            <h2 style="margin: 0 0 16px; color: #2e7d32;">నమస్కారం ${name},</h2>
            <p style="color: #444; line-height: 1.7; margin: 0 0 16px;">
              మీరు మీ <strong>${startupName}</strong> ఖాతాలో విజయవంతంగా లాగిన్ అయ్యారు.
            </p>

            <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <h3 style="color: #1b5e20; margin: 0 0 12px;">లాగిన్ వివరాలు:</h3>
              <p style="color: #444; margin: 4px 0;"><strong>సమయం:</strong> ${formatTime(loginTime)}</p>
              <p style="color: #444; margin: 4px 0;"><strong>పరికరం:</strong> ${deviceInfo}</p>
              <p style="color: #444; margin: 4px 0;"><strong>ఐపి చిరునామా:</strong> ${ipAddress}</p>
            </div>

            <p style="color: #444; line-height: 1.7; margin: 16px 0;">
              ఈ లాగిన్ మీరు అధికారం ఇవ్వకపోతే, దయచేసి వెంటనే మా సహాయక బృందాన్ని సంప్రదించండి.
            </p>

            <p style="color: #2e7d32; font-weight: bold; margin: 24px 0 8px;">శుభ వ్యవసాయం,</p>
            <p style="color: #444; margin: 0 0 4px;">టీమ్ ${startupName}</p>
            <p style="color: #444; margin: 0 0 4px;">📞 హెల్ప్‌లైన్: ${tollFree}</p>
            <p style="color: #444; margin: 0;">🌐 వెబ్‌సైట్: <a href="${website}" style="color: #2e7d32; text-decoration: none;">${website}</a></p>
          </div>
        `,
        text: `
నమస్కారం ${name},

మీరు మీ ${startupName} ఖాతాలో విజయవంతంగా లాగిన్ అయ్యారు.

లాగిన్ వివరాలు:
- సమయం: ${formatTime(loginTime)}
- పరికరం: ${deviceInfo}
- ఐపి చిరునామా: ${ipAddress}

ఈ లాగిన్ మీరు అధికారం ఇవ్వకపోతే, దయచేసి వెంటనే మా సహాయక బృందాన్ని సంప్రదించండి.

శుభ వ్యవసాయం,
టీమ్ ${startupName}
📞 హెల్ప్‌లైన్: ${tollFree}
🌐 వెబ్‌సైట్: ${website}
        `
      }
    };

    return templates[language] || templates.english;
  }

  // Send login success email
  async sendLoginSuccessEmail({ to, name, language = 'english', loginTime, deviceInfo, ipAddress }) {
    try {
      if (!this.transporter) {
        throw new Error('Email service not configured');
      }

      const content = this.generateLoginSuccessEmailContent(name, language, loginTime, deviceInfo, ipAddress);

      const mailOptions = {
        from: this.getFromAddress(),
        to: to,
        subject: content.subject,
        html: content.html,
        text: content.text
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      return {
        success: true,
        messageId: result.messageId,
        email: to
      };

    } catch (error) {
      console.error('Login success email error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Send password reset email
  async sendPasswordResetEmail({ to, name, resetUrl, language = 'english' }) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const templates = {
        english: {
          subject: 'Reset Your Prani Mitra Password',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Password Reset - Prani Mitra</title>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #4CAF50, #45a049); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .button { display: inline-block; background: #4CAF50; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                .button:hover { background: #45a049; }
                .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
                .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🐄 Prani Mitra</h1>
                  <p>Your Smart Farming Companion</p>
                </div>
                <div class="content">
                  <h2>Password Reset Request</h2>
                  <p>Hello ${name},</p>
                  <p>We received a request to reset your password for your Prani Mitra account.</p>
                  <p>Click the button below to reset your password:</p>
                  <a href="${resetUrl}" class="button">Reset Password</a>
                  <div class="warning">
                    <strong>⚠️ Important:</strong>
                    <ul>
                      <li>This link will expire in 1 hour</li>
                      <li>If you didn't request this reset, please ignore this email</li>
                      <li>For security, don't share this link with anyone</li>
                    </ul>
                  </div>
                  <p>If the button doesn't work, copy and paste this link into your browser:</p>
                  <p style="word-break: break-all; background: #eee; padding: 10px; border-radius: 5px;">${resetUrl}</p>
                </div>
                <div class="footer">
                  <p>© 2024 Prani Mitra. All rights reserved.</p>
                  <p>This is an automated message, please do not reply.</p>
                </div>
              </div>
            </body>
            </html>
          `
        },
        hindi: {
          subject: 'अपना Prani Mitra पासवर्ड रीसेट करें',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>पासवर्ड रीसेट - Prani Mitra</title>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #4CAF50, #45a049); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .button { display: inline-block; background: #4CAF50; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                .button:hover { background: #45a049; }
                .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
                .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🐄 Prani Mitra</h1>
                  <p>आपका स्मार्ट फार्मिंग साथी</p>
                </div>
                <div class="content">
                  <h2>पासवर्ड रीसेट अनुरोध</h2>
                  <p>नमस्ते ${name},</p>
                  <p>हमें आपके Prani Mitra खाते के लिए पासवर्ड रीसेट करने का अनुरोध प्राप्त हुआ है।</p>
                  <p>अपना पासवर्ड रीसेट करने के लिए नीचे दिए गए बटन पर क्लिक करें:</p>
                  <a href="${resetUrl}" class="button">पासवर्ड रीसेट करें</a>
                  <div class="warning">
                    <strong>⚠️ महत्वपूर्ण:</strong>
                    <ul>
                      <li>यह लिंक 1 घंटे में समाप्त हो जाएगा</li>
                      <li>यदि आपने यह रीसेट नहीं मांगा है, तो कृपया इस ईमेल को नजरअंदाज करें</li>
                      <li>सुरक्षा के लिए, इस लिंक को किसी के साथ साझा न करें</li>
                    </ul>
                  </div>
                  <p>यदि बटन काम नहीं करता है, तो इस लिंक को अपने ब्राउज़र में कॉपी और पेस्ट करें:</p>
                  <p style="word-break: break-all; background: #eee; padding: 10px; border-radius: 5px;">${resetUrl}</p>
                </div>
                <div class="footer">
                  <p>© 2024 Prani Mitra. सभी अधिकार सुरक्षित।</p>
                  <p>यह एक स्वचालित संदेश है, कृपया जवाब न दें।</p>
                </div>
              </div>
            </body>
            </html>
          `
        },
        telugu: {
          subject: 'మీ Prani Mitra పాస్‌వర్డ్‌ను రీసెట్ చేయండి',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>పాస్‌వర్డ్ రీసెట్ - Prani Mitra</title>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #4CAF50, #45a049); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .button { display: inline-block; background: #4CAF50; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                .button:hover { background: #45a049; }
                .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
                .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🐄 Prani Mitra</h1>
                  <p>మీ స్మార్ట్ ఫార్మింగ్ కంపానియన్</p>
                </div>
                <div class="content">
                  <h2>పాస్‌వర్డ్ రీసెట్ అభ్యర్థన</h2>
                  <p>హలో ${name},</p>
                  <p>మీ Prani Mitra ఖాతా కోసం పాస్‌వర్డ్‌ను రీసెట్ చేయమని మాకు అభ్యర్థన వచ్చింది.</p>
                  <p>మీ పాస్‌వర్డ్‌ను రీసెట్ చేయడానికి క్రింది బటన్‌పై క్లిక్ చేయండి:</p>
                  <a href="${resetUrl}" class="button">పాస్‌వర్డ్ రీసెట్ చేయండి</a>
                  <div class="warning">
                    <strong>⚠️ ముఖ్యమైనది:</strong>
                    <ul>
                      <li>ఈ లింక్ 1 గంటలో గడువు ముగుస్తుంది</li>
                      <li>మీరు ఈ రీసెట్‌ను అభ్యర్థించకపోతే, దయచేసి ఈ ఇమెయిల్‌ను విస్మరించండి</li>
                      <li>భద్రత కోసం, ఈ లింక్‌ను ఎవరితోనూ భాగస్వామ్యం చేయకండి</li>
                    </ul>
                  </div>
                  <p>బటన్ పని చేయకపోతే, ఈ లింక్‌ను మీ బ్రౌజర్‌లో కాపీ చేసి పేస్ట్ చేయండి:</p>
                  <p style="word-break: break-all; background: #eee; padding: 10px; border-radius: 5px;">${resetUrl}</p>
                </div>
                <div class="footer">
                  <p>© 2024 Prani Mitra. అన్ని హక్కులు ప్రత్యేకించబడ్డాయి.</p>
                  <p>ఇది స్వయంచాలక సందేశం, దయచేసి ప్రత్యుత్తరం ఇవ్వకండి.</p>
                </div>
              </div>
            </body>
            </html>
          `
        }
      };

      const template = templates[language] || templates.english;

      const mailOptions = {
        from: `"Prani Mitra" <${process.env.EMAIL_USER || 'noreply@pranimitra.com'}>`,
        to: to,
        subject: template.subject,
        html: template.html
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      return {
        success: true,
        messageId: result.messageId,
        email: to
      };

    } catch (error) {
      console.error('Password reset email error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Send password reset confirmation email
  async sendPasswordResetConfirmationEmail({ to, name, language = 'english', resetTime }) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const templates = {
        english: {
          subject: 'Password Reset Successful - Prani Mitra',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Password Reset Successful - Prani Mitra</title>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #4CAF50, #45a049); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .success { background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 20px 0; }
                .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🐄 Prani Mitra</h1>
                  <p>Your Smart Farming Companion</p>
                </div>
                <div class="content">
                  <h2>✅ Password Reset Successful</h2>
                  <p>Hello ${name},</p>
                  <div class="success">
                    <strong>Your password has been successfully reset!</strong>
                    <p>Reset completed at: ${resetTime.toLocaleString()}</p>
                  </div>
                  <p>You can now log in to your Prani Mitra account with your new password.</p>
                  <p>If you did not make this change, please contact our support team immediately.</p>
                </div>
                <div class="footer">
                  <p>© 2024 Prani Mitra. All rights reserved.</p>
                  <p>This is an automated message, please do not reply.</p>
                </div>
              </div>
            </body>
            </html>
          `
        },
        hindi: {
          subject: 'पासवर्ड रीसेट सफल - Prani Mitra',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>पासवर्ड रीसेट सफल - Prani Mitra</title>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #4CAF50, #45a049); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .success { background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 20px 0; }
                .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🐄 Prani Mitra</h1>
                  <p>आपका स्मार्ट फार्मिंग साथी</p>
                </div>
                <div class="content">
                  <h2>✅ पासवर्ड रीसेट सफल</h2>
                  <p>नमस्ते ${name},</p>
                  <div class="success">
                    <strong>आपका पासवर्ड सफलतापूर्वक रीसेट हो गया है!</strong>
                    <p>रीसेट पूरा हुआ: ${resetTime.toLocaleString()}</p>
                  </div>
                  <p>अब आप अपने नए पासवर्ड के साथ अपने Prani Mitra खाते में लॉग इन कर सकते हैं।</p>
                  <p>यदि आपने यह परिवर्तन नहीं किया है, तो कृपया तुरंत हमारी सहायता टीम से संपर्क करें।</p>
                </div>
                <div class="footer">
                  <p>© 2024 Prani Mitra. सभी अधिकार सुरक्षित।</p>
                  <p>यह एक स्वचालित संदेश है, कृपया जवाब न दें।</p>
                </div>
              </div>
            </body>
            </html>
          `
        },
        telugu: {
          subject: 'పాస్‌వర్డ్ రీసెట్ విజయవంతం - Prani Mitra',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>పాస్‌వర్డ్ రీసెట్ విజయవంతం - Prani Mitra</title>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #4CAF50, #45a049); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .success { background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 20px 0; }
                .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🐄 Prani Mitra</h1>
                  <p>మీ స్మార్ట్ ఫార్మింగ్ కంపానియన్</p>
                </div>
                <div class="content">
                  <h2>✅ పాస్‌వర్డ్ రీసెట్ విజయవంతం</h2>
                  <p>హలో ${name},</p>
                  <div class="success">
                    <strong>మీ పాస్‌వర్డ్ విజయవంతంగా రీసెట్ చేయబడింది!</strong>
                    <p>రీసెట్ పూర్తయింది: ${resetTime.toLocaleString()}</p>
                  </div>
                  <p>ఇప్పుడు మీరు మీ కొత్త పాస్‌వర్డ్‌తో మీ Prani Mitra ఖాతాలోకి లాగిన్ చేయవచ్చు.</p>
                  <p>మీరు ఈ మార్పును చేయకపోతే, దయచేసి వెంటనే మా మద్దతు బృందాన్ని సంప్రదించండి.</p>
                </div>
                <div class="footer">
                  <p>© 2024 Prani Mitra. అన్ని హక్కులు ప్రత్యేకించబడ్డాయి.</p>
                  <p>ఇది స్వయంచాలక సందేశం, దయచేసి ప్రత్యుత్తరం ఇవ్వకండి.</p>
                </div>
              </div>
            </body>
            </html>
          `
        }
      };

      const template = templates[language] || templates.english;

      const mailOptions = {
        from: `"Prani Mitra" <${process.env.EMAIL_USER || 'noreply@pranimitra.com'}>`,
        to: to,
        subject: template.subject,
        html: template.html
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      return {
        success: true,
        messageId: result.messageId,
        email: to
      };

    } catch (error) {
      console.error('Password reset confirmation email error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Send verification approval email
  async sendVerificationApprovalEmail({ to, name, language = 'english' }) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const templates = {
        english: {
          subject: 'Account Verification Approved - Prani Mitra',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Verification Approved - Prani Mitra</title>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #4CAF50, #45a049); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .success { background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 20px 0; }
                .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🐄 Prani Mitra</h1>
                  <p>Your Smart Farming Companion</p>
                </div>
                <div class="content">
                  <h2>✅ Account Verification Approved!</h2>
                  <p>Hello ${name},</p>
                  <div class="success">
                    <strong>Congratulations! Your account has been verified successfully.</strong>
                    <p>You can now access all features of Prani Mitra.</p>
                  </div>
                  <p>Your account is now fully activated and you can:</p>
                  <ul>
                    <li>Make unlimited calls to our AI experts</li>
                    <li>Access premium farming guides</li>
                    <li>Get personalized crop advice</li>
                    <li>Connect with other farmers</li>
                  </ul>
                  <p>Thank you for choosing Prani Mitra!</p>
                </div>
                <div class="footer">
                  <p>© 2024 Prani Mitra. All rights reserved.</p>
                  <p>This is an automated message, please do not reply.</p>
                </div>
              </div>
            </body>
            </html>
          `
        },
        hindi: {
          subject: 'खाता सत्यापन स्वीकृत - Prani Mitra',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>सत्यापन स्वीकृत - Prani Mitra</title>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #4CAF50, #45a049); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .success { background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 20px 0; }
                .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🐄 Prani Mitra</h1>
                  <p>आपका स्मार्ट फार्मिंग साथी</p>
                </div>
                <div class="content">
                  <h2>✅ खाता सत्यापन स्वीकृत!</h2>
                  <p>नमस्ते ${name},</p>
                  <div class="success">
                    <strong>बधाई हो! आपका खाता सफलतापूर्वक सत्यापित हो गया है।</strong>
                    <p>अब आप Prani Mitra की सभी सुविधाओं का उपयोग कर सकते हैं।</p>
                  </div>
                  <p>आपका खाता अब पूरी तरह सक्रिय है और आप कर सकते हैं:</p>
                  <ul>
                    <li>हमारे AI विशेषज्ञों से असीमित कॉल करें</li>
                    <li>प्रीमियम फार्मिंग गाइड तक पहुंचें</li>
                    <li>व्यक्तिगत फसल सलाह प्राप्त करें</li>
                    <li>अन्य किसानों से जुड़ें</li>
                  </ul>
                  <p>Prani Mitra चुनने के लिए धन्यवाद!</p>
                </div>
                <div class="footer">
                  <p>© 2024 Prani Mitra. सभी अधिकार सुरक्षित।</p>
                  <p>यह एक स्वचालित संदेश है, कृपया जवाब न दें।</p>
                </div>
              </div>
            </body>
            </html>
          `
        },
        telugu: {
          subject: 'ఖాతా ధృవీకరణ ఆమోదించబడింది - Prani Mitra',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>ధృవీకరణ ఆమోదించబడింది - Prani Mitra</title>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #4CAF50, #45a049); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .success { background: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 20px 0; }
                .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🐄 Prani Mitra</h1>
                  <p>మీ స్మార్ట్ ఫార్మింగ్ కంపానియన్</p>
                </div>
                <div class="content">
                  <h2>✅ ఖాతా ధృవీకరణ ఆమోదించబడింది!</h2>
                  <p>హలో ${name},</p>
                  <div class="success">
                    <strong>అభినందనలు! మీ ఖాతా విజయవంతంగా ధృవీకరించబడింది.</strong>
                    <p>ఇప్పుడు మీ Prani Mitra యొక్క అన్ని లక్షణాలను ఉపయోగించవచ్చు.</p>
                  </div>
                  <p>మీ ఖాతా ఇప్పుడు పూర్తిగా సక్రియం మరియు మీరు చేయవచ్చు:</p>
                  <ul>
                    <li>మా AI నిపుణులకు అపరిమిత కాల్‌లు చేయండి</li>
                    <li>ప్రీమియం ఫార్మింగ్ గైడ్‌లకు ప్రాప్యత పొందండి</li>
                    <li>వ్యక్తిగత పంట సలహాలు పొందండి</li>
                    <li>ఇతర రైతులతో కనెక్ట్ అవండి</li>
                  </ul>
                  <p>ఇంటర్నెట్ అవసరం లేదు. 24/7 అందుబాటులో ఉండే మా AI సహాయకుడి ద్వారా వెంటనే సమాధానాలు పొందండి.</p>
                  <p>ఆరోగ్యకరమైన పంటలు, పశుసంరక్షణ మరియు సరైన సమాచారం కోసం మేము ఎల్లప్పుడూ మీతో ఉంటాము.</p>
                  <p style="color: #2e7d32; font-weight: bold; margin: 24px 0 8px;">శుభ వ్యవసాయం,</p>
                  <p style="color: #444; margin: 0 0 4px;">టీమ్ ${startupName}</p>
                  <p style="color: #444; margin: 0 0 4px;">📞 హెల్ప్‌లైన్: ${tollFree}</p>
                  <p style="color: #444; margin: 0;">🌐 వెబ్‌సైట్: <a href="${website}" style="color: #2e7d32; text-decoration: none;">${website}</a></p>
                </div>
                <div class="footer">
                  <p>© 2024 Prani Mitra. అన్ని హక్కులు ప్రత్యేకించబడ్డాయి.</p>
                  <p>ఇది స్వయంచాలక సందేశం, దయచేసి ప్రత్యుత్తరం ఇవ్వకండి.</p>
                </div>
              </div>
            </body>
            </html>
          `
        }
      };

      const template = templates[language] || templates.english;

      const mailOptions = {
        from: `"Prani Mitra" <${process.env.EMAIL_USER || 'noreply@pranimitra.com'}>`,
        to: to,
        subject: template.subject,
        html: template.html
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      return {
        success: true,
        messageId: result.messageId,
        email: to
      };

    } catch (error) {
      console.error('Verification approval email error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Send verification rejection email
  async sendVerificationRejectionEmail({ to, name, rejectionReason, language = 'english' }) {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      const templates = {
        english: {
          subject: 'Account Verification Update - Prani Mitra',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Verification Update - Prani Mitra</title>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #4CAF50, #45a049); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }
                .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>🐄 Prani Mitra</h1>
                  <p>Your Smart Farming Companion</p>
                </div>
                <div class="content">
                  <h2>📋 Account Verification Update</h2>
                  <p>Hello ${name},</p>
                  <div class="warning">
                    <strong>Your account verification requires additional information.</strong>
                    <p><strong>Reason:</strong> ${rejectionReason}</p>
                  </div>
                  <p>Please review the feedback above and resubmit your verification with the required information.</p>
                  <p>You can resubmit your verification by:</p>
                  <ol>
                    <li>Logging into your account</li>
                    <li>Going to the verification section</li>
                    <li>Uploading the required documents</li>
                    <li>Submitting for review again</li>
                  </ol>
                  <p>If you have any questions, please contact our support team.</p>
                </div>
                <div class="footer">
                  <p>© 2024 Prani Mitra. All rights reserved.</p>
                  <p>This is an automated message, please do not reply.</p>
                </div>
              </div>
            </body>
            </html>
          `
        }
      };

      const template = templates[language] || templates.english;

      const mailOptions = {
        from: `"Prani Mitra" <${process.env.EMAIL_USER || 'noreply@pranimitra.com'}>`,
        to: to,
        subject: template.subject,
        html: template.html
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      return {
        success: true,
        messageId: result.messageId,
        email: to
      };

    } catch (error) {
      console.error('Verification rejection email error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new EmailService();
