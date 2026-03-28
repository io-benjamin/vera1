# 🚀 vera App - RUNNING!

## ✅ Status: All Systems Running

### Backend API
- **Status**: ✅ Running
- **URL**: http://localhost:3000
- **Health**: http://localhost:3000/api/health
- **Logs**: `/tmp/claude/-Users-estradab-Projects-vera/tasks/b64f7f6.output`

### Mobile App (Expo)
- **Status**: ✅ Running
- **Metro Bundler**: http://localhost:8081
- **Logs**: `/tmp/claude/-Users-estradab-Projects-vera/tasks/ba662be.output`

### Database
- **Status**: ✅ Running
- **Name**: vera
- **Engine**: PostgreSQL 14

---

## 🎯 How to Access the App

### Option 1: iOS Simulator (Fastest)
```bash
# Open a new terminal and run:
cd /Users/estradab/Projects/vera/mobile
npx expo start --ios
```

### Option 2: Android Emulator
```bash
# Open a new terminal and run:
cd /Users/estradab/Projects/vera/mobile
npx expo start --android
```

### Option 3: Expo Go App (Physical Device)
1. Install "Expo Go" from App Store or Google Play
2. Open a new terminal:
   ```bash
   cd /Users/estradab/Projects/vera/mobile
   npx expo start
   ```
3. Scan the QR code with your phone

### Option 4: Web Browser (Quick Preview)
```bash
# Open a new terminal and run:
cd /Users/estradab/Projects/vera/mobile
npx expo start --web
```

---

## 👤 Test Account (Already Created!)

**Email**: test@vera.com
**Password**: password123

**JWT Token**:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJiNTU2ZDBjMy04ZWYxLTRiNWMtYTlmNC01MTIwYjQ2YjNhNjQiLCJpYXQiOjE3NjgyNzU4OTEsImV4cCI6MTc2ODg4MDY5MX0.KoWo0Ftc6Xga9J6u40CvXoztx1P6ye3JWJnOe4Gd_V8
```

---

## 📊 Mock Data (Already Loaded!)

✅ **240 transactions** across 3 accounts over 60 days

**Demo User ID**: 5a6e53fc-f53b-48c1-ac9c-df5286e9fd59
**Accounts**:
- Chase Checking
- Wells Fargo Savings
- Capital One Credit

---

## 🧪 Test the Features

### Via Mobile App:
1. **Login** with test@vera.com / password123
2. **Navigate to Personality** screen
3. **Tap "Re-analyze"** to see your spending personality
4. **Navigate to Leaks** screen
5. **Tap "Scan for Leaks"** to detect money drains

### Via API (Terminal):
```bash
# Set your token
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJiNTU2ZDBjMy04ZWYxLTRiNWMtYTlmNC01MTIwYjQ2YjNhNjQiLCJpYXQiOjE3NjgyNzU4OTEsImV4cCI6MTc2ODg4MDY5MX0.KoWo0Ftc6Xga9J6u40CvXoztx1P6ye3JWJnOe4Gd_V8"

# Get personality
curl http://localhost:3000/api/personality \
  -H "Authorization: Bearer $TOKEN"

# Detect leaks
curl -X POST http://localhost:3000/api/leaks/detect \
  -H "Authorization: Bearer $TOKEN"

# Get leaks
curl http://localhost:3000/api/leaks \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🎨 What You'll See

### Personality Analysis
```
You are a Subscription Zombie 🧟

You're paying for 11 active subscriptions. That's $1,284
leaving your account every year on services you barely touch.

Damage Score: $1,284
Confidence: 85%

What to Do About It:
1. Cancel any subscription you haven't used in 30 days
2. Set calendar reminders 3 days before annual renewals
3. Use one streaming service at a time - rotate monthly
```

### Leak Detection
```
Money Leaks

3 Active Leaks
$567/month Draining

🔄 Duplicate Subscriptions - $30/mo
💸 Micro-Drains - $387/mo
🍔 Food Delivery - $150/mo
```

---

## 🛑 How to Stop Everything

```bash
# Stop backend
lsof -ti:3000 | xargs kill

# Stop mobile app
lsof -ti:8081 | xargs kill

# Stop PostgreSQL (if needed)
brew services stop postgresql@14
```

Or just close the terminals!

---

## 📝 View Logs

### Backend Logs:
```bash
tail -f /tmp/claude/-Users-estradab-Projects-vera/tasks/b64f7f6.output
```

### Mobile Logs:
```bash
tail -f /tmp/claude/-Users-estradab-Projects-vera/tasks/ba662be.output
```

---

## 🔧 Troubleshooting

### "Can't connect to backend"
- Make sure backend is running: `curl http://localhost:3000/api/health`
- Check backend logs for errors

### "Session expired"
- JWT tokens expire after 7 days
- Login again to get a new token

### "Not enough transaction data"
- Mock data is already loaded!
- If needed, run again: `curl -X POST http://localhost:3000/api/mock/seed`

### Mobile app won't start
```bash
# Kill existing processes
lsof -ti:8081 | xargs kill

# Restart
cd /Users/estradab/Projects/vera/mobile
npm start
```

---

## 🎉 You're All Set!

Everything is running and ready to test!

**Next Steps**:
1. Open the app (see "How to Access" above)
2. Login with test@vera.com / password123
3. Explore Personality and Leaks screens
4. Try the API calls above

**Documentation**:
- Full guide: `COMPLETE_SETUP_GUIDE.md`
- Quick start: `QUICK_START.md`
- Backend guide: `backend/SETUP_GUIDE.md`

Happy testing! 🚀
