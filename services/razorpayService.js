const Razorpay = require('razorpay');
const crypto = require('crypto');

class RazorpayService {
  constructor() {
    this.keyId = process.env.RAZORPAY_KEY_ID;
    this.keySecret = process.env.RAZORPAY_KEY_SECRET;
    
    if (this.keyId && this.keySecret) {
      this.razorpay = new Razorpay({
        key_id: this.keyId,
        key_secret: this.keySecret
      });
      console.log('Razorpay service initialized');
    } else {
      console.warn('Razorpay credentials not found. Using mock service.');
      this.razorpay = new MockRazorpayService();
    }
  }

  // Create order
  async createOrder(orderData) {
    try {
      const options = {
        amount: orderData.amount * 100, // Convert to paise
        currency: orderData.currency || 'INR',
        receipt: orderData.receipt,
        notes: orderData.notes || {}
      };

      const order = await this.razorpay.orders.create(options);
      
      return {
        success: true,
        order: {
          id: order.id,
          amount: order.amount / 100, // Convert back to rupees
          currency: order.currency,
          receipt: order.receipt,
          status: order.status,
          createdAt: new Date(order.created_at * 1000),
          notes: order.notes
        }
      };
    } catch (error) {
      console.error('Razorpay create order error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Verify payment signature
  verifyPaymentSignature(paymentId, orderId, signature) {
    try {
      const body = orderId + "|" + paymentId;
      const expectedSignature = crypto
        .createHmac('sha256', this.keySecret)
        .update(body.toString())
        .digest('hex');

      return expectedSignature === signature;
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  // Fetch payment details
  async fetchPayment(paymentId) {
    try {
      const payment = await this.razorpay.payments.fetch(paymentId);
      
      return {
        success: true,
        payment: {
          id: payment.id,
          amount: payment.amount / 100,
          currency: payment.currency,
          status: payment.status,
          orderId: payment.order_id,
          method: payment.method,
          captured: payment.captured,
          description: payment.description,
          email: payment.email,
          contact: payment.contact,
          fee: payment.fee / 100,
          tax: payment.tax / 100,
          errorCode: payment.error_code,
          errorDescription: payment.error_description,
          createdAt: new Date(payment.created_at * 1000)
        }
      };
    } catch (error) {
      console.error('Razorpay fetch payment error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Capture payment
  async capturePayment(paymentId, amount) {
    try {
      const payment = await this.razorpay.payments.capture(paymentId, amount * 100);
      
      return {
        success: true,
        payment: {
          id: payment.id,
          amount: payment.amount / 100,
          status: payment.status,
          captured: payment.captured
        }
      };
    } catch (error) {
      console.error('Razorpay capture payment error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Create refund
  async createRefund(paymentId, amount, notes = {}) {
    try {
      const refundData = {
        amount: amount * 100, // Convert to paise
        notes: notes
      };

      const refund = await this.razorpay.payments.refund(paymentId, refundData);
      
      return {
        success: true,
        refund: {
          id: refund.id,
          paymentId: refund.payment_id,
          amount: refund.amount / 100,
          currency: refund.currency,
          status: refund.status,
          createdAt: new Date(refund.created_at * 1000),
          notes: refund.notes
        }
      };
    } catch (error) {
      console.error('Razorpay refund error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Fetch refund details
  async fetchRefund(paymentId, refundId) {
    try {
      const refund = await this.razorpay.payments.fetchRefund(paymentId, refundId);
      
      return {
        success: true,
        refund: {
          id: refund.id,
          paymentId: refund.payment_id,
          amount: refund.amount / 100,
          currency: refund.currency,
          status: refund.status,
          createdAt: new Date(refund.created_at * 1000),
          notes: refund.notes
        }
      };
    } catch (error) {
      console.error('Razorpay fetch refund error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Create customer
  async createCustomer(customerData) {
    try {
      const customer = await this.razorpay.customers.create({
        name: customerData.name,
        email: customerData.email,
        contact: customerData.contact,
        notes: customerData.notes || {}
      });

      return {
        success: true,
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          contact: customer.contact,
          createdAt: new Date(customer.created_at * 1000),
          notes: customer.notes
        }
      };
    } catch (error) {
      console.error('Razorpay create customer error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Create subscription
  async createSubscription(subscriptionData) {
    try {
      const subscription = await this.razorpay.subscriptions.create({
        plan_id: subscriptionData.planId,
        customer_id: subscriptionData.customerId,
        quantity: subscriptionData.quantity || 1,
        total_count: subscriptionData.totalCount,
        start_at: subscriptionData.startAt,
        expire_by: subscriptionData.expireBy,
        addons: subscriptionData.addons || [],
        notes: subscriptionData.notes || {}
      });

      return {
        success: true,
        subscription: {
          id: subscription.id,
          planId: subscription.plan_id,
          customerId: subscription.customer_id,
          status: subscription.status,
          currentStart: new Date(subscription.current_start * 1000),
          currentEnd: new Date(subscription.current_end * 1000),
          createdAt: new Date(subscription.created_at * 1000),
          notes: subscription.notes
        }
      };
    } catch (error) {
      console.error('Razorpay create subscription error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Fetch order details
  async fetchOrder(orderId) {
    try {
      const order = await this.razorpay.orders.fetch(orderId);
      
      return {
        success: true,
        order: {
          id: order.id,
          amount: order.amount / 100,
          currency: order.currency,
          receipt: order.receipt,
          status: order.status,
          attempts: order.attempts,
          createdAt: new Date(order.created_at * 1000),
          notes: order.notes
        }
      };
    } catch (error) {
      console.error('Razorpay fetch order error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get payment methods
  getPaymentMethods() {
    return {
      card: { enabled: true, name: 'Credit/Debit Card' },
      netbanking: { enabled: true, name: 'Net Banking' },
      wallet: { enabled: true, name: 'Wallet' },
      upi: { enabled: true, name: 'UPI' },
      emi: { enabled: true, name: 'EMI' }
    };
  }
}

// Mock Razorpay Service for development
class MockRazorpayService {
  async create(options) {
    console.log('=== MOCK RAZORPAY ORDER ===');
    console.log('Options:', options);
    console.log('===========================');
    
    return {
      id: `order_mock_${Date.now()}`,
      amount: options.amount,
      currency: options.currency,
      receipt: options.receipt,
      status: 'created',
      created_at: Math.floor(Date.now() / 1000),
      notes: options.notes
    };
  }

  get orders() {
    return {
      create: this.create.bind(this),
      fetch: async (orderId) => ({
        id: orderId,
        amount: 100000, // Mock amount
        currency: 'INR',
        receipt: 'mock_receipt',
        status: 'created',
        attempts: 0,
        created_at: Math.floor(Date.now() / 1000),
        notes: {}
      })
    };
  }

  get payments() {
    return {
      fetch: async (paymentId) => ({
        id: paymentId,
        amount: 100000,
        currency: 'INR',
        status: 'captured',
        order_id: 'order_mock',
        method: 'upi',
        captured: true,
        description: 'Mock payment',
        email: 'test@example.com',
        contact: '+919876543210',
        fee: 236,
        tax: 36,
        created_at: Math.floor(Date.now() / 1000)
      }),
      capture: async (paymentId, amount) => ({
        id: paymentId,
        amount: amount,
        status: 'captured',
        captured: true
      }),
      refund: async (paymentId, refundData) => ({
        id: `rfnd_mock_${Date.now()}`,
        payment_id: paymentId,
        amount: refundData.amount,
        currency: 'INR',
        status: 'processed',
        created_at: Math.floor(Date.now() / 1000),
        notes: refundData.notes
      })
    };
  }

  get customers() {
    return {
      create: async (customerData) => ({
        id: `cust_mock_${Date.now()}`,
        name: customerData.name,
        email: customerData.email,
        contact: customerData.contact,
        created_at: Math.floor(Date.now() / 1000),
        notes: customerData.notes
      })
    };
  }
}

// Create singleton instance
const razorpayService = new RazorpayService();

module.exports = razorpayService;
