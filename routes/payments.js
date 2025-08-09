const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Plan = require('../models/Plan');
const Payment = require('../models/Payment');
const Voucher = require('../models/Voucher');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const razorpayService = require('../services/razorpayService');
const { sendSubscriptionNotification } = require('../services/smsService');
const router = express.Router();

// Helper function to handle validation errors
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

// Helper function to generate unique order ID
const generateOrderId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return `PM_${timestamp}_${random}`.toUpperCase();
};

// @route   POST /api/payments/create-order
// @desc    Create payment order
// @access  Private
router.post('/create-order', authenticateToken, [
  body('planId')
    .isMongoId()
    .withMessage('Valid plan ID is required'),
  body('billingCycle')
    .isIn(['monthly', 'yearly'])
    .withMessage('Billing cycle must be monthly or yearly'),
  body('voucherCode')
    .optional()
    .trim()
    .isLength({ min: 4, max: 20 })
    .withMessage('Invalid voucher code format')
], handleValidationErrors, async (req, res) => {
  try {
    const userId = req.userId;
    const user = req.user;
    const { planId, billingCycle, voucherCode } = req.body;

    // Get plan details
    const plan = await Plan.findById(planId);
    if (!plan || !plan.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found or not available'
      });
    }

    // Calculate amount
    let amount = billingCycle === 'yearly' ? plan.price.yearly : plan.price.monthly;
    let discountAmount = 0;
    let voucherData = null;

    // Apply voucher if provided
    if (voucherCode) {
      const voucher = await Voucher.findOne({ 
        code: voucherCode.toUpperCase(),
        isActive: true 
      });

      if (!voucher) {
        return res.status(404).json({
          success: false,
          message: 'Invalid voucher code'
        });
      }

      // Check if user can use this voucher
      const canUse = voucher.canUserUse(userId, user);
      if (!canUse.canUse) {
        return res.status(400).json({
          success: false,
          message: canUse.reason
        });
      }

      // Check if voucher is applicable to this plan
      if (voucher.applicablePlans.length > 0 && !voucher.applicablePlans.includes(planId)) {
        return res.status(400).json({
          success: false,
          message: 'Voucher not applicable to this plan'
        });
      }

      // Calculate discount
      const discountResult = voucher.calculateDiscount(amount, billingCycle);
      if (discountResult.error) {
        return res.status(400).json({
          success: false,
          message: discountResult.error
        });
      }

      discountAmount = discountResult.discount;
      voucherData = {
        code: voucher.code,
        type: voucher.type,
        value: voucher.value,
        discountAmount
      };
    }

    // Calculate final amount
    const finalAmount = Math.max(0, amount - discountAmount);

    // Generate order ID
    const orderId = generateOrderId();

    // Create Razorpay order
    const razorpayOrder = await razorpayService.createOrder({
      amount: finalAmount,
      currency: 'INR',
      receipt: orderId,
      notes: {
        userId: userId.toString(),
        planId: planId.toString(),
        billingCycle,
        voucherCode: voucherCode || null
      }
    });

    if (!razorpayOrder.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create payment order',
        error: razorpayOrder.error
      });
    }

    // Calculate subscription dates
    const startDate = new Date();
    let endDate = new Date();
    if (billingCycle === 'monthly') {
      endDate.setMonth(endDate.getMonth() + 1);
    } else {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }

    // Create payment record
    const payment = new Payment({
      userId,
      planId,
      orderId,
      razorpayOrderId: razorpayOrder.order.id,
      amount,
      currency: 'INR',
      billingCycle,
      status: 'created',
      discounts: voucherData ? {
        couponCode: voucherData.code,
        discountAmount: voucherData.discountAmount
      } : {},
      subscription: {
        startDate,
        endDate,
        autoRenewal: false
      },
      customerDetails: {
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        address: user.location
      },
      metadata: {
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
        source: req.get('X-Source') || 'web'
      }
    });

    await payment.save();

    // Prepare response
    const orderData = {
      orderId: payment.orderId,
      razorpayOrderId: razorpayOrder.order.id,
      amount: finalAmount,
      currency: 'INR',
      plan: {
        id: plan._id,
        name: plan.name,
        displayName: plan.displayName,
        billingCycle
      },
      discount: voucherData ? {
        code: voucherData.code,
        amount: voucherData.discountAmount,
        originalAmount: amount
      } : null,
      subscription: {
        startDate,
        endDate
      },
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      customer: {
        name: user.name,
        email: user.email,
        contact: user.phoneNumber
      }
    };

    res.status(201).json({
      success: true,
      message: 'Payment order created successfully',
      data: orderData
    });

  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order'
    });
  }
});

// @route   POST /api/payments/verify
// @desc    Verify payment and activate subscription
// @access  Private
router.post('/verify', authenticateToken, [
  body('razorpayPaymentId')
    .notEmpty()
    .withMessage('Razorpay payment ID is required'),
  body('razorpayOrderId')
    .notEmpty()
    .withMessage('Razorpay order ID is required'),
  body('razorpaySignature')
    .notEmpty()
    .withMessage('Razorpay signature is required')
], handleValidationErrors, async (req, res) => {
  try {
    const userId = req.userId;
    const { razorpayPaymentId, razorpayOrderId, razorpaySignature } = req.body;

    // Find payment record
    const payment = await Payment.findOne({ 
      userId,
      razorpayOrderId,
      status: 'created'
    }).populate('planId');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }

    // Verify signature
    const isValidSignature = razorpayService.verifyPaymentSignature(
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature
    );

    if (!isValidSignature) {
      // Update payment status to failed
      payment.status = 'failed';
      await payment.save();

      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Fetch payment details from Razorpay
    const paymentDetails = await razorpayService.fetchPayment(razorpayPaymentId);
    
    if (!paymentDetails.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch payment details'
      });
    }

    // Update payment record
    payment.razorpayPaymentId = razorpayPaymentId;
    payment.razorpaySignature = razorpaySignature;
    payment.status = paymentDetails.payment.status === 'captured' ? 'paid' : 'pending';
    payment.paymentMethod = paymentDetails.payment.method;
    await payment.save();

    if (payment.status === 'paid') {
      // Apply voucher usage if used
      if (payment.discounts.couponCode) {
        const voucher = await Voucher.findOne({ 
          code: payment.discounts.couponCode 
        });
        if (voucher) {
          await voucher.applyUsage(userId);
        }
      }

      // Update user subscription
      const user = await User.findById(userId);
      user.subscription = {
        planId: payment.planId._id,
        status: 'active',
        startDate: payment.subscription.startDate,
        endDate: payment.subscription.endDate,
        autoRenewal: payment.subscription.autoRenewal
      };
      await user.save();

      // Send SMS notification
      try {
        await sendSubscriptionNotification(
          user.phoneNumber,
          'activation',
          { plan: payment.planId.name }
        );
      } catch (smsError) {
        console.error('SMS notification error:', smsError);
        // Don't fail the payment verification if SMS fails
      }

      res.status(200).json({
        success: true,
        message: 'Payment verified and subscription activated',
        data: {
          paymentId: payment._id,
          status: payment.status,
          subscription: user.subscription,
          plan: payment.planId
        }
      });
    } else {
      res.status(200).json({
        success: false,
        message: 'Payment verification completed but payment not captured',
        data: {
          paymentId: payment._id,
          status: payment.status
        }
      });
    }

  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed'
    });
  }
});

// @route   POST /api/payments/webhook
// @desc    Handle Razorpay webhook
// @access  Public (but verified)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const webhookBody = req.body;
    const webhookSignature = req.headers['x-razorpay-signature'];

    // Verify webhook signature
    const expectedSignature = require('crypto')
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || '')
      .update(webhookBody)
      .digest('hex');

    if (webhookSignature !== expectedSignature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook signature'
      });
    }

    const event = JSON.parse(webhookBody);
    
    // Handle different webhook events
    switch (event.event) {
      case 'payment.captured':
        await handlePaymentCaptured(event.payload.payment.entity);
        break;
      
      case 'payment.failed':
        await handlePaymentFailed(event.payload.payment.entity);
        break;
      
      case 'subscription.activated':
        await handleSubscriptionActivated(event.payload.subscription.entity);
        break;
      
      case 'subscription.cancelled':
        await handleSubscriptionCancelled(event.payload.subscription.entity);
        break;
      
      default:
        console.log(`Unhandled webhook event: ${event.event}`);
    }

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed'
    });
  }
});

// Webhook event handlers
async function handlePaymentCaptured(paymentData) {
  try {
    const payment = await Payment.findOne({
      razorpayPaymentId: paymentData.id
    }).populate('userId planId');

    if (payment) {
      payment.status = 'paid';
      payment.webhookEvents.push({
        eventType: 'payment.captured',
        eventData: paymentData,
        receivedAt: new Date()
      });
      await payment.save();

      // Activate subscription if not already active
      if (payment.userId.subscription.status !== 'active') {
        payment.userId.subscription = {
          planId: payment.planId._id,
          status: 'active',
          startDate: payment.subscription.startDate,
          endDate: payment.subscription.endDate,
          autoRenewal: payment.subscription.autoRenewal
        };
        await payment.userId.save();
      }
    }
  } catch (error) {
    console.error('Handle payment captured error:', error);
  }
}

async function handlePaymentFailed(paymentData) {
  try {
    const payment = await Payment.findOne({
      razorpayPaymentId: paymentData.id
    });

    if (payment) {
      payment.status = 'failed';
      payment.webhookEvents.push({
        eventType: 'payment.failed',
        eventData: paymentData,
        receivedAt: new Date()
      });
      await payment.save();
    }
  } catch (error) {
    console.error('Handle payment failed error:', error);
  }
}

async function handleSubscriptionActivated(subscriptionData) {
  // Handle subscription activation from Razorpay
  console.log('Subscription activated:', subscriptionData);
}

async function handleSubscriptionCancelled(subscriptionData) {
  // Handle subscription cancellation from Razorpay
  console.log('Subscription cancelled:', subscriptionData);
}

// @route   GET /api/payments/methods
// @desc    Get available payment methods
// @access  Public
router.get('/methods', (req, res) => {
  try {
    const methods = razorpayService.getPaymentMethods();
    
    res.status(200).json({
      success: true,
      data: { methods }
    });

  } catch (error) {
    console.error('Get payment methods error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment methods'
    });
  }
});

// @route   POST /api/payments/refund
// @desc    Process refund (Admin only)
// @access  Private/Admin
router.post('/refund', authenticateToken, requireAdmin, [
  body('paymentId')
    .isMongoId()
    .withMessage('Valid payment ID is required'),
  body('amount')
    .isFloat({ min: 0.01 })
    .withMessage('Refund amount must be greater than 0'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Reason must not exceed 200 characters')
], handleValidationErrors, async (req, res) => {
  try {
    const { paymentId, amount, reason } = req.body;

    // Find payment
    const payment = await Payment.findById(paymentId).populate('userId');
    
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    if (payment.status !== 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Can only refund paid payments'
      });
    }

    // Process refund with Razorpay
    const refundResult = await razorpayService.createRefund(
      payment.razorpayPaymentId,
      amount,
      { reason: reason || 'Admin initiated refund' }
    );

    if (!refundResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to process refund',
        error: refundResult.error
      });
    }

    // Update payment record
    payment.status = 'refunded';
    payment.refund = {
      refundId: refundResult.refund.id,
      refundAmount: amount,
      refundDate: new Date(),
      refundReason: reason || 'Admin initiated refund',
      refundStatus: 'processed'
    };
    await payment.save();

    // Update user subscription if full refund
    if (amount >= payment.amount) {
      const user = payment.userId;
      user.subscription.status = 'cancelled';
      await user.save();
    }

    res.status(200).json({
      success: true,
      message: 'Refund processed successfully',
      data: {
        refundId: refundResult.refund.id,
        amount: amount,
        status: 'processed'
      }
    });

  } catch (error) {
    console.error('Process refund error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process refund'
    });
  }
});

module.exports = router;
