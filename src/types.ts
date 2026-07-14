import { Timestamp } from 'firebase/firestore';

export type PinType = 'WAEC' | 'NECO' | 'NABTEB';

export interface PinConfig {
  cost: number;
  interest: number;
}

export const PIN_CONFIGS: Record<PinType, PinConfig> = {
  WAEC: { cost: 3250, interest: 100 },
  NECO: { cost: 2050, interest: 50 },
  NABTEB: { cost: 650, interest: 50 },
};

export interface WithdrawalRecord {
  amount: number;
  date: Timestamp;
}

export interface TransactionRecord {
  type: 'deposit' | 'withdrawal';
  amount: number;
  date: Timestamp;
  pinType?: PinType;
}

export interface Investment {
  id?: string;
  userId: string;
  investorName: string;
  pinType: PinType;
  amount: number;
  pinCount: number;
  interestPerPin: number;
  totalExpectedInterest: number;
  startDate: Timestamp;
  payoutDate: Timestamp;
  status: 'active' | 'completed';
  totalWithdrawn: number;
  withdrawals?: WithdrawalRecord[];
  history?: TransactionRecord[];
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role: 'investor' | 'admin';
}
