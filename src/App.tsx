/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  Timestamp,
  doc,
  updateDoc,
  deleteDoc,
  getDocFromServer
} from 'firebase/firestore';
import { 
  TrendingUp, 
  Plus, 
  Wallet, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  PieChart,
  Coins,
  ArrowDownCircle,
  X,
  Edit2,
  Trash2,
  Download,
  FileText,
  Image as ImageIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { db } from './firebase';
import { PinType, PIN_CONFIGS, Investment, TransactionRecord } from './types';

// --- Constants ---
const GUEST_USER_ID = 'public_investor';

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (event.error?.message?.includes('operationType')) {
        setHasError(true);
        try {
          const parsed = JSON.parse(event.error.message);
          setErrorMsg(`Database error during ${parsed.operationType} at ${parsed.path}`);
        } catch {
          setErrorMsg(event.error.message);
        }
      }
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
        <div className="bg-white p-6 rounded-2xl shadow-xl max-w-md w-full border border-red-100">
          <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
          <p className="text-gray-600 mb-6">{errorMsg}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors"
          >
            Reload Application
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default function App() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [investorName, setInvestorName] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [startDateInput, setStartDateInput] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedPin, setSelectedPin] = useState<PinType>('WAEC');
  const [topUpId, setTopUpId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [withdrawModal, setWithdrawModal] = useState<{ open: boolean, investment?: Investment }>({ open: false });
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [withdrawDateInput, setWithdrawDateInput] = useState<string>(new Date().toISOString().split('T')[0]);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<{ open: boolean, investment?: Investment }>({ open: false });
  const [editName, setEditName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editPin, setEditPin] = useState<PinType>('WAEC');
  const [editDate, setEditDate] = useState('');

  // Test Connection
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'investments'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Investment));
      setInvestments(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'investments');
    });

    return () => unsubscribe();
  }, []);

  const handleInvest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !investorName || isSubmitting) return;

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;

    setIsSubmitting(true);
    const config = PIN_CONFIGS[selectedPin];
    
    // Check for existing investment to top up (by ID or Name)
    const existingInv = topUpId 
      ? investments.find(inv => inv.id === topUpId)
      : investments.find(inv => 
          inv.investorName.trim().toLowerCase() === investorName.trim().toLowerCase()
        );

    if (existingInv) {
      const newTotalAmount = existingInv.amount + numAmount;
      const newPinCount = newTotalAmount / config.cost;
      
      // New Calculation: > 500k earns 20k/month (120k for 6 months)
      let totalExpectedInterest = newPinCount * config.interest;
      if (newTotalAmount > 500000) {
        totalExpectedInterest = 20000 * 6; // 120,000 for 6 months
      }

      const newHistory: TransactionRecord[] = [
        ...(existingInv.history || []),
        { type: 'deposit', amount: numAmount, date: Timestamp.now(), pinType: selectedPin }
      ];

      try {
        const invRef = doc(db, 'investments', existingInv.id!);
        await updateDoc(invRef, {
          investorName, // Update name in case of slight casing changes
          pinType: selectedPin, // Update to the latest pin type
          amount: newTotalAmount,
          pinCount: newPinCount,
          totalExpectedInterest: totalExpectedInterest,
          history: newHistory
        });
        setAmount('');
        setInvestorName('');
        setTopUpId(null);
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `investments/${existingInv.id}`);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const pinCount = numAmount / config.cost;
    
    // New Calculation: > 500k earns 20k/month (120k for 6 months)
    let totalExpectedInterest = pinCount * config.interest;
    if (numAmount > 500000) {
      totalExpectedInterest = 20000 * 6; // 120,000 for 6 months
    }
    
    const startDate = Timestamp.fromDate(new Date(startDateInput));
    const payoutDate = Timestamp.fromMillis(startDate.toMillis() + 180 * 24 * 60 * 60 * 1000); // 6 months (180 days)

    const newInvestment: Investment = {
      userId: GUEST_USER_ID,
      investorName,
      pinType: selectedPin,
      amount: numAmount,
      pinCount,
      interestPerPin: config.interest,
      totalExpectedInterest,
      startDate,
      payoutDate,
      status: 'active',
      totalWithdrawn: 0,
      withdrawals: [],
      history: [{ type: 'deposit', amount: numAmount, date: Timestamp.now(), pinType: selectedPin }]
    };

    try {
      await addDoc(collection(db, 'investments'), newInvestment);
      setAmount('');
      setInvestorName('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'investments');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const openEditModal = (inv: Investment) => {
    setEditModal({ open: true, investment: inv });
    setEditName(inv.investorName);
    setEditAmount(inv.amount.toString());
    setEditPin(inv.pinType);
    setEditDate(new Date(inv.startDate.toMillis()).toISOString().split('T')[0]);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal.investment || !editAmount || !editName || isSubmitting) return;

    const numAmount = parseFloat(editAmount);
    if (isNaN(numAmount) || numAmount <= 0) return;

    setIsSubmitting(true);
    const config = PIN_CONFIGS[editPin];
    const pinCount = numAmount / config.cost;
    
    // New Calculation: > 500k earns 20k/month (120k for 6 months)
    let totalExpectedInterest = pinCount * config.interest;
    if (numAmount > 500000) {
      totalExpectedInterest = 20000 * 6; // 120,000 for 6 months
    }
    
    const startDate = Timestamp.fromDate(new Date(editDate));
    const payoutDate = Timestamp.fromMillis(startDate.toMillis() + 180 * 24 * 60 * 60 * 1000);

    try {
      const invRef = doc(db, 'investments', editModal.investment.id!);
      await updateDoc(invRef, {
        investorName: editName,
        pinType: editPin,
        amount: numAmount,
        pinCount,
        interestPerPin: config.interest,
        totalExpectedInterest,
        startDate,
        payoutDate
      });
      setEditModal({ open: false });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `investments/${editModal.investment.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'investments', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `investments/${id}`);
    }
  };

  const handleSelectForTopUp = (id: string, name: string, pin: PinType) => {
    setTopUpId(id);
    setInvestorName(name);
    setSelectedPin(pin);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Focus the amount input
    const amountInput = document.getElementById('investment-amount');
    if (amountInput) amountInput.focus();
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!withdrawModal.investment || !withdrawAmount || isSubmitting) return;

    const numWithdraw = parseFloat(withdrawAmount);
    if (isNaN(numWithdraw) || numWithdraw <= 0) return;

    const inv = withdrawModal.investment;
    const now = Date.now();
    const start = inv.startDate.toMillis();
    const end = inv.payoutDate.toMillis();
    const duration = end - start;
    const elapsed = Math.max(0, Math.min(now - start, duration));
    const currentAccumulated = (elapsed / duration) * inv.totalExpectedInterest;
    
    const totalAvailable = inv.amount + currentAccumulated - (inv.totalWithdrawn || 0);

    if (numWithdraw > totalAvailable) {
      setWithdrawError("Insufficient funds (Capital + Accumulated Interest)");
      return;
    }

    setWithdrawError(null);
    setIsSubmitting(true);
    try {
      const invRef = doc(db, 'investments', inv.id!);
      const newWithdrawal = {
        amount: numWithdraw,
        date: Timestamp.fromDate(new Date(withdrawDateInput))
      };
      
      const newHistory: TransactionRecord[] = [
        ...(inv.history || []),
        { type: 'withdrawal', amount: numWithdraw, date: Timestamp.fromDate(new Date(withdrawDateInput)) }
      ];

      await updateDoc(invRef, {
        totalWithdrawn: (inv.totalWithdrawn || 0) + numWithdraw,
        withdrawals: [...(inv.withdrawals || []), newWithdrawal],
        history: newHistory
      });
      setWithdrawModal({ open: false });
      setWithdrawAmount('');
      setWithdrawError(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `investments/${inv.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const stats = useMemo(() => {
    const totalInvested = investments.reduce((sum, inv) => sum + inv.amount, 0);
    const totalWithdrawn = investments.reduce((sum, inv) => sum + (inv.totalWithdrawn || 0), 0);
    
    const now = Date.now();
    let totalAccumulated = 0;
    let dailyAccrual = 0;

    investments.forEach(inv => {
      const start = inv.startDate.toMillis();
      const end = inv.payoutDate.toMillis();
      const duration = end - start;
      const elapsed = Math.max(0, Math.min(now - start, duration));
      
      const accumulated = (elapsed / duration) * inv.totalExpectedInterest;
      totalAccumulated += accumulated;
      dailyAccrual += inv.totalExpectedInterest / 180;
    });

    const netBalance = totalInvested + totalAccumulated - totalWithdrawn;

    return { totalInvested, totalAccumulated, dailyAccrual, totalWithdrawn, netBalance };
  }, [investments]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#F8F9FA] pb-20">
        {/* Header */}
        <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-blue-600" />
              <span className="text-xl font-bold text-gray-900">PinVest</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-full text-xs font-bold">
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
              LIVE TRACKING
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-6 py-8">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
            <StatCard 
              label="Total Capital" 
              value={`₦${stats.totalInvested.toLocaleString()}`} 
              icon={<Wallet className="w-5 h-5" />}
              color="blue"
            />
            <StatCard 
              label="Grown Interest" 
              value={`₦${stats.totalAccumulated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} 
              icon={<Coins className="w-5 h-5" />}
              color="green"
              subValue={`Daily: +₦${stats.dailyAccrual.toFixed(2)}`}
            />
            <StatCard 
              label="Total Withdrawn" 
              value={`₦${stats.totalWithdrawn.toLocaleString()}`} 
              icon={<ArrowDownCircle className="w-5 h-5" />}
              color="red"
            />
            <StatCard 
              label="Net Balance" 
              value={`₦${stats.netBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} 
              icon={<PieChart className="w-5 h-5" />}
              color="purple"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            {/* Investment Form */}
            <div className="lg:col-span-1">
              <div className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-100 sticky top-28">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Plus className="w-5 h-5 text-blue-600" />
                    {topUpId ? 'Top-up Investment' : 'New Investment'}
                  </h2>
                  {topUpId && (
                    <button 
                      onClick={() => {
                        setTopUpId(null);
                        setInvestorName('');
                        setAmount('');
                      }}
                      className="text-[10px] font-bold text-red-600 hover:underline uppercase tracking-wider"
                    >
                      Cancel
                    </button>
                  )}
                </div>
                <form onSubmit={handleInvest} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Investor Name</label>
                    <input 
                      type="text"
                      value={investorName}
                      onChange={(e) => setInvestorName(e.target.value)}
                      placeholder="Enter full name"
                      className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-600 transition-all font-medium"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Select Pin Type</label>
                    <div className="grid grid-cols-1 gap-3">
                      {(Object.keys(PIN_CONFIGS) as PinType[]).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setSelectedPin(type)}
                          className={`p-4 rounded-2xl border-2 text-left transition-all ${
                            selectedPin === type 
                              ? 'border-blue-600 bg-blue-50' 
                              : 'border-gray-100 hover:border-gray-200'
                          }`}
                        >
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-gray-900">{type}</span>
                            <span className="text-xs font-semibold text-blue-600">₦{PIN_CONFIGS[type].interest} profit/pin</span>
                          </div>
                          <p className="text-xs text-gray-500">Cost: ₦{PIN_CONFIGS[type].cost.toLocaleString()}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Investment Amount (₦)</label>
                    <input 
                      id="investment-amount"
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Enter amount"
                      className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-600 transition-all font-medium"
                      required
                    />
                    {amount && (
                      <p className="mt-2 text-xs text-gray-500">
                        Approx. {(parseFloat(amount) / PIN_CONFIGS[selectedPin].cost).toFixed(1)} pins
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                    <input 
                      type="date"
                      value={startDateInput}
                      onChange={(e) => setStartDateInput(e.target.value)}
                      className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-600 transition-all font-medium"
                      required
                    />
                  </div>

                  <button 
                    disabled={isSubmitting}
                    className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-blue-100"
                  >
                    {isSubmitting ? 'Processing...' : (topUpId ? 'Confirm Top-up' : 'Start Investment')}
                  </button>
                </form>
              </div>
            </div>

            {/* Investment List */}
            <div className="lg:col-span-2">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Your Portfolio</h2>
                <span className="text-sm text-gray-500">{investments.length} Active</span>
              </div>

              <div className="space-y-4">
                <AnimatePresence mode="popLayout">
                  {investments.length === 0 ? (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="bg-white p-12 rounded-[32px] border border-dashed border-gray-200 text-center"
                    >
                      <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">No investments yet. Start by adding one!</p>
                    </motion.div>
                  ) : (
                    investments.sort((a, b) => b.startDate.toMillis() - a.startDate.toMillis()).map((inv) => (
                      <InvestmentRow 
                        key={inv.id} 
                        investment={inv} 
                        onWithdraw={() => setWithdrawModal({ open: true, investment: inv })}
                        onEdit={() => openEditModal(inv)}
                        onDelete={() => handleDelete(inv.id!)}
                        onAddFunds={() => handleSelectForTopUp(inv.id!, inv.investorName, inv.pinType)}
                      />
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </main>

        {/* Withdrawal Modal */}
        <AnimatePresence>
          {withdrawModal.open && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  setWithdrawModal({ open: false });
                  setWithdrawError(null);
                }}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl"
              >
                <button 
                  onClick={() => {
                    setWithdrawModal({ open: false });
                    setWithdrawError(null);
                  }}
                  className="absolute top-6 right-6 p-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
                
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Withdraw Funds</h3>
                <p className="text-gray-500 mb-8">
                  Withdraw from your {withdrawModal.investment?.pinType} investment. 
                  Funds are taken from accumulated interest first, then capital.
                </p>

                <form onSubmit={handleWithdraw} className="space-y-6">
                  {withdrawError && (
                    <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-medium flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      {withdrawError}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Amount to Withdraw (₦)</label>
                    <input 
                      type="number"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder="e.g. 1000"
                      className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-red-600 transition-all font-medium"
                      required
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Withdrawal Date</label>
                    <input 
                      type="date"
                      value={withdrawDateInput}
                      onChange={(e) => setWithdrawDateInput(e.target.value)}
                      className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-red-600 transition-all font-medium"
                      required
                    />
                  </div>

                  <button 
                    disabled={isSubmitting}
                    className="w-full py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {isSubmitting ? 'Processing...' : 'Confirm Withdrawal'}
                  </button>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Edit Modal */}
        <AnimatePresence>
          {editModal.open && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setEditModal({ open: false })}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
              >
                <button 
                  onClick={() => setEditModal({ open: false })}
                  className="absolute top-6 right-6 p-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
                
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Edit Investment</h3>
                <p className="text-gray-500 mb-8">Update investment details for {editModal.investment?.investorName}.</p>

                <form onSubmit={handleUpdate} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Investor Name</label>
                    <input 
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-600 transition-all font-medium"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Pin Type</label>
                    <div className="grid grid-cols-1 gap-2">
                      {(Object.keys(PIN_CONFIGS) as PinType[]).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setEditPin(type)}
                          className={`p-3 rounded-xl border-2 text-left transition-all ${
                            editPin === type ? 'border-blue-600 bg-blue-50' : 'border-gray-100'
                          }`}
                        >
                          <span className="font-bold text-sm">{type}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Amount (₦)</label>
                    <input 
                      type="number"
                      value={editAmount}
                      onChange={(e) => setEditAmount(e.target.value)}
                      className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-600 transition-all font-medium"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
                    <input 
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-600 transition-all font-medium"
                      required
                    />
                  </div>

                  <button 
                    disabled={isSubmitting}
                    className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all active:scale-[0.98] disabled:opacity-50"
                  >
                    {isSubmitting ? 'Updating...' : 'Save Changes'}
                  </button>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}

function StatCard({ label, value, icon, color, subValue }: { label: string, value: string, icon: React.ReactNode, color: 'blue' | 'green' | 'purple' | 'red', subValue?: string }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-emerald-50 text-emerald-600',
    purple: 'bg-purple-50 text-purple-600',
    red: 'bg-red-50 text-red-600'
  };

  return (
    <div className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-100">
      <div className={`w-10 h-10 ${colors[color]} rounded-xl flex items-center justify-center mb-4`}>
        {icon}
      </div>
      <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
      <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
      {subValue && <p className="text-xs font-semibold text-emerald-600 mt-1">{subValue}</p>}
    </div>
  );
}

const InvestmentRow: React.FC<{ 
  investment: Investment, 
  onWithdraw: () => void, 
  onEdit: () => void, 
  onDelete: () => void,
  onAddFunds: () => void
}> = ({ investment, onWithdraw, onEdit, onDelete, onAddFunds }) => {
  const [accumulated, setAccumulated] = useState(0);
  const [progress, setProgress] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      const now = Date.now();
      const start = investment.startDate.toMillis();
      const end = investment.payoutDate.toMillis();
      const duration = end - start;
      const elapsed = Math.max(0, Math.min(now - start, duration));
      
      const acc = (elapsed / duration) * investment.totalExpectedInterest;
      setAccumulated(acc);
      setProgress((elapsed / duration) * 100);
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [investment]);

  const netValue = investment.amount + accumulated - (investment.totalWithdrawn || 0);

  const exportToPDF = async () => {
    if (!historyRef.current) return;
    const canvas = await html2canvas(historyRef.current, { scale: 2 });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`${investment.investorName}_Statement.pdf`);
  };

  const exportToImage = async () => {
    if (!historyRef.current) return;
    const canvas = await html2canvas(historyRef.current, { scale: 2 });
    const link = document.createElement('a');
    link.download = `${investment.investorName}_Statement.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-100 hover:border-blue-100 transition-colors group"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center font-bold text-gray-900">
            {investment.pinType[0]}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <button 
                onClick={onAddFunds}
                className="font-bold text-gray-900 hover:text-blue-600 transition-colors text-left"
                title="Click to add funds for this investor"
              >
                {investment.investorName}
              </button>
              <button 
                onClick={onEdit}
                className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                title="Edit Investment"
              >
                <Edit2 className="w-3 h-3" />
              </button>
              <button 
                onClick={onDelete}
                className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                title="Delete Investment"
              >
                <Trash2 className="w-3 h-3" />
              </button>
              <button 
                onClick={() => setShowHistory(!showHistory)}
                className={`p-1 transition-colors ${showHistory ? 'text-blue-600' : 'text-gray-400 hover:text-blue-600'}`}
                title="View Transaction History"
              >
                <FileText className="w-3 h-3" />
              </button>
            </div>
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Started {new Date(investment.startDate.toMillis()).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-blue-600 mb-1">{investment.pinType} Pin</p>
          <p className="text-sm font-bold text-gray-900">₦{investment.amount.toLocaleString()}</p>
          <p className="text-[10px] text-gray-500">{investment.pinCount.toFixed(1)} Pins</p>
        </div>
      </div>

      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div ref={historyRef} className="bg-gray-900 text-white p-6 rounded-2xl mb-4 border border-gray-800">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h5 className="text-lg font-bold mb-1">Transaction Statement</h5>
                  <p className="text-xs text-gray-400">{investment.investorName} • {investment.pinType} Plan</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-gray-400 uppercase font-bold">Generated On</p>
                  <p className="text-xs">{new Date().toLocaleDateString()}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-4 text-[10px] uppercase font-bold text-gray-500 pb-2 border-b border-gray-800">
                  <span>Date</span>
                  <span>Type</span>
                  <span className="text-center">Plan</span>
                  <span className="text-right">Amount</span>
                </div>
                {(investment.history || []).sort((a, b) => b.date.toMillis() - a.date.toMillis()).map((t, i) => (
                  <div key={i} className="grid grid-cols-4 text-xs py-1">
                    <span className="text-gray-400">{new Date(t.date.toMillis()).toLocaleDateString()}</span>
                    <span className={`font-medium ${t.type === 'deposit' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {t.type.toUpperCase()}
                    </span>
                    <span className="text-center text-gray-500">{t.pinType || '-'}</span>
                    <span className={`text-right font-bold ${t.type === 'deposit' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {t.type === 'deposit' ? '+' : '-'}₦{t.amount.toLocaleString()}
                    </span>
                  </div>
                ))}
                {(!investment.history || investment.history.length === 0) && (
                  <div className="text-center py-4 text-gray-500 text-xs italic">
                    No transaction history found.
                  </div>
                )}
              </div>

              <div className="mt-6 pt-4 border-t border-gray-800 flex justify-between items-end">
                <div>
                  <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Total Balance</p>
                  <p className="text-xl font-bold text-blue-400">₦{netValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                </div>
                <div className="flex gap-2 no-print">
                  <button onClick={exportToPDF} className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors" title="Download PDF">
                    <FileText className="w-4 h-4" />
                  </button>
                  <button onClick={exportToImage} className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors" title="Download Image">
                    <ImageIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-gray-50 p-4 rounded-2xl mb-4">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">Grown Interest</p>
            <p className="text-lg font-bold text-emerald-600">
              ₦{accumulated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">Withdrawn</p>
            <p className="text-lg font-bold text-red-500">
              ₦{(investment.totalWithdrawn || 0).toLocaleString()}
            </p>
          </div>
        </div>

        {investment.withdrawals && investment.withdrawals.length > 0 && (
          <div className="mb-4 pt-3 border-t border-gray-100">
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2">Withdrawal History</p>
            <div className="space-y-1 max-h-24 overflow-y-auto pr-2">
              {investment.withdrawals.map((w, i) => (
                <div key={i} className="flex justify-between text-[10px] text-gray-500">
                  <span>{new Date(w.date.toMillis()).toLocaleString()}</span>
                  <span className="font-bold text-red-400">-₦{w.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="pt-4 border-t border-gray-200 flex justify-between items-center gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-1">Current Net Value</p>
            <p className="text-xl font-bold text-blue-600">
              ₦{netValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={onAddFunds}
              className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-700 transition-all active:scale-95 flex items-center gap-2 shadow-sm shadow-blue-200"
            >
              <Plus className="w-4 h-4" />
              Add Funds
            </button>
            <button 
              onClick={onWithdraw}
              className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-xl hover:bg-red-700 transition-all active:scale-95 flex items-center gap-2"
            >
              <ArrowDownCircle className="w-4 h-4" />
              Withdraw
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs font-medium">
        <div className="flex items-center gap-2 text-gray-500">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          Payout: {new Date(investment.payoutDate.toMillis()).toLocaleDateString()}
        </div>
        <div className="w-32 h-1 bg-gray-100 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            className="h-full bg-blue-600"
          />
        </div>
      </div>
    </motion.div>
  );
}
