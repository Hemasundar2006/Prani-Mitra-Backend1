# Prani Mitra API Reference

Complete API reference for the Prani Mitra Backend service.

## Table of Contents

1. [Authentication](#authentication)
2. [User Management](#user-management)
3. [Call Management](#call-management)
4. [Payment Processing](#payment-processing)
5. [Plans Management](#plans-management)
6. [Content Management](#content-management)
7. [Admin Panel](#admin-panel)
8. [SMS Services](#sms-services)
9. [Error Codes](#error-codes)
10. [Rate Limits](#rate-limits)

## Authentication

### Send OTP

**POST** `/api/auth/send-otp`

Send OTP to user's mobile number for verification.

**Request Body:**
```json
{
  "phoneNumber": "9876543210",
  "purpose": "login" // "login", "registration", "phone_verification"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "phoneNumber": "9876543210",
    "expiresIn": 600,
    "messageId": "msg_123456"
  }
}
```

**Rate Limit:** 5 requests per 15 minutes per IP

### Register User

**POST** `/api/auth/register`

Register a new user with OTP verification.

**Request Body:**
```json
{
  "phoneNumber": "9876543210",
  "otp": "123456",
  "name": "John Farmer",
  "email": "john@example.com",
  "preferredLanguage": "english",
  "location": {
    "state": "Telangana",
    "district": "Hyderabad",
    "village": "Gachibowli",
    "pincode": "500032"
  },
  "farmingType": ["crops", "dairy"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "user": {
      "id": "64a1b2c3d4e5f678901234",
      "phoneNumber": "9876543210",
      "name": "John Farmer",
      "preferredLanguage": "english",
      "subscription": {
        "status": "free",
        "planId": null
      },
      "usage": {
        "totalCalls": 0,
        "monthlyCallsUsed": 0
      }
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenType": "Bearer"
  }
}
```

### Login User

**POST** `/api/auth/login`

Login existing user with OTP verification.

**Request Body:**
```json
{
  "phoneNumber": "9876543210",
  "otp": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "64a1b2c3d4e5f678901234",
      "phoneNumber": "9876543210",
      "name": "John Farmer",
      "subscription": {
        "status": "active",
        "planId": "64a1b2c3d4e5f678901235",
        "endDate": "2024-12-31T23:59:59.000Z"
      },
      "usage": {
        "monthlyCallsUsed": 15,
        "totalCalls": 45
      }
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenType": "Bearer",
    "usageReset": false
  }
}
```

### Check Phone Number

**GET** `/api/auth/check-phone/:phoneNumber`

Check if phone number is registered.

**Response:**
```json
{
  "success": true,
  "data": {
    "phoneNumber": "9876543210",
    "exists": true,
    "isActive": true,
    "name": "John Farmer"
  }
}
```

## User Management

### Get User Profile

**GET** `/api/users/profile`

Get current user's profile information.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "64a1b2c3d4e5f678901234",
      "phoneNumber": "9876543210",
      "name": "John Farmer",
      "email": "john@example.com",
      "preferredLanguage": "english",
      "location": {
        "state": "Telangana",
        "district": "Hyderabad",
        "village": "Gachibowli",
        "pincode": "500032"
      },
      "farmingType": ["crops", "dairy"],
      "subscription": {
        "status": "active",
        "planId": "64a1b2c3d4e5f678901235",
        "startDate": "2024-01-01T00:00:00.000Z",
        "endDate": "2024-12-31T23:59:59.000Z"
      },
      "usage": {
        "totalCalls": 45,
        "monthlyCallsUsed": 15,
        "lastCallDate": "2024-01-15T10:30:00.000Z"
      },
      "profile": {
        "dateOfBirth": "1985-05-15T00:00:00.000Z",
        "gender": "male",
        "experience": "5-10years"
      },
      "preferences": {
        "notifications": {
          "sms": true,
          "email": false,
          "whatsapp": true
        },
        "timezone": "Asia/Kolkata"
      },
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

### Update User Profile

**PUT** `/api/users/profile`

Update user profile information.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "name": "Updated Name",
  "email": "updated@example.com",
  "location": {
    "state": "Karnataka",
    "district": "Bangalore",
    "village": "Whitefield",
    "pincode": "560066"
  },
  "farmingType": ["crops", "poultry"],
  "profile": {
    "dateOfBirth": "1985-05-15T00:00:00.000Z",
    "gender": "male",
    "experience": "10+years"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "user": {
      "id": "64a1b2c3d4e5f678901234",
      "name": "Updated Name",
      "email": "updated@example.com",
      "location": {
        "state": "Karnataka",
        "district": "Bangalore",
        "village": "Whitefield",
        "pincode": "560066"
      },
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

### Get Usage Statistics

**GET** `/api/users/usage`

Get user's usage statistics and analytics.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `startDate` (optional): Start date for analytics (ISO 8601)
- `endDate` (optional): End date for analytics (ISO 8601)

**Response:**
```json
{
  "success": true,
  "data": {
    "current": {
      "monthlyCallsUsed": 15,
      "totalCalls": 45,
      "lastCallDate": "2024-01-15T10:30:00.000Z",
      "lastResetDate": "2024-01-01T00:00:00.000Z"
    },
    "subscription": {
      "status": "active",
      "planId": "64a1b2c3d4e5f678901235",
      "startDate": "2024-01-01T00:00:00.000Z",
      "endDate": "2024-12-31T23:59:59.000Z",
      "daysRemaining": 350
    },
    "analytics": {
      "totalCalls": 45,
      "totalDurationMinutes": 180,
      "avgDurationMinutes": 4,
      "completionRate": 95.5
    },
    "recentCalls": [
      {
        "id": "64a1b2c3d4e5f678901236",
        "queryType": "animal_health",
        "language": "english",
        "duration": 240,
        "status": "completed",
        "date": "2024-01-15T10:30:00.000Z"
      }
    ]
  }
}
```

### Get Call History

**GET** `/api/users/calls`

Get user's call history with pagination and filtering.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 100)
- `queryType` (optional): Filter by query type
- `status` (optional): Filter by call status
- `startDate` (optional): Start date filter (ISO 8601)
- `endDate` (optional): End date filter (ISO 8601)

**Response:**
```json
{
  "success": true,
  "data": {
    "calls": [
      {
        "id": "64a1b2c3d4e5f678901236",
        "callId": "CALL_ABC123",
        "queryType": "animal_health",
        "language": "english",
        "query": {
          "text": "My cow is not eating properly",
          "transcription": "My cow is not eating properly"
        },
        "response": {
          "text": "This could be due to several reasons...",
          "confidence": 0.95
        },
        "callDetails": {
          "startTime": "2024-01-15T10:30:00.000Z",
          "endTime": "2024-01-15T10:34:00.000Z",
          "duration": 240,
          "status": "completed"
        },
        "sms": {
          "sent": true,
          "sentAt": "2024-01-15T10:35:00.000Z",
          "deliveryStatus": "delivered"
        },
        "isEmergency": false,
        "tags": ["nutrition", "cattle"],
        "createdAt": "2024-01-15T10:30:00.000Z",
        "durationInMinutes": 4
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "totalCalls": 45,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

### Get Call Details

**GET** `/api/users/calls/:callId`

Get detailed information about a specific call.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "call": {
      "id": "64a1b2c3d4e5f678901236",
      "callId": "CALL_ABC123",
      "phoneNumber": "9876543210",
      "language": "english",
      "queryType": "animal_health",
      "query": {
        "text": "My cow is not eating properly",
        "audioUrl": "https://storage.example.com/audio/query_123.mp3",
        "transcription": "My cow is not eating properly"
      },
      "response": {
        "text": "This could be due to several reasons including digestive issues, stress, or illness. I recommend checking the cow's temperature and consulting with a veterinarian if the problem persists.",
        "audioUrl": "https://storage.example.com/audio/response_123.mp3",
        "confidence": 0.95
      },
      "callDetails": {
        "startTime": "2024-01-15T10:30:00.000Z",
        "endTime": "2024-01-15T10:34:00.000Z",
        "duration": 240,
        "status": "completed"
      },
      "feedback": {
        "rating": 5,
        "comment": "Very helpful advice",
        "helpful": true,
        "categories": ["accurate", "clear", "relevant"]
      },
      "sms": {
        "sent": true,
        "sentAt": "2024-01-15T10:35:00.000Z",
        "messageId": "msg_456789",
        "summary": "Call Summary: Animal Health query about cow not eating...",
        "deliveryStatus": "delivered"
      },
      "location": {
        "state": "Telangana",
        "district": "Hyderabad"
      },
      "cost": 0,
      "tags": ["nutrition", "cattle", "appetite_loss"],
      "isEmergency": false,
      "followUpRequired": false,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:35:00.000Z",
      "durationInMinutes": 4
    }
  }
}
```

### Add Call Feedback

**PUT** `/api/users/calls/:callId/feedback`

Add feedback for a completed call.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "rating": 5,
  "comment": "Very helpful advice, solved my problem",
  "helpful": true,
  "categories": ["accurate", "clear", "relevant", "timely"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Feedback added successfully",
  "data": {
    "feedback": {
      "rating": 5,
      "comment": "Very helpful advice, solved my problem",
      "helpful": true,
      "categories": ["accurate", "clear", "relevant", "timely"]
    }
  }
}
```

### Get Payment History

**GET** `/api/users/payments`

Get user's payment history.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)
- `status` (optional): Filter by payment status

**Response:**
```json
{
  "success": true,
  "data": {
    "payments": [
      {
        "id": "64a1b2c3d4e5f678901237",
        "orderId": "PM_ABC123_XYZ789",
        "razorpayOrderId": "order_xyz123",
        "razorpayPaymentId": "pay_abc456",
        "amount": 299,
        "currency": "INR",
        "billingCycle": "monthly",
        "status": "paid",
        "paymentMethod": "upi",
        "plan": {
          "id": "64a1b2c3d4e5f678901235",
          "name": "basic",
          "displayName": {
            "en": "Basic Plan"
          }
        },
        "discounts": {
          "couponCode": "WELCOME50",
          "discountAmount": 150
        },
        "taxes": {
          "gst": 53.82,
          "totalTax": 53.82
        },
        "subscription": {
          "startDate": "2024-01-01T00:00:00.000Z",
          "endDate": "2024-02-01T00:00:00.000Z"
        },
        "invoiceDetails": {
          "invoiceNumber": "PM240100001",
          "invoiceDate": "2024-01-01T00:00:00.000Z"
        },
        "createdAt": "2024-01-01T00:00:00.000Z",
        "finalAmount": 202.82
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 2,
      "totalPayments": 3,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

### Update Preferences

**PUT** `/api/users/preferences`

Update user notification and other preferences.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "notifications": {
    "sms": true,
    "email": false,
    "whatsapp": true
  },
  "timezone": "Asia/Kolkata"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Preferences updated successfully",
  "data": {
    "preferences": {
      "notifications": {
        "sms": true,
        "email": false,
        "whatsapp": true
      },
      "timezone": "Asia/Kolkata"
    }
  }
}
```

### Deactivate Account

**DELETE** `/api/users/account`

Deactivate user account.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Account deactivated successfully"
}
```

## Call Management

### Initiate Call

**POST** `/api/calls/initiate`

Initiate a new voice call session.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "phoneNumber": "9876543210",
  "language": "english",
  "queryType": "animal_health",
  "location": {
    "state": "Telangana",
    "district": "Hyderabad"
  },
  "isEmergency": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Call initiated successfully",
  "data": {
    "callId": "CALL_ABC123_XYZ789",
    "id": "64a1b2c3d4e5f678901236",
    "phoneNumber": "9876543210",
    "language": "english",
    "queryType": "animal_health",
    "isEmergency": false,
    "status": "initiated",
    "startTime": "2024-01-15T10:30:00.000Z",
    "tollFreeNumber": "1800-123-4567",
    "instructions": {
      "en": "Call the toll-free number and follow the voice prompts to connect with our AI assistant.",
      "hi": "टोल-फ्री नंबर पर कॉल करें और हमारे AI सहायक से जुड़ने के लिए वॉयस प्रॉम्प्ट का पालन करें।",
      "te": "టోల్-ఫ్రీ నంబర్‌కు కాల్ చేసి, మా AI అసిస్టెంట్‌తో కనెక్ట్ అవ్వడానికి వాయిస్ ప్రాంప్ట్‌లను అనుసరించండి।"
    }
  }
}
```

**Rate Limit:** 2 requests per minute per user

### Connect Call

**PUT** `/api/calls/:callId/connect`

Mark call as connected (used by telephony system).

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "actualPhoneNumber": "9876543210"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Call connected",
  "data": {
    "callId": "CALL_ABC123_XYZ789",
    "status": "connected"
  }
}
```

### Complete Call

**PUT** `/api/calls/:callId/complete`

Complete call with AI response and metadata.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "query": {
    "text": "My cow is not eating properly",
    "transcription": "My cow is not eating properly",
    "audioUrl": "https://storage.example.com/audio/query_123.mp3"
  },
  "response": {
    "text": "This could be due to several reasons including digestive issues, stress, or illness. I recommend checking the cow's temperature and consulting with a veterinarian if the problem persists.",
    "confidence": 0.95,
    "audioUrl": "https://storage.example.com/audio/response_123.mp3"
  },
  "aiMetadata": {
    "model": "prani-mitra-v1.2",
    "version": "1.2.0",
    "processingTime": 1500,
    "tokens": {
      "input": 15,
      "output": 45
    }
  },
  "tags": ["nutrition", "cattle", "appetite_loss"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Call completed successfully",
  "data": {
    "callId": "CALL_ABC123_XYZ789",
    "status": "completed",
    "duration": 240,
    "durationInMinutes": 4,
    "smsStatus": "sent"
  }
}
```

### Fail Call

**PUT** `/api/calls/:callId/fail`

Mark call as failed with reason.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "reason": "Network connectivity issues",
  "errorCode": "NETWORK_ERROR"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Call marked as failed",
  "data": {
    "callId": "CALL_ABC123_XYZ789",
    "status": "failed"
  }
}
```

### Get Call Status

**GET** `/api/calls/:callId/status`

Get current status of a call.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "callId": "CALL_ABC123_XYZ789",
    "status": "completed",
    "startTime": "2024-01-15T10:30:00.000Z",
    "endTime": "2024-01-15T10:34:00.000Z",
    "duration": 240,
    "durationInMinutes": 4,
    "isEmergency": false
  }
}
```

### Resend SMS Summary

**POST** `/api/calls/:callId/resend-sms`

Resend SMS summary for a completed call.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "SMS sent successfully",
  "data": {
    "smsStatus": "sent",
    "sentAt": "2024-01-15T10:40:00.000Z"
  }
}
```

## Payment Processing

### Create Payment Order

**POST** `/api/payments/create-order`

Create a payment order for subscription purchase.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "planId": "64a1b2c3d4e5f678901235",
  "billingCycle": "monthly",
  "voucherCode": "WELCOME50"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment order created successfully",
  "data": {
    "orderId": "PM_ABC123_XYZ789",
    "razorpayOrderId": "order_xyz123",
    "amount": 149,
    "currency": "INR",
    "plan": {
      "id": "64a1b2c3d4e5f678901235",
      "name": "basic",
      "displayName": {
        "en": "Basic Plan"
      },
      "billingCycle": "monthly"
    },
    "discount": {
      "code": "WELCOME50",
      "amount": 150,
      "originalAmount": 299
    },
    "subscription": {
      "startDate": "2024-01-15T00:00:00.000Z",
      "endDate": "2024-02-15T00:00:00.000Z"
    },
    "razorpayKeyId": "rzp_test_xyz123",
    "customer": {
      "name": "John Farmer",
      "email": "john@example.com",
      "contact": "9876543210"
    }
  }
}
```

### Verify Payment

**POST** `/api/payments/verify`

Verify payment and activate subscription.

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "razorpayPaymentId": "pay_xyz123",
  "razorpayOrderId": "order_abc456",
  "razorpaySignature": "signature_string_here"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment verified and subscription activated",
  "data": {
    "paymentId": "64a1b2c3d4e5f678901237",
    "status": "paid",
    "subscription": {
      "status": "active",
      "planId": "64a1b2c3d4e5f678901235",
      "startDate": "2024-01-15T00:00:00.000Z",
      "endDate": "2024-02-15T00:00:00.000Z"
    },
    "plan": {
      "id": "64a1b2c3d4e5f678901235",
      "name": "basic",
      "displayName": {
        "en": "Basic Plan"
      }
    }
  }
}
```

### Get Payment Methods

**GET** `/api/payments/methods`

Get available payment methods.

**Response:**
```json
{
  "success": true,
  "data": {
    "methods": {
      "card": {
        "enabled": true,
        "name": "Credit/Debit Card"
      },
      "netbanking": {
        "enabled": true,
        "name": "Net Banking"
      },
      "wallet": {
        "enabled": true,
        "name": "Wallet"
      },
      "upi": {
        "enabled": true,
        "name": "UPI"
      },
      "emi": {
        "enabled": true,
        "name": "EMI"
      }
    }
  }
}
```

### Process Refund (Admin Only)

**POST** `/api/payments/refund`

Process refund for a payment.

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Request Body:**
```json
{
  "paymentId": "64a1b2c3d4e5f678901237",
  "amount": 149,
  "reason": "User requested cancellation"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Refund processed successfully",
  "data": {
    "refundId": "rfnd_xyz123",
    "amount": 149,
    "status": "processed"
  }
}
```

## Plans Management

### Get All Plans

**GET** `/api/plans`

Get all active subscription plans.

**Query Parameters:**
- `language` (optional): Language for localized content (default: english)

**Response:**
```json
{
  "success": true,
  "data": {
    "plans": [
      {
        "id": "64a1b2c3d4e5f678901235",
        "name": "basic",
        "displayName": "Basic Plan",
        "description": "Perfect for small farmers with basic consultation needs",
        "price": {
          "monthly": 299,
          "yearly": 2999
        },
        "features": [
          {
            "name": "50 calls per month",
            "included": true
          },
          {
            "name": "SMS summaries",
            "included": true
          },
          {
            "name": "Priority support",
            "included": false
          }
        ],
        "limits": {
          "callLimit": 50,
          "callDurationLimit": 30,
          "smsLimit": 100,
          "prioritySupport": false
        },
        "planType": "basic",
        "metadata": {
          "color": "#007bff",
          "icon": "basic-plan",
          "badge": null,
          "popular": false
        },
        "yearlyDiscount": 17
      },
      {
        "id": "64a1b2c3d4e5f678901236",
        "name": "premium",
        "displayName": "Premium Plan",
        "description": "Best for commercial farmers with extensive consultation needs",
        "price": {
          "monthly": 599,
          "yearly": 5999
        },
        "features": [
          {
            "name": "Unlimited calls",
            "included": true
          },
          {
            "name": "SMS summaries",
            "included": true
          },
          {
            "name": "Priority support",
            "included": true
          }
        ],
        "limits": {
          "callLimit": -1,
          "callDurationLimit": 60,
          "smsLimit": 500,
          "prioritySupport": true
        },
        "planType": "premium",
        "metadata": {
          "color": "#28a745",
          "icon": "premium-plan",
          "badge": "Most Popular",
          "popular": true
        },
        "yearlyDiscount": 17
      }
    ]
  }
}
```

### Get Plan Details

**GET** `/api/plans/:planId`

Get detailed information about a specific plan.

**Query Parameters:**
- `language` (optional): Language for localized content (default: english)

**Response:**
```json
{
  "success": true,
  "data": {
    "plan": {
      "id": "64a1b2c3d4e5f678901235",
      "name": "basic",
      "displayName": "Basic Plan",
      "description": "Perfect for small farmers with basic consultation needs",
      "price": {
        "monthly": 299,
        "yearly": 2999
      },
      "features": [
        {
          "name": "50 calls per month",
          "included": true
        },
        {
          "name": "SMS summaries",
          "included": true
        },
        {
          "name": "Priority support",
          "included": false
        }
      ],
      "limits": {
        "callLimit": 50,
        "callDurationLimit": 30,
        "smsLimit": 100,
        "prioritySupport": false
      },
      "planType": "basic",
      "metadata": {
        "color": "#007bff",
        "icon": "basic-plan",
        "badge": null,
        "popular": false
      },
      "yearlyDiscount": 17
    }
  }
}
```

## Content Management

### Get Content

**GET** `/api/content`

Get published content with filtering and pagination.

**Query Parameters:**
- `type` (optional): Content type (faq, tip, blog, guide, announcement)
- `category` (optional): Content category (animal_health, crop_guidance, nutrition, general, emergency, technology)
- `language` (optional): Language (english, hindi, telugu)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20, max: 50)
- `search` (optional): Search term
- `tags` (optional): Comma-separated tags
- `farmingTypes` (optional): Comma-separated farming types
- `regions` (optional): Comma-separated regions
- `difficulty` (optional): Difficulty level (beginner, intermediate, advanced)

**Response:**
```json
{
  "success": true,
  "data": {
    "content": [
      {
        "id": "64a1b2c3d4e5f678901238",
        "title": "How to Identify Common Cattle Diseases",
        "content": "Cattle diseases can significantly impact farm productivity...",
        "excerpt": "Learn to identify early signs of common cattle diseases",
        "slug": "how-to-identify-common-cattle-diseases",
        "type": "guide",
        "category": "animal_health",
        "tags": ["cattle", "disease", "health", "prevention"],
        "metadata": {
          "readTime": 5,
          "difficulty": "beginner",
          "season": ["all"],
          "regions": ["telangana", "andhra-pradesh"],
          "farmingTypes": ["dairy", "mixed"]
        },
        "media": {
          "featuredImage": {
            "url": "https://storage.example.com/images/cattle-diseases.jpg",
            "alt": "Cattle health examination"
          }
        },
        "engagement": {
          "views": 1250,
          "likes": 45,
          "shares": 12,
          "commentsCount": 8
        },
        "publishedAt": "2024-01-10T00:00:00.000Z",
        "createdAt": "2024-01-08T00:00:00.000Z",
        "updatedAt": "2024-01-10T00:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalContent": 95,
      "hasNextPage": true,
      "hasPrevPage": false,
      "limit": 20
    },
    "filters": {
      "type": null,
      "category": "animal_health",
      "language": "english",
      "search": null,
      "tags": null,
      "farmingTypes": null,
      "regions": null,
      "difficulty": null
    }
  }
}
```

### Get Trending Content

**GET** `/api/content/trending`

Get trending content based on recent engagement.

**Query Parameters:**
- `limit` (optional): Number of items (default: 10, max: 20)
- `language` (optional): Language (default: english)

**Response:**
```json
{
  "success": true,
  "data": {
    "content": [
      {
        "id": "64a1b2c3d4e5f678901238",
        "title": "How to Identify Common Cattle Diseases",
        "excerpt": "Learn to identify early signs of common cattle diseases",
        "slug": "how-to-identify-common-cattle-diseases",
        "type": "guide",
        "category": "animal_health",
        "tags": ["cattle", "disease", "health"],
        "engagement": {
          "views": 1250,
          "likes": 45,
          "shares": 12
        },
        "publishedAt": "2024-01-10T00:00:00.000Z"
      }
    ]
  }
}
```

### Get Content by Slug

**GET** `/api/content/:slug`

Get specific content by its slug.

**Query Parameters:**
- `language` (optional): Language (default: english)

**Response:**
```json
{
  "success": true,
  "data": {
    "content": {
      "id": "64a1b2c3d4e5f678901238",
      "title": "How to Identify Common Cattle Diseases",
      "content": "Cattle diseases can significantly impact farm productivity. Early identification is crucial for effective treatment and prevention of spread. Here are the most common cattle diseases and their symptoms:\n\n## 1. Foot and Mouth Disease\n\nSymptoms:\n- Fever and loss of appetite\n- Blisters on mouth, tongue, and feet\n- Excessive drooling\n- Lameness\n\n## 2. Mastitis\n\nSymptoms:\n- Swollen udder\n- Reduced milk production\n- Changes in milk consistency\n- Fever in severe cases\n\n...",
      "excerpt": "Learn to identify early signs of common cattle diseases and take preventive measures",
      "slug": "how-to-identify-common-cattle-diseases",
      "type": "guide",
      "category": "animal_health",
      "tags": ["cattle", "disease", "health", "prevention", "symptoms"],
      "metadata": {
        "readTime": 5,
        "difficulty": "beginner",
        "season": ["all"],
        "regions": ["telangana", "andhra-pradesh", "karnataka"],
        "farmingTypes": ["dairy", "mixed"]
      },
      "media": {
        "featuredImage": {
          "url": "https://storage.example.com/images/cattle-diseases.jpg",
          "alt": "Cattle health examination"
        },
        "images": [
          {
            "url": "https://storage.example.com/images/fmd-symptoms.jpg",
            "caption": "Foot and mouth disease symptoms in cattle",
            "alt": "Cattle showing FMD symptoms"
          }
        ],
        "videos": [
          {
            "url": "https://storage.example.com/videos/cattle-examination.mp4",
            "title": "How to examine cattle for diseases",
            "duration": 180
          }
        ]
      },
      "engagement": {
        "views": 1251,
        "likes": 45,
        "shares": 12,
        "commentsCount": 8
      },
      "author": {
        "name": "Dr. Veterinary Expert"
      },
      "publishedAt": "2024-01-10T00:00:00.000Z",
      "createdAt": "2024-01-08T00:00:00.000Z",
      "updatedAt": "2024-01-10T00:00:00.000Z"
    },
    "relatedContent": [
      {
        "id": "64a1b2c3d4e5f678901239",
        "title": "Cattle Vaccination Schedule",
        "slug": "cattle-vaccination-schedule",
        "excerpt": "Complete vaccination schedule for cattle health",
        "publishedAt": "2024-01-08T00:00:00.000Z"
      }
    ]
  }
}
```

### Add Comment to Content

**POST** `/api/content/:contentId/comment`

Add a comment to content (requires approval).

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "content": "Very helpful article! This helped me identify mastitis in my cow early.",
  "language": "english"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Comment added successfully (pending approval)"
}
```

### Get Content Categories Statistics

**GET** `/api/content/categories/stats`

Get content statistics by category.

**Response:**
```json
{
  "success": true,
  "data": {
    "categories": [
      {
        "category": "animal_health",
        "displayName": {
          "en": "Animal Health",
          "hi": "पशु स्वास्थ्य",
          "te": "పశు ఆరోగ్యం"
        },
        "count": 45,
        "types": ["faq", "tip", "guide", "blog"],
        "latestUpdate": "2024-01-15T00:00:00.000Z"
      },
      {
        "category": "crop_guidance",
        "displayName": {
          "en": "Crop Guidance",
          "hi": "फसल मार्गदर्शन",
          "te": "పంట మార్గదర్శకత्वం"
        },
        "count": 38,
        "types": ["faq", "tip", "guide"],
        "latestUpdate": "2024-01-14T00:00:00.000Z"
      }
    ],
    "totalCategories": 6,
    "totalContent": 125
  }
}
```

## Error Codes

### Authentication Errors
- `USER_NOT_FOUND` - User not found with provided phone number
- `USER_EXISTS` - User already exists with phone number
- `ACCOUNT_DEACTIVATED` - User account is deactivated
- `OTP_VERIFICATION_FAILED` - OTP verification failed
- `RECENT_OTP_EXISTS` - Recent OTP already sent
- `INVALID_TOKEN` - Invalid or expired JWT token

### Subscription Errors
- `FREE_LIMIT_EXCEEDED` - Free tier monthly limit exceeded
- `SUBSCRIPTION_REQUIRED` - Active subscription required
- `CALL_LIMIT_EXCEEDED` - Monthly call limit exceeded
- `PREMIUM_REQUIRED` - Premium subscription required

### Payment Errors
- `PAYMENT_FAILED` - Payment processing failed
- `INVALID_PAYMENT_SIGNATURE` - Invalid Razorpay signature
- `VOUCHER_INVALID` - Invalid or expired voucher code
- `VOUCHER_LIMIT_EXCEEDED` - Voucher usage limit exceeded

### SMS Errors
- `SMS_FAILED` - SMS sending failed
- `SMS_LIMIT_EXCEEDED` - SMS limit exceeded

### General Errors
- `VALIDATION_FAILED` - Request validation failed
- `RESOURCE_NOT_FOUND` - Requested resource not found
- `PERMISSION_DENIED` - Insufficient permissions
- `RATE_LIMIT_EXCEEDED` - Rate limit exceeded

## Rate Limits

### Authentication
- **OTP Requests**: 5 requests per 15 minutes per phone number
- **Login Attempts**: 10 attempts per 15 minutes per IP

### API Calls
- **General API**: 100 requests per 15 minutes per IP
- **Call Initiation**: 2 requests per minute per user
- **SMS Sending**: 10 requests per hour per admin user

### Response Headers
Rate limit information is included in response headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict
- `429` - Too Many Requests
- `500` - Internal Server Error

## Pagination

All paginated endpoints follow this format:

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (varies by endpoint)

**Response Format:**
```json
{
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "totalItems": 100,
    "hasNextPage": true,
    "hasPrevPage": false,
    "limit": 20
  }
}
```

## Webhook Events

### Razorpay Webhooks

**POST** `/api/payments/webhook`

Handles Razorpay webhook events:
- `payment.captured`
- `payment.failed`
- `subscription.activated`
- `subscription.cancelled`

**Headers:**
```
X-Razorpay-Signature: <signature>
Content-Type: application/json
```

**Verification:**
Webhooks are verified using HMAC SHA256 signature with webhook secret.

## Localization

### Supported Languages
- **English** (`english`) - Default
- **Hindi** (`hindi`)
- **Telugu** (`telugu`)

### Usage
Include language parameter in requests:
```
GET /api/content?language=hindi
GET /api/plans?language=telugu
```

### Response Format
Localized content is returned in the requested language, with fallback to English if translation is not available.

## Content Types

### Query Types
- `animal_health` - Animal health and veterinary queries
- `crop_guidance` - Crop cultivation and farming techniques
- `nutrition` - Animal nutrition and feed management
- `emergency` - Emergency situations requiring immediate attention
- `general` - General farming and agricultural queries

### Content Categories
- `animal_health` - Animal health and veterinary content
- `crop_guidance` - Crop and farming guidance
- `nutrition` - Nutrition and feeding advice
- `general` - General farming information
- `emergency` - Emergency procedures and protocols
- `technology` - Agricultural technology and innovations

### Content Types
- `faq` - Frequently Asked Questions
- `tip` - Quick tips and advice
- `blog` - Detailed blog articles
- `guide` - Step-by-step guides
- `announcement` - Important announcements

This completes the comprehensive API reference for the Prani Mitra Backend service.
