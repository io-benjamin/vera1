# Plaid Integration - Deployment Checklist

## ✅ Completed Tasks

### Backend
- [x] Created Plaid service with functional exports
  - `createLinkToken()` - Generate link tokens
  - `exchangePublicToken()` - Exchange public tokens
  - `syncAccountsForItem()` - Sync bank accounts
  - `syncTransactions()` - Fetch transactions with pagination
  - `removeItem()` - Disconnect accounts
  - Helper functions: `mapAccountType()`, `mapCategory()`

- [x] Created Plaid API routes
  - `POST /api/plaid/link-token`
  - `POST /api/plaid/exchange-token`
  - `POST /api/plaid/sync-accounts`
  - `POST /api/plaid/sync-transactions`
  - `DELETE /api/plaid/items/:itemId`

- [x] Updated server configuration
  - Removed statement routes import
  - Added Plaid routes registration
  - Configured Plaid pool

- [x] Deleted obsolete files
  - Removed `/backend/src/routes/statements.routes.ts`

- [x] Created database schema files
  - `schema_plaid.sql` - Complete new schema
  - Migration file: `003_plaid_integration.sql`

- [x] TypeScript validation
  - All files compile without errors
  - Types properly defined
  - Auth middleware integration complete

### Mobile
- [x] Replaced ConnectAccountsScreen
  - PDF upload → Plaid Link integration
  - Account list display with balances
  - Real-time Plaid Link status

- [x] Updated API service
  - Removed statement functions
  - Added Plaid endpoint functions
  - Proper error handling

- [x] Navigation integration
  - ConnectAccountsScreen properly wired
  - Screen imports updated

## ⏳ Next Steps (Before First Deploy)

### 1. Environment Setup
- [ ] Create `.env` file in `/backend` with:
  ```
  PLAID_CLIENT_ID=<your_client_id>
  PLAID_SECRET=<your_secret>
  PLAID_ENV=sandbox
  DATABASE_URL=postgres://...
  PORT=3000
  ```
- [ ] Verify all required env vars are set

### 2. Install Dependencies
- [ ] Run `cd backend && npm install plaid`
- [ ] Run `cd mobile && npm install react-native-plaid-link-sdk`
- [ ] Run `npm install` in both directories to ensure all deps are current

### 3. Database Migration
- [ ] Verify PostgreSQL is running
- [ ] Run `npm run dev` in backend (auto-runs migrations)
- [ ] Verify migration completed without errors
- [ ] Check `plaid_items` table was created:
  ```sql
  \dt plaid_items  -- Should show the table
  ```

### 4. Verify TypeScript Compilation
- [ ] Run `cd backend && npx tsc --noEmit`
  - Should output: ✅ **Zero errors**
- [ ] Run `cd mobile && npx tsc --noEmit`
  - Should output: ✅ **Zero errors**

### 5. Test Backend
- [ ] Start backend: `npm run dev`
- [ ] Verify server starts without errors
- [ ] Check health endpoint: `http://localhost:3000/api/health`
- [ ] Should return:
  ```json
  {
    "status": "ok",
    "timestamp": "2026-01-17T12:00:00.000Z",
    "service": "vera-api"
  }
  ```

### 6. Test Mobile App
- [ ] Start mobile: `npm start`
- [ ] Login with test credentials
- [ ] Navigate to "Connect Bank Accounts" screen
- [ ] Verify Plaid Link button appears
- [ ] Test complete flow:
  1. Tap "Add Bank Account"
  2. Plaid Link opens
  3. Select test bank (e.g., "Test Bank")
  4. Use test credentials: `user_good` / `pass_good`
  5. Verify account appears in list

### 7. Verify Database Operations
- [ ] After connecting account, verify data in DB:
  ```sql
  SELECT * FROM plaid_items WHERE user_id = '<user_id>';
  SELECT * FROM accounts WHERE plaid_item_id IS NOT NULL;
  SELECT COUNT(*) FROM transactions WHERE plaid_transaction_id IS NOT NULL;
  ```

## 📋 Configuration Verification

### Backend Environment
- [ ] `PLAID_CLIENT_ID` - Set and valid
- [ ] `PLAID_SECRET` - Set and secret
- [ ] `PLAID_ENV` - Set to "sandbox" or "production"
- [ ] `DATABASE_URL` - Valid PostgreSQL connection
- [ ] `PORT` - Set to 3000 (or desired port)

### Mobile Configuration
- [ ] `API_BASE_URL` - Points to backend (localhost:3000 for dev)
- [ ] Plaid Link SDK installed
- [ ] Auth token storage working

### Database
- [ ] PostgreSQL running and accessible
- [ ] vera database exists
- [ ] All users table has users
- [ ] plaid_items table created
- [ ] accounts table updated with Plaid columns
- [ ] transactions table updated with Plaid columns

## 🧪 Test Cases

### Account Connection
- [ ] User can open Plaid Link
- [ ] User can select and connect bank account
- [ ] Account appears in connected list
- [ ] Account shows correct balance
- [ ] Account shows correct bank name

### Transaction Syncing
- [ ] Transactions sync after account connection
- [ ] Transaction count is correct
- [ ] Transaction amounts are correct
- [ ] Duplicate transactions prevented

### Account Disconnection
- [ ] User can disconnect account
- [ ] Account removed from list
- [ ] Associated transactions deleted
- [ ] plaid_items entry deleted

### Error Handling
- [ ] Invalid token returns 401
- [ ] Missing required fields return 400
- [ ] Server errors return 500 with message
- [ ] Network errors handled gracefully

## 📊 Monitoring

### Server Logs
- [ ] Check for any errors on startup
- [ ] Monitor API response times
- [ ] Watch for database connection issues

### Database
- [ ] Monitor table sizes (especially transactions)
- [ ] Check index performance
- [ ] Verify no orphaned records

### Plaid Dashboard
- [ ] Monitor API usage/quota
- [ ] Check for authentication errors
- [ ] Review webhook logs (if configured)

## 🚀 Deployment Sequence

1. Apply database migration
2. Install npm dependencies
3. Set environment variables
4. Start backend server
5. Start mobile app
6. Test complete flow
7. Monitor logs for errors

## ⚠️ Known Limitations

- Institution name is generic ("Bank Account") initially - can be enhanced
- Account removal requires backend endpoint (not yet UI)
- Transaction sync runs on demand (no background job yet)
- No webhook integration (batch manual sync only)

## 📝 Documentation Files

- `PLAID_IMPLEMENTATION.md` - Technical overview
- `PLAID_DEVELOPER_GUIDE.md` - Complete developer guide
- `setup-plaid.sh` - Automated setup script

## 🆘 Troubleshooting

If you encounter issues, check these files in order:
1. Backend logs: `npm run dev` output
2. Mobile console: Expo client logs
3. Database: `psql` queries to verify table structure
4. Plaid Dashboard: Check credentials and quota

## ✨ Success Criteria

- [x] Backend TypeScript compiles without errors
- [x] Mobile TypeScript compiles without errors
- [x] All Plaid routes defined
- [x] ConnectAccountsScreen uses Plaid Link
- [x] Database schema ready
- [x] Migration file created
- [ ] ⏳ End-to-end test passed
- [ ] ⏳ Transactions sync verified
- [ ] ⏳ Account disconnection works
- [ ] ⏳ Production deployment tested

---

**Status**: Code complete, awaiting environment setup and testing

**Last Updated**: January 17, 2026

**Next Person**: Review this checklist, follow "Next Steps" section in order
