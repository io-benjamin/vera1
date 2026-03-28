# vera API

Backend API for the vera banking and spending tracking mobile app.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Create a `.env` file in the `backend` directory:
   ```
   PORT=3000
   PLAID_CLIENT_ID=your_plaid_client_id
   PLAID_SECRET=your_plaid_secret
   PLAID_ENV=sandbox
   ```
   
   Get your Plaid sandbox credentials from [Plaid Dashboard](https://dashboard.plaid.com/)
   
   **Note:** The app defaults to sandbox mode. If `PLAID_ENV` is not set or set to anything other than `production`, it will use sandbox.
   
   **Plaid Sandbox Testing:**
   - Use test credentials: `user_good` / `pass_good` for successful login
   - Use `user_good` / `pass_good` with any institution in sandbox
   - Sandbox institutions include: Chase, Bank of America, Wells Fargo, etc.
   - See [Plaid Sandbox Documentation](https://plaid.com/docs/sandbox/) for more test credentials

3. **Set up database (optional for MVP):**
   The database schema is defined in `src/database/schema.sql`. For the MVP, the API works without a database connection. To set up PostgreSQL:
   ```bash
   # Create database
   createdb money_plan_db
   
   # Run schema
   psql money_plan_db < src/database/schema.sql
   ```

## Running Locally

**Development mode (with auto-reload):**
```bash
npm run dev
```

**Production build:**
```bash
npm run build
npm start
```

The server will start on `http://localhost:3000` (or the port specified in `PORT` environment variable).

## API Endpoints

### `GET /api/health`
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
    "service": "vera-api"
}
```

### `POST /api/plaid/link-token`
Create a Plaid Link token for connecting bank accounts.

**Request Body:**
```json
{
  "user_id": "optional-user-id"
}
```

**Response:**
```json
{
  "link_token": "link-sandbox-abc123..."
}
```

### `POST /api/plaid/exchange-token`
Exchange Plaid public token for access token and return account info.

**Request Body:**
```json
{
  "public_token": "public-sandbox-abc123..."
}
```

**Response:**
```json
{
  "account": {
    "id": "acc_123",
    "plaid_account_id": "abc123",
    "name": "Checking Account",
    "type": "CHECKING",
    "institution_name": "Chase",
    "balance": 1500.00,
    "last_synced_at": "2024-01-01T00:00:00.000Z",
    "is_active": true
  }
}
```

### `GET /api/accounts`
Get all connected accounts.

**Response:**
```json
{
  "accounts": [
    {
      "id": "acc_123",
      "name": "Checking Account",
      "institution_name": "Chase",
      "balance": 1500.00,
      ...
    }
  ]
}
```

### `POST /api/accounts/sync`
Sync all accounts (refresh balances and transactions).

**Response:**
```json
{
  "message": "Accounts synced successfully"
}
```

### `GET /api/spending/weekly-checkup`
Get weekly spending checkup.

**Response:**
```json
{
  "checkup": {
    "week_start_date": "2024-01-01T00:00:00.000Z",
    "week_end_date": "2024-01-07T23:59:59.999Z",
    "total_spent": 450.50,
    "transaction_count": 23,
    "top_categories": [
      {
        "category": "FOOD",
        "amount": 180.00,
        "percentage": 40.0
      }
    ],
    "daily_average": 64.36,
    "insights": [
      "You're spending an average of $64.36 per day this week.",
      "Food is your biggest spending category at 40.0% of total."
    ],
    "comparison_to_previous_week": {
      "change_amount": 50.00,
      "change_percentage": 12.5
    }
  }
}
```

## Environment Variables

- `PORT` - Server port (default: 3000)
- `PLAID_CLIENT_ID` - Plaid client ID
- `PLAID_SECRET` - Plaid secret key
- `PLAID_ENV` - Plaid environment (`sandbox` or `production`)

## Project Structure

```
backend/
├── src/
│   ├── server.ts              # Express server setup
│   ├── routes/
│   │   ├── plaid.routes.ts    # Plaid integration routes
│   │   ├── accounts.routes.ts # Account management routes
│   │   └── spending.routes.ts # Spending analysis routes
│   ├── services/
│   │   ├── plaidService.ts           # Plaid API integration
│   │   └── spendingAnalysisService.ts # Spending analysis logic
│   ├── models/
│   │   └── types.ts           # TypeScript type definitions
│   └── database/
│       └── schema.sql         # PostgreSQL database schema
├── package.json
├── tsconfig.json
└── README.md
```

## TODO

- [ ] Add database connection and persistence
- [ ] Add authentication
- [ ] Implement transaction sync with Plaid
- [ ] Add transaction categorization
- [ ] Add unit tests
- [ ] Add integration tests
- [ ] Add request logging
- [ ] Add rate limiting
