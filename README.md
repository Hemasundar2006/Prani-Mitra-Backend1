# Prani Mitra Backend API

A comprehensive backend API for Prani Mitra - a rural-focused AI service platform that provides smart farming and animal health assistance through voice calls, SMS, and web interfaces.

## 🚀 Features

- **Authentication System**: Mobile OTP-based authentication
- **User Management**: Profile management, usage tracking, subscription handling
- **Payment Integration**: Razorpay integration for premium subscriptions
- **Call Management**: Voice call logging, AI response tracking, SMS summaries
- **Content Management**: Multilingual FAQs, tips, blogs, and guides
- **Admin Panel**: Comprehensive admin APIs for user and system management
- **SMS Integration**: MSG91/Twilio integration for OTP and notifications
- **Voucher System**: Discount codes and promotional offers
- **Analytics**: Detailed usage and performance analytics

## 📋 Prerequisites

- Node.js (v16.0.0 or higher)
- MongoDB (v4.4 or higher)
- Razorpay account (for payments)
- MSG91 or Twilio account (for SMS)

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd prani-mitra-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` file with your configuration:
   ```env
   # Server Configuration
   NODE_ENV=development
   PORT=5000
   FRONTEND_URL=http://localhost:3000

   # Database
   MONGODB_URI=mongodb://localhost:27017/prani-mitra

   # JWT Secret
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

   # Razorpay Configuration
   RAZORPAY_KEY_ID=your_razorpay_key_id
   RAZORPAY_KEY_SECRET=your_razorpay_key_secret

   # SMS Service (MSG91)
   MSG91_API_KEY=your_msg91_api_key
   MSG91_SENDER_ID=PRANMT

   # Other configurations...
   ```

4. **Start the server**
   ```bash
   # Development
   npm run dev

   # Production
   npm start
   ```

## 📚 API Documentation

### Base URL
```
Development: http://localhost:5000/api
Production: https://your-domain.com/api
```

### Authentication
Most endpoints require authentication using Bearer token:
```
Authorization: Bearer <your-jwt-token>
```

## 🔐 Authentication Endpoints

### Send OTP
```http
POST /api/auth/send-otp
Content-Type: application/json

{
  "phoneNumber": "9876543210",
  "purpose": "login"
}
```

### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "phoneNumber": "9876543210",
  "otp": "123456",
  "name": "John Farmer",
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

### Login User
```http
POST /api/auth/login
Content-Type: application/json

{
  "phoneNumber": "9876543210",
  "otp": "123456"
}
```

## 👤 User Management Endpoints

### Get Profile
```http
GET /api/users/profile
Authorization: Bearer <token>
```

### Update Profile
```http
PUT /api/users/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name",
  "email": "user@example.com",
  "location": {
    "state": "Karnataka",
    "district": "Bangalore"
  }
}
```

### Get Usage Statistics
```http
GET /api/users/usage
Authorization: Bearer <token>
```

### Get Call History
```http
GET /api/users/calls?page=1&limit=20
Authorization: Bearer <token>
```

## 📞 Call Management Endpoints

### Initiate Call
```http
POST /api/calls/initiate
Authorization: Bearer <token>
Content-Type: application/json

{
  "phoneNumber": "9876543210",
  "language": "english",
  "queryType": "animal_health",
  "isEmergency": false
}
```

### Complete Call
```http
PUT /api/calls/{callId}/complete
Authorization: Bearer <token>
Content-Type: application/json

{
  "query": {
    "text": "My cow is not eating properly",
    "transcription": "My cow is not eating properly"
  },
  "response": {
    "text": "This could be due to several reasons...",
    "confidence": 0.95
  },
  "aiMetadata": {
    "model": "prani-mitra-v1",
    "processingTime": 1500
  }
}
```

### Get Call Status
```http
GET /api/calls/{callId}/status
Authorization: Bearer <token>
```

## 💳 Payment Endpoints

### Create Payment Order
```http
POST /api/payments/create-order
Authorization: Bearer <token>
Content-Type: application/json

{
  "planId": "64a1b2c3d4e5f6789012345",
  "billingCycle": "monthly",
  "voucherCode": "WELCOME50"
}
```

### Verify Payment
```http
POST /api/payments/verify
Authorization: Bearer <token>
Content-Type: application/json

{
  "razorpayPaymentId": "pay_xyz123",
  "razorpayOrderId": "order_abc456",
  "razorpaySignature": "signature_string"
}
```

## 📋 Plans Endpoints

### Get All Plans
```http
GET /api/plans?language=english
```

### Get Plan Details
```http
GET /api/plans/{planId}?language=hindi
```

## 📝 Content Endpoints

### Get Content
```http
GET /api/content?type=faq&category=animal_health&language=telugu&page=1&limit=10
```

### Get Content by Slug
```http
GET /api/content/{slug}?language=english
```

### Get Trending Content
```http
GET /api/content/trending?limit=5&language=hindi
```

## 🔧 Admin Endpoints

### Get Dashboard Statistics
```http
GET /api/admin/dashboard?period=30d
Authorization: Bearer <admin-token>
```

### Create Voucher
```http
POST /api/admin/vouchers
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "code": "WELCOME50",
  "name": "Welcome Discount",
  "type": "percentage",
  "value": 50,
  "validity": {
    "startDate": "2024-01-01T00:00:00Z",
    "endDate": "2024-12-31T23:59:59Z"
  },
  "usage": {
    "totalLimit": 1000,
    "perUserLimit": 1
  }
}
```

### Update User Subscription
```http
PUT /api/admin/users/{userId}/subscription
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "planId": "64a1b2c3d4e5f6789012345",
  "status": "active",
  "endDate": "2024-12-31T23:59:59Z"
}
```

## 📨 SMS Endpoints

### Send Custom SMS
```http
POST /api/sms/send
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "phoneNumber": "9876543210",
  "message": "Your custom message here"
}
```

### Send Bulk SMS
```http
POST /api/sms/send-bulk
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "phoneNumbers": ["9876543210", "9876543211"],
  "message": "Bulk message content"
}
```

## 📊 Response Format

### Success Response
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    // Response data
  }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description",
  "errors": [
    // Validation errors (if any)
  ],
  "code": "ERROR_CODE"
}
```

## 🌐 Supported Languages

- **English** (`english`)
- **Hindi** (`hindi`) 
- **Telugu** (`telugu`)

## 📱 Query Types

- `animal_health` - Animal health related queries
- `crop_guidance` - Crop and farming guidance
- `nutrition` - Animal nutrition advice
- `emergency` - Emergency situations
- `general` - General farming queries

## 🔄 Subscription Status

- `free` - Free tier user
- `active` - Active premium subscription
- `expired` - Subscription expired
- `cancelled` - Subscription cancelled

## 📞 Call Status

- `initiated` - Call request created
- `connected` - Call connected
- `completed` - Call completed successfully
- `failed` - Call failed
- `abandoned` - Call abandoned by user

## 💰 Payment Status

- `created` - Payment order created
- `pending` - Payment in progress
- `paid` - Payment successful
- `failed` - Payment failed
- `refunded` - Payment refunded
- `cancelled` - Payment cancelled

## 🚦 Rate Limiting

- **OTP Requests**: 5 requests per 15 minutes
- **Login Attempts**: 10 attempts per 15 minutes
- **Call Requests**: 2 requests per minute
- **General API**: 100 requests per 15 minutes

## 🛡️ Security Features

- JWT-based authentication
- Request rate limiting
- Input validation and sanitization
- CORS protection
- Helmet security headers
- MongoDB injection prevention

## 📈 Monitoring & Logging

- Request/response logging with Morgan
- Error tracking and reporting
- Performance monitoring
- Usage analytics

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## 🚀 Deployment

### Docker Deployment
```bash
# Build image
docker build -t prani-mitra-backend .

# Run container
docker run -p 5000:5000 --env-file .env prani-mitra-backend
```

### PM2 Deployment
```bash
# Install PM2
npm install -g pm2

# Start application
pm2 start server.js --name "prani-mitra-api"

# Monitor
pm2 monit
```

## 🔧 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NODE_ENV` | Environment (development/production) | Yes |
| `PORT` | Server port | No (default: 5000) |
| `MONGODB_URI` | MongoDB connection string | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `RAZORPAY_KEY_ID` | Razorpay key ID | Yes |
| `RAZORPAY_KEY_SECRET` | Razorpay key secret | Yes |
| `MSG91_API_KEY` | MSG91 API key | Yes |
| `MSG91_SENDER_ID` | SMS sender ID | No (default: PRANMT) |
| `TOLL_FREE_NUMBER` | Toll-free number for calls | No |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support, email support@pranimitra.com or create an issue in the repository.

## 🙏 Acknowledgments

- MongoDB for database solutions
- Razorpay for payment processing
- MSG91/Twilio for SMS services
- Express.js community for the excellent framework
