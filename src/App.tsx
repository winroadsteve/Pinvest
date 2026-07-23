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
  Image as ImageIcon,
  Settings,
  Lock,
  ShieldCheck,
  Shield,
  Users,
  Award,
  Sparkles,
  Check,
  Phone,
  Mail,
  ArrowUpRight,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { db } from './firebase';
import { PinType, PIN_CONFIGS, Investment, TransactionRecord } from './types';
import happyInvestorImg from './assets/images/happy_investor_pinvest_1784802210426.jpg';

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
  const [customProfitPerPin, setCustomProfitPerPin] = useState<string>('100');
  const [customDurationDays, setCustomDurationDays] = useState<string>('180');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [withdrawModal, setWithdrawModal] = useState<{ open: boolean, investment?: Investment }>({ open: false });
  const [withdrawAmount, setWithdrawAmount] = useState<string>('');
  const [withdrawDateInput, setWithdrawDateInput] = useState<string>(new Date().toISOString().split('T')[0]);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawMode, setWithdrawMode] = useState<'funds' | 'pins'>('funds');
  const [withdrawPinsCount, setWithdrawPinsCount] = useState<string>('');
  const [withdrawPinsType, setWithdrawPinsType] = useState<PinType>('WAEC');
  const [editModal, setEditModal] = useState<{ open: boolean, investment?: Investment }>({ open: false });
  const [editName, setEditName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editPin, setEditPin] = useState<PinType>('WAEC');
  const [editDate, setEditDate] = useState('');
  const [editProfitPerPin, setEditProfitPerPin] = useState('');
  const [editDurationDays, setEditDurationDays] = useState('');

  // Admin & Public Access State
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    return sessionStorage.getItem('pinvest_admin_auth') === 'true';
  });
  const [showAdminAuthModal, setShowAdminAuthModal] = useState<boolean>(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState<string>('');
  const [adminPasswordError, setAdminPasswordError] = useState<string | null>(null);
  const [showContactModal, setShowContactModal] = useState<boolean>(false);
  const [showInvestorsList, setShowInvestorsList] = useState<boolean>(false);

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPass = adminPasswordInput.trim();
    if (cleanPass === 'pinvest2026' || cleanPass === 'admin123' || cleanPass === 'admin') {
      setIsAdmin(true);
      sessionStorage.setItem('pinvest_admin_auth', 'true');
      setShowAdminAuthModal(false);
      setAdminPasswordInput('');
      setAdminPasswordError(null);
    } else {
      setAdminPasswordError('Incorrect admin password.');
    }
  };

  const handleAdminLogout = () => {
    setIsAdmin(false);
    sessionStorage.removeItem('pinvest_admin_auth');
  };

  // Dynamic Card/PIN Prices
  const [cardPrices, setCardPrices] = useState<Record<PinType, number>>(() => {
    const saved = localStorage.getItem('pin_card_prices');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // use default
      }
    }
    return {
      WAEC: PIN_CONFIGS.WAEC.cost,
      NECO: PIN_CONFIGS.NECO.cost,
      NABTEB: PIN_CONFIGS.NABTEB.cost,
    };
  });
  const [showPricingSettings, setShowPricingSettings] = useState(false);

  const handleUpdateCardPrice = (type: PinType, value: string) => {
    const parsed = parseFloat(value);
    const newPrices = {
      ...cardPrices,
      [type]: isNaN(parsed) ? 0 : parsed
    };
    setCardPrices(newPrices);
    localStorage.setItem('pin_card_prices', JSON.stringify(newPrices));
  };

  // Automatically set default profit per pin when a pin type is selected
  useEffect(() => {
    if (!topUpId) {
      setCustomProfitPerPin(PIN_CONFIGS[selectedPin].interest.toString());
    }
  }, [selectedPin, topUpId]);

  // Set default pin type when withdrawal modal opens and reset states
  useEffect(() => {
    if (withdrawModal.open && withdrawModal.investment) {
      setWithdrawPinsType(withdrawModal.investment.pinType);
      setWithdrawMode('funds');
      setWithdrawPinsCount('');
      setWithdrawAmount('');
    }
  }, [withdrawModal.open, withdrawModal.investment]);

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
    const profitPerPin = parseFloat(customProfitPerPin) || config.interest;
    const durationDays = parseInt(customDurationDays) || 180;
    
    // Check for existing investment to top up (by ID or Name)
    const existingInv = topUpId 
      ? investments.find(inv => inv.id === topUpId)
      : investments.find(inv => 
          inv.investorName.trim().toLowerCase() === investorName.trim().toLowerCase()
        );

    if (existingInv) {
      const newTotalAmount = existingInv.amount + numAmount;
      const newPinCount = newTotalAmount / cardPrices[selectedPin];
      
      const activeProfitPerPin = parseFloat(customProfitPerPin) || existingInv.interestPerPin || config.interest;
      
      // New Calculation: > 500k earns 20k/month (120k for 6 months)
      let totalExpectedInterest = newPinCount * activeProfitPerPin;
      if (newTotalAmount > 500000) {
        const existingDurationDays = Math.round((existingInv.payoutDate.toMillis() - existingInv.startDate.toMillis()) / (24 * 60 * 60 * 1000)) || 180;
        const durationMonths = existingDurationDays / 30;
        totalExpectedInterest = 20000 * durationMonths; // 20k/month
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
          interestPerPin: activeProfitPerPin,
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

    const pinCount = numAmount / cardPrices[selectedPin];
    
    // New Calculation: > 500k earns 20k/month (120k for 6 months)
    let totalExpectedInterest = pinCount * profitPerPin;
    if (numAmount > 500000) {
      const durationMonths = durationDays / 30;
      totalExpectedInterest = 20000 * durationMonths; // 20k/month
    }
    
    const startDate = Timestamp.fromDate(new Date(startDateInput));
    const payoutDate = Timestamp.fromMillis(startDate.toMillis() + durationDays * 24 * 60 * 60 * 1000); // custom duration in days

    const newInvestment: Investment = {
      userId: GUEST_USER_ID,
      investorName,
      pinType: selectedPin,
      amount: numAmount,
      pinCount,
      interestPerPin: profitPerPin,
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
    
    // Calculate the existing duration in days
    const durationDays = Math.round((inv.payoutDate.toMillis() - inv.startDate.toMillis()) / (24 * 60 * 60 * 1000)) || 180;
    setEditProfitPerPin((inv.interestPerPin ?? PIN_CONFIGS[inv.pinType].interest).toString());
    setEditDurationDays(durationDays.toString());
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal.investment || !editAmount || !editName || isSubmitting) return;

    const numAmount = parseFloat(editAmount);
    if (isNaN(numAmount) || numAmount <= 0) return;

    setIsSubmitting(true);
    const config = PIN_CONFIGS[editPin];
    const pinCount = numAmount / cardPrices[editPin];
    
    const profitPerPin = parseFloat(editProfitPerPin) || config.interest;
    const durationDays = parseInt(editDurationDays) || 180;
    
    // New Calculation: > 500k earns 20k/month (120k for 6 months)
    let totalExpectedInterest = pinCount * profitPerPin;
    if (numAmount > 500000) {
      const durationMonths = durationDays / 30;
      totalExpectedInterest = 20000 * durationMonths; // 20k/month
    }
    
    const startDate = Timestamp.fromDate(new Date(editDate));
    const payoutDate = Timestamp.fromMillis(startDate.toMillis() + durationDays * 24 * 60 * 60 * 1000);

    try {
      const invRef = doc(db, 'investments', editModal.investment.id!);
      await updateDoc(invRef, {
        investorName: editName,
        pinType: editPin,
        amount: numAmount,
        pinCount,
        interestPerPin: profitPerPin,
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
    const inv = investments.find(i => i.id === id);
    const name = inv ? inv.investorName : 'this investment';
    if (!window.confirm(`Are you sure you want to permanently delete the investment for ${name}? This action cannot be undone.`)) return;

    try {
      await deleteDoc(doc(db, 'investments', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `investments/${id}`);
    }
  };

  const handleDeleteSoldPin = async (investmentId: string, soldPinIndex: number) => {
    const inv = investments.find(i => i.id === investmentId);
    if (!inv) return;

    const soldPins = [...(inv.soldPins || [])];
    const removedPin = soldPins[soldPinIndex];
    if (!removedPin) return;

    if (!window.confirm(`Are you sure you want to delete this direct sale of ${removedPin.pinCount}x ${removedPin.pinType} PIN(s)? This will reverse the withdrawal and restore the investment value.`)) return;

    try {
      soldPins.splice(soldPinIndex, 1);

      // Remove corresponding transaction from history
      const history = [...(inv.history || [])];
      const historyIndex = history.findIndex(t => 
        t.type === 'pin_withdrawal' && 
        t.pinType === removedPin.pinType && 
        t.pinCount === removedPin.pinCount && 
        t.amount === removedPin.totalCost &&
        Math.abs(t.date.toMillis() - removedPin.date.toMillis()) < 5000
      );

      if (historyIndex !== -1) {
        history.splice(historyIndex, 1);
      } else {
        const fallbackIndex = history.findIndex(t => 
          t.type === 'pin_withdrawal' && 
          t.pinType === removedPin.pinType && 
          t.pinCount === removedPin.pinCount && 
          t.amount === removedPin.totalCost
        );
        if (fallbackIndex !== -1) {
          history.splice(fallbackIndex, 1);
        }
      }

      const newTotalWithdrawn = Math.max(0, (inv.totalWithdrawn || 0) - removedPin.totalCost);

      const invRef = doc(db, 'investments', investmentId);
      await updateDoc(invRef, {
        soldPins: soldPins,
        history: history,
        totalWithdrawn: newTotalWithdrawn
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `investments/${investmentId}/soldPins`);
    }
  };

  const handleDeleteWithdrawal = async (investmentId: string, withdrawalIndex: number) => {
    const inv = investments.find(i => i.id === investmentId);
    if (!inv) return;

    const withdrawals = [...(inv.withdrawals || [])];
    const removedWithdrawal = withdrawals[withdrawalIndex];
    if (!removedWithdrawal) return;

    if (!window.confirm(`Are you sure you want to delete this withdrawal of ₦${removedWithdrawal.amount.toLocaleString()}? This will restore the withdrawn amount back to the investment value.`)) return;

    try {
      withdrawals.splice(withdrawalIndex, 1);

      // Remove corresponding transaction from history
      const history = [...(inv.history || [])];
      const historyIndex = history.findIndex(t => 
        t.type === 'withdrawal' && 
        t.amount === removedWithdrawal.amount &&
        Math.abs(t.date.toMillis() - removedWithdrawal.date.toMillis()) < 5000
      );

      if (historyIndex !== -1) {
        history.splice(historyIndex, 1);
      } else {
        const fallbackIndex = history.findIndex(t => 
          t.type === 'withdrawal' && 
          t.amount === removedWithdrawal.amount
        );
        if (fallbackIndex !== -1) {
          history.splice(fallbackIndex, 1);
        }
      }

      const newTotalWithdrawn = Math.max(0, (inv.totalWithdrawn || 0) - removedWithdrawal.amount);

      const invRef = doc(db, 'investments', investmentId);
      await updateDoc(invRef, {
        withdrawals: withdrawals,
        history: history,
        totalWithdrawn: newTotalWithdrawn
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `investments/${investmentId}/withdrawals`);
    }
  };

  const handleSelectForTopUp = (id: string, name: string, pin: PinType) => {
    setTopUpId(id);
    setInvestorName(name);
    setSelectedPin(pin);
    const existing = investments.find(inv => inv.id === id);
    if (existing) {
      setCustomProfitPerPin((existing.interestPerPin ?? PIN_CONFIGS[pin].interest).toString());
      const durationDays = Math.round((existing.payoutDate.toMillis() - existing.startDate.toMillis()) / (24 * 60 * 60 * 1000)) || 180;
      setCustomDurationDays(durationDays.toString());
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Focus the amount input
    const amountInput = document.getElementById('investment-amount');
    if (amountInput) amountInput.focus();
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!withdrawModal.investment || isSubmitting) return;

    const inv = withdrawModal.investment;
    const now = Date.now();
    const start = inv.startDate.toMillis();
    const end = inv.payoutDate.toMillis();
    const duration = end - start;
    const elapsed = Math.max(0, Math.min(now - start, duration));
    const currentAccumulated = (elapsed / duration) * inv.totalExpectedInterest;
    
    const totalAvailable = inv.amount + currentAccumulated - (inv.totalWithdrawn || 0);

    let updateFields: any = {};

    if (withdrawMode === 'funds') {
      if (!withdrawAmount) return;
      const numWithdraw = parseFloat(withdrawAmount);
      if (isNaN(numWithdraw) || numWithdraw <= 0) return;

      if (numWithdraw > totalAvailable) {
        setWithdrawError("Insufficient funds (Capital + Accumulated Interest)");
        return;
      }

      const newWithdrawal = {
        amount: numWithdraw,
        date: Timestamp.fromDate(new Date(withdrawDateInput))
      };
      
      const newHistory: TransactionRecord[] = [
        ...(inv.history || []),
        { type: 'withdrawal', amount: numWithdraw, date: Timestamp.fromDate(new Date(withdrawDateInput)) }
      ];

      updateFields = {
        totalWithdrawn: (inv.totalWithdrawn || 0) + numWithdraw,
        withdrawals: [...(inv.withdrawals || []), newWithdrawal],
        history: newHistory
      };
    } else {
      if (!withdrawPinsCount) return;
      const numPins = parseInt(withdrawPinsCount);
      if (isNaN(numPins) || numPins <= 0) return;

      const costPerPin = cardPrices[withdrawPinsType];
      const totalPinCost = numPins * costPerPin;

      if (totalPinCost > totalAvailable) {
        setWithdrawError(`Insufficient funds. Need ₦${totalPinCost.toLocaleString()} but only ₦${totalAvailable.toLocaleString()} is available.`);
        return;
      }

      const newSoldPin = {
        pinType: withdrawPinsType,
        pinCount: numPins,
        costPerPin: costPerPin,
        totalCost: totalPinCost,
        date: Timestamp.fromDate(new Date(withdrawDateInput))
      };

      const newTransaction: TransactionRecord = {
        type: 'pin_withdrawal',
        amount: totalPinCost,
        date: Timestamp.fromDate(new Date(withdrawDateInput)),
        pinType: withdrawPinsType,
        pinCount: numPins
      };

      updateFields = {
        totalWithdrawn: (inv.totalWithdrawn || 0) + totalPinCost,
        soldPins: [...(inv.soldPins || []), newSoldPin],
        history: [...(inv.history || []), newTransaction]
      };
    }

    setWithdrawError(null);
    setIsSubmitting(true);
    try {
      const invRef = doc(db, 'investments', inv.id!);
      await updateDoc(invRef, updateFields);
      setWithdrawModal({ open: false });
      setWithdrawAmount('');
      setWithdrawPinsCount('');
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
      const duration = Math.max(1000, end - start);
      const elapsed = Math.max(0, Math.min(now - start, duration));
      
      const accumulated = (elapsed / duration) * inv.totalExpectedInterest;
      totalAccumulated += accumulated;
      
      const durationDays = Math.round(duration / (24 * 60 * 60 * 1000)) || 180;
      dailyAccrual += inv.totalExpectedInterest / durationDays;
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
        <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
          <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-blue-600" />
              <span className="text-xl font-bold text-gray-900">PinVest</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 bg-blue-50 text-blue-600 rounded-full text-xs font-bold">
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                LIVE RATES
              </div>

              {/* Admin Mode Controls */}
              {!isAdmin ? (
                <button 
                  onClick={() => setShowAdminAuthModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-full text-xs font-bold transition-all shadow-sm"
                >
                  <Lock className="w-3.5 h-3.5 text-blue-400" />
                  Admin Login
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold border border-emerald-200">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    Admin Mode Active
                  </span>
                  <button 
                    onClick={handleAdminLogout}
                    className="px-3 py-1.5 text-gray-500 hover:text-red-600 rounded-lg text-xs font-bold transition-colors"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-6 py-8">
          {/* Hero Header with Happy Investor Picture & Catchy Mantra */}
          <div className="bg-gradient-to-br from-blue-900 via-indigo-900 to-slate-900 rounded-[32px] p-8 md:p-10 text-white mb-10 shadow-xl overflow-hidden relative border border-blue-800/40">
            {/* Subtle background glow circles */}
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
              <div className="lg:col-span-7 space-y-5">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-white/10 backdrop-blur-md rounded-full text-xs font-bold text-amber-300 border border-white/10">
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Nigeria's Premier Exam PIN Arbitrage Pool</span>
                </div>

                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-[1.15]">
                  Powering Smart Capital. <br />
                  <span className="bg-gradient-to-r from-amber-300 via-emerald-300 to-teal-200 bg-clip-text text-transparent">
                    Growing Daily Wealth.
                  </span>
                </h1>

                <p className="text-sm md:text-base text-blue-100/90 leading-relaxed font-normal max-w-xl">
                  Turn high exam season demand into steady daily yields. PinVest finances wholesale WAEC, NECO & NABTEB scratch card procurement so you earn guaranteed daily profit with total capital security.
                </p>

                <div className="flex flex-wrap items-center gap-4 pt-2">
                  <button
                    onClick={() => setShowContactModal(true)}
                    className="px-6 py-3.5 bg-amber-400 hover:bg-amber-300 text-gray-950 font-extrabold rounded-2xl text-xs transition-all shadow-lg shadow-amber-900/20 flex items-center gap-2 active:scale-95"
                  >
                    <Phone className="w-4 h-4" />
                    Start Investing Today
                  </button>
                  <button
                    onClick={() => setShowInvestorsList(!showInvestorsList)}
                    className="px-6 py-3.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl text-xs transition-all border border-white/20 flex items-center gap-2 backdrop-blur-sm"
                  >
                    <Users className="w-4 h-4 text-emerald-300" />
                    {showInvestorsList ? 'Hide Active Portfolios' : 'View Present Investors'}
                  </button>
                </div>

                <div className="pt-4 flex flex-wrap items-center gap-6 border-t border-white/10 text-xs text-blue-200">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>100% Capital Safety</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-amber-300 shrink-0" />
                    <span>Daily Profit Accrual</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-blue-300 shrink-0" />
                    <span>Audited Statements</span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 relative">
                <div className="relative rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl group">
                  <img 
                    src={happyInvestorImg} 
                    alt="Happy PinVest Investor" 
                    className="w-full h-64 sm:h-72 object-cover object-top group-hover:scale-105 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-950/80 via-transparent to-transparent" />
                  
                  {/* Overlay Badge */}
                  <div className="absolute bottom-4 left-4 right-4 bg-white/15 backdrop-blur-md p-3 rounded-xl border border-white/20 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-xs shadow-md">
                        <Check className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">Satisfied Investor</p>
                        <p className="text-[10px] text-emerald-300 font-semibold">Daily Yield Verified</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-extrabold bg-emerald-400 text-gray-950 px-2.5 py-1 rounded-full uppercase tracking-wider">
                      Active
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Present Rates & Daily Profit Dashboard */}
          <div className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-100 mb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-gray-100">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-bold mb-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  Official Daily Rates & Yields
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Current Exam PIN Rates & Daily Yield</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Transparent rate cards based on real WAEC, NECO & NABTEB scratch card procurement.
                </p>
              </div>
              <div className="text-left md:text-right">
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Profit Rate</span>
                <span className="text-sm font-extrabold text-blue-600">₦100 Profit / PIN / Day</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {(['WAEC', 'NECO', 'NABTEB'] as PinType[]).map((type) => (
                <div key={type} className="bg-gradient-to-b from-gray-50 to-white p-6 rounded-2xl border border-gray-100 relative overflow-hidden group hover:border-blue-200 transition-all shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold px-2.5 py-1 bg-blue-600 text-white rounded-lg">{type} PIN</span>
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      Active Yield
                    </span>
                  </div>
                  <div className="space-y-2 mb-4">
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase font-bold">Base Card Cost</p>
                      <p className="text-xl font-extrabold text-gray-900">₦{cardPrices[type].toLocaleString()}</p>
                    </div>
                    <div className="flex justify-between items-center text-xs pt-2 border-t border-gray-100">
                      <span className="text-gray-500 font-medium">Daily Return</span>
                      <span className="font-bold text-blue-600">₦100 / pin / day</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500 font-medium">Monthly Return Estimate</span>
                      <span className="font-bold text-emerald-600">~₦3,000 / pin / mo</span>
                    </div>
                  </div>
                  <div className="bg-blue-50/60 p-2.5 rounded-xl text-[11px] text-blue-800 font-medium leading-tight">
                    High demand during {type} registration & result checking cycles.
                  </div>
                </div>
              ))}
            </div>

            {/* High Yield Tier Notice */}
            <div className="mt-6 bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center shrink-0">
                  <Award className="w-6 h-6 text-amber-300" />
                </div>
                <div>
                  <h4 className="font-bold text-base text-amber-200 flex items-center gap-2">
                    High-Yield Premium Investor Tier (&gt; ₦500,000)
                  </h4>
                  <p className="text-xs text-blue-100 leading-relaxed mt-0.5">
                    Investments above ₦500k earn a fixed <strong className="text-white">₦20,000 guaranteed profit monthly</strong> (₦120,000 total per 6-month cycle).
                  </p>
                </div>
              </div>
              <button 
                onClick={() => isAdmin ? window.scrollTo({ top: 300, behavior: 'smooth' }) : setShowContactModal(true)}
                className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-gray-900 rounded-xl font-extrabold text-xs transition-all shrink-0 shadow-md flex items-center gap-1.5"
              >
                {isAdmin ? 'Add Premium Investment' : 'Inquire Premium Tier'}
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Why Invest with Pinvest? */}
          <div className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-100 mb-10">
            <div className="text-center max-w-2xl mx-auto mb-8">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-bold mb-3">
                <Shield className="w-3.5 h-3.5" />
                Safe & Transparent Exam PIN Capital Growth
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-3">Why You Should Invest With PinVest</h2>
              <p className="text-gray-500 text-xs md:text-sm leading-relaxed">
                PinVest finances the wholesale procurement and retail distribution of WAEC, NECO, and NABTEB examination scratch cards across Nigeria.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 hover:bg-blue-50/40 hover:border-blue-100 transition-all group">
                <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Award className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">High Recurrent Demand</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Over 3 million candidates register for national examinations annually. Exam cards are non-discretionary and yield high turnover.
                </p>
              </div>

              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 hover:bg-emerald-50/40 hover:border-emerald-100 transition-all group">
                <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">Guaranteed Daily Accrual</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Returns grow continuously second-by-second with full daily interest rate formulas. Track your gains live anytime.
                </p>
              </div>

              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 hover:bg-purple-50/40 hover:border-purple-100 transition-all group">
                <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Coins className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">Dual Exit & PIN Resale</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Withdraw yields in cash directly to your bank account OR convert profits into physical/e-PIN cards to sell at retail price.
                </p>
              </div>

              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 hover:bg-amber-50/40 hover:border-amber-100 transition-all group">
                <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <FileText className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">Audited PDF Receipts</h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Export official PDF & PNG statements for any active account anytime with complete breakdown of deposits, yields & PIN sales.
                </p>
              </div>
            </div>
          </div>

          {/* Present Active Investors Section (Click to View) */}
          <div className="bg-white p-8 rounded-[32px] shadow-sm border border-gray-100 mb-10">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" />
                  Present Active Investors
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  Transparent record of currently active investor portfolios and daily yield tracking.
                </p>
              </div>
              <button
                onClick={() => setShowInvestorsList(!showInvestorsList)}
                className={`px-5 py-2.5 rounded-2xl font-bold text-xs transition-all flex items-center gap-2 ${
                  showInvestorsList 
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-100' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                }`}
              >
                <Users className="w-4 h-4" />
                {showInvestorsList ? 'Hide Present Investors' : `Click to View Present Investors (${investments.length})`}
                <ChevronDown className={`w-4 h-4 transition-transform ${showInvestorsList ? 'rotate-180' : ''}`} />
              </button>
            </div>

            <AnimatePresence>
              {showInvestorsList && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden mt-6 space-y-4 pt-4 border-t border-gray-100"
                >
                  {investments.length === 0 ? (
                    <div className="p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                      <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-xs text-gray-500 font-medium">No active investor accounts found.</p>
                    </div>
                  ) : (
                    investments.sort((a, b) => b.startDate.toMillis() - a.startDate.toMillis()).map((inv) => (
                      <InvestmentRow 
                        key={inv.id} 
                        investment={inv} 
                        isAdmin={isAdmin}
                        onWithdraw={() => setWithdrawModal({ open: true, investment: inv })}
                        onEdit={() => openEditModal(inv)}
                        onDelete={() => handleDelete(inv.id!)}
                        onAddFunds={() => handleSelectForTopUp(inv.id!, inv.investorName, inv.pinType)}
                        onDeleteSoldPin={(soldPinIndex) => handleDeleteSoldPin(inv.id!, soldPinIndex)}
                        onDeleteWithdrawal={(withdrawalIndex) => handleDeleteWithdrawal(inv.id!, withdrawalIndex)}
                        onRequestAdminAuth={() => setShowAdminAuthModal(true)}
                      />
                    ))
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            {/* Left Column: Admin Form OR Public Investment Inquiry */}
            <div className="lg:col-span-1">
              {isAdmin ? (
                /* Admin Investment Form & Card Pricing Controls */
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
                            <p className="text-xs text-gray-500">Cost: ₦{cardPrices[type].toLocaleString()}</p>
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
                          Approx. {(parseFloat(amount) / cardPrices[selectedPin]).toFixed(1)} pins
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

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Profit per Pin (₦)</label>
                        <input 
                          type="number"
                          value={customProfitPerPin}
                          onChange={(e) => setCustomProfitPerPin(e.target.value)}
                          placeholder="e.g. 100"
                          className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-600 transition-all font-medium"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Duration (Days)</label>
                        <input 
                          type="number"
                          value={customDurationDays}
                          onChange={(e) => setCustomDurationDays(e.target.value)}
                          placeholder="e.g. 180"
                          className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-600 transition-all font-medium"
                          required
                        />
                      </div>
                    </div>

                    <button 
                      disabled={isSubmitting}
                      className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-blue-100"
                    >
                      {isSubmitting ? 'Processing...' : (topUpId ? 'Confirm Top-up' : 'Start Investment')}
                    </button>
                  </form>

                  {/* Collapsible Card Prices Settings */}
                  <div className="border-t border-gray-100 pt-6 mt-6">
                    <button
                      type="button"
                      onClick={() => setShowPricingSettings(!showPricingSettings)}
                      className="flex items-center justify-between w-full text-sm font-bold text-gray-500 hover:text-gray-900 transition-all"
                    >
                      <span className="flex items-center gap-2">
                        <Settings className="w-4 h-4 text-blue-600" />
                        Card Cost Settings
                      </span>
                      <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-extrabold uppercase tracking-wider">
                        {showPricingSettings ? 'Hide' : 'Configure'}
                      </span>
                    </button>
                    
                    <AnimatePresence>
                      {showPricingSettings && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden mt-4 space-y-4"
                        >
                          <p className="text-xs text-gray-500 leading-relaxed">
                            Adjust the base cost of exam PIN cards. New investments and withdrawals will use these updated prices.
                          </p>
                          <div className="space-y-3 pt-1">
                            {(Object.keys(cardPrices) as PinType[]).map((type) => (
                              <div key={type} className="flex items-center justify-between gap-4 bg-gray-50 p-3 rounded-2xl border border-gray-100">
                                <span className="text-xs font-bold text-gray-800">{type} Card Cost</span>
                                <div className="relative w-32">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">₦</span>
                                  <input
                                    type="number"
                                    value={cardPrices[type] === 0 ? '' : cardPrices[type]}
                                    onChange={(e) => handleUpdateCardPrice(type, e.target.value)}
                                    placeholder="0"
                                    className="w-full pl-7 pr-3 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-blue-600 focus:border-transparent outline-none transition-all text-right"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              ) : (
                /* Public Visitor Action Card */
                <div className="bg-gradient-to-b from-blue-900 via-indigo-900 to-gray-900 text-white p-8 rounded-[32px] shadow-xl sticky top-28 space-y-6">
                  <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-amber-300" />
                  </div>

                  <div>
                    <h3 className="text-2xl font-bold text-white mb-2">Start Investing with PinVest</h3>
                    <p className="text-xs text-blue-100 leading-relaxed">
                      Enroll in WAEC, NECO & NABTEB examination scratch card pools. Guaranteed daily interest accruals with full capital security.
                    </p>
                  </div>

                  <div className="space-y-3 bg-white/5 p-4 rounded-2xl border border-white/10">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-blue-200">Daily Return Rate</span>
                      <span className="font-bold text-emerald-400">₦100 / PIN / Day</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-blue-200">Tier &gt; ₦500k Profit</span>
                      <span className="font-bold text-amber-300">₦20,000 / Mo</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-blue-200">Liquidity Options</span>
                      <span className="font-bold text-white">Cash or e-PIN Cards</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowContactModal(true)}
                    className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-extrabold rounded-2xl text-xs transition-all shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2"
                  >
                    <Phone className="w-4 h-4" />
                    How to Invest / Contact Desk
                  </button>

                  <div className="pt-4 border-t border-white/10 text-center">
                    <p className="text-[11px] text-blue-200">
                      Are you the PinVest Administrator?{' '}
                      <button
                        onClick={() => setShowAdminAuthModal(true)}
                        className="text-amber-300 hover:underline font-bold"
                      >
                        Login to Admin Panel
                      </button>
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Portfolio Overview Banner */}
            <div className="lg:col-span-2">
              <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center space-y-4 py-12">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center">
                  <TrendingUp className="w-8 h-8" />
                </div>
                <div className="max-w-md">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">Live Yield & Portfolio Monitoring</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    All investments accrue daily profits automatically. Click <strong className="text-gray-800">"View Present Investors"</strong> above to inspect active investor portfolios, daily accrued yields, and transaction statements.
                  </p>
                </div>
                <button
                  onClick={() => setShowInvestorsList(!showInvestorsList)}
                  className="px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold text-xs hover:bg-blue-700 transition-all shadow-md shadow-blue-100 flex items-center gap-2"
                >
                  <Users className="w-4 h-4" />
                  {showInvestorsList ? 'Hide Active Investors' : `View Active Investors (${investments.length})`}
                </button>
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
                
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Withdrawals & Sales</h3>
                <p className="text-gray-500 mb-6">
                  Select whether to withdraw cash or directly sell/withdraw PINs from your {withdrawModal.investment?.pinType} investment.
                </p>

                <div className="flex bg-gray-100 p-1 rounded-2xl mb-6">
                  <button
                    type="button"
                    onClick={() => {
                      setWithdrawMode('funds');
                      setWithdrawError(null);
                    }}
                    className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${
                      withdrawMode === 'funds' 
                        ? 'bg-white text-gray-900 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    Withdraw Funds
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWithdrawMode('pins');
                      setWithdrawError(null);
                    }}
                    className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${
                      withdrawMode === 'pins' 
                        ? 'bg-white text-gray-900 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    Withdraw PINs
                  </button>
                </div>

                <form onSubmit={handleWithdraw} className="space-y-6">
                  {withdrawError && (
                    <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-medium flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      {withdrawError}
                    </div>
                  )}

                  {withdrawMode === 'funds' ? (
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
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Select Pin Type</label>
                        <div className="grid grid-cols-3 gap-2">
                          {(Object.keys(PIN_CONFIGS) as PinType[]).map((type) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => setWithdrawPinsType(type)}
                              className={`py-2 px-3 rounded-xl border text-center transition-all text-xs font-bold ${
                                withdrawPinsType === type 
                                  ? 'border-red-600 bg-red-50 text-red-600 font-extrabold' 
                                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              {type}
                              <div className="text-[9px] font-normal text-gray-400">₦{cardPrices[type]}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Number of PINs to Withdraw</label>
                        <input 
                          type="number"
                          value={withdrawPinsCount}
                          onChange={(e) => setWithdrawPinsCount(e.target.value)}
                          placeholder="e.g. 5"
                          className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-red-600 transition-all font-medium"
                          required
                          autoFocus
                        />
                        {withdrawPinsCount && !isNaN(parseInt(withdrawPinsCount)) && (
                          <p className="mt-2 text-xs text-gray-500 font-semibold">
                            Total equivalent cost: <span className="text-red-600 font-bold">₦{(parseInt(withdrawPinsCount) * cardPrices[withdrawPinsType]).toLocaleString()}</span> (subtracted from net value)
                          </p>
                        )}
                      </div>
                    </div>
                  )}

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
                    {isSubmitting ? 'Processing...' : (withdrawMode === 'funds' ? 'Confirm Withdrawal' : 'Confirm PIN Withdrawal')}
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
                          onClick={() => {
                            setEditPin(type);
                            setEditProfitPerPin(PIN_CONFIGS[type].interest.toString());
                          }}
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

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Profit per Pin (₦)</label>
                      <input 
                        type="number"
                        value={editProfitPerPin}
                        onChange={(e) => setEditProfitPerPin(e.target.value)}
                        placeholder="e.g. 100"
                        className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-600 transition-all font-medium"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Duration (Days)</label>
                      <input 
                        type="number"
                        value={editDurationDays}
                        onChange={(e) => setEditDurationDays(e.target.value)}
                        placeholder="e.g. 180"
                        className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-600 transition-all font-medium"
                        required
                      />
                    </div>
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

        {/* Admin Password Authentication Modal */}
        <AnimatePresence>
          {showAdminAuthModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  setShowAdminAuthModal(false);
                  setAdminPasswordError(null);
                }}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl border border-gray-100 z-10"
              >
                <button 
                  onClick={() => {
                    setShowAdminAuthModal(false);
                    setAdminPasswordError(null);
                  }}
                  className="absolute top-6 right-6 p-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
                  <Lock className="w-6 h-6" />
                </div>
                
                <h3 className="text-xl font-bold text-gray-900 mb-1">Admin Access Only</h3>
                <p className="text-xs text-gray-500 mb-6">Enter administrative password to manage investments, top-ups, and prices.</p>

                <form onSubmit={handleAdminLogin} className="space-y-4">
                  {adminPasswordError && (
                    <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-medium flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {adminPasswordError}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wider">Admin Password</label>
                    <input 
                      type="password"
                      value={adminPasswordInput}
                      onChange={(e) => setAdminPasswordInput(e.target.value)}
                      placeholder="Enter admin password"
                      className="w-full p-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-600 transition-all text-sm font-bold"
                      autoFocus
                      required
                    />
                  </div>

                  <button 
                    type="submit"
                    className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-sm hover:bg-blue-700 transition-all active:scale-[0.98] shadow-lg shadow-blue-100"
                  >
                    Unlock Admin Panel
                  </button>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Public Visitor How to Invest / Contact Modal */}
        <AnimatePresence>
          {showContactModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowContactModal(false)}
                className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-white w-full max-w-md rounded-[32px] p-8 shadow-2xl border border-gray-100 z-10 max-h-[90vh] overflow-y-auto"
              >
                <button 
                  onClick={() => setShowContactModal(false)}
                  className="absolute top-6 right-6 p-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-4">
                  <Sparkles className="w-6 h-6" />
                </div>
                
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Start Your PinVestment</h3>
                <p className="text-xs text-gray-500 mb-6">Follow these simple steps to enroll in our high-yielding WAEC, NECO & NABTEB PIN investment portfolios.</p>

                <div className="space-y-4 mb-6">
                  <div className="flex gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">1</div>
                    <div>
                      <h4 className="font-bold text-sm text-gray-900">Select Plan & Capital</h4>
                      <p className="text-xs text-gray-500 mt-0.5">Choose between WAEC, NECO, or NABTEB PIN plans starting from ₦10,000 up to ₦10,000,000+.</p>
                    </div>
                  </div>

                  <div className="flex gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">2</div>
                    <div>
                      <h4 className="font-bold text-sm text-gray-900">Contact Official Desk</h4>
                      <p className="text-xs text-gray-500 mt-0.5">Reach out to our desk manager to request official deposit account details & verification.</p>
                    </div>
                  </div>

                  <div className="flex gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0">3</div>
                    <div>
                      <h4 className="font-bold text-sm text-gray-900">Live Dashboard Portfolio</h4>
                      <p className="text-xs text-gray-500 mt-0.5">Once confirmed, your portfolio goes live instantly and accrues profits daily in real time!</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <a 
                    href="https://wa.me/2348000000000?text=Hello%20PinVest%20Admin,%20I%20would%20like%20to%20start%20an%20investment."
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3.5 bg-emerald-600 text-white rounded-2xl font-bold text-xs hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-100"
                  >
                    <Phone className="w-4 h-4" />
                    Chat with Desk Manager on WhatsApp
                  </a>
                  <a 
                    href="mailto:invest@pinvest.ng?subject=PinVest%20Investment%20Inquiry"
                    className="w-full py-3.5 bg-gray-100 text-gray-800 rounded-2xl font-bold text-xs hover:bg-gray-200 transition-all flex items-center justify-center gap-2"
                  >
                    <Mail className="w-4 h-4" />
                    Email Official Support Desk
                  </a>
                </div>
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
  isAdmin: boolean,
  onWithdraw: () => void, 
  onEdit: () => void, 
  onDelete: () => void,
  onAddFunds: () => void,
  onDeleteSoldPin: (index: number) => void,
  onDeleteWithdrawal: (index: number) => void,
  onRequestAdminAuth: () => void
}> = ({ investment, isAdmin, onWithdraw, onEdit, onDelete, onAddFunds, onDeleteSoldPin, onDeleteWithdrawal, onRequestAdminAuth }) => {
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
              <span className="font-bold text-gray-900 text-left">
                {investment.investorName}
              </span>
              {isAdmin && (
                <>
                  <button 
                    onClick={onEdit}
                    className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                    title="Edit Investment"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={onDelete}
                    className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                    title="Delete Investment"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
              <button 
                onClick={() => setShowHistory(!showHistory)}
                className={`p-1 transition-colors ${showHistory ? 'text-blue-600' : 'text-gray-400 hover:text-blue-600'}`}
                title="View Statement & History"
              >
                <FileText className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Started {new Date(investment.startDate.toMillis()).toLocaleDateString()}
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
                    <span className={`font-medium ${t.type === 'deposit' ? 'text-emerald-400' : t.type === 'withdrawal' ? 'text-red-400' : 'text-amber-400'}`}>
                      {t.type === 'deposit' ? 'DEPOSIT' : t.type === 'withdrawal' ? 'WITHDRAW' : `PIN WD (${t.pinCount || 0}x)`}
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
                <div key={i} className="flex justify-between items-center text-[10px] text-gray-500 py-0.5 hover:bg-gray-100/50 px-1 rounded transition-colors group/item">
                  <span>{new Date(w.date.toMillis()).toLocaleString()}</span>
                  <div className="flex items-center gap-1.5 font-bold">
                    <span className="text-red-400">-₦{w.amount.toLocaleString()}</span>
                    {isAdmin && (
                      <button
                        onClick={() => onDeleteWithdrawal(i)}
                        className="p-0.5 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover/item:opacity-100 focus:opacity-100"
                        title="Delete this withdrawal"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {investment.soldPins && investment.soldPins.length > 0 && (
          <div className="mb-4 pt-3 border-t border-gray-100">
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 mb-2">Directly Sold Pins History</p>
            <div className="space-y-1 max-h-24 overflow-y-auto pr-2">
              {investment.soldPins.map((s, i) => (
                <div key={i} className="flex justify-between items-center text-[10px] text-gray-500 py-0.5 hover:bg-gray-100/50 px-1 rounded transition-colors group/item">
                  <span>
                    {new Date(s.date.toMillis()).toLocaleDateString()} - {s.pinCount}x {s.pinType} Pin(s) @ ₦{s.costPerPin}
                  </span>
                  <div className="flex items-center gap-1.5 font-bold">
                    <span className="text-red-400">-₦{s.totalCost.toLocaleString()}</span>
                    {isAdmin && (
                      <button
                        onClick={() => onDeleteSoldPin(i)}
                        className="p-0.5 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover/item:opacity-100 focus:opacity-100"
                        title="Delete this sold PIN record"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
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
            {isAdmin ? (
              <>
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
              </>
            ) : (
              <button 
                onClick={() => setShowHistory(!showHistory)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-xl transition-all flex items-center gap-2"
              >
                <FileText className="w-4 h-4 text-blue-600" />
                {showHistory ? 'Hide Statement' : 'View Statement'}
              </button>
            )}
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
};
