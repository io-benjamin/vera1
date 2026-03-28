#!/bin/bash
set -e

echo "🔄 vera Plaid Integration Setup Script"
echo "==========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Check environment variables
echo -e "${YELLOW}Step 1: Checking environment variables...${NC}"
if [ -z "$PLAID_CLIENT_ID" ]; then
  echo -e "${RED}❌ PLAID_CLIENT_ID not set${NC}"
  echo "Please set: export PLAID_CLIENT_ID=your_client_id"
  exit 1
fi
if [ -z "$PLAID_SECRET" ]; then
  echo -e "${RED}❌ PLAID_SECRET not set${NC}"
  echo "Please set: export PLAID_SECRET=your_secret"
  exit 1
fi
if [ -z "$PLAID_ENV" ]; then
  echo -e "${YELLOW}⚠️  PLAID_ENV not set, using 'sandbox' as default${NC}"
  export PLAID_ENV=sandbox
fi
echo -e "${GREEN}✅ Environment variables configured${NC}"
echo ""

# Step 2: Install backend dependencies
echo -e "${YELLOW}Step 2: Installing backend dependencies...${NC}"
cd backend
npm install plaid
echo -e "${GREEN}✅ Backend dependencies installed${NC}"
echo ""

# Step 3: Install mobile dependencies
echo -e "${YELLOW}Step 3: Installing mobile dependencies...${NC}"
cd ../mobile
npm install react-native-plaid-link-sdk
echo -e "${GREEN}✅ Mobile dependencies installed${NC}"
echo ""

# Step 4: Apply database migrations
echo -e "${YELLOW}Step 4: Applying database migrations...${NC}"
cd ../backend
if [ -z "$DATABASE_URL" ]; then
  echo -e "${YELLOW}⚠️  DATABASE_URL not set. Migrations will run automatically when server starts.${NC}"
else
  echo -e "${GREEN}✅ Migrations will apply on server startup${NC}"
fi
echo ""

# Step 5: Compile TypeScript
echo -e "${YELLOW}Step 5: Compiling TypeScript...${NC}"
npm run build 2>/dev/null || npx tsc
echo -e "${GREEN}✅ TypeScript compiled successfully${NC}"
echo ""

echo -e "${GREEN}==========================================="
echo "🎉 Setup complete!"
echo -e "==========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Start the backend: cd backend && npm run dev"
echo "2. Start the mobile app: cd mobile && npm start"
echo "3. Test the flow: Navigate to Connect Accounts screen"
echo ""
