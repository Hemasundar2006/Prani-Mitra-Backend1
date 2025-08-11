# 🔧 CORS Error Fix Instructions

## ✅ **CORS Configuration Updated**

The backend has been updated to accept requests from your Vercel frontend:
- `https://prani-mitra1.vercel.app` ✅

## 🚀 **Deployment Steps**

### **1. Update Environment Variables on Render**

Go to your Render dashboard for the backend service and add/update:

```
FRONTEND_URL=https://prani-mitra1.vercel.app
NODE_ENV=production
```

### **2. Redeploy Backend**

After updating environment variables:
1. Go to your Render service dashboard
2. Click "Manual Deploy" or push changes to trigger auto-deploy
3. Wait for deployment to complete

### **3. Test CORS**

After deployment, test with:
```bash
curl -H "Origin: https://prani-mitra1.vercel.app" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     https://prani-mitra-backend1.onrender.com/api/auth/register
```

Should return CORS headers without errors.

## 🔧 **What Was Changed**

### **server.js - Updated CORS Configuration:**
```javascript
app.use(cors({
  origin: [
    'http://localhost:3000',           // local frontend
    'http://localhost:3001',           // alternative development port
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'https://prani-mitra1.vercel.app', // ✅ YOUR FRONTEND URL
    process.env.FRONTEND_URL           // additional production frontend from env
  ].filter(Boolean),
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
```

## 🎯 **Expected Results**

After deployment, your frontend at `https://prani-mitra1.vercel.app` should be able to:
- ✅ Make API calls to `https://prani-mitra-backend1.onrender.com/api/*`
- ✅ Register new users
- ✅ Login users
- ✅ Access all API endpoints

## 🆘 **If Still Getting CORS Errors**

1. **Check Render Logs:**
   - Look for `🚫 CORS blocked origin:` messages
   - Verify environment variables are set correctly

2. **Verify Frontend URL:**
   - Ensure your frontend is exactly: `https://prani-mitra1.vercel.app`
   - Check for trailing slashes or different subdomains

3. **Clear Browser Cache:**
   - Hard refresh (Ctrl+F5 or Cmd+Shift+R)
   - Or open in incognito/private mode

4. **Contact Support:**
   - If issues persist, share the exact error message and frontend URL

## 📝 **Environment Variables Summary**

Make sure these are set in your Render environment:

```
NODE_ENV=production
PORT=5000
FRONTEND_URL=https://prani-mitra1.vercel.app
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your-secret-key
RAZORPAY_KEY_ID=your-key
RAZORPAY_KEY_SECRET=your-secret
```

---

**Status:** ✅ CORS configuration updated and tested locally
**Next Step:** Deploy to Render with updated environment variables
