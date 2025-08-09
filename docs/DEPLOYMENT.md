# Prani Mitra Backend Deployment Guide

This guide covers various deployment options for the Prani Mitra Backend API.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Local Development](#local-development)
4. [Docker Deployment](#docker-deployment)
5. [Cloud Deployment](#cloud-deployment)
6. [Database Setup](#database-setup)
7. [SSL Configuration](#ssl-configuration)
8. [Monitoring & Logging](#monitoring--logging)
9. [Backup & Recovery](#backup--recovery)
10. [Troubleshooting](#troubleshooting)

## Prerequisites

### System Requirements
- **Node.js**: v16.0.0 or higher
- **MongoDB**: v4.4 or higher
- **RAM**: Minimum 2GB, Recommended 4GB+
- **Storage**: Minimum 10GB free space
- **Network**: Stable internet connection for external services

### External Services
- **Razorpay Account**: For payment processing
- **SMS Service**: MSG91 or Twilio account
- **Domain & SSL**: For production deployment
- **Cloud Storage** (optional): For file uploads

## Environment Setup

### 1. Clone Repository
```bash
git clone <repository-url>
cd prani-mitra-backend
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Create `.env` file from template:
```bash
cp env.example .env
```

Edit `.env` with your configuration:
```env
# Server Configuration
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://your-domain.com

# Database
MONGODB_URI=mongodb://localhost:27017/prani-mitra

# JWT Secret (Generate a strong secret)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Razorpay Configuration
RAZORPAY_KEY_ID=rzp_live_your_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret

# SMS Service (MSG91)
MSG91_API_KEY=your_msg91_api_key
MSG91_SENDER_ID=PRANMT
MSG91_ROUTE=4

# Alternative: Twilio
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Cloudinary (for file uploads)
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# AI Service Configuration
AI_SERVICE_URL=http://localhost:8000/api/ai
AI_SERVICE_API_KEY=your_ai_service_api_key

# Toll-free Number
TOLL_FREE_NUMBER=1800-123-4567

# Admin Configuration
ADMIN_EMAIL=admin@pranimitra.com
ADMIN_PHONE=+919876543210
```

### 4. Generate JWT Secret
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Local Development

### 1. Start MongoDB
```bash
# Using MongoDB service
sudo systemctl start mongod

# Or using Docker
docker run -d -p 27017:27017 --name mongo mongo:latest
```

### 2. Start Development Server
```bash
npm run dev
```

### 3. Verify Installation
```bash
curl http://localhost:5000/api/health
```

Expected response:
```json
{
  "status": "OK",
  "message": "Prani Mitra Backend is running",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0"
}
```

## Docker Deployment

### 1. Create Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodeuser -u 1001

# Change ownership
RUN chown -R nodeuser:nodejs /app
USER nodeuser

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

# Start application
CMD ["npm", "start"]
```

### 2. Create Docker Compose
```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/prani-mitra
    env_file:
      - .env
    depends_on:
      - mongo
    restart: unless-stopped
    networks:
      - prani-mitra

  mongo:
    image: mongo:5.0
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
      - ./mongo-init.js:/docker-entrypoint-initdb.d/mongo-init.js:ro
    environment:
      - MONGO_INITDB_ROOT_USERNAME=admin
      - MONGO_INITDB_ROOT_PASSWORD=password
      - MONGO_INITDB_DATABASE=prani-mitra
    restart: unless-stopped
    networks:
      - prani-mitra

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - api
    restart: unless-stopped
    networks:
      - prani-mitra

volumes:
  mongodb_data:

networks:
  prani-mitra:
    driver: bridge
```

### 3. MongoDB Initialization
Create `mongo-init.js`:
```javascript
db = db.getSiblingDB('prani-mitra');

db.createUser({
  user: 'api_user',
  pwd: 'secure_password',
  roles: [
    {
      role: 'readWrite',
      db: 'prani-mitra'
    }
  ]
});

// Create indexes
db.users.createIndex({ phoneNumber: 1 }, { unique: true });
db.users.createIndex({ 'subscription.status': 1 });
db.calls.createIndex({ userId: 1, createdAt: -1 });
db.calls.createIndex({ callId: 1 }, { unique: true });
db.payments.createIndex({ userId: 1, createdAt: -1 });
db.payments.createIndex({ razorpayOrderId: 1 }, { unique: true });
db.content.createIndex({ slug: 1 }, { unique: true });
db.content.createIndex({ type: 1, status: 1 });
```

### 4. Nginx Configuration
Create `nginx.conf`:
```nginx
events {
    worker_connections 1024;
}

http {
    upstream api {
        server api:5000;
    }

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;

    server {
        listen 80;
        server_name your-domain.com;
        return 301 https://$server_name$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name your-domain.com;

        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;

        # Security headers
        add_header X-Frame-Options DENY;
        add_header X-Content-Type-Options nosniff;
        add_header X-XSS-Protection "1; mode=block";
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

        # API routes
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://api;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Auth routes with stricter rate limiting
        location /api/auth/ {
            limit_req zone=auth burst=10 nodelay;
            proxy_pass http://api;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Health check
        location /api/health {
            proxy_pass http://api;
        }
    }
}
```

### 5. Deploy with Docker Compose
```bash
# Build and start services
docker-compose up -d

# Check logs
docker-compose logs -f api

# Scale API service
docker-compose up -d --scale api=3
```

## Cloud Deployment

### AWS EC2 Deployment

#### 1. Launch EC2 Instance
```bash
# Create key pair
aws ec2 create-key-pair --key-name prani-mitra --query 'KeyMaterial' --output text > prani-mitra.pem
chmod 400 prani-mitra.pem

# Launch instance
aws ec2 run-instances \
  --image-id ami-0abcdef1234567890 \
  --count 1 \
  --instance-type t3.medium \
  --key-name prani-mitra \
  --security-groups prani-mitra-sg \
  --user-data file://user-data.sh
```

#### 2. User Data Script
Create `user-data.sh`:
```bash
#!/bin/bash
yum update -y
yum install -y docker git

# Install Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
yum install -y nodejs

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/download/1.29.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Start Docker
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user

# Clone and deploy
cd /home/ec2-user
git clone <repository-url> prani-mitra-backend
cd prani-mitra-backend
cp env.example .env
# Edit .env with production values
docker-compose up -d
```

#### 3. Security Group Configuration
```bash
aws ec2 create-security-group \
  --group-name prani-mitra-sg \
  --description "Prani Mitra API Security Group"

# Allow HTTP
aws ec2 authorize-security-group-ingress \
  --group-name prani-mitra-sg \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0

# Allow HTTPS
aws ec2 authorize-security-group-ingress \
  --group-name prani-mitra-sg \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0

# Allow SSH
aws ec2 authorize-security-group-ingress \
  --group-name prani-mitra-sg \
  --protocol tcp \
  --port 22 \
  --cidr YOUR_IP/32
```

### Digital Ocean Deployment

#### 1. Create Droplet
```bash
# Using doctl CLI
doctl compute droplet create prani-mitra-api \
  --image ubuntu-20-04-x64 \
  --size s-2vcpu-4gb \
  --region blr1 \
  --ssh-keys YOUR_SSH_KEY_ID \
  --user-data-file user-data.sh
```

#### 2. Setup Script
```bash
#!/bin/bash
apt update && apt upgrade -y
apt install -y docker.io docker-compose git nginx certbot python3-certbot-nginx

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs

# Clone repository
git clone <repository-url> /opt/prani-mitra-backend
cd /opt/prani-mitra-backend

# Setup environment
cp env.example .env
# Edit .env file with production values

# Deploy
docker-compose up -d

# Setup SSL
certbot --nginx -d your-domain.com
```

### Heroku Deployment

#### 1. Prepare for Heroku
Create `Procfile`:
```
web: npm start
```

Create `heroku-postbuild` script in `package.json`:
```json
{
  "scripts": {
    "heroku-postbuild": "echo 'Build completed'"
  }
}
```

#### 2. Deploy to Heroku
```bash
# Install Heroku CLI
npm install -g heroku

# Login and create app
heroku login
heroku create prani-mitra-api

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your-jwt-secret
heroku config:set RAZORPAY_KEY_ID=your-key-id
# ... set other variables

# Add MongoDB addon
heroku addons:create mongolab:sandbox

# Deploy
git push heroku main

# Scale dynos
heroku ps:scale web=2
```

## Database Setup

### MongoDB Atlas (Recommended for Production)

#### 1. Create Cluster
1. Go to [MongoDB Atlas](https://cloud.mongodb.com)
2. Create new project "Prani Mitra"
3. Build new cluster (M10 or higher for production)
4. Choose region closest to your users

#### 2. Security Configuration
```javascript
// Database user
username: "api_user"
password: "secure_generated_password"
role: "readWrite"

// Network Access
// Add your server IP addresses
// For development: 0.0.0.0/0 (not recommended for production)
```

#### 3. Connection String
```env
MONGODB_URI=mongodb+srv://api_user:password@cluster0.xyz.mongodb.net/prani-mitra?retryWrites=true&w=majority
```

### Self-Hosted MongoDB

#### 1. Installation (Ubuntu)
```bash
# Import MongoDB public GPG Key
wget -qO - https://www.mongodb.org/static/pgp/server-5.0.asc | sudo apt-key add -

# Create list file
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/5.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-5.0.list

# Install MongoDB
sudo apt update
sudo apt install -y mongodb-org

# Start MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod
```

#### 2. Security Configuration
```bash
# Connect to MongoDB
mongo

# Create admin user
use admin
db.createUser({
  user: "admin",
  pwd: "secure_admin_password",
  roles: [ { role: "userAdminAnyDatabase", db: "admin" } ]
})

# Create application user
use prani-mitra
db.createUser({
  user: "api_user",
  pwd: "secure_api_password",
  roles: [ { role: "readWrite", db: "prani-mitra" } ]
})

exit
```

#### 3. Enable Authentication
Edit `/etc/mongod.conf`:
```yaml
security:
  authorization: enabled

net:
  port: 27017
  bindIp: 127.0.0.1  # Change to 0.0.0.0 for remote access
```

Restart MongoDB:
```bash
sudo systemctl restart mongod
```

### Database Indexes
Create indexes for optimal performance:
```javascript
// Connect to database
use prani-mitra

// User indexes
db.users.createIndex({ phoneNumber: 1 }, { unique: true })
db.users.createIndex({ 'subscription.status': 1 })
db.users.createIndex({ createdAt: -1 })

// Call indexes
db.calls.createIndex({ userId: 1, createdAt: -1 })
db.calls.createIndex({ callId: 1 }, { unique: true })
db.calls.createIndex({ phoneNumber: 1, createdAt: -1 })
db.calls.createIndex({ queryType: 1, createdAt: -1 })
db.calls.createIndex({ language: 1 })
db.calls.createIndex({ 'callDetails.status': 1 })
db.calls.createIndex({ isEmergency: 1, createdAt: -1 })

// Payment indexes
db.payments.createIndex({ userId: 1, createdAt: -1 })
db.payments.createIndex({ orderId: 1 })
db.payments.createIndex({ razorpayOrderId: 1 })
db.payments.createIndex({ razorpayPaymentId: 1 })
db.payments.createIndex({ status: 1, createdAt: -1 })

// Content indexes
db.content.createIndex({ slug: 1 }, { unique: true })
db.content.createIndex({ type: 1, status: 1, publishedAt: -1 })
db.content.createIndex({ category: 1, status: 1 })
db.content.createIndex({ tags: 1 })
db.content.createIndex({ status: 1, scheduledAt: 1 })

// OTP indexes (with TTL)
db.otps.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
db.otps.createIndex({ phoneNumber: 1, purpose: 1 })

// Voucher indexes
db.vouchers.createIndex({ code: 1 }, { unique: true })
db.vouchers.createIndex({ isActive: 1, 'validity.startDate': 1, 'validity.endDate': 1 })
```

## SSL Configuration

### Let's Encrypt (Recommended)

#### 1. Install Certbot
```bash
# Ubuntu/Debian
sudo apt install certbot python3-certbot-nginx

# CentOS/RHEL
sudo yum install certbot python3-certbot-nginx
```

#### 2. Obtain Certificate
```bash
# For Nginx
sudo certbot --nginx -d your-domain.com -d api.your-domain.com

# For Apache
sudo certbot --apache -d your-domain.com -d api.your-domain.com

# Standalone (if no web server)
sudo certbot certonly --standalone -d your-domain.com
```

#### 3. Auto-renewal
```bash
# Test renewal
sudo certbot renew --dry-run

# Add to crontab
sudo crontab -e
# Add line: 0 12 * * * /usr/bin/certbot renew --quiet
```

### Custom SSL Certificate

#### 1. Generate Private Key
```bash
openssl genrsa -out private.key 2048
```

#### 2. Create Certificate Signing Request
```bash
openssl req -new -key private.key -out certificate.csr
```

#### 3. Install Certificate
Place certificate files in `/etc/nginx/ssl/` and update Nginx configuration.

## Monitoring & Logging

### PM2 Process Manager

#### 1. Install PM2
```bash
npm install -g pm2
```

#### 2. Ecosystem Configuration
Create `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [{
    name: 'prani-mitra-api',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max_old_space_size=1024'
  }]
}
```

#### 3. Deploy with PM2
```bash
# Start application
pm2 start ecosystem.config.js

# Monitor
pm2 monit

# Logs
pm2 logs

# Restart
pm2 restart all

# Save PM2 configuration
pm2 save
pm2 startup
```

### Log Management

#### 1. Winston Logger Configuration
```javascript
// Add to server.js
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});
```

#### 2. Log Rotation
```bash
# Install logrotate
sudo apt install logrotate

# Create logrotate config
sudo nano /etc/logrotate.d/prani-mitra
```

Add configuration:
```
/opt/prani-mitra-backend/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 nodeuser nodeuser
    postrotate
        pm2 reloadLogs
    endscript
}
```

### Health Monitoring

#### 1. Health Check Endpoint
```javascript
// Already implemented in server.js
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Prani Mitra Backend is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});
```

#### 2. Uptime Monitoring
Use services like:
- **UptimeRobot**: Free tier available
- **Pingdom**: Professional monitoring
- **StatusCake**: Free and paid plans

#### 3. Application Monitoring
Consider integrating:
- **New Relic**: Application performance monitoring
- **DataDog**: Infrastructure and application monitoring
- **Sentry**: Error tracking and performance monitoring

## Backup & Recovery

### Database Backup

#### 1. MongoDB Backup Script
Create `backup.sh`:
```bash
#!/bin/bash

# Configuration
DB_NAME="prani-mitra"
BACKUP_DIR="/backups/mongodb"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="prani-mitra_${DATE}"

# Create backup directory
mkdir -p ${BACKUP_DIR}

# Create backup
mongodump --db ${DB_NAME} --out ${BACKUP_DIR}/${BACKUP_NAME}

# Compress backup
tar -czf ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz -C ${BACKUP_DIR} ${BACKUP_NAME}

# Remove uncompressed backup
rm -rf ${BACKUP_DIR}/${BACKUP_NAME}

# Keep only last 30 backups
find ${BACKUP_DIR} -name "prani-mitra_*.tar.gz" -mtime +30 -delete

echo "Backup completed: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
```

#### 2. Automated Backups
```bash
# Make script executable
chmod +x backup.sh

# Add to crontab
crontab -e
# Add line: 0 2 * * * /opt/prani-mitra-backend/backup.sh
```

#### 3. Restore from Backup
```bash
# Extract backup
tar -xzf prani-mitra_20240115_020000.tar.gz

# Restore database
mongorestore --db prani-mitra --drop prani-mitra_20240115_020000/prani-mitra/
```

### Cloud Backup

#### 1. AWS S3 Backup
```bash
# Install AWS CLI
pip install awscli

# Configure AWS credentials
aws configure

# Upload backup to S3
aws s3 cp /backups/mongodb/ s3://prani-mitra-backups/mongodb/ --recursive
```

#### 2. Google Cloud Storage
```bash
# Install gsutil
curl https://sdk.cloud.google.com | bash

# Upload backup
gsutil -m cp -r /backups/mongodb/ gs://prani-mitra-backups/
```

## Troubleshooting

### Common Issues

#### 1. MongoDB Connection Issues
```bash
# Check MongoDB status
sudo systemctl status mongod

# Check MongoDB logs
sudo tail -f /var/log/mongodb/mongod.log

# Test connection
mongo --eval "db.runCommand('ping')"
```

#### 2. Port Already in Use
```bash
# Find process using port 5000
lsof -i :5000

# Kill process
kill -9 <PID>
```

#### 3. Memory Issues
```bash
# Check memory usage
free -h

# Check Node.js memory usage
ps aux | grep node

# Increase Node.js memory limit
node --max_old_space_size=4096 server.js
```

#### 4. SSL Certificate Issues
```bash
# Check certificate validity
openssl x509 -in /etc/ssl/certs/cert.pem -text -noout

# Test SSL connection
openssl s_client -connect your-domain.com:443
```

### Performance Optimization

#### 1. Node.js Optimization
```javascript
// Enable compression
const compression = require('compression');
app.use(compression());

// Set proper cache headers
app.use((req, res, next) => {
  if (req.url.includes('/api/')) {
    res.set('Cache-Control', 'no-cache');
  }
  next();
});
```

#### 2. MongoDB Optimization
```javascript
// Connection pooling
mongoose.connect(uri, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
});

// Enable query profiling
db.setProfilingLevel(1, { slowms: 100 });
```

#### 3. Nginx Optimization
```nginx
# Enable gzip compression
gzip on;
gzip_types text/plain application/json application/javascript text/css;

# Enable caching
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

### Log Analysis

#### 1. Common Log Patterns
```bash
# Error logs
grep "ERROR" logs/combined.log

# Failed authentication
grep "Authentication failed" logs/combined.log

# Payment failures
grep "Payment.*failed" logs/combined.log

# High response times
grep "duration.*[5-9][0-9][0-9][0-9]" logs/combined.log
```

#### 2. Log Monitoring Scripts
Create `monitor.sh`:
```bash
#!/bin/bash

# Check for errors in last hour
ERRORS=$(grep "ERROR" logs/combined.log | grep "$(date -d '1 hour ago' '+%Y-%m-%d %H')" | wc -l)

if [ $ERRORS -gt 10 ]; then
    echo "High error rate detected: $ERRORS errors in last hour"
    # Send alert (email, Slack, etc.)
fi
```

### Security Checklist

- [ ] Change all default passwords
- [ ] Enable MongoDB authentication
- [ ] Use HTTPS only
- [ ] Implement rate limiting
- [ ] Keep dependencies updated
- [ ] Use strong JWT secrets
- [ ] Enable firewall
- [ ] Regular security updates
- [ ] Monitor access logs
- [ ] Implement proper CORS

### Maintenance Tasks

#### Daily
- [ ] Check application logs
- [ ] Monitor system resources
- [ ] Verify backup completion

#### Weekly
- [ ] Review error logs
- [ ] Check security updates
- [ ] Monitor database performance

#### Monthly
- [ ] Update dependencies
- [ ] Review access logs
- [ ] Test backup restoration
- [ ] Performance optimization review

This deployment guide covers the essential aspects of deploying the Prani Mitra Backend API in various environments. Choose the deployment method that best fits your requirements and infrastructure.
