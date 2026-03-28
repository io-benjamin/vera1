# 🚀 vera - Quick Start Guide

Get your behavior coaching platform running in 10 minutes!

## Prerequisites Check

Before starting, make sure you have:

- [ ] **Node.js** (v16+) - `node --version`
- [ ] **npm** - `npm --version`
- [ ] **PostgreSQL** (v12+) - See installation below
- [ ] **iOS Simulator** or **Android Emulator** or **Expo Go** app on phone

---

## Step 1: Install PostgreSQL (If Not Installed)

Check if you have PostgreSQL:
```bash
psql --version
```

If not installed, choose one:

### Option A: Homebrew (Recommended)
```bash
brew install postgresql@14
brew services start postgresql@14

# Add to PATH (add to ~/.zshrc or ~/.bash_profile)
export PATH="/opt/homebrew/opt/postgresql@14/bin:$PATH"

# Reload shell
source ~/.zshrc  # or source ~/.bash_profile
```

### Option B: Postgres.app (GUI, Easier)
1. Download from https://postgresapp.com/
2. Open the app
3. Click "Initialize" to create your first server
4. Add to PATH:
   ```bash
   # Add to ~/.zshrc or ~/.bash_profile
   export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"
   source ~/.zshrc
   ```

Verify:
```bash
psql --version
# Should show: psql (PostgreSQL) 14.x
```

---

## Step 2: Automatic Setup (Easy Way)

Run the setup script:

```bash
cd /Users/estradab/Projects/vera
./setup.sh
```

This will:
- ✅ Create the database
- ✅ Load the schema
- ✅ Install all dependencies
- ✅ Show you next steps

**Then skip to Step 6!**

---

## Step 3: Manual Setup (If You Prefer)

### 3a. Install Dependencies

```bash
# Backend
cd backend
npm install

# Mobile
cd ../mobile
npm install
cd ..
```

### 3b. Create Database

```bash
# Create database
createdb vera

# Load schema
psql vera < backend/src/database/schema.sql

# Verify
psql vera -c "\dt"
# You should see tables: users, accounts, transactions, etc.
```

---

## Step 4: Start the Backend

```bash
cd backend
npm run dev
```

You should see:
```
🚀 Server running on http://localhost:3000
📊 Health check: http://localhost:3000/api/health
```

**Keep this terminal running!**

Test it:
```bash
# In a NEW terminal
curl http://localhost:3000/api/health
```

Should return:
```json
{
  "status": "ok",
  "timestamp": "2024-01-12T...",
  "service": "vera-api"
}
```

---

## Step 5: Start the Mobile App

Open a **NEW terminal**:

```bash
cd mobile
npm start
```

You should see a QR code. Then:

- Press `i` for **iOS Simulator**
- Press `a` for **Android Emulator**
- Or scan the QR code with **Expo Go** app on your phone

The app will open and show the **Login** screen!

---

## Step 6: Create a Test Account

### Option A: Via Mobile App (Recommended)
1. In the app, tap "**Sign up**"
2. Enter:
   - Email: `test@vera.com`
   - Password: `password123`
   - First Name: `Test`
3. Tap "**Create Account**"
4. You're logged in! 🎉

### Option B: Via API

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@vera.com",
    "password": "password123",
    "first_name": "Test"
  }'
```

You'll get back a JWT token. Save it!

---

## Step 7: Seed Mock Data (For Testing)

**IMPORTANT**: You need 60-90 days of transactions to test Personality and Leaks features.

Seed mock data:

```bash
curl -X POST http://localhost:3000/api/mock/seed
```

This creates:
- ✅ 3 bank accounts (Chase Checking, Wells Fargo Savings, Capital One Credit)
- ✅ 80 transactions per account
- ✅ 60 days of transaction history
- ✅ Realistic spending patterns

---

## Step 8: Test All Features!

### In the Mobile App:

1. **Dashboard Screen** (you should see it after login)
   - View total balance
   - See weekly spending
   - Navigate between screens

2. **Personality Screen**
   - Tap the menu/navigation to go to "Personality"
   - Tap "Re-analyze My Personality"
   - See your spending personality type! 🧟

3. **Leaks Screen**
   - Navigate to "Leaks"
   - Tap "Scan for New Leaks"
   - See detected money drains! 💸

### Expected Results:

**Personality Screen:**
```
You are a Subscription Zombie 🧟

You're paying for 11 active subscriptions...

Damage Score: $1,284
Confidence: 85%

What to Do About It:
1. Cancel subscriptions...
```

**Leaks Screen:**
```
Money Leaks

3 Active Leaks
$567/month Draining Per Month

🔄 Duplicate Subscriptions
💸 Micro-Drain Pattern
🍔 Food Delivery Dependency
```

---

## Step 9: Test the API Directly (Optional)

Save the JWT token from registration, then:

```bash
# Replace YOUR_TOKEN with the actual token
TOKEN="YOUR_TOKEN_HERE"

# Get personality
curl http://localhost:3000/api/personality \
  -H "Authorization: Bearer $TOKEN"

# Get leaks
curl http://localhost:3000/api/leaks \
  -H "Authorization: Bearer $TOKEN"

# Detect new leaks
curl -X POST http://localhost:3000/api/leaks/detect \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🎯 What to Explore

### 1. Spending Personalities (6 Types)
- Drifter
- Impulse Buyer
- Subscription Zombie
- Lifestyle Creep
- Provider
- Optimistic Overspender

### 2. Money Leaks (5 Types)
- Duplicate Subscriptions
- Hidden Annual Charges
- Merchant Inflation
- Micro-Drains
- Food Delivery Dependency

### 3. Plain Language Coaching
All messages use **real language, not finance jargon**:
- ✅ "You spent $340 on DoorDash"
- ❌ "Your food expenditure exceeded allocation"

---

## 🚨 Troubleshooting

### "Connection refused" when starting backend
- PostgreSQL isn't running
- Run: `brew services start postgresql@14`
- Or open Postgres.app

### "Database 'vera' does not exist"
```bash
createdb vera
psql vera < backend/src/database/schema.sql
```

### "Not enough transaction data"
- You need to seed mock data
- Run: `curl -X POST http://localhost:3000/api/mock/seed`

### Mobile app won't connect to backend
- Backend must be running on http://localhost:3000
- iOS Simulator: Use `localhost`
- Android Emulator: Use `10.0.2.2`
- Physical Device: Use your computer's IP address
  - Edit `mobile/src/services/api.ts` line 4-5

### "Invalid token" / "Session expired"
- JWT tokens expire after 7 days
- Login again to get a new token

### Can't install dependencies
```bash
# Clear caches
rm -rf backend/node_modules mobile/node_modules
rm backend/package-lock.json mobile/package-lock.json

# Reinstall
cd backend && npm install
cd ../mobile && npm install
```

---

## 📊 Database Inspection

Want to see the data?

```bash
# Connect to database
psql vera

# List tables
\dt

# See users
SELECT * FROM users;

# See personalities
SELECT * FROM spending_personalities;

# See detected leaks
SELECT * FROM detected_leaks;

# Exit
\q
```

---

## 🎓 Architecture Overview

```
┌─────────────────────────────────────────┐
│         Mobile App (React Native)       │
│  - Login/Register                       │
│  - Personality Dashboard                │
│  - Leaks Screen                         │
│  - Original Dashboard/Accounts          │
└─────────────────┬───────────────────────┘
                  │ HTTP/REST
                  │ JWT Auth
┌─────────────────▼───────────────────────┐
│       Backend API (Express)             │
│  - JWT Authentication                   │
│  - Personality Analysis Service         │
│  - Leak Detection Service               │
│  - Coaching Service (Plain Language)    │
└─────────────────┬───────────────────────┘
                  │ SQL
┌─────────────────▼───────────────────────┐
│         PostgreSQL Database             │
│  - users, accounts, transactions        │
│  - spending_personalities               │
│  - detected_leaks                       │
│  - emotional_spending_events            │
│  - spending_alerts                      │
│  - weekly_checkins                      │
│  - family_connections                   │
└─────────────────────────────────────────┘
```

---

## 📚 Next Steps

Once everything is working:

1. **Read the full guide**: `COMPLETE_SETUP_GUIDE.md`
2. **Explore the code**:
   - Backend services: `backend/src/services/`
   - Mobile screens: `mobile/src/screens/`
3. **Customize the coaching messages**: `backend/src/services/coachingService.ts`
4. **Add more personality types**: Follow guide in `COMPLETE_SETUP_GUIDE.md`
5. **Integrate OpenAI**: Swap rule-based coaching with GPT-4

---

## ✅ Success Checklist

- [ ] PostgreSQL installed and running
- [ ] Backend dependencies installed (`npm install`)
- [ ] Mobile dependencies installed (`npm install`)
- [ ] Database created and schema loaded
- [ ] Backend running on http://localhost:3000
- [ ] Mobile app running in simulator/device
- [ ] Test account created
- [ ] Mock data seeded
- [ ] Personality screen shows a personality type
- [ ] Leaks screen shows detected leaks

**All checked?** You're ready! 🚀

---

## 🎉 You Did It!

You now have a **complete behavior coaching platform** running!

**What's different from other finance apps:**
- ❌ No budgets, no categories, no penny-tracking
- ✅ Detects behavior patterns from actual spending
- ✅ Plain language coaching, not finance jargon
- ✅ Focuses on WHY you spend, not WHAT you spend on

**Go break it, test it, customize it, and make it yours!**

Need help? Check:
- `COMPLETE_SETUP_GUIDE.md` - Full documentation
- `backend/SETUP_GUIDE.md` - Backend-specific guide
- Backend services code for how everything works

Happy coding! 💜
