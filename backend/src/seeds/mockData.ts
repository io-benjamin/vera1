import { TransactionCategory } from '../models/types';

const MERCHANTS: Record<TransactionCategory, string[]> = {
  [TransactionCategory.FOOD]: [
    'Starbucks', 'Whole Foods', 'Chipotle', 'McDonald\'s', 'Olive Garden',
    'Panera Bread', 'Thai Palace', 'Sushi Place', 'Pizza Hut', 'Trader Joe\'s'
  ],
  [TransactionCategory.TRANSPORTATION]: [
    'Uber', 'Lyft', 'Shell Gas', 'Chevron', 'Delta Airlines', 
    'United Airlines', 'Parking.com', 'EV Charging Station', 'Taxi'
  ],
  [TransactionCategory.SHOPPING]: [
    'Amazon', 'Target', 'Walmart', 'Best Buy', 'Nike Store', 
    'H&M', 'Urban Outfitters', 'Zara', 'Gap', 'ASOS'
  ],
  [TransactionCategory.ENTERTAINMENT]: [
    'Netflix', 'Spotify', 'AMC Theaters', 'Cinemark', 'Xbox Game Pass',
    'Disney+', 'Concert Tickets', 'Comedy Club', 'Museum Admission'
  ],
  [TransactionCategory.BILLS]: [
    'Electric Company', 'Water Utility', 'Internet Provider', 'Phone Bill',
    'Insurance Premium', 'Rent Payment', 'Mortgage Payment'
  ],
  [TransactionCategory.HEALTHCARE]: [
    'CVS Pharmacy', 'Walgreens', 'Urgent Care', 'Dr. Smith Medical', 
    'Hospital Bill', 'Dental Office', 'Eye Doctor'
  ],
  [TransactionCategory.TRAVEL]: [
    'Airbnb', 'Booking.com', 'Marriott', 'Hotel.com', 'Southwest Airlines',
    'American Airlines', 'Car Rental Co', 'Travel Agency'
  ],
  [TransactionCategory.TRANSFER]: [
    'Transfer to Savings', 'Transfer from Checking', 'Peer Transfer', 'Account Transfer'
  ],
  [TransactionCategory.OTHER]: [
    'Misc Purchase', 'Local Store', 'Online Order', 'General Expense'
  ],
};

const AMOUNTS = {
  [TransactionCategory.FOOD]: { min: 8, max: 80 },
  [TransactionCategory.TRANSPORTATION]: { min: 15, max: 250 },
  [TransactionCategory.SHOPPING]: { min: 25, max: 500 },
  [TransactionCategory.ENTERTAINMENT]: { min: 10, max: 200 },
  [TransactionCategory.BILLS]: { min: 50, max: 2000 },
  [TransactionCategory.HEALTHCARE]: { min: 30, max: 1000 },
  [TransactionCategory.TRAVEL]: { min: 100, max: 2000 },
  [TransactionCategory.TRANSFER]: { min: 50, max: 5000 },
  [TransactionCategory.OTHER]: { min: 10, max: 500 },
};

export function generateMockAccounts(userId: string) {
  return [
    {
      teller_account_id: 'acct_1234567890',
      name: 'Primary Checking',
      type: 'CHECKING',
      institution_name: 'Bank of America',
      balance: 8750.00,
    },
    {
      teller_account_id: 'acct_0987654321',
      name: 'Emergency Fund',
      type: 'SAVINGS',
      institution_name: 'Ally Bank',
      balance: 25000.00,
    },
    {
      teller_account_id: 'acct_1111111111',
      name: 'Rewards Card',
      type: 'CREDIT',
      institution_name: 'American Express',
      balance: -1250.00,
    },
    {
      teller_account_id: 'acct_2222222222',
      name: 'Investment Account',
      type: 'INVESTMENT',
      institution_name: 'Fidelity',
      balance: 45000.00,
    },
  ];
}

export function generateMockTransactions(
  accountId: string,
  daysBack: number = 60
): Array<{
  teller_transaction_id: string;
  amount: number;
  date: string;
  name: string;
  category: TransactionCategory;
  merchant_name: string;
  is_pending: boolean;
}> {
  const transactions = [];
  const now = new Date();

  for (let i = 0; i < 80; i++) {
    const daysAgo = Math.floor(Math.random() * daysBack);
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);

    // Randomly select category
    const categories = Object.values(TransactionCategory);
    const category = categories[Math.floor(Math.random() * categories.length)];

    // Get merchants and amounts for this category
    const merchants = MERCHANTS[category] || ['Generic Store'];
    const merchant = merchants[Math.floor(Math.random() * merchants.length)];
    const amountRange = AMOUNTS[category] || AMOUNTS[TransactionCategory.OTHER];
    const amount = -(Math.random() * (amountRange.max - amountRange.min) + amountRange.min);

    transactions.push({
      teller_transaction_id: `txn_${accountId}_${i}`,
      amount: Math.round(amount * 100) / 100, // Round to 2 decimals
      date: date.toISOString().split('T')[0], // YYYY-MM-DD
      name: merchant,
      category,
      merchant_name: merchant,
      is_pending: Math.random() < 0.1, // 10% pending
    });
  }

  return transactions;
}
