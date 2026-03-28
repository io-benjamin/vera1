# vera

A mobile banking app that helps you connect all your banking accounts via Plaid and get insights on your spending patterns.

## Project Structure

```
vera/
├── mobile/     # React Native + Expo app (Plaid Link integration)
└── backend/    # Node.js + Express API (Plaid SDK integration)
```

## Quick Start

### Prerequisites
- Node.js 16+
- PostgreSQL 13+
- Plaid account (sandbox for testing)

### Environment Setup

Create `.env` file in `backend/` directory:

```env
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_secret
PLAID_ENV=sandbox
DATABASE_URL=postgres://user:password@localhost:5432/vera
PORT=3000
NODE_ENV=development
```

### Backend Setup

```bash
cd backend
npm install plaid
npm run dev
```

The backend will run on `http://localhost:3000` and automatically apply database migrations.

### Mobile App Setup

```bash
cd mobile
npm install react-native-plaid-link-sdk
expo start
```

Scan the QR code with Expo Go app on your phone, or press `i` for iOS simulator / `a` for Android emulator.

## Features

- **Plaid Bank Integration**: Connect real bank accounts securely via Plaid
- **Real-Time Account Sync**: Automatically fetch accounts and transactions from banks
- **Bank-Level Security**: Your login credentials are never shared (powered by Plaid)
- **Transaction Categorization**: Transactions are automatically categorized
- **Spending Insights**: Get AI-powered insights on your spending patterns
- **Clean Mobile UI**: Simple, intuitive interface for managing your finances

## Tech Stack

**Mobile:**
- React Native + Expo
- TypeScript
- React Navigation
- Context API
- Plaid Link SDK

**Backend:**
- Node.js + Express
- TypeScript
- PostgreSQL
- Plaid SDK (bank integration)
- Claude AI (spending insights)

## Documentation

For detailed information, see:
- [PLAID_DEVELOPER_GUIDE.md](PLAID_DEVELOPER_GUIDE.md) - Complete developer guide
- [PLAID_DEPLOYMENT_CHECKLIST.md](PLAID_DEPLOYMENT_CHECKLIST.md) - Deployment steps
- [PLAID_IMPLEMENTATION.md](PLAID_IMPLEMENTATION.md) - Technical overview

## Environment Variables

### Backend
- `PORT` - Server port (default: 3000)
- `DATABASE_URL` - PostgreSQL connection string
- `PLAID_CLIENT_ID` - Plaid dashboard client ID
- `PLAID_SECRET` - Plaid dashboard secret
- `PLAID_ENV` - Plaid environment (sandbox or production)

**Note:** Set up PostgreSQL locally and create the `vera` database. See `backend/SETUP_GUIDE.md` for detailed database setup.

## Development

See individual README files in `mobile/` and `backend/` directories for detailed setup and API documentation.

## TODO

- [ ] Add transaction categorization improvements
- [ ] Add spending trend analysis
- [ ] Add recurring transaction detection
- [ ] Add budget tracking
- [ ] Add unit and integration tests
- [ ] Add deployment configurations
