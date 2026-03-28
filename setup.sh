#!/bin/bash

# vera Setup Script
# This script will set up your database and start the servers

set -e  # Exit on error

echo "🚀 vera Setup Script"
echo "========================"
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Check PostgreSQL
echo "📊 Step 1: Checking PostgreSQL..."
if ! command -v psql &> /dev/null; then
    echo -e "${RED}❌ PostgreSQL not found!${NC}"
    echo ""
    echo "Please install PostgreSQL first:"
    echo "  brew install postgresql@14"
    echo "  brew services start postgresql@14"
    echo ""
    echo "Or download Postgres.app from: https://postgresapp.com/"
    exit 1
fi
echo -e "${GREEN}✅ PostgreSQL found${NC}"
echo ""

# Step 2: Check if database exists
echo "📊 Step 2: Checking database..."
DB_EXISTS=$(psql -lqt | cut -d \| -f 1 | grep -w vera | wc -l)

if [ $DB_EXISTS -eq 0 ]; then
    echo "Creating database 'vera'..."
    createdb vera
    echo -e "${GREEN}✅ Database created${NC}"

    echo "Loading schema..."
    psql vera < backend/src/database/schema.sql
    echo -e "${GREEN}✅ Schema loaded${NC}"
else
    echo -e "${YELLOW}⚠️  Database 'vera' already exists${NC}"
    echo ""
    read -p "Do you want to RESET the database? This will DELETE ALL DATA! (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Dropping database..."
        dropdb vera
        echo "Creating fresh database..."
        createdb vera
        echo "Loading schema..."
        psql vera < backend/src/database/schema.sql
        echo -e "${GREEN}✅ Database reset complete${NC}"
    else
        echo "Running migrations to add new tables..."
        # Run migration SQL
        psql vera <<'SQL'
-- Add auth fields to users (if they don't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name='users' AND column_name='password_hash') THEN
        ALTER TABLE users
          ADD COLUMN password_hash VARCHAR(255),
          ADD COLUMN first_name VARCHAR(100),
          ADD COLUMN last_name VARCHAR(100),
          ADD COLUMN phone VARCHAR(20),
          ADD COLUMN preferred_language VARCHAR(10) DEFAULT 'en';

        ALTER TABLE users ALTER COLUMN email SET NOT NULL;
    END IF;
END $$;

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
SQL
        echo -e "${GREEN}✅ Migrations applied${NC}"
    fi
fi
echo ""

# Step 3: Check dependencies
echo "📦 Step 3: Checking dependencies..."
if [ ! -d "backend/node_modules" ]; then
    echo "Installing backend dependencies..."
    cd backend && npm install && cd ..
fi
if [ ! -d "mobile/node_modules" ]; then
    echo "Installing mobile dependencies..."
    cd mobile && npm install && cd ..
fi
echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

# Step 4: Create test user
echo "👤 Step 4: Setting up test user..."
echo ""
echo "The backend API needs to be running to create a test user."
echo "Once the backend starts, you can create a test user via:"
echo ""
echo "  curl -X POST http://localhost:3000/api/auth/register \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"email\":\"test@vera.com\",\"password\":\"password123\"}'"
echo ""
echo "Or use the mobile app to register!"
echo ""

# Step 5: Seed mock data
echo "🌱 Step 5: Mock data info..."
echo ""
echo "To test personality and leaks features, you need transaction data."
echo "Once the backend is running, seed mock data with:"
echo ""
echo "  curl -X POST http://localhost:3000/api/mock/seed"
echo ""
echo "This creates 3 accounts with 80 transactions each over 60 days."
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo ""
echo "1. Start the backend:"
echo "   cd backend && npm run dev"
echo ""
echo "2. In a NEW terminal, start the mobile app:"
echo "   cd mobile && npm start"
echo ""
echo "3. Create a test account in the app or via API"
echo ""
echo "4. Seed mock data (for testing personality/leaks):"
echo "   curl -X POST http://localhost:3000/api/mock/seed"
echo ""
echo "5. Explore the Personality and Leaks screens!"
echo ""
echo "📖 Full guide: COMPLETE_SETUP_GUIDE.md"
echo ""
