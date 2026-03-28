# Simulating Mock Data for Sandbox Development

Since Plaid is in sandbox mode, you can't connect real accounts. Here are two ways to add test data:

## Option 1: API Endpoint (Easiest)

Make a POST request to seed mock data instantly:

```bash
# Seed mock data
curl -X POST http://localhost:3000/api/mock/seed

# Response:
{
  "message": "Mock data seeded successfully",
  "user_id": "...",
  "email": "demo-xxx@vera.com",
  "accounts_created": 3,
  "transactions_created": 240
}
```

The response will give you a user ID and email to use for testing.

To clear all data:
```bash
curl -X POST http://localhost:3000/api/mock/clear
```

## Option 2: Command Line Seed Script

Run this from the backend directory:

```bash
npx ts-node src/seeds/seedDatabase.ts
```

This will:
- Create a test user (demo@vera.com)
- Create 3 mock accounts (Checking, Savings, Credit Card)
- Generate 80 realistic transactions for each account
- Populate with varied merchants, amounts, and categories

## What Gets Created

### Accounts (3 total):
- **Chase Checking** - $5,234.50
- **Wells Fargo Savings** - $12,500.00
- **Capital One Credit Card** - -$2,345.67

### Transactions:
- 80 transactions per account (240 total)
- Last 60 days of activity
- Realistic merchants (Starbucks, Amazon, Uber, etc.)
- Proper categories (Food, Transportation, Shopping, etc.)
- 10% marked as pending

## Using Mock Data with Your App

1. **Seed the data**: `curl -X POST http://localhost:3000/api/mock/seed`
2. **Copy the user ID** from the response
3. **In your app**: Sign up with the email returned (e.g., demo-xxx@vera.com)
4. **View accounts**: The connected accounts will appear automatically
5. **Check spending**: The Weekly Spending Checkup will analyze the mock transactions

## Customizing Mock Data

Edit [src/seeds/mockData.ts](src/seeds/mockData.ts) to:
- Change merchants in the `MERCHANTS` object
- Adjust transaction amounts in the `AMOUNTS` object
- Modify `generateMockTransactions()` to generate different patterns
- Adjust number of days back (currently 60)

## Why Mock Data Instead of Real Plaid?

✅ Faster development cycle  
✅ No Plaid account credentials needed  
✅ Consistent, reproducible test data  
✅ Easy to clear and reset  
✅ Test edge cases (pending transactions, multiple accounts, etc.)
