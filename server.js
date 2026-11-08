const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const http = require('http');
require('dotenv').config();

const app = express();

// Render and other reverse proxies forward the client IP in X-Forwarded-For.
// Trust the first proxy hop so express-rate-limit can identify clients correctly.
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

// CORS config must be before routes
app.use(cors({
  origin: [
    'http://localhost:3000',           // local frontend
    'http://localhost:3001',           // alternative development port
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'https://prani-mitra1.vercel.app', // production frontend (Vercel)
    'https://prani-mitra1-6y9uifsit-hemasundar2006s-projects.vercel.app', // Vercel preview URL
    'https://prani-mitra-demo2.vercel.app',
    'http://localhost:8081',
    'http://localhost:19006',
    // New demo frontend
    process.env.FRONTEND_URL,
    process.env.EXPO_WEB_URL,
    process.env.PRODUCTION_WEB_URL
  ].filter(Boolean), // Remove any undefined values
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin'
  ],
  credentials: true
}));

// Allow preflight requests
app.options('*', cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('combined'));

// Database connection
mongoose.connect(process.env.DATABASE_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017/prani-mitra', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/assistant', require('./routes/assistant'));
app.use('/api/conversations', require('./routes/conversations'));
app.use('/api/users', require('./routes/users'));
app.use('/api/plans', require('./routes/plans'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/calls', require('./routes/calls'));
app.use('/api/content', require('./routes/content'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/contact', require('./routes/contact'));
app.use('/api/support', require('./routes/support'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  const checks = {
    backend: true,
    gemini: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_MODEL),
    geminiLive: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_LIVE_MODEL),
    gnani: Boolean(process.env.GNANI_API_KEY),
    database: mongoose.connection.readyState === 1
  };
  res.status(Object.values(checks).every(Boolean) ? 200 : 503).json({
    status: Object.values(checks).every(Boolean) ? 'OK' : 'DEGRADED',
    checks,
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'production' && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
require('./services/assistantWebSocket').attachAssistantWebSocket(server);
server.listen(PORT, () => {
  console.log(`🚀 Prani Mitra Backend server running on port ${PORT}`);
  console.log(`📱 Environment: ${process.env.NODE_ENV || 'production'}`);
});

module.exports = app;
