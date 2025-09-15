const express = require('express');
const { body, validationResult } = require('express-validator');
const emailService = require('../services/emailService');

const router = express.Router();

// Helper: validation error handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// @route   POST /api/contact
// @desc    Send contact form message to admin email
// @access  Public
router.post('/', [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('email')
    .isEmail()
    .withMessage('Valid email address is required')
    .normalizeEmail(),
  body('phone')
    .optional({ checkFalsy: true })
    .matches(/^[0-9+\-()\s]{7,20}$/)
    .withMessage('Phone must be 7-20 characters (digits and + - ( ) space)'),
  body('category')
    .optional({ checkFalsy: true })
    .custom((value) => {
      const allowed = ['General Inquiry', 'Technical Support', 'Billing & Plans', 'Feedback', 'Partnership'];
      const aliases = ['Support', 'Billing', 'General'];
      return allowed.includes(value) || aliases.includes(value);
    })
    .withMessage('Invalid category'),
  body('subject')
    .optional({ checkFalsy: true })
    .isLength({ max: 150 })
    .withMessage('Subject must not exceed 150 characters'),
  body('message')
    .trim()
    .isLength({ min: 10, max: 2000 })
    .withMessage('Message must be between 10 and 2000 characters')
], handleValidationErrors, async (req, res) => {
  try {
    const { name, email, phone, category, subject, message } = req.body;

    // Normalize category aliases from UI to backend canonical values
    let normalizedCategory = category || 'General Inquiry';
    if (normalizedCategory === 'Support') normalizedCategory = 'Technical Support';
    if (normalizedCategory === 'Billing') normalizedCategory = 'Billing & Plans';
    if (normalizedCategory === 'General') normalizedCategory = 'General Inquiry';

    const toEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
    if (!toEmail) {
      return res.status(500).json({
        success: false,
        message: 'Email service not configured (missing ADMIN_EMAIL/EMAIL_USER)'
      });
    }

    const result = await emailService.sendContactFormEmail({
      to: toEmail,
      fromEmail: email,
      name,
      phone,
      category: normalizedCategory,
      subject: subject || 'New Contact Message',
      message
    });

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send message',
        error: process.env.NODE_ENV === 'development' ? result.error : undefined
      });
    }

    res.status(200).json({
      success: true,
      message: 'Your message has been sent successfully',
      data: { messageId: result.messageId }
    });
  } catch (error) {
    console.error('Contact form error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message'
    });
  }
});

module.exports = router;


