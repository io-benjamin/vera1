# Plaid Integration Complete - Developer Guide

## What Was Changed

This is a **complete architectural pivot** from manual PDF statement uploads to automated Plaid bank integration. All statement-related code has been removed and replaced with Plaid SDK integration.

### Quick Summary
- ✅ Plaid service refactored (335 lines of clean, functional code)
- ✅ Plaid API routes created (5 endpoints)
- ✅ ConnectAccountsScreen redesigned with Plaid Link
- ✅ Mobile API service updated with Plaid methods
- ✅ Database schema created for Plaid (`schema_plaid.sql`)
- ✅ Migration file ready (`003_plaid_integration.sql`)
- ✅ All TypeScript compiles without errors
- ✅ Statement routes and functionality removed

---

## Files Changed

### Created Files
1. **`/backend/src/services/plaidService.ts`** (335 lines)
   - Functional exports for Plaid operations
   - Account and transaction syncing
   - Token exchange handling

2. **`/backend/src/routes/plaid.routes.ts`** (130 lines)
   - 5 API endpoints for Plaid operations
   - Auth middleware applied

3. **`/backend/src/database/schema_plaid.sql`** (234 lines)
   - New Plaid-optimized database schema
   - `plaid_items` table for connections

4. **`/backend/src/database/migrations/003_plaid_integration.sql`**
   - Migration file for safe schema application
   - Adds `plaid_items` table
   - Updates existing tables for Plaid fields

5. **`/PLAID_IMPLEMENTATION.md`**
   - Comprehensive documentation

6. **`/setup-plaid.sh`**
   - Setup automation script

### Modified Files
1. **`/backend/src/server.ts`**
   - Removed: `statementsRoutes` import
   - Added: Plaid routes and pool initialization

2. **`/mobile/src/screens/ConnectAccountsScreen.tsx`**
   - Replaced: PDF upload UI → Plaid Link UI
   - Added: `usePlaidLink` hook integration
   - New: Account display with balances

3. **`/mobile/src/services/api.ts`**
   - Removed: `uploadStatement()`, `getStatements()`, `Statement` interface
   - Added: Plaid API methods (`getLinkToken`, `exchangeToken`, `syncAccounts`, etc.)

### Deleted Files
1. **`/backend/src/routes/statements.routes.ts`** ❌ Removed

---

## Installation & Setup

### Prerequisites
```bash
# Ensure you have Node.js 16+ and PostgreSQL 13+
node --version  # Should be 16+
psql --version  # Should be 13+
```

### Environment Variables
Create or update `.env` in the `backend` directory:

```env
# Plaid Configuration
PLAID_CLIENT_ID=your_client_id_from_plaid_dashboard
PLAID_SECRET=your_secret_from_plaid_dashboard
PLAID_ENV=sandbox  # Use 'sandbox' for testing, 'production' for live

# Database
DATABASE_URL=postgres://user:password@localhost:5432/vera

# Server
PORT=3000
NODE_ENV=development
```

### Step 1: Install Dependencies

**Backend:**
```bash
cd backend
npm install plaid
```

**Mobile:**
```bash
cd mobile
npm install react-native-plaid-link-sdk
```

### Step 2: Apply Database Migration
The migration runs automatically on server startup, but you can also run it manually:

```bash
cd backend
npm run dev  # Starts the server, which runs migrations
```

Or apply directly with psql:
```bash
psql -U postgres -d vera -f src/database/migrations/003_plaid_integration.sql
```

### Step 3: Verify TypeScript Compilation
```bash
cd backend
npx tsc --noEmit  # Should have 0 errors
```

### Step 4: Start Services

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev  # Starts on http://localhost:3000
```

**Terminal 2 - Mobile:**
```bash
cd mobile
npm start    # Press 'i' for iOS or 'a' for Android
```

---

## API Endpoints

All endpoints require `Authorization: Bearer {token}` header.

### POST `/api/plaid/link-token`
Get a link token to open Plaid Link modal.

**Request:**
```json
{}
```

**Response:**
```json
{
  "linkToken": "link-sandbox-123456789"
}
```

### POST `/api/plaid/exchange-token`
Exchange public token from Plaid Link for access token.

**Request:**
```json
{
  "publicToken": "public-sandbox-123456789"
}
```

**Response:**
```json
{
  "itemId": "item-123456789",
  "accessToken": "access-sandbox-123456789"
}
```

### POST `/api/plaid/sync-accounts`
Sync accounts for a specific Plaid item.

**Request:**
```json
{
  "itemId": "item-123456789"
}
```

**Response:**
```json
{
  "accounts": [
    {
      "id": "account-uuid",
      "name": "Checking Account",
      "type": "CHECKING",
      "institution_name": "Chase",
      "balance": 1234.56,
      "last_four": "4242",
      "is_active": true
    }
  ]
}
```

### POST `/api/plaid/sync-transactions`
Sync transactions for all Plaid items (past 30 days default).

**Request:**
```json
{
  "days": 30
}
```

**Response:**
```json
{
  "transactionsSynced": 156
}
```

### DELETE `/api/plaid/items/:itemId`
Remove a Plaid connection and cascade delete associated data.

**Request:** None

**Response:**
```json
{
  "success": true
}
```

---

## Mobile Usage

### Opening Plaid Link

```typescript
import { usePlaidLink } from 'react-native-plaid-link-sdk';
import { getLinkToken, exchangeToken } from '../services/api';

const { open, ready } = usePlaidLink({
  token: linkToken,
  onSuccess: async (publicToken) => {
    // Exchange token on backend
    const result = await exchangeToken(publicToken);
    // Handle success
  },
  onExit: (error) => {
    // Handle user exit
  },
});

if (ready) {
  open();
}
```

---

## Database Schema

### `plaid_items` Table
Stores Plaid connections for each user.

```sql
CREATE TABLE plaid_items (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  item_id VARCHAR(255) UNIQUE,
  access_token VARCHAR(255),
  institution_id VARCHAR(255),
  institution_name VARCHAR(255),
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(user_id, item_id)
);
```

### Updated `accounts` Table
Now includes Plaid fields:

```sql
ALTER TABLE accounts ADD COLUMN plaid_account_id VARCHAR(255);
ALTER TABLE accounts ADD COLUMN plaid_item_id VARCHAR(255);
ALTER TABLE accounts ADD COLUMN subtype VARCHAR(50);
ALTER TABLE accounts ADD COLUMN last_synced_at TIMESTAMP;
```

### Updated `transactions` Table
Now uses `plaid_transaction_id` for deduplication:

```sql
ALTER TABLE transactions ADD COLUMN plaid_transaction_id VARCHAR(255) UNIQUE;
ALTER TABLE transactions ADD COLUMN merchant_id VARCHAR(255);
```

---

## Testing Flow

### 1. Register/Login
- App: Login with email/password

### 2. Connect Account
- Tap "Connect Bank Accounts" button
- Plaid Link opens
- Select sandbox test bank (e.g., "Test Bank")
- Use credentials: `user_good` / `pass_good`
- Authorize the connection

### 3. See Connected Account
- Account appears in the list with balance
- Shows bank name and last 4 digits

### 4. Sync Transactions
- Transactions sync automatically
- Can trigger manual sync via backend

### 5. Disconnect Account (Optional)
- Swipe left on account (if implemented)
- Account is removed and cascaded deletes transactions

---

## Troubleshooting

### "Property 'user' does not exist on type 'Request'"
**Solution:** Ensure auth middleware is applied before plaid routes in `server.ts`.

### "PLAID_CLIENT_ID not set"
**Solution:** Export environment variables before starting:
```bash
export PLAID_CLIENT_ID=your_id
export PLAID_SECRET=your_secret
npm run dev
```

### "Failed to get link token"
**Solution:** 
1. Check Plaid credentials in `.env`
2. Ensure server is running on port 3000
3. Check browser/mobile network requests

### "Access token not found" on exchange
**Solution:** Ensure token exchange request includes `publicToken` in body.

### Transactions not syncing
**Solution:**
1. Check `last_synced_at` timestamp in `plaid_items` table
2. Ensure `syncTransactions` is called after `exchangeToken`
3. Check PostgreSQL logs for insert errors

---

## Next Steps

### Short Term
1. ✅ Code implementation complete
2. ⏳ Apply database migrations
3. ⏳ Test end-to-end flow
4. ⏳ Add error handling for edge cases

### Medium Term
- Add account removal UI (swipe/delete button)
- Add transaction sync refresh button
- Add batch syncing for all accounts
- Add transaction history view

### Long Term
- Add recurring transaction detection
- Add spending analytics
- Add budget alerts
- Add export functionality

---

## Security Notes

- **Never** commit Plaid keys to version control
- Always use environment variables for secrets
- Use `PLAID_ENV=sandbox` for testing
- In production, use `PLAID_ENV=production`
- Access tokens are stored server-side in `plaid_items` table
- Public tokens are never stored

---

## Performance Considerations

- **Transaction Syncing**: Uses pagination (500 per request)
- **Deduplication**: Enforced via database UNIQUE constraint on `plaid_transaction_id`
- **Account Syncing**: Batch updates using `ON CONFLICT`
- **Database Indexes**: Created on `user_id`, `plaid_account_id`, `plaid_transaction_id`

---

## Support

For issues:
1. Check the troubleshooting section
2. Review TypeScript compilation output
3. Check server logs for errors
4. Verify Plaid dashboard credentials
5. Test with Plaid sandbox environment

---

**Last Updated**: January 2026
**Plaid SDK Version**: Latest (npm package)
**React Native Plaid Link**: Latest (npm package)
