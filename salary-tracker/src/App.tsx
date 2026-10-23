import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Wallet, AlertTriangle, PlusCircle, Trash2, Edit2, Search, Download, Sparkles,
  ArrowUpRight, ArrowDownRight, RefreshCw, ChevronRight, Send, X, Eye, EyeOff
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, Legend
} from 'recharts';

// ---------- Types ----------
type TxType = 'income' | 'expense';
type Tab = 'dashboard' | 'transactions' | 'budgets' | 'analytics' | 'ai-advisor';
type Budgets = Record<string, number>;
type RecurrenceFrequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
type BudgetPeriod = 'calendar-month' | 'salary-cycle';

interface Transaction {
  id: string;
  type: TxType;
  category: string;
  amount: number;
  date: string;
  description: string;
  merchant?: string;
  recurringItemId?: string;
}

interface FormState {
  type: TxType;
  amount: string;
  category: string;
  date: string;
  description: string;
  merchant: string;
  saveRecurring: boolean;
  frequency: RecurrenceFrequency;
  endDate: string;
  reminderDays: number;
  amountMayVary: boolean;
  customIntervalDays: number;
  recordImmediately: boolean;
}

interface RecurringItem {
  id: string;
  type: TxType;
  category: string;
  description: string;
  amount: number;
  frequency: RecurrenceFrequency;
  nextDate: string;
  startDate: string;
  endDate: string;
  reminderDays: number;
  amountMayVary: boolean;
  customIntervalDays: number;
  lastPaidDate?: string;
}

interface SavingsGoal {
  id: string;
  name: string;
  target: number;
  saved: number;
  monthlyContribution: number;
}

interface ChatMessage {
  sender: 'ai' | 'user';
  text: string;
}

interface AlertItem {
  type: 'danger' | 'warning';
  title: string;
  message: string;
}

interface ProfileDetails {
  name: string;
  email: string;
  phone: string;
  role: string;
  location: string;
  age: string;
}

interface SavedState {
  transactions: Transaction[];
  budgets: Budgets;
  overallMonthlyBudget: number;
  recurringItems: RecurringItem[];
  paydayDay: number;
  plannedSavings: number;
  budgetPeriod: BudgetPeriod;
  alertThresholds: { notice: number; alert: number };
  savingsGoals: SavingsGoal[];
  profile: ProfileDetails;
}

// ---------- Helpers ----------
const STORAGE_KEY = 'smartspend:v1';

const pad2 = (n: number) => String(n).padStart(2, '0');
const toLocalDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayStr = () => toLocalDateStr(new Date());

const fmt = (n: number) => n.toLocaleString('en-IN');
const inr = (n: number) => `${n < 0 ? '-' : ''}₹${fmt(Math.abs(n))}`;
const percentOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

const sumBy = (list: Transaction[], type: TxType) =>
  list.filter((t) => t.type === type).reduce((acc, t) => acc + Number(t.amount), 0);

const salaryCycleWindow = (date: Date, paydayDay: number) => {
  const start = new Date(date.getFullYear(), date.getMonth(), paydayDay);
  if (date.getDate() < paydayDay) start.setMonth(start.getMonth() - 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, paydayDay);
  return { start: toLocalDateStr(start), end: toLocalDateStr(end), nextPayday: toLocalDateStr(end) };
};

const advanceRecurrence = (date: string, frequency: RecurrenceFrequency, customIntervalDays = 14) => {
  const next = new Date(`${date}T00:00:00`);
  if (frequency === 'weekly') next.setDate(next.getDate() + 7);
  else if (frequency === 'quarterly') next.setMonth(next.getMonth() + 3);
  else if (frequency === 'yearly') next.setFullYear(next.getFullYear() + 1);
  else if (frequency === 'custom') next.setDate(next.getDate() + customIntervalDays);
  else next.setMonth(next.getMonth() + 1);
  return toLocalDateStr(next);
};

const monthInfo = (monthsAgo: number) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsAgo);
  return {
    key: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`,
    short: d.toLocaleString('en-US', { month: 'short' }),
    long: d.toLocaleString('en-US', { month: 'long' })
  };
};

const csvCell = (value: string | number) => {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

const renderRichText = (text: string) =>
  text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part, i) => {
    if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    }
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <span key={i}>{part}</span>;
  });

const THIS_MONTH = todayStr().slice(0, 7);
const seedDate = (day: number) => `${THIS_MONTH}-${pad2(day)}`;

const INITIAL_TRANSACTIONS: Transaction[] = [
  { id: 'tx-1', type: 'income', category: 'Salary', amount: 55000, date: seedDate(1), description: 'Monthly Tech Salary' },
  { id: 'tx-2', type: 'income', category: 'Freelance', amount: 12000, date: seedDate(5), description: 'Landing page UI design' },
  { id: 'tx-3', type: 'expense', category: 'Rent', amount: 15000, date: seedDate(2), description: 'Apartment rent' },
  { id: 'tx-4', type: 'expense', category: 'Food', amount: 4850, date: seedDate(6), description: 'Grocery supermarket & dining' },
  { id: 'tx-5', type: 'expense', category: 'Shopping', amount: 4500, date: seedDate(8), description: 'Autumn jacket & running shoes' },
  { id: 'tx-6', type: 'expense', category: 'Travel', amount: 3400, date: seedDate(10), description: 'Cab rides & train tickets' },
  { id: 'tx-7', type: 'expense', category: 'Utilities', amount: 2400, date: seedDate(11), description: 'High-speed Fiber & Electricity' },
  { id: 'tx-8', type: 'expense', category: 'Entertainment', amount: 1299, date: seedDate(14), description: 'Weekend Cinema & Netflix' },
  { id: 'tx-9', type: 'expense', category: 'Healthcare', amount: 1500, date: seedDate(16), description: 'Dental routine checkup' },
  { id: 'tx-10', type: 'expense', category: 'Food', amount: 1650, date: seedDate(19), description: 'Weekend dining out' },
  { id: 'tx-11', type: 'income', category: 'Investments', amount: 3500, date: seedDate(20), description: 'Quarterly Dividend Payout' }
];

const INITIAL_BUDGETS: Budgets = {
  Food: 6000,
  Travel: 3000,
  Shopping: 4000,
  Rent: 15000,
  Utilities: 3000,
  Entertainment: 2500,
  Healthcare: 3000,
  Education: 3000,
  Transport: 2000,
  Others: 2000
};

const SAMPLE_HISTORY = [
  { income: 45000, expense: 31000 },
  { income: 48000, expense: 34500 },
  { income: 52000, expense: 33000 }
];

const EXPENSE_CATEGORIES = [
  { name: 'Food', icon: '🍔', color: '#f97316' },
  { name: 'Travel', icon: '✈️', color: '#3b82f6' },
  { name: 'Shopping', icon: '🛍️', color: '#ec4899' },
  { name: 'Rent', icon: '🏠', color: '#8b5cf6' },
  { name: 'Utilities', icon: '⚡', color: '#eab308' },
  { name: 'Entertainment', icon: '🎬', color: '#06b6d4' },
  { name: 'Healthcare', icon: '💊', color: '#ef4444' },
  { name: 'Education', icon: '📚', color: '#10b981' },
  { name: 'Transport', icon: '🚗', color: '#64748b' },
  { name: 'Others', icon: '📦', color: '#a855f7' }
];

const INCOME_CATEGORIES = [
  { name: 'Salary', icon: '💼', color: '#10b981' },
  { name: 'Freelance', icon: '💻', color: '#06b6d4' },
  { name: 'Investments', icon: '📈', color: '#8b5cf6' },
  { name: 'Gifts', icon: '🎁', color: '#f59e0b' },
  { name: 'Other Income', icon: '💰', color: '#3b82f6' }
];

const NAV_TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'budgets', label: 'Budgets' },
  { id: 'analytics', label: 'Analytics' }
];

const TOOLTIP_STYLE = { backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' };
const rupeeFormatter = (val: unknown) => inr(Number(val));
const renderPieLabel = ({ name, percent }: { name?: string | number; percent?: number }) =>
  `${name ?? ''} ${Math.round((percent ?? 0) * 100)}%`;

const EMPTY_PROFILE: ProfileDetails = {
  name: '',
  email: '',
  phone: '',
  role: '',
  location: '',
  age: ''
};

const FINANCE_QUOTES = [
  'A budget is a plan for your money to help you live better.',
  'Small, steady savings can grow into meaningful financial security.',
  'Spend with intention today to give your future more choices.',
  'Progress in personal finance comes from consistent, thoughtful habits.',
  'The best time to plan your finances is before you need to.'
];

const getQuoteForPageLoad = () => {
  try {
    const previousIndex = Number(window.localStorage.getItem('smartspend:last-quote-index'));
    const availableIndexes = FINANCE_QUOTES.map((_, index) => index).filter((index) => index !== previousIndex);
    const index = availableIndexes[Math.floor(Math.random() * availableIndexes.length)];
    window.localStorage.setItem('smartspend:last-quote-index', String(index));
    return FINANCE_QUOTES[index];
  } catch {
    return FINANCE_QUOTES[Math.floor(Math.random() * FINANCE_QUOTES.length)];
  }
};

const toNumberEntries = <T extends Record<string, number>>(obj: T): Array<[string, number]> =>
  Object.entries(obj) as Array<[string, number]>;

const emptyForm = (type: TxType = 'expense'): FormState => ({
  type,
  amount: '',
  category: type === 'expense' ? 'Food' : 'Salary',
  date: todayStr(),
  description: '',
  merchant: '',
  saveRecurring: false,
  frequency: 'monthly',
  endDate: '',
  reminderDays: 3,
  amountMayVary: false,
  customIntervalDays: 14,
  recordImmediately: true
});

const loadSaved = (): Partial<SavedState> => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const out: Partial<SavedState> = {};
    if (Array.isArray(parsed.transactions)) out.transactions = parsed.transactions;
    if (parsed.budgets && typeof parsed.budgets === 'object') out.budgets = parsed.budgets;
    if (typeof parsed.overallMonthlyBudget === 'number') out.overallMonthlyBudget = parsed.overallMonthlyBudget;
    if (Array.isArray(parsed.recurringItems)) out.recurringItems = parsed.recurringItems;
    if (typeof parsed.paydayDay === 'number') out.paydayDay = parsed.paydayDay;
    if (typeof parsed.plannedSavings === 'number') out.plannedSavings = parsed.plannedSavings;
    if (parsed.budgetPeriod === 'calendar-month' || parsed.budgetPeriod === 'salary-cycle') out.budgetPeriod = parsed.budgetPeriod;
    if (parsed.alertThresholds && typeof parsed.alertThresholds === 'object') out.alertThresholds = parsed.alertThresholds;
    if (Array.isArray(parsed.savingsGoals)) out.savingsGoals = parsed.savingsGoals;
    if (parsed.profile && typeof parsed.profile === 'object') {
      out.profile = {
        name: typeof parsed.profile.name === 'string' ? parsed.profile.name : '',
        email: typeof parsed.profile.email === 'string' ? parsed.profile.email : '',
        phone: typeof parsed.profile.phone === 'string' ? parsed.profile.phone : '',
        role: typeof parsed.profile.role === 'string' ? parsed.profile.role : '',
        location: typeof parsed.profile.location === 'string' ? parsed.profile.location : '',
        age: typeof parsed.profile.age === 'string' || typeof parsed.profile.age === 'number' ? String(parsed.profile.age) : ''
      };
    }
    return out;
  } catch {
    return {};
  }
};
const SAVED: Partial<SavedState> = typeof window !== 'undefined' ? loadSaved() : {};

export default function App() {
  const [welcomeQuote] = useState(getQuoteForPageLoad);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [signedInEmail, setSignedInEmail] = useState('');
  const [profile, setProfile] = useState<ProfileDetails>(SAVED.profile ?? EMPTY_PROFILE);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState<ProfileDetails>(SAVED.profile ?? EMPTY_PROFILE);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [transactions, setTransactions] = useState<Transaction[]>(SAVED.transactions ?? INITIAL_TRANSACTIONS);
  const [budgets, setBudgets] = useState<Budgets>({ ...INITIAL_BUDGETS, ...SAVED.budgets });
  const [overallMonthlyBudget, setOverallMonthlyBudget] = useState<number>(SAVED.overallMonthlyBudget ?? 40000);
  const [recurringItems, setRecurringItems] = useState<RecurringItem[]>(SAVED.recurringItems ?? []);
  const [paydayDay, setPaydayDay] = useState<number>(SAVED.paydayDay ?? 1);
  const [plannedSavings, setPlannedSavings] = useState<number>(SAVED.plannedSavings ?? 0);
  const [budgetPeriod, setBudgetPeriod] = useState<BudgetPeriod>(SAVED.budgetPeriod ?? 'calendar-month');
  const [alertThresholds, setAlertThresholds] = useState(SAVED.alertThresholds ?? { notice: 80, alert: 100 });
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>(SAVED.savingsGoals ?? []);
  const [budgetSort, setBudgetSort] = useState<'over' | 'closest' | 'highest' | 'alphabetical'>('over');
  const [transactionSort] = useState<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'>('date-desc');
  const [showSafeSpendDetails, setShowSafeSpendDetails] = useState(false);
  const [showAlertDetails, setShowAlertDetails] = useState(false);
  const [alertsDismissed, setAlertsDismissed] = useState(false);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalForm, setGoalForm] = useState({ name: '', target: '', saved: '', monthlyContribution: '' });
  const [goalContribution, setGoalContribution] = useState<Record<string, string>>({});
  const [dateFrom] = useState('');
  const [dateTo] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | TxType>('all');
  const [filterCategory, setFilterCategory] = useState('all');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [formData, setFormData] = useState<FormState>(() => emptyForm());

  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      sender: 'ai',
      text: "👋 Hi! I'm your AI Smart Expense Assistant. Ask me anything about your cashflow, top spendings, or personalized tips to save money this month!"
    }
  ]);
  const [aiInput, setAiInput] = useState('');
  const chatBodyRef = useRef<HTMLDivElement | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ transactions, budgets, overallMonthlyBudget, recurringItems, paydayDay, plannedSavings, budgetPeriod, alertThresholds, savingsGoals, profile })
      );
    } catch {
      // storage unavailable (private mode / sandbox) – app still works in memory
    }
  }, [transactions, budgets, overallMonthlyBudget, recurringItems, paydayDay, plannedSavings, budgetPeriod, alertThresholds, savingsGoals, profile]);

  useEffect(() => {
    const el = chatBodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages, activeTab]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((id: number) => window.clearTimeout(id));
  }, []);

  useEffect(() => {
    if (!isModalOpen && !isBudgetModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsModalOpen(false);
        setIsBudgetModalOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isModalOpen, isBudgetModalOpen]);

  const currentMonth = todayStr().slice(0, 7);
  const currentMonthName = monthInfo(0).long;
  const cycleWindow = salaryCycleWindow(new Date(), paydayDay);

  const monthTransactions = useMemo(
    () => transactions.filter((t: Transaction) => t.date.startsWith(currentMonth)),
    [transactions, currentMonth]
  );

  const cycleTransactions = useMemo(
    () => transactions.filter((tx) => tx.date >= cycleWindow.start && tx.date < cycleWindow.end),
    [transactions, cycleWindow.start, cycleWindow.end]
  );

  const cycleIncome = useMemo(() => sumBy(cycleTransactions, 'income'), [cycleTransactions]);
  const cycleExpenses = useMemo(() => sumBy(cycleTransactions, 'expense'), [cycleTransactions]);
  const nextPaydaySalary = useMemo(
    () => recurringItems.find((item) => item.type === 'income' && item.category === 'Salary' && item.nextDate === cycleWindow.nextPayday),
    [recurringItems, cycleWindow.nextPayday]
  );
  const dueSoonItems = useMemo(() => {
    const today = new Date(`${todayStr()}T00:00:00`);
    return recurringItems
      .filter((item) => item.lastPaidDate !== item.nextDate && (!item.endDate || item.nextDate <= item.endDate))
      .map((item) => ({
        ...item,
        daysUntil: Math.ceil((new Date(`${item.nextDate}T00:00:00`).getTime() - today.getTime()) / 86400000)
      }))
      .filter((item) => item.daysUntil <= 14 && item.nextDate <= cycleWindow.end)
      .sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  }, [recurringItems, cycleWindow.end]);
  const unpaidRecurringItems = recurringItems.filter((item) => item.lastPaidDate !== item.nextDate);
  const upcomingBills = unpaidRecurringItems.filter((item) => item.type === 'expense' && item.nextDate <= cycleWindow.end);
  const fixedBillsDue = upcomingBills.reduce((sum, item) => sum + item.amount, 0);
  const fixedCategories = ['Rent', 'Utilities', 'Loan', 'Loan Repayment', 'Insurance', 'Subscriptions'];
  const cycleVariableSpending = cycleTransactions
    .filter((tx) => tx.type === 'expense' && !fixedCategories.includes(tx.category))
    .reduce((sum, tx) => sum + tx.amount, 0);
  const safeToSpend = cycleIncome - cycleExpenses - plannedSavings - fixedBillsDue;

  const sortedTransactions = useMemo(
    () => [...transactions].sort((a: Transaction, b: Transaction) => {
      if (transactionSort === 'amount-desc') return b.amount - a.amount;
      if (transactionSort === 'amount-asc') return a.amount - b.amount;
      return transactionSort === 'date-desc' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
    }),
    [transactions, transactionSort]
  );

  const totalIncome = useMemo(() => sumBy(monthTransactions, 'income'), [monthTransactions]);
  const totalExpenses = useMemo(() => sumBy(monthTransactions, 'expense'), [monthTransactions]);
  const netSavings = totalIncome - totalExpenses;
  const savingsRate = percentOf(netSavings, totalIncome);
  const remainingBudget = overallMonthlyBudget - totalExpenses;
  const budgetUtilization = Math.min(100, percentOf(totalExpenses, overallMonthlyBudget));
  const budgetTransactions = budgetPeriod === 'salary-cycle' ? cycleTransactions : monthTransactions;
  const budgetPeriodExpenses = sumBy(budgetTransactions, 'expense');

  const categoryExpenses = useMemo(() => {
    const map: Record<string, number> = {};
    budgetTransactions
      .filter((t: Transaction) => t.type === 'expense')
      .forEach((t: Transaction) => {
        map[t.category] = (map[t.category] || 0) + Number(t.amount);
      });
    return map;
  }, [budgetTransactions]);

  const incomeByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    monthTransactions
      .filter((t: Transaction) => t.type === 'income')
      .forEach((t: Transaction) => {
        map[t.category] = (map[t.category] || 0) + Number(t.amount);
      });
    return map;
  }, [monthTransactions]);

  const smartAlerts = useMemo(() => {
    const alerts: AlertItem[] = [];
    if (overallMonthlyBudget > 0) {
      if (totalExpenses > overallMonthlyBudget) {
        alerts.push({
          type: 'danger',
          title: 'Total Monthly Budget Exceeded!',
          message: `You have overspent by ${inr(totalExpenses - overallMonthlyBudget)} across all categories.`
        });
      } else if (budgetUtilization >= alertThresholds.notice) {
        alerts.push({
          type: 'warning',
          title: 'Overall Budget Warning',
          message: `You've utilized ${budgetUtilization}% of your ${inr(overallMonthlyBudget)} monthly budget.`
        });
      }
    }

    toNumberEntries(budgets).forEach(([cat, limit]) => {
      if (limit <= 0) return;
      const spent = categoryExpenses[cat] || 0;
      if (spent > limit) {
        alerts.push({
          type: 'danger',
          title: `${cat} Limit Exceeded!`,
          message: `Spent ${inr(spent)} / ${inr(limit)} (Exceeded by ${inr(spent - limit)})`
        });
      } else if (spent === limit) {
        alerts.push({
          type: 'warning',
          title: `${cat} Limit Reached`,
          message: `You've used your full ${inr(limit)} budget for ${cat}.`
        });
      } else if (spent / limit >= alertThresholds.alert / 100) {
        alerts.push({
          type: 'danger',
          title: `${cat} Limit Exceeded!`,
          message: `Spent ${inr(spent)} / ${inr(limit)} (Exceeded by ${inr(spent - limit)})`
        });
      } else if (spent / limit >= alertThresholds.notice / 100) {
        alerts.push({
          type: 'warning',
          title: `${cat} Approaching Limit`,
          message: `You've consumed ${percentOf(spent, limit)}% of your ${inr(limit)} budget.`
        });
      }
    });

    return alerts.sort((a, b) => (a.type === b.type ? 0 : a.type === 'danger' ? -1 : 1));
  }, [categoryExpenses, budgets, totalExpenses, overallMonthlyBudget, budgetUtilization, alertThresholds]);

  const overBudgetCategories = useMemo(
    () => toNumberEntries(budgets).filter(([category, limit]) => limit > 0 && (categoryExpenses[category] || 0) > limit),
    [budgets, categoryExpenses]
  );
  const nearBudgetCategories = useMemo(
    () => toNumberEntries(budgets).filter(([category, limit]) => {
      const spent = categoryExpenses[category] || 0;
      return limit > 0 && spent >= limit * alertThresholds.notice / 100 && spent <= limit;
    }),
    [budgets, categoryExpenses, alertThresholds.notice]
  );

  const sortedBudgetCategories = useMemo(() => [...EXPENSE_CATEGORIES].sort((a, b) => {
    const spentA = categoryExpenses[a.name] || 0;
    const spentB = categoryExpenses[b.name] || 0;
    const limitA = budgets[a.name] || 0;
    const limitB = budgets[b.name] || 0;
    if (budgetSort === 'highest') return spentB - spentA;
    if (budgetSort === 'alphabetical') return a.name.localeCompare(b.name);
    if (budgetSort === 'closest') return percentOf(spentB, limitB) - percentOf(spentA, limitA);
    const overA = Math.max(0, spentA - limitA);
    const overB = Math.max(0, spentB - limitB);
    if (overA !== overB) return overB - overA;
    return percentOf(spentB, limitB) - percentOf(spentA, limitA);
  }), [categoryExpenses, budgets, budgetSort]);

  useEffect(() => {
    setAlertsDismissed(false);
  }, [overBudgetCategories.map(([category, limit]) => `${category}:${limit}:${categoryExpenses[category] || 0}`).join('|'), nearBudgetCategories.map(([category]) => category).join('|')]);

  const pieChartData = useMemo(
    () =>
      Object.entries(categoryExpenses).map(([name, value]) => {
        const match = EXPENSE_CATEGORIES.find((c) => c.name === name);
        return { name, value, color: match ? match.color : '#8884d8' };
      }),
    [categoryExpenses]
  );

  const barChartData = useMemo(
    () =>
      [3, 2, 1, 0].map((ago: number) => {
        const { key, short } = monthInfo(ago);
        const inMonth = transactions.filter((t: Transaction) => t.date.startsWith(key));
        if (ago > 0 && inMonth.length === 0) {
          return { month: short, ...SAMPLE_HISTORY[3 - ago] };
        }
        return { month: short, income: sumBy(inMonth, 'income'), expense: sumBy(inMonth, 'expense') };
      }),
    [transactions]
  );

  const trendData = useMemo(() => {
    const dates: Record<string, number> = {};
    monthTransactions
      .filter((t: Transaction) => t.type === 'expense')
      .forEach((t: Transaction) => {
        dates[t.date] = (dates[t.date] || 0) + Number(t.amount);
      });
    return Object.keys(dates)
      .sort()
      .map((date: string) => ({ date: date.substring(5), amount: dates[date] }));
  }, [monthTransactions]);

  const filteredTransactions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return sortedTransactions.filter((tx: Transaction) => {
      const matchesSearch =
        tx.description.toLowerCase().includes(term) || tx.category.toLowerCase().includes(term) || (tx.merchant || '').toLowerCase().includes(term);
      const matchesType = filterType === 'all' || tx.type === filterType;
      const matchesCategory = filterCategory === 'all' || tx.category === filterCategory;
      const matchesFrom = !dateFrom || tx.date >= dateFrom;
      const matchesTo = !dateTo || tx.date <= dateTo;
      return matchesSearch && matchesType && matchesCategory && matchesFrom && matchesTo;
    });
  }, [sortedTransactions, searchTerm, filterType, filterCategory, dateFrom, dateTo]);

  const handleOpenAdd = (type: TxType = 'expense') => {
    setEditingTransaction(null);
    setFormData(emptyForm(type));
    setIsModalOpen(true);
  };

  const handleOpenEdit = (tx: Transaction) => {
    setEditingTransaction(tx);
    setFormData({
      type: tx.type,
      amount: String(tx.amount),
      category: tx.category,
      date: tx.date,
      description: tx.description,
      merchant: tx.merchant || '',
      saveRecurring: false,
      frequency: 'monthly',
      endDate: '',
      reminderDays: 3,
      amountMayVary: false,
      customIntervalDays: 14,
      recordImmediately: true
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    const transaction = transactions.find((item) => item.id === id);
    if (!transaction || !window.confirm(`Delete ${transaction.description}? This cannot be undone.`)) return;
    setTransactions((prev: Transaction[]) => prev.filter((item: Transaction) => item.id !== id));
  };

  const handleMarkRecurringPaid = (item: RecurringItem) => {
    const payment: Transaction = {
      id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: item.type,
      category: item.category,
      amount: item.amount,
      date: item.nextDate,
      description: item.description,
      recurringItemId: item.id
    };
    setTransactions((prev) => [payment, ...prev]);
    setRecurringItems((prev) => prev.map((entry) => entry.id === item.id
      ? { ...entry, lastPaidDate: entry.nextDate, nextDate: advanceRecurrence(entry.nextDate, entry.frequency, entry.customIntervalDays) }
      : entry));
  };

  const handleSaveTransaction = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const amount = Number(formData.amount);
    const description = formData.description.trim();
    if (!Number.isFinite(amount) || amount <= 0 || !description) return;

    const payload = {
      type: formData.type,
      category: formData.category,
      date: formData.date,
      description,
      amount,
      merchant: formData.merchant.trim()
    };

    if (editingTransaction) {
      setTransactions((prev: Transaction[]) =>
        prev.map((item: Transaction) => (item.id === editingTransaction.id ? { ...item, ...payload } : item))
      );
    } else if (!formData.saveRecurring || formData.recordImmediately) {
      const newTx: Transaction = {
        id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ...payload
      };
      setTransactions((prev: Transaction[]) => [newTx, ...prev]);
    }
    if (formData.saveRecurring) {
      const recurring: RecurringItem = {
        id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: formData.type,
        category: formData.category,
        description,
        amount,
        frequency: formData.frequency,
        startDate: formData.date,
        endDate: formData.endDate,
        reminderDays: formData.reminderDays,
        amountMayVary: formData.amountMayVary,
        customIntervalDays: formData.customIntervalDays,
        nextDate: formData.recordImmediately ? advanceRecurrence(formData.date, formData.frequency, formData.customIntervalDays) : formData.date
      };
      setRecurringItems((prev) => [...prev, recurring]);
    }
    setIsModalOpen(false);
  };

  const handleSaveGoal = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const target = Number(goalForm.target);
    const saved = Number(goalForm.saved) || 0;
    const monthlyContribution = Number(goalForm.monthlyContribution) || 0;
    if (!goalForm.name.trim() || target <= 0 || saved < 0 || monthlyContribution < 0) return;
    setSavingsGoals((prev) => [...prev, {
      id: `goal-${Date.now()}`,
      name: goalForm.name.trim(),
      target,
      saved,
      monthlyContribution
    }]);
    setGoalForm({ name: '', target: '', saved: '', monthlyContribution: '' });
    setShowGoalForm(false);
  };

  const handleExportCSV = () => {
    const headers = 'ID,Type,Category,Amount,Date,Description\n';
    const rows = transactions
      .map((t: Transaction) =>
        [csvCell(t.id), csvCell(t.type), csvCell(t.category), t.amount, csvCell(t.date), csvCell(t.description)].join(',')
      )
      .join('\n');
    const blob = new Blob(['\uFEFF' + headers + rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Expense_Report_${todayStr()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const buildReply = (q: string): string => {
    const lower = q.toLowerCase();
    const expenseEntries = toNumberEntries(categoryExpenses);
    const overs = toNumberEntries(budgets)
      .map(([cat, limit]) => ({ cat, limit, over: (categoryExpenses[cat] || 0) - limit }))
      .filter((x) => x.limit > 0 && x.over > 0)
      .sort((a, b) => b.over - a.over);
    const overTotal = overs.reduce((sum, x) => sum + x.over, 0);

    if (/\b(most|highest|biggest|top)\b/.test(lower)) {
      if (expenseEntries.length === 0) {
        return `📭 No expenses recorded for ${currentMonthName} yet, so there is nothing to rank.`;
      }
      const [maxCat, maxVal] = expenseEntries.reduce<[string, number]>(
        (best, cur) => (cur[1] > best[1] ? cur : best),
        ['', 0]
      );
      return `📊 Based on your data, you spent the most on **${maxCat}** at **${inr(maxVal)}**, which accounts for **${percentOf(maxVal, totalExpenses)}%** of your total spending in ${currentMonthName}.`;
    }

    const mentioned = EXPENSE_CATEGORIES.find((c) => lower.includes(c.name.toLowerCase()));
    if (mentioned && /(how much|spent|spend)/.test(lower)) {
      const spent = categoryExpenses[mentioned.name] || 0;
      const limit = budgets[mentioned.name] || 0;
      const limitText =
        limit > 0
          ? spent > limit
            ? ` That is **${inr(spent - limit)} over** your ${inr(limit)} limit.`
            : ` You have **${inr(limit - spent)}** left of your ${inr(limit)} limit.`
          : ' No limit is set for this category.';
      return `${mentioned.icon} You spent **${inr(spent)}** on **${mentioned.name}** in ${currentMonthName} (${percentOf(spent, totalExpenses)}% of all spending).${limitText}`;
    }

    if (/(save|saving|budget|suggest|tip)/.test(lower)) {
      const numberMatch = q.match(/(\d[\d,]*)/);
      const target = numberMatch ? Number(numberMatch[1].replace(/,/g, '')) : 0;
      const food = categoryExpenses['Food'] || 0;
      const shopping = categoryExpenses['Shopping'] || 0;

      const lines = [
        overs.length > 0
          ? `1. **Bring overspent categories back to their limits:** ${overs
            .map((o) => `${o.cat} (${inr(o.over)} over)`)
            .join(', ')} — that alone frees up **${inr(overTotal)}**.`
          : '1. **No category is over its limit** — great discipline. Keep it up!',
        `2. **Shopping (${inr(shopping)}):** try a 48-hour cooling-off rule for non-essential buys.`,
        `3. **Food (${inr(food)}):** planning meals ahead and cooking a few more days a week usually trims this noticeably.`,
        '4. **Entertainment:** consolidate or pause overlapping subscriptions.'
      ];
      let goalLine = '';
      if (target >= 100) {
        goalLine =
          overTotal >= target
            ? `\n\n🎯 Fixing the overspent categories would already cover your ${inr(target)} goal.`
            : `\n\n🎯 For your ${inr(target)} goal, overspending covers ${inr(overTotal)}; the remaining ${inr(target - overTotal)} has to come from trimming other categories.`;
      }
      return `💡 **Savings ideas based on ${currentMonthName}'s spending:**\n\n${lines.join('\n')}${goalLine}`;
    }

    if (/(health|summary|status|audit)/.test(lower)) {
      const rawScore =
        5 +
        Math.max(-3, Math.min(3, savingsRate / 10)) +
        (overallMonthlyBudget > 0 && totalExpenses > overallMonthlyBudget ? -1.5 : 1.5) -
        Math.min(2, overs.length * 0.5);
      const score = Math.max(0, Math.min(10, rawScore)).toFixed(1);
      const statusLine =
        overallMonthlyBudget > 0 && totalExpenses > overallMonthlyBudget
          ? '⚠️ Alert: You have currently exceeded your allocated monthly budget.'
          : '✅ You are within your overall monthly budget.';
      return `🌟 **Financial Health Score: ${score}/10**\n\n• **Savings Rate:** ${savingsRate}%\n• **Net Cashflow:** ${inr(netSavings)}\n• **Budget Utilization:** ${budgetUtilization}%\n• **Categories over limit:** ${overs.length}\n${statusLine}\n\n*Score is a simple estimate from savings rate, budget usage and category limits.*`;
    }

    if (/(income|salary|earn)/.test(lower)) {
      const top = toNumberEntries(incomeByCategory).sort((a, b) => b[1] - a[1])[0];
      const topText = top ? `, mostly from **${top[0]}** (${inr(top[1])})` : '';
      return `💰 Your total recorded income for ${currentMonthName} is **${inr(totalIncome)}**${topText}.`;
    }

    return `✨ In ${currentMonthName} you earned **${inr(totalIncome)}** and spent **${inr(totalExpenses)}**, leaving **${inr(netSavings)}**. Try asking: *"Where did I spend the most?"*, *"How much did I spend on food?"* or *"How can I save ₹3,000?"*`;
  };

  const askAI = (queryText?: string) => {
    const q = (queryText ?? aiInput).trim();
    if (!q) return;

    setChatMessages((prev: ChatMessage[]) => [...prev, { sender: 'user', text: q }]);
    setAiInput('');

    const reply = buildReply(q);
    const id = window.setTimeout(() => {
      setChatMessages((prev: ChatMessage[]) => [...prev, { sender: 'ai', text: reply }]);
    }, 400);
    timersRef.current.push(id);
  };

  const tabClass = (tab: Tab) =>
    `px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${activeTab === tab ? 'bg-emerald-500 text-slate-950 font-semibold shadow' : 'text-slate-300 hover:text-white'
    }`;

  const handleSaveProfile = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfile({
      name: profileDraft.name.trim(),
      email: profileDraft.email.trim(),
      phone: profileDraft.phone.trim(),
      role: profileDraft.role.trim(),
      location: profileDraft.location.trim(),
      age: profileDraft.age.trim()
    });
    setIsEditingProfile(false);
  };

  const handleSignIn = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSignedInEmail(loginEmail.trim());
    setLoginPassword('');
    setIsSignedIn(true);
  };

  const handleGoogleDemoSignIn = () => {
    setSignedInEmail('Google demo account');
    setIsSignedIn(true);
  };

  if (!isSignedIn) {
    return (
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-10 text-slate-100">
        <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-teal-500/10 blur-3xl" />

        <section className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl shadow-black/40 md:grid-cols-2">
          <div className="hidden flex-col justify-between bg-gradient-to-br from-emerald-500 via-teal-600 to-slate-900 p-10 md:flex">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950/20 text-2xl font-black text-white">
              ₹
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-100">SmartSpend</p>
              <h1 className="mt-4 text-4xl font-bold leading-tight text-white">Make every rupee count.</h1>
              <p className="mt-4 max-w-sm text-sm leading-6 text-emerald-50">
                Keep your spending, savings, and salary cycle in one clear view.
              </p>
            </div>
            <p className="text-xs text-emerald-100/80">Your personal finance workspace</p>
          </div>

          <div className="p-6 sm:p-10">
            <div className="mb-8 flex items-center gap-3 md:hidden">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-400 text-xl font-black text-slate-950">₹</div>
              <div>
                <p className="font-bold text-white">SmartSpend</p>
                <p className="text-xs text-slate-400">Personal finance tracker</p>
              </div>
            </div>

            <p className="text-sm font-semibold text-emerald-400">Welcome back</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">Sign in</h2>
            <p className="mt-2 text-sm text-slate-400">Enter your details to open your finance dashboard.</p>

            <form className="mt-8 space-y-5" onSubmit={handleSignIn}>
              <div>
                <label htmlFor="login-email" className="mb-2 block text-sm font-medium text-slate-200">Email address</label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  required
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                />
              </div>
              <div>
                <label htmlFor="login-password" className="mb-2 block text-sm font-medium text-slate-200">Password</label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showLoginPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={loginPassword}
                    onChange={(event) => setLoginPassword(event.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-12 text-sm text-black outline-none transition placeholder:text-slate-500 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((visible) => !visible)}
                    aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showLoginPassword}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-600 transition hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
                  >
                    {showLoginPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                className="w-full rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-emerald-500/10 transition hover:bg-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
              >
                Sign in to SmartSpend
              </button>
            </form>

            <div className="my-6 flex items-center gap-3" aria-hidden="true">
              <div className="h-px flex-1 bg-slate-700" />
              <span className="text-xs uppercase tracking-wide text-slate-500">or</span>
              <div className="h-px flex-1 bg-slate-700" />
            </div>
            <button
              type="button"
              onClick={handleGoogleDemoSignIn}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-700 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              <span aria-hidden="true" className="text-lg font-bold text-blue-600">G</span>
              Continue with Google (demo)
            </button>

            <p className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-200/90">
              Demo sign-in only: email/password and Google buttons do not verify identity or secure your data. Use sample details only; connect a real authentication service before using real accounts.
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="finance-app min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-30 px-4 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-slate-950 font-black text-xl">
            ₹
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              SmartSpend <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">Pro</span>
            </h1>
            <p className="text-xs text-slate-400 hidden sm:block">Intelligent Personal Expense Tracker & AI Advisor</p>
          </div>
        </div>

        <nav className="order-last w-full sm:order-none sm:w-auto overflow-x-auto flex items-center gap-1 sm:gap-2 bg-slate-800/60 p-1 rounded-xl border border-slate-700/60 text-xs sm:text-sm">
          {NAV_TABS.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={tabClass(tab.id)}>
              {tab.label}
            </button>
          ))}
          <button
            onClick={() => setActiveTab('ai-advisor')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'ai-advisor' ? 'bg-purple-500 text-white font-semibold shadow-lg shadow-purple-500/25' : 'text-purple-300 hover:text-purple-200'
              }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI Advisor
          </button>
        </nav>

        <div className="flex items-center gap-2">
          <span className="hidden max-w-40 truncate text-xs text-slate-400 lg:block" title={signedInEmail}>{signedInEmail}</span>
          <button
            onClick={() => handleOpenAdd('expense')}
            aria-label="Add expense"
            className="flex items-center gap-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold transition"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Expense</span>
          </button>
          <button
            onClick={() => handleOpenAdd('income')}
            aria-label="Add income"
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3.5 py-1.5 rounded-lg text-xs font-bold transition shadow-md shadow-emerald-500/20"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Income</span>
          </button>
          <button
            onClick={() => {
              setLoginEmail(signedInEmail.includes('@') ? signedInEmail : '');
              setLoginPassword('');
              setIsSignedIn(false);
            }}
            className="rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/10 hover:text-emerald-200"
          >
            Sign in
          </button>
          <button
            onClick={() => {
              setIsSignedIn(false);
              setSignedInEmail('');
              setLoginEmail('');
            }}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {smartAlerts.length > 0 && !alertsDismissed && (
          <section className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-950">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-700" />
              <div className="flex-1">
                <p className="font-semibold">
                  {overBudgetCategories.length} {overBudgetCategories.length === 1 ? 'category' : 'categories'} over budget
                  {' · '}{nearBudgetCategories.length} nearing limit
                </p>
                <p className="text-xs mt-1">
                  {overBudgetCategories.length > 0
                    ? overBudgetCategories.map(([category, limit]) => `${category} ${inr((categoryExpenses[category] || 0) - limit)} over`).join(' · ')
                    : 'No categories are over budget.'}
                </p>
                <div className="flex items-center gap-4 mt-2">
                  <button onClick={() => setShowAlertDetails((value) => !value)} className="text-xs font-semibold underline underline-offset-2">
                    {showAlertDetails ? 'Hide details' : 'Review budgets'}
                  </button>
                  <button onClick={() => setAlertsDismissed(true)} className="text-xs">Dismiss</button>
                </div>
              </div>
            </div>
            {showAlertDetails && (
              <div className="mt-3 pt-3 border-t border-amber-200 space-y-3">
                {overBudgetCategories.map(([category, limit]) => {
                  const spent = categoryExpenses[category] || 0;
                  const counted = budgetTransactions.filter((tx) => tx.type === 'expense' && tx.category === category);
                  return (
                    <div key={category} className="text-xs">
                      <p className="font-semibold">{category}: limit {inr(limit)} · spent {inr(spent)} · {inr(spent - limit)} over</p>
                      <p className="mt-0.5">Period: {budgetPeriod === 'salary-cycle' ? `${cycleWindow.start} to ${cycleWindow.end}` : currentMonthName}</p>
                      <p className="mt-0.5">Counted: {counted.length ? counted.map((tx) => tx.description).join(', ') : 'No matching transactions'}</p>
                      <div className="flex gap-3 mt-1.5">
                        <button onClick={() => setIsBudgetModalOpen(true)} className="font-semibold underline">Adjust limit</button>
                        <button onClick={() => { setActiveTab('transactions'); setFilterCategory(category); setFilterType('expense'); }} className="font-semibold underline">Review transactions</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {activeTab === 'dashboard' && (
          <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="pb-1">
              <p className="text-sm font-semibold text-emerald-700">Your money, in focus</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                Welcome{profile.name.trim() ? `, ${profile.name.trim()}` : ' to SmartSpend'}
              </h1>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-900 p-5 text-white shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 text-2xl font-black text-slate-950 shadow-lg shadow-emerald-500/20">
                    {profile.name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'P'}
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Personal profile</p>
                    <h2 className="mt-1 text-2xl font-bold text-white">{profile.name || 'Add your name'}</h2>
                    <p className="text-sm text-slate-200">{profile.role || 'Add your job title'}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setProfileDraft(profile);
                    setIsEditingProfile((editing) => !editing);
                  }}
                  className="self-start rounded-lg border border-emerald-300/40 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-white/10"
                >
                  {isEditingProfile ? 'Close editor' : 'Edit profile'}
                </button>
              </div>

              {isEditingProfile && (
                <form onSubmit={handleSaveProfile} className="mt-5 rounded-xl border border-white/15 bg-slate-950/30 p-4">
                  <h3 className="mb-4 text-sm font-semibold text-white">Your personal details</h3>
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <label htmlFor="profile-name" className="mb-1.5 block text-xs font-medium text-slate-200">Full name</label>
                      <input id="profile-name" required value={profileDraft.name} onChange={(event) => setProfileDraft({ ...profileDraft, name: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" />
                    </div>
                    <div>
                      <label htmlFor="profile-email" className="mb-1.5 block text-xs font-medium text-slate-200">Email</label>
                      <input id="profile-email" type="email" required value={profileDraft.email} onChange={(event) => setProfileDraft({ ...profileDraft, email: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" />
                    </div>
                    <div>
                      <label htmlFor="profile-phone" className="mb-1.5 block text-xs font-medium text-slate-200">Phone</label>
                      <input id="profile-phone" type="tel" value={profileDraft.phone} onChange={(event) => setProfileDraft({ ...profileDraft, phone: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" />
                    </div>
                    <div>
                      <label htmlFor="profile-role" className="mb-1.5 block text-xs font-medium text-slate-200">Job title</label>
                      <input id="profile-role" value={profileDraft.role} onChange={(event) => setProfileDraft({ ...profileDraft, role: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" />
                    </div>
                    <div>
                      <label htmlFor="profile-location" className="mb-1.5 block text-xs font-medium text-slate-200">Location</label>
                      <input id="profile-location" value={profileDraft.location} onChange={(event) => setProfileDraft({ ...profileDraft, location: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" />
                    </div>
                    <div>
                      <label htmlFor="profile-age" className="mb-1.5 block text-xs font-medium text-slate-200">Age</label>
                      <input id="profile-age" type="number" min="1" max="120" value={profileDraft.age} onChange={(event) => setProfileDraft({ ...profileDraft, age: event.target.value })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-black outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20" />
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button type="button" onClick={() => setIsEditingProfile(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10">Cancel</button>
                    <button type="submit" className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-emerald-300">Save profile</button>
                  </div>
                </form>
              )}

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-300">Email</p>
                  <p className="mt-1 text-sm font-medium text-white">{profile.email || 'Not added'}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-300">Phone</p>
                  <p className="mt-1 text-sm font-medium text-white">{profile.phone || 'Not added'}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-300">Location</p>
                  <p className="mt-1 text-sm font-medium text-white">{profile.location || 'Not added'}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-300">Age</p>
                  <p className="mt-1 text-sm font-medium text-white">{profile.age ? `${profile.age} years` : 'Not added'}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide font-semibold text-emerald-700">Salary cycle</p>
                <h2 className="text-lg font-bold text-slate-900">{cycleWindow.start} to {cycleWindow.end}</h2>
              </div>
              <button onClick={() => setIsBudgetModalOpen(true)} className="text-xs font-semibold text-emerald-700 underline underline-offset-2">Cycle settings</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              <div><p className="text-xs text-slate-500">Salary received</p><p className="mt-1 font-bold text-slate-900">{inr(cycleIncome)}</p><p className="text-[11px] text-slate-500">All income in cycle</p></div>
              <div><p className="text-xs text-slate-500">Fixed bills due</p><p className="mt-1 font-bold text-slate-900">{inr(fixedBillsDue)}</p><p className="text-[11px] text-slate-500">{upcomingBills.length} unpaid recurring bills</p></div>
              <div><p className="text-xs text-slate-500">Variable spending</p><p className="mt-1 font-bold text-slate-900">{inr(cycleVariableSpending)}</p><p className="text-[11px] text-slate-500">Recorded flexible expenses</p></div>
              <div><p className="text-xs text-slate-500">Savings planned</p><p className="mt-1 font-bold text-slate-900">{inr(plannedSavings)}</p><p className="text-[11px] text-slate-500">Set aside this cycle</p></div>
              <button onClick={() => setShowSafeSpendDetails((value) => !value)} className="text-left p-3 -m-3 rounded-lg hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700">
                <p className="text-xs text-emerald-800 font-semibold">Safe to spend</p><p className={`mt-1 font-bold ${safeToSpend < 0 ? 'text-rose-700' : 'text-emerald-800'}`}>{inr(safeToSpend)}</p><p className="text-[11px] text-emerald-800 underline">See calculation</p>
              </button>
              <div><p className="text-xs text-slate-500">Next payday</p><p className="mt-1 font-bold text-slate-900">{new Date(`${cycleWindow.nextPayday}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p><p className="text-[11px] text-slate-500">{nextPaydaySalary ? `Expected ${inr(nextPaydaySalary.amount)}` : 'Add expected salary in recurring items'}</p></div>
            </div>
            {showSafeSpendDetails && (
              <div className="border-t border-slate-200 pt-3 text-xs text-slate-700 space-y-1">
                <p>Recorded cycle income: <strong>{inr(cycleIncome)}</strong> · recorded expenses: <strong>{inr(cycleExpenses)}</strong></p>
                <p>Upcoming unpaid bills: <strong>{inr(fixedBillsDue)}</strong> · planned savings: <strong>{inr(plannedSavings)}</strong></p>
                <p className="font-semibold">{inr(cycleIncome)} − {inr(cycleExpenses)} − {inr(fixedBillsDue)} − {inr(plannedSavings)} = {inr(safeToSpend)}</p>
                {upcomingBills.length > 0 && <p>Bills included: {upcomingBills.map((item) => `${item.description} ${inr(item.amount)} (${item.nextDate})`).join(' · ')}</p>}
              </div>
            )}
          </section>
        )}

        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl relative overflow-hidden group hover:border-slate-700 transition">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
                  <span>Income minus expenses this cycle</span>
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <Wallet className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  {inr(cycleIncome - cycleExpenses)}
                </div>
                <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                  Based on recorded entries from {cycleWindow.start} to today.
                </p>
                <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition" />
              </div>

              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl relative overflow-hidden group hover:border-slate-700 transition">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
                  <span>Income ({currentMonthName})</span>
                  <div className="w-7 h-7 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center">
                    <ArrowDownRight className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-teal-400 tracking-tight">
                  +{inr(totalIncome)}
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  From {monthTransactions.filter((t) => t.type === 'income').length} income entries
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl relative overflow-hidden group hover:border-slate-700 transition">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
                  <span>Expenses ({currentMonthName})</span>
                  <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-rose-400 tracking-tight">
                  -{inr(totalExpenses)}
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Across {Object.keys(categoryExpenses).length} categories
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl relative overflow-hidden group hover:border-slate-700 transition">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
                  <span>Monthly Budget</span>
                  <button
                    onClick={() => setIsBudgetModalOpen(true)}
                    className="text-[11px] text-emerald-400 hover:underline cursor-pointer"
                  >
                    Adjust
                  </button>
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  {inr(overallMonthlyBudget)}
                </div>
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Used: {budgetUtilization}%</span>
                    <span className={remainingBudget < 0 ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                      {remainingBudget < 0 ? `Over by ${inr(Math.abs(remainingBudget))}` : `Left ${inr(remainingBudget)}`}
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${budgetUtilization > 95 ? 'bg-rose-500' : budgetUtilization > 75 ? 'bg-amber-400' : 'bg-emerald-500'
                        }`}
                      style={{ width: `${budgetUtilization}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div><h3 className="font-semibold text-slate-900">Due soon</h3><p className="text-xs text-slate-500">Expected recurring items. Not counted as paid until recorded.</p></div>
                <button onClick={() => { setFormData({ ...emptyForm('expense'), saveRecurring: true }); setIsModalOpen(true); }} className="text-xs font-semibold text-emerald-700 underline underline-offset-2">Add recurring item</button>
              </div>
              {dueSoonItems.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {dueSoonItems.map((item) => (
                    <div key={item.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0"><p className="font-medium text-sm text-slate-900">{item.description} <span className="text-xs text-slate-500">· {item.category}</span></p><p className="text-xs text-slate-500">{item.nextDate} · {item.daysUntil < 0 ? `Overdue by ${Math.abs(item.daysUntil)} days` : item.daysUntil === 0 ? 'Due today' : `Due in ${item.daysUntil} days`}</p></div>
                      <div className="flex items-center gap-3"><span className="text-sm font-semibold text-slate-900">{inr(item.amount)}{item.amountMayVary ? ' est.' : ''}</span><button onClick={() => handleMarkRecurringPaid(item)} className="min-h-10 px-3 text-xs font-semibold text-emerald-800 border border-emerald-200 rounded-lg hover:bg-emerald-50">Mark paid</button></div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-slate-500">No recurring income or bills due soon. Expected items stay separate from recorded transactions.</p>}
            </section>

            <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3 mb-4"><div><h3 className="font-semibold text-slate-900">Savings goals</h3><p className="text-xs text-slate-500">Transfers here do not count as spending.</p></div><button onClick={() => setShowGoalForm((value) => !value)} className="text-xs font-semibold text-emerald-700 underline underline-offset-2">{showGoalForm ? 'Cancel' : 'Add goal'}</button></div>
              {showGoalForm && <form onSubmit={handleSaveGoal} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-4 p-3 bg-slate-50 rounded-lg"><input aria-label="Goal name" required placeholder="Goal name" value={goalForm.name} onChange={(event) => setGoalForm((prev) => ({ ...prev, name: event.target.value }))} className="input-field" /><input aria-label="Goal target" required min="1" type="number" placeholder="Target amount" value={goalForm.target} onChange={(event) => setGoalForm((prev) => ({ ...prev, target: event.target.value }))} className="input-field" /><input aria-label="Already saved" min="0" type="number" placeholder="Already saved" value={goalForm.saved} onChange={(event) => setGoalForm((prev) => ({ ...prev, saved: event.target.value }))} className="input-field" /><div className="flex gap-2"><input aria-label="Monthly contribution" min="0" type="number" placeholder="Monthly plan" value={goalForm.monthlyContribution} onChange={(event) => setGoalForm((prev) => ({ ...prev, monthlyContribution: event.target.value }))} className="input-field min-w-0" /><button className="px-3 min-h-10 bg-emerald-700 text-white rounded-lg text-xs font-semibold">Save</button></div></form>}
              {savingsGoals.length > 0 ? <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{savingsGoals.map((goal) => <div key={goal.id} className="border border-slate-200 rounded-lg p-4"><div className="flex justify-between gap-2"><p className="font-semibold text-sm text-slate-900">{goal.name}</p><button aria-label={`Remove ${goal.name} goal`} onClick={() => setSavingsGoals((prev) => prev.filter((entry) => entry.id !== goal.id))} className="text-xs text-rose-700">Remove</button></div><p className="text-xs text-slate-600 mt-1">{inr(goal.saved)} of {inr(goal.target)} · {inr(goal.monthlyContribution)} planned monthly</p><div className="h-2 mt-3 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-600" style={{ width: `${Math.min(100, percentOf(goal.saved, goal.target))}%` }} /></div><div className="flex gap-2 mt-3"><input aria-label={`Contribution to ${goal.name}`} type="number" min="0.01" value={goalContribution[goal.id] || ''} onChange={(event) => setGoalContribution((prev) => ({ ...prev, [goal.id]: event.target.value }))} placeholder="Add saved amount" className="input-field" /><button onClick={() => { const amount = Number(goalContribution[goal.id]); if (amount > 0) { setSavingsGoals((prev) => prev.map((entry) => entry.id === goal.id ? { ...entry, saved: entry.saved + amount } : entry)); setGoalContribution((prev) => ({ ...prev, [goal.id]: '' })); } }} className="px-3 min-h-10 text-xs font-semibold bg-slate-100 text-slate-800 rounded-lg">Add</button></div></div>)}</div> : <p className="text-sm text-slate-500">Create a goal to track a target, saved amount, and monthly contribution.</p>}
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h3 className="font-semibold text-white text-base">Category Budget Status</h3>
                    <p className="text-xs text-slate-400">Live tracker against your monthly category caps</p>
                  </div>
                  <button
                    onClick={() => setActiveTab('budgets')}
                    className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium"
                  >
                    View All <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-4">
                  {Object.keys(budgets).slice(0, 5).map((cat) => {
                    const spent = categoryExpenses[cat] || 0;
                    const limit = budgets[cat];
                    const percent = Math.min(100, percentOf(spent, limit));
                    const isOver = limit > 0 && spent > limit;
                    const match = EXPENSE_CATEGORIES.find((c) => c.name === cat);

                    return (
                      <div key={cat} className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs">
                          <span className="flex items-center gap-2 text-slate-300 font-medium">
                            <span>{match?.icon || '📁'}</span> {cat}
                          </span>
                          <span className="text-slate-400">
                            <span className={isOver ? 'text-rose-400 font-bold' : 'text-slate-200'}>
                              {inr(spent)}
                            </span>
                            {' '}/ {inr(limit)}
                            {isOver && (
                              <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 font-medium">
                                +{inr(spent - limit)} over
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 rounded-full ${isOver ? 'bg-rose-500' : percent >= 80 ? 'bg-amber-400' : 'bg-emerald-500'
                              }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-between">
                <div className="w-full text-left mb-2">
                  <h3 className="font-semibold text-white text-base">Expense Distribution</h3>
                  <p className="text-xs text-slate-400">Category-wise share</p>
                </div>

                <div className="w-full h-48 relative flex items-center justify-center">
                  {pieChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieChartData}
                          innerRadius={50}
                          outerRadius={75}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {pieChartData.map((entry) => (
                            <Cell key={`cell-${entry.name}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip formatter={rupeeFormatter} contentStyle={TOOLTIP_STYLE} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-xs text-slate-500">No expenses recorded this month.</p>
                  )}
                </div>

                <div className="w-full flex flex-wrap gap-2 justify-center mt-2">
                  {pieChartData.slice(0, 4).map((entry) => (
                    <div key={entry.name} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span>{entry.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div>
                  <h3 className="font-semibold text-white text-base">Recent Transactions</h3>
                  <p className="text-xs text-slate-400">Your latest logged financial movements</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('transactions')}
                    className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700"
                  >
                    View All ({transactions.length})
                  </button>
                  <button
                    onClick={handleExportCSV}
                    className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1.5 rounded-lg border border-emerald-500/20 font-medium transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    CSV Export
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-800/50 text-slate-400 uppercase font-semibold text-[10px] tracking-wider">
                    <tr>
                      <th className="py-3 px-4 rounded-l-lg">Transaction</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4 text-center rounded-r-lg">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {sortedTransactions.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500">
                          No transactions yet. Add your first one with the buttons above.
                        </td>
                      </tr>
                    )}
                    {sortedTransactions.slice(0, 5).map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3.5 px-4 font-medium text-white">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tx.type === 'income' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                              }`}>
                              {tx.type === 'income' ? <ArrowDownRight className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                            </div>
                            <div>
                              <span className="block font-medium">{tx.description}</span>
                              <span className="text-[10px] text-slate-500 capitalize">{tx.type}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300 font-medium text-[11px]">
                            {tx.category}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-400">{tx.date}</td>
                        <td className="py-3.5 px-4 text-right font-bold">
                          <span className={tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}>
                            {tx.type === 'income' ? '+' : '-'}{inr(Number(tx.amount))}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleOpenEdit(tx)}
                              aria-label={`Edit ${tx.description}`}
                              className="p-1 hover:text-white text-slate-400 transition"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(tx.id)}
                              aria-label={`Delete ${tx.description}`}
                              className="p-1 hover:text-rose-400 text-slate-400 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-2xl">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search by description or category..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as 'all' | TxType)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none"
                >
                  <option value="all">All Types</option>
                  <option value="income">Income Only</option>
                  <option value="expense">Expenses Only</option>
                </select>

                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none"
                >
                  <option value="all">All Categories</option>
                  <optgroup label="Expenses">
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Income">
                    {INCOME_CATEGORIES.map((c) => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </optgroup>
                </select>

                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-xl text-xs font-medium border border-slate-700 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </button>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Showing {filteredTransactions.length} of {transactions.length} entries
                </span>
                <button
                  onClick={() => handleOpenAdd('expense')}
                  className="text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 shadow"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Add Transaction
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-800/40 text-slate-400 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Description</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {filteredTransactions.length > 0 ? (
                      filteredTransactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-800/30 transition">
                          <td className="py-3.5 px-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${tx.type === 'income' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}>
                              {tx.type}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-medium text-white">{tx.description}</td>
                          <td className="py-3.5 px-4">
                            <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-slate-300">
                              {tx.category}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-400">{tx.date}</td>
                          <td className="py-3.5 px-4 text-right font-bold text-sm">
                            <span className={tx.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}>
                              {tx.type === 'income' ? '+' : '-'}{inr(Number(tx.amount))}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-3">
                              <button
                                onClick={() => handleOpenEdit(tx)}
                                className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition"
                                title="Edit"
                                aria-label={`Edit ${tx.description}`}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(tx.id)}
                                className="p-1.5 hover:bg-rose-500/10 rounded text-slate-400 hover:text-rose-400 transition"
                                title="Delete"
                                aria-label={`Delete ${tx.description}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">
                          No transactions matching your criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'budgets' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="space-y-2">
                <span className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">Overall Financial Cap</span>
                <h2 className="text-2xl font-bold text-white">Monthly Target: {inr(overallMonthlyBudget)}</h2>
                <p className="text-xs text-slate-400 max-w-lg">
                  Set and manage limits for your entire monthly spending. Alerts appear at the top of the page when you reach 85% and 100% of a limit.
                </p>
              </div>
              <button
                onClick={() => setIsBudgetModalOpen(true)}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 self-start md:self-auto"
              >
                <Edit2 className="w-4 h-4" />
                Configure Budgets
              </button>
            </div>

            <section className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-2 md:grid-cols-5 gap-4" aria-label="Budget summary">
              <div><p className="text-xs text-slate-500">Total monthly budget</p><p className="font-bold text-slate-900 mt-1">{inr(overallMonthlyBudget)}</p></div>
              <div><p className="text-xs text-slate-500">Total spent</p><p className="font-bold text-slate-900 mt-1">{inr(budgetPeriodExpenses)}</p></div>
              <div><p className="text-xs text-slate-500">Total remaining</p><p className={`font-bold mt-1 ${overallMonthlyBudget - budgetPeriodExpenses < 0 ? 'text-rose-700' : 'text-emerald-800'}`}>{inr(overallMonthlyBudget - budgetPeriodExpenses)}</p></div>
              <div><p className="text-xs text-slate-500">Over limit</p><p className="font-bold text-rose-700 mt-1">{overBudgetCategories.length} categories</p></div>
              <div><p className="text-xs text-slate-500">Near limit</p><p className="font-bold text-amber-800 mt-1">{nearBudgetCategories.length} categories</p></div>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">Period: {budgetPeriod === 'salary-cycle' ? `${cycleWindow.start} to ${cycleWindow.end}` : currentMonthName}</p>
              <label className="flex items-center gap-2 text-xs text-slate-600">Sort categories
                <select aria-label="Sort budget categories" value={budgetSort} onChange={(event) => setBudgetSort(event.target.value as typeof budgetSort)} className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800">
                  <option value="over">Over budget first</option><option value="closest">Closest to limit</option><option value="highest">Highest spending</option><option value="alphabetical">Alphabetical</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sortedBudgetCategories.map((catObj) => {
                const cat = catObj.name;
                const spent = categoryExpenses[cat] || 0;
                const limit = budgets[cat] || 0;
                const hasLimit = limit > 0;
                const percent = Math.min(100, percentOf(spent, limit));
                const isOver = hasLimit && spent > limit;
                const remaining = limit - spent;

                return (
                  <div key={cat} className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4 hover:border-slate-700 transition">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-lg">
                          {catObj.icon}
                        </div>
                        <div>
                          <h4 className="font-semibold text-white text-sm">{cat}</h4>
                          <span className="text-[11px] text-slate-400">Limit: {inr(limit)}</span>
                        </div>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${isOver ? 'bg-rose-500/10 text-rose-700 border border-rose-500/20' : percent >= alertThresholds.notice ? 'bg-amber-100 text-amber-800' : 'bg-slate-800 text-slate-700'
                        }`}>
                        {!hasLimit ? 'No limit' : isOver ? `Over budget · ${percentOf(spent, limit)}%` : percent >= alertThresholds.notice ? `Near limit · ${percentOf(spent, limit)}%` : `Under budget · ${percentOf(spent, limit)}%`}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>Spent: {inr(spent)}</span>
                        <span className={hasLimit && remaining < 0 ? 'text-rose-400 font-semibold' : 'text-slate-300'}>
                          {!hasLimit
                            ? 'No limit set'
                            : remaining < 0
                              ? `Over by ${inr(Math.abs(remaining))}`
                              : `${inr(remaining)} left`}
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${isOver ? 'bg-rose-500' : percent >= 80 ? 'bg-amber-400' : 'bg-emerald-500'
                            }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-semibold text-white text-base">Recurring Subscriptions & Bills</h3>
                </div>
                <span className="text-xs bg-slate-800 text-slate-400 px-2.5 py-1 rounded-full">Sample data</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-400">Apartment Rent</div>
                  <div className="text-base font-bold text-white mt-1">₹15,000 / mo</div>
                  <span className="text-[10px] text-emerald-400">Due 1st of month</span>
                </div>
                <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-400">Netflix & Entertainment</div>
                  <div className="text-base font-bold text-white mt-1">₹649 / mo</div>
                  <span className="text-[10px] text-emerald-400">Due 14th of month</span>
                </div>
                <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-400">High-speed Fiber Broadband</div>
                  <div className="text-base font-bold text-white mt-1">₹1,180 / mo</div>
                  <span className="text-[10px] text-emerald-400">Due 11th of month</span>
                </div>
                <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-400">Vehicle EMI</div>
                  <div className="text-base font-bold text-white mt-1">₹6,500 / mo</div>
                  <span className="text-[10px] text-emerald-400">Due 5th of month</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <div className="mb-4">
                  <h3 className="font-semibold text-white text-base">Monthly Comparison (Income vs Expense)</h3>
                  <p className="text-xs text-slate-400">Past months without entries show sample figures</p>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="month" stroke="#64748b" textAnchor="middle" />
                      <YAxis stroke="#64748b" />
                      <RechartsTooltip formatter={rupeeFormatter} contentStyle={TOOLTIP_STYLE} />
                      <Legend />
                      <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="expense" name="Expense" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                <div className="mb-4">
                  <h3 className="font-semibold text-white text-base">Category-wise Expenditure</h3>
                  <p className="text-xs text-slate-400">Breakdown of {currentMonthName}'s expenses</p>
                </div>
                <div className="h-64 w-full">
                  {pieChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieChartData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius={85}
                          dataKey="value"
                          label={renderPieLabel}
                        >
                          {pieChartData.map((entry) => (
                            <Cell key={`cell-${entry.name}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip formatter={rupeeFormatter} contentStyle={TOOLTIP_STYLE} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-slate-500">
                      No expenses recorded this month.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <div className="mb-4">
                <h3 className="font-semibold text-white text-base">Daily Spending Trend</h3>
                <p className="text-xs text-slate-400">Expenditure flow timeline throughout {currentMonthName}</p>
              </div>
              <div className="h-64 w-full">
                {trendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="date" stroke="#64748b" />
                      <YAxis stroke="#64748b" />
                      <RechartsTooltip formatter={rupeeFormatter} contentStyle={TOOLTIP_STYLE} />
                      <Line
                        type="monotone"
                        dataKey="amount"
                        name="Daily Spend"
                        stroke="#8b5cf6"
                        strokeWidth={3}
                        dot={{ fill: '#8b5cf6', r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-500">
                    No expenses recorded this month.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'ai-advisor' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col h-[650px] shadow-2xl">
            <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Smart Expense AI Advisor</h3>
                  <p className="text-[11px] text-slate-400">Answers computed from your actual expense records</p>
                </div>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Data Connected
              </span>
            </div>

            <div ref={chatBodyRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 max-w-2xl ${msg.sender === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
                >
                  <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${msg.sender === 'user' ? 'bg-emerald-500 text-slate-950' : 'bg-purple-600 text-white'
                    }`}>
                    {msg.sender === 'user' ? 'ME' : 'AI'}
                  </div>
                  <div className={`p-4 rounded-2xl text-xs sm:text-sm whitespace-pre-wrap leading-relaxed ${msg.sender === 'user'
                    ? 'bg-emerald-500 text-slate-950 font-medium rounded-tr-none'
                    : 'bg-slate-800/80 text-slate-200 border border-slate-700/60 rounded-tl-none'
                    }`}>
                    {msg.sender === 'ai' ? renderRichText(msg.text) : msg.text}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-4 py-2 border-t border-slate-800/60 bg-slate-950/40 flex flex-wrap gap-2">
              <button
                onClick={() => askAI('Where did I spend the most money this month?')}
                className="text-[11px] bg-slate-800 hover:bg-slate-700 text-purple-300 hover:text-purple-200 px-3 py-1.5 rounded-full border border-purple-500/20 transition"
              >
                🔍 Top expense this month?
              </button>
              <button
                onClick={() => askAI('How can I save ₹3,000 this month?')}
                className="text-[11px] bg-slate-800 hover:bg-slate-700 text-purple-300 hover:text-purple-200 px-3 py-1.5 rounded-full border border-purple-500/20 transition"
              >
                💡 How to save ₹3,000?
              </button>
              <button
                onClick={() => askAI('Give me a summary of my financial health')}
                className="text-[11px] bg-slate-800 hover:bg-slate-700 text-purple-300 hover:text-purple-200 px-3 py-1.5 rounded-full border border-purple-500/20 transition"
              >
                📊 Financial health audit
              </button>
            </div>

            <div className="p-3 sm:p-4 border-t border-slate-800 bg-slate-950 flex gap-2">
              <input
                type="text"
                placeholder="Ask financial questions e.g. 'How much did I spend on food?'"
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && askAI()}
                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-purple-500"
              />
              <button
                onClick={() => askAI()}
                aria-label="Send message"
                className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center shadow-lg shadow-purple-600/30"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </main>

      {activeTab === 'dashboard' && (
        <footer className="w-full border-t border-slate-800 bg-slate-900/70 px-4 py-6 text-center sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">A thought for your finances</p>
          <blockquote className="mx-auto mt-2 max-w-2xl text-sm italic text-slate-200">
            “{welcomeQuote}”
          </blockquote>
        </footer>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setIsModalOpen(false)}
              aria-label="Close"
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white mb-1">
              {editingTransaction ? 'Edit Transaction' : 'Record Transaction'}
            </h3>
            <p className="text-xs text-slate-400 mb-5">Keep your finances accurate and up-to-date.</p>

            <form onSubmit={handleSaveTransaction} className="space-y-4">
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, type: 'expense', category: 'Food' }))}
                  className={`py-2 rounded-lg text-xs font-bold transition ${formData.type === 'expense' ? 'bg-rose-500 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                >
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, type: 'income', category: 'Salary' }))}
                  className={`py-2 rounded-lg text-xs font-bold transition ${formData.type === 'income' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
                    }`}
                >
                  Income
                </button>
              </div>

              <div>
                <label htmlFor="transaction-amount" className="block text-xs font-medium text-slate-400 mb-1">Amount (₹)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">₹</span>
                  <input
                    id="transaction-amount"
                    type="number"
                    required
                    min="0.01"
                    step="0.01"
                    placeholder="e.g. 1500"
                    value={formData.amount}
                    onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="transaction-category" className="block text-xs font-medium text-slate-400 mb-1">Category</label>
                <select
                  id="transaction-category"
                  value={formData.category}
                  onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  {(formData.type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES).map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="transaction-description" className="block text-xs font-medium text-slate-400 mb-1">Description / Notes</label>
                <input
                  id="transaction-description"
                  type="text"
                  required
                  placeholder="e.g. Weekend dinner, client payment..."
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label htmlFor="transaction-date" className="block text-xs font-medium text-slate-400 mb-1">Date</label>
                <input
                  id="transaction-date"
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-1/2 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`w-1/2 py-2.5 rounded-xl text-xs font-bold shadow-lg transition ${formData.type === 'expense'
                    ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/20'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                    }`}
                >
                  {editingTransaction ? 'Save Changes' : 'Record Transaction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isBudgetModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsBudgetModalOpen(false)}
              aria-label="Close"
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white mb-1">Budget Setup</h3>
            <p className="text-xs text-slate-400 mb-5">Adjust monthly caps to maintain financial discipline.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-emerald-400 mb-1">
                  Overall Monthly Budget (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={overallMonthlyBudget}
                  onChange={(e) => setOverallMonthlyBudget(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-slate-600">Payday day of month
                  <input aria-label="Payday day of month" type="number" min="1" max="31" value={paydayDay} onChange={(event) => setPaydayDay(Math.min(31, Math.max(1, Number(event.target.value) || 1)))} className="input-field mt-1" />
                </label>
                <label className="text-xs text-slate-600">Savings planned per cycle (₹)
                  <input aria-label="Savings planned per cycle" type="number" min="0" value={plannedSavings} onChange={(event) => setPlannedSavings(Math.max(0, Number(event.target.value) || 0))} className="input-field mt-1" />
                </label>
                <label className="text-xs text-slate-600">Budget resets by
                  <select aria-label="Budget period" value={budgetPeriod} onChange={(event) => setBudgetPeriod(event.target.value as BudgetPeriod)} className="input-field mt-1"><option value="calendar-month">Calendar month</option><option value="salary-cycle">Salary cycle</option></select>
                </label>
                <label className="text-xs text-slate-600">Near-limit notice at (%)
                  <input aria-label="Near limit threshold" type="number" min="1" max="99" value={alertThresholds.notice} onChange={(event) => setAlertThresholds((prev) => ({ ...prev, notice: Math.max(1, Math.min(99, Number(event.target.value) || 80)) }))} className="input-field mt-1" />
                </label>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <span className="text-xs font-semibold text-slate-300 block mb-3">Category-Specific Limits</span>
                <div className="space-y-3">
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <div key={cat.name} className="flex items-center justify-between gap-3">
                      <span className="text-xs text-slate-400 flex items-center gap-1.5 w-32">
                        <span>{cat.icon}</span> {cat.name}
                      </span>
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">₹</span>
                        <input
                          type="number"
                          min="0"
                          value={budgets[cat.name] || 0}
                          onChange={(e) =>
                            setBudgets((prev) => ({
                              ...prev,
                              [cat.name]: Math.max(0, Number(e.target.value) || 0)
                            }))
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-7 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setIsBudgetModalOpen(false)}
                className="w-full mt-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 py-2.5 rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-500/20"
              >
                Apply Budgets
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
