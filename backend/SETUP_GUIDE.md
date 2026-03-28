# vera Behavior Coaching Platform - Setup Guide

## What's Been Built

You now have a **behavior diagnosis and coaching engine** (NOT a budgeting app) with:

### ✅ Backend Services (Complete)

1. **Authentication System** (`/api/auth`)
   - JWT-based authentication
   - User registration, login, profile management
   - Password change functionality
   - Secure token-based API access

2. **Spending Personality Engine** (`/api/personality`)
   - Detects 6 personality types from transaction patterns:
     - Drifter: No savings goal, inconsistent spending
     - Impulse Buyer: High late-night & emotional purchases
     - Subscription Zombie: 10+ active subscriptions
     - Lifestyle Creep: Income ↑ → spending ↑
     - Provider: Sends money to family, neglects self
     - Optimistic Overspender: Frequent overdrafts
   - Calculates "damage score" (money lost to behavior)
   - Plain-language coaching messages

3. **Leak Detection Engine** (`/api/leaks`)
   - Detects 5 types of money drains:
     - Duplicate subscriptions
     - Hidden annual charges
     - Merchant inflation (price creep)
     - Micro-drains ($7-$15 charges adding up)
     - Food delivery dependency
   - Calculates monthly/annual costs
   - Action-oriented solutions

4. **Coaching Service** (Plain Language Engine)
   - Rule-based coaching templates (designed for OpenAI integration later)
   - Blunt, specific, action-oriented language
   - NO finance jargon
   - Family mode support with Spanish translation framework

### 📊 Database Schema (Complete)

New tables:
- `spending_personalities` - User personality profiles
- `detected_leaks` - Money drains found
- `emotional_spending_events` - Time/emotion-based patterns
- `spending_alerts` - Real-time warnings
- `weekly_checkins` - Sunday AI summaries
- `family_connections` - Parent/family mode

Enhanced `users` table with:
- `password_hash` for authentication
- `first_name`, `last_name`, `phone`
- `preferred_language` for family mode

---

## Setup Instructions

### 1. Install New Dependencies

```bash
cd backend
npm install
```

New packages added:
- `bcryptjs` - Password hashing
- `jsonwebtoken` - JWT authentication
- `@types/bcryptjs` & `@types/jsonwebtoken` - TypeScript types

### 2. Update Database Schema

You have two options:

**Option A: Fresh Database (DESTROYS EXISTING DATA)**
```bash
# Drop and recreate database
dropdb vera
createdb vera
psql vera < src/database/schema.sql
```

**Option B: Migrate Existing Database (RECOMMENDED)**

Run this migration script:

```sql
-- Add password field to users
ALTER TABLE users
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10) DEFAULT 'en';

-- Update email to be NOT NULL (if not already)
ALTER TABLE users ALTER COLUMN email SET NOT NULL;

-- Create new enums
DO $$ BEGIN
  CREATE TYPE personality_type AS ENUM (
    'DRIFTER', 'IMPULSE_BUYER', 'SUBSCRIPTION_ZOMBIE',
    'LIFESTYLE_CREEP', 'PROVIDER', 'OPTIMISTIC_OVERSPENDER'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE leak_type AS ENUM (
    'DUPLICATE_SUBSCRIPTION', 'HIDDEN_ANNUAL_CHARGE', 'MERCHANT_INFLATION',
    'MICRO_DRAIN', 'FOOD_DELIVERY_DEPENDENCY'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE alert_type AS ENUM (
    'OVERDRAFT_WARNING', 'SPENDING_PACE', 'PATTERN_RECOGNITION',
    'SUBSCRIPTION_ALERT', 'MERCHANT_PRICE', 'UNUSUAL_ACTIVITY'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create new tables (run the CREATE TABLE statements from schema.sql)
-- spending_personalities, detected_leaks, emotional_spending_events,
-- spending_alerts, weekly_checkins, family_connections
```

Save this as `migration.sql` and run:
```bash
psql vera < migration.sql
```

### 3. Update Environment Variables

Your `.env` file now includes:
```
JWT_SECRET=vera-dev-secret-key-change-in-production-12345
```

⚠️ **IMPORTANT**: Change this secret in production!

### 4. Create Test User (If Fresh Database)

```bash
cd backend
npm run dev
```

Then use the API or Postman to register:
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@vera.com",
    "password": "password123",
    "first_name": "Test",
    "last_name": "User"
  }'
```

You'll get back a JWT token. Save it!

### 5. Test the New APIs

**Get Spending Personality:**
```bash
curl http://localhost:3000/api/personality \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Detect Money Leaks:**
```bash
curl -X POST http://localhost:3000/api/leaks/detect \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Get Detected Leaks:**
```bash
curl http://localhost:3000/api/leaks \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## API Endpoints Reference

### Authentication (`/api/auth`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/register` | Register new user |
| POST | `/login` | Login user |
| GET | `/me` | Get current user (requires auth) |
| PATCH | `/profile` | Update profile (requires auth) |
| POST | `/change-password` | Change password (requires auth) |

### Personality (`/api/personality`) - All require authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Get personality with coaching |
| POST | `/analyze` | Force re-analysis |

### Leaks (`/api/leaks`) - All require authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Get all detected leaks |
| POST | `/detect` | Run leak detection |
| GET | `/:leakId` | Get leak with coaching |
| POST | `/:leakId/resolve` | Mark leak as resolved |

---

## Example Response Formats

### Personality Analysis Response
```json
{
  "personality": {
    "id": "...",
    "primary_type": "SUBSCRIPTION_ZOMBIE",
    "secondary_type": "IMPULSE_BUYER",
    "confidence_score": 85.5,
    "damage_score": 1284.00,
    "behavior_patterns": {
      "subscription_count": 11,
      "late_night_spending_ratio": 0.34,
      ...
    }
  },
  "message": {
    "title": "You are a Subscription Zombie",
    "description": "You're paying for 11 active subscriptions. That's $1,284 leaving your account every year on services you barely touch.",
    "emoji": "🧟"
  },
  "actions": [
    "Cancel any subscription you haven't used in 30 days",
    "Set calendar reminders 3 days before annual renewals",
    "Use one streaming service at a time - rotate monthly"
  ]
}
```

### Leak Detection Response
```json
{
  "leaks": [
    {
      "id": "...",
      "leak_type": "DUPLICATE_SUBSCRIPTION",
      "title": "Duplicate Netflix Subscriptions",
      "description": "You're paying for 2 different netflix accounts",
      "monthly_cost": 29.98,
      "annual_cost": 359.76,
      "merchant_names": ["Netflix Premium", "Netflix Standard"],
      "is_resolved": false
    }
  ],
  "summary": {
    "total_leaks": 5,
    "unresolved_leaks": 5,
    "total_monthly_cost": 567.89,
    "total_annual_cost": 6814.68
  }
}
```

---

## Language & Tone Examples

All coaching messages follow these rules:

❌ **DON'T SAY:**
- "Your discretionary spending is high"
- "Consider optimizing your subscription portfolio"

✅ **DO SAY:**
- "You spent $340 on food delivery last month. That's a car payment."
- "You're paying for 11 subscriptions you never use. That's $187/month going nowhere."

The `CoachingService` handles all messaging. Easy to extend for OpenAI later.

---

## Next Steps

### Phase 1: Mobile App (Next)
- Login/Register screens
- Personality Dashboard
- Leak Detection screen
- Integrate with new auth + behavior APIs

### Phase 2: Advanced Features (Future)
- Weekly AI Check-In scheduler
- Real-time spending alerts
- Emotional spending heatmap
- Future trajectory simulator
- Family/Parent mode UI

### Phase 3: OpenAI Integration (Future)
- Replace rule-based coaching with GPT-4
- Maintain plain language tone
- Add personalization based on user history

---

## Architecture Notes

### Why This Design?

1. **Rule-Based Coaching Now, AI Later**
   - `CoachingService` has templates ready
   - Easy to swap in OpenAI API calls
   - Same interface, better output

2. **Behavior Patterns Over Budgets**
   - No budget categories
   - Focus on WHY users spend, not HOW MUCH
   - Detect patterns, not track pennies

3. **Plain Language First**
   - All messages use real language
   - No finance jargon
   - Blunt but supportive tone

4. **Data-Driven Personalities**
   - Analyzed from 60-90 days of transactions
   - Updated quarterly
   - No surveys, just behavior

---

## Troubleshooting

### "Not enough transaction data"
- Need 60-90 days of transactions to analyze personality
- Use mock data seeder: `POST /api/mock/seed`

### "Invalid token"
- Token expired (7 days)
- Login again to get new token

### Personality scores seem off
- Algorithm uses approximations (late-night spending, etc.)
- Will improve with more data points
- Consider adding time-of-day transaction tracking

---

## Files Created/Modified

### New Files:
- `backend/src/services/authService.ts` - Authentication logic
- `backend/src/services/coachingService.ts` - Plain language engine
- `backend/src/services/personalityAnalysisService.ts` - 6 personality types
- `backend/src/services/leakDetectionService.ts` - 5 leak types
- `backend/src/middleware/auth.ts` - JWT verification
- `backend/src/routes/auth.routes.ts` - Auth endpoints
- `backend/src/routes/personality.routes.ts` - Personality endpoints
- `backend/src/routes/leaks.routes.ts` - Leak endpoints

### Modified Files:
- `backend/src/database/schema.sql` - New tables and enums
- `backend/src/models/types.ts` - New type definitions
- `backend/src/server.ts` - Added new routes
- `backend/package.json` - New dependencies
- `backend/.env` - JWT_SECRET added

---

## Questions?

This is a MASSIVE foundation. You now have:
- ✅ Full authentication
- ✅ 6 personality types detection
- ✅ 5 leak types detection
- ✅ Plain language coaching
- ✅ Database schema for all features
- ✅ RESTful API

Ready to build the mobile app! 📱
