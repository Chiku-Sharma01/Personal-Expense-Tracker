import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Wallet, AlertTriangle, PlusCircle, Trash2, Edit2, Search, Download, Sparkles,
  ArrowUpRight, ArrowDownRight, RefreshCw, ChevronRight, Send, X
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, Legend
} from 'recharts';

// ---------- Types ----------
type TxType = 'income' | 'expense';
type Tab = 'dashboard' | 'transactions' | 'budgets' | 'analytics' | 'ai-advisor';
type Budgets = Record<string, number>;

interface Transaction {
  id: string;
  type: TxType;
  category: string;
  amount: number;
  date: string; // YYYY-MM-DD (local date)
  description: string;
}

interface FormState {
  type: TxType;
  amount: string; // kept as string while typing
  category: string;
  date: string;
  description: string;
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

interface SavedState {
  transactions: Transaction[];
  budgets: Budgets;
  overallMonthlyBudget: number;
}

// ---------- Helpers ----------
const STORAGE_KEY = 'smartspend:v1';

const pad2 = (n: number) => String(n).padStart(2, '0');

// Local calendar date. (toISOString() is UTC and gives the wrong day for part of
// every day in time zones ahead of / behind UTC.)
const toLocalDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayStr = () => toLocalDateStr(new Date());

const fmt = (n: number) => n.toLocaleString('en-IN');
const inr = (n: number) => `${n < 0 ? '-' : ''}₹${fmt(Math.abs(n))}`;

// Safe percentage: never divides by zero.
const percentOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

const sumBy = (list: Transaction[], type: TxType) =>
  list.filter((t) => t.type === type).reduce((acc, t) => acc + Number(t.amount), 0);

const monthInfo = (monthsAgo: number) => {
  const d = new Date();
  d.setDate(1); // avoid day-overflow when subtracting months (e.g. 31 Mar -> "31 Feb")
  d.setMonth(d.getMonth() - monthsAgo);
  return {
    key: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`,
    short: d.toLocaleString('en-US', { month: 'short' }),
    long: d.toLocaleString('en-US', { month: 'long' })
  };
};

// CSV-safe cell: escapes quotes and neutralises spreadsheet formulas (=, +, -, @).
const csvCell = (value: string | number) => {
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

// Tiny renderer for the **bold** and *italic* markers used in AI replies.
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

// ---------- Seed data (dated relative to the current month so the demo always works) ----------
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

// Sample figures shown for past months that have no real transactions yet.
const SAMPLE_HISTORY = [
  { income: 45000, expense: 31000 }, // 3 months ago
  { income: 48000, expense: 34500 }, // 2 months ago
  { income: 52000, expense: 33000 } // last month
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

const toNumberEntries = <T extends Record<string, number>>(obj: T): Array<[string, number]> =>
  Object.entries(obj) as Array<[string, number]>;

const emptyForm = (type: TxType = 'expense'): FormState => ({
  type,
  amount: '',
  category: type === 'expense' ? 'Food' : 'Salary',
  date: todayStr(),
  description: ''
});

// ---------- Persistence (safe if storage is unavailable) ----------
const loadSaved = (): Partial<SavedState> => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const out: Partial<SavedState> = {};
    if (Array.isArray(parsed.transactions)) out.transactions = parsed.transactions;
    if (parsed.budgets && typeof parsed.budgets === 'object') out.budgets = parsed.budgets;
    if (typeof parsed.overallMonthlyBudget === 'number') out.overallMonthlyBudget = parsed.overallMonthlyBudget;
    return out;
  } catch {
    return {};
  }
};
const SAVED: Partial<SavedState> = typeof window !== 'undefined' ? loadSaved() : {};

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [transactions, setTransactions] = useState<Transaction[]>(SAVED.transactions ?? INITIAL_TRANSACTIONS);
  const [budgets, setBudgets] = useState<Budgets>({ ...INITIAL_BUDGETS, ...SAVED.budgets });
  const [overallMonthlyBudget, setOverallMonthlyBudget] = useState<number>(SAVED.overallMonthlyBudget ?? 40000);

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | TxType>('all');
  const [filterCategory, setFilterCategory] = useState('all');

  // Modal State for Add/Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [formData, setFormData] = useState<FormState>(() => emptyForm());

  // Budget Edit Modal
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);

  // AI Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      sender: 'ai',
      text: "👋 Hi! I'm your AI Smart Expense Assistant. Ask me anything about your cashflow, top spendings, or personalized tips to save money this month!"
    }
  ]);
  const [aiInput, setAiInput] = useState('');
  const chatBodyRef = useRef<HTMLDivElement | null>(null);
  const timersRef = useRef<number[]>([]);

  // ---------- Effects ----------
  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ transactions, budgets, overallMonthlyBudget })
      );
    } catch {
      /* storage unavailable (private mode / sandbox) – app still works in memory */
    }
  }, [transactions, budgets, overallMonthlyBudget]);

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

  // ---------- Calculations (budget stats are scoped to the current month) ----------
  const currentMonth = todayStr().slice(0, 7);
  const currentMonthName = monthInfo(0).long;

  const monthTransactions = useMemo(
    () => transactions.filter((t: Transaction) => t.date.startsWith(currentMonth)),
    [transactions, currentMonth]
  );

  const sortedTransactions = useMemo(
    () => [...transactions].sort((a: Transaction, b: Transaction) => b.date.localeCompare(a.date)),
    [transactions]
  );

  const totalIncome = useMemo(() => sumBy(monthTransactions, 'income'), [monthTransactions]);
  const totalExpenses = useMemo(() => sumBy(monthTransactions, 'expense'), [monthTransactions]);
  const allTimeBalance = useMemo(
    () => sumBy(transactions, 'income') - sumBy(transactions, 'expense'),
    [transactions]
  );

  const netSavings = totalIncome - totalExpenses;
  const savingsRate = percentOf(netSavings, totalIncome);
  const remainingBudget = overallMonthlyBudget - totalExpenses;
  const budgetUtilization = Math.min(100, percentOf(totalExpenses, overallMonthlyBudget));

  const categoryExpenses = useMemo(() => {
    const map: Record<string, number> = {};
    monthTransactions
      .filter((t) => t.type === 'expense')
      .forEach((t) => {
        map[t.category] = (map[t.category] || 0) + Number(t.amount);
      });
    return map;
  }, [monthTransactions]);

  const incomeByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    monthTransactions
      .filter((t) => t.type === 'income')
      .forEach((t) => {
        map[t.category] = (map[t.category] || 0) + Number(t.amount);
      });
    return map;
  }, [monthTransactions]);

  // Dynamic Alerts & Overspending Warnings
  const smartAlerts = useMemo(() => {
    const alerts: AlertItem[] = [];
    if (overallMonthlyBudget > 0) {
      if (totalExpenses > overallMonthlyBudget) {
        alerts.push({
          type: 'danger',
          title: 'Total Monthly Budget Exceeded!',
          message: `You have overspent by ${inr(totalExpenses - overallMonthlyBudget)} across all categories.`
        });
      } else if (budgetUtilization >= 85) {
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
      } else if (spent / limit >= 0.85) {
        alerts.push({
          type: 'warning',
          title: `${cat} Approaching Limit`,
          message: `You've consumed ${percentOf(spent, limit)}% of your ${inr(limit)} budget.`
        });
      }
    });

    // Most serious first
    return alerts.sort((a, b) => (a.type === b.type ? 0 : a.type === 'danger' ? -1 : 1));
  }, [categoryExpenses, budgets, totalExpenses, overallMonthlyBudget, budgetUtilization]);

  // Chart Data: Donut Breakdown
  const pieChartData = useMemo(
    () =>
      Object.entries(categoryExpenses).map(([name, value]) => {
        const match = EXPENSE_CATEGORIES.find((c) => c.name === name);
        return { name, value, color: match ? match.color : '#8884d8' };
      }),
    [categoryExpenses]
  );

  // Chart Data: Monthly Comparison (real data when a past month has transactions, sample figures otherwise)
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

  // Chart Data: Expense trend (current month)
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

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return sortedTransactions.filter((tx: Transaction) => {
      const matchesSearch =
        tx.description.toLowerCase().includes(term) || tx.category.toLowerCase().includes(term);
      const matchesType = filterType === 'all' || tx.type === filterType;
      const matchesCategory = filterCategory === 'all' || tx.category === filterCategory;
      return matchesSearch && matchesType && matchesCategory;
    });
  }, [sortedTransactions, searchTerm, filterType, filterCategory]);

  // ---------- Handlers ----------
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
      description: tx.description
    });
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    setTransactions((prev: Transaction[]) => prev.filter((item: Transaction) => item.id !== id));
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
      amount
    };

    if (editingTransaction) {
      setTransactions((prev: Transaction[]) =>
        prev.map((item: Transaction) => (item.id === editingTransaction.id ? { ...item, ...payload } : item))
      );
    } else {
      const newTx: Transaction = {
        id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        ...payload
      };
      setTransactions((prev: Transaction[]) => [newTx, ...prev]);
    }
    setIsModalOpen(false);
  };

  const handleExportCSV = () => {
    const headers = 'ID,Type,Category,Amount,Date,Description\n';
    const rows = transactions
      .map((t: Transaction) =>
        [csvCell(t.id), csvCell(t.type), csvCell(t.category), t.amount, csvCell(t.date), csvCell(t.description)].join(',')
      )
      .join('\n');
    // BOM so Excel reads ₹ and other Unicode correctly
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

  // ---------- AI Assistant Query Engine ----------
  const buildReply = (q: string): string => {
    const lower = q.toLowerCase();
    const expenseEntries = toNumberEntries(categoryExpenses);
    const overs = toNumberEntries(budgets)
      .map(([cat, limit]) => ({ cat, limit, over: (categoryExpenses[cat] || 0) - limit }))
      .filter((x) => x.limit > 0 && x.over > 0)
      .sort((a, b) => b.over - a.over);
    const overTotal = overs.reduce((sum, x) => sum + x.over, 0);

    // 1) Biggest spending category
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

    // 2) "How much did I spend on <category>?"
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

    // 3) Saving tips
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

    // 4) Health / summary
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

    // 5) Income
    if (/(income|salary|earn)/.test(lower)) {
      const top = toNumberEntries(incomeByCategory).sort((a, b) => b[1] - a[1])[0];
      const topText = top ? `, mostly from **${top[0]}** (${inr(top[1])})` : '';
      return `💰 Your total recorded income for ${currentMonthName} is **${inr(totalIncome)}**${topText}.`;
    }

    // 6) Fallback
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
    `px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
      activeTab === tab ? 'bg-emerald-500 text-slate-950 font-semibold shadow' : 'text-slate-300 hover:text-white'
    }`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
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

        {/* Navigation Tabs */}
        <nav className="order-last w-full sm:order-none sm:w-auto overflow-x-auto flex items-center gap-1 sm:gap-2 bg-slate-800/60 p-1 rounded-xl border border-slate-700/60 text-xs sm:text-sm">
          {NAV_TABS.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={tabClass(tab.id)}>
              {tab.label}
            </button>
          ))}
          <button
            onClick={() => setActiveTab('ai-advisor')}
            className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'ai-advisor' ? 'bg-purple-500 text-white font-semibold shadow-lg shadow-purple-500/25' : 'text-purple-300 hover:text-purple-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI Advisor
          </button>
        </nav>

        {/* Quick Actions */}
        <div className="flex items-center gap-2">
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
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Alerts Banner (if any) */}
        {smartAlerts.length > 0 && (
          <div className="space-y-2">
            {smartAlerts.slice(0, 2).map((alert) => (
              <div
                key={alert.title}
                className={`p-3.5 rounded-xl border flex items-start gap-3 text-sm backdrop-blur transition-all ${
                  alert.type === 'danger'
                    ? 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                    : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                }`}
              >
                <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${alert.type === 'danger' ? 'text-rose-400' : 'text-amber-400'}`} />
                <div className="flex-1">
                  <span className="font-semibold block">{alert.title}</span>
                  <p className="text-xs opacity-90">{alert.message}</p>
                </div>
              </div>
            ))}
            {smartAlerts.length > 2 && (
              <button
                onClick={() => setActiveTab('budgets')}
                className="text-xs text-slate-400 hover:text-white underline underline-offset-2"
              >
                +{smartAlerts.length - 2} more alert{smartAlerts.length - 2 > 1 ? 's' : ''} — review budgets
              </button>
            )}
          </div>
        )}

        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Top Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Current Balance */}
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl relative overflow-hidden group hover:border-slate-700 transition">
                <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-2">
                  <span>Current Balance</span>
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <Wallet className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  {inr(allTimeBalance)}
                </div>
                <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                  Saved this month: <span className={netSavings >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                    {savingsRate}% of income
                  </span>
                </p>
                <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition" />
              </div>

              {/* Total Income */}
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

              {/* Total Expenses */}
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

              {/* Monthly Budget Tracker */}
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
                      className={`h-full transition-all duration-500 ${
                        budgetUtilization > 95 ? 'bg-rose-500' : budgetUtilization > 75 ? 'bg-amber-400' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${budgetUtilization}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Middle Section: Quick Chart Preview & Category Budget Progress */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Category Spending Progress */}
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
                            className={`h-full transition-all duration-500 rounded-full ${
                              isOver ? 'bg-rose-500' : percent >= 80 ? 'bg-amber-400' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Donut Snapshot */}
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

            {/* Recent Transactions Table Preview */}
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
                          {/* flex lives on an inner div: display:flex on a <td> breaks table layout */}
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              tx.type === 'income' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
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

        {/* TAB 2: TRANSACTIONS MANAGEMENT */}
        {activeTab === 'transactions' && (
          <div className="space-y-6">
            {/* Header & Controls */}
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

            {/* Transactions List */}
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
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              tx.type === 'income' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
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

        {/* TAB 3: BUDGETS & RECURRING */}
        {activeTab === 'budgets' && (
          <div className="space-y-6">
            {/* Overall Monthly Budget Card */}
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

            {/* Category Budgets Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {EXPENSE_CATEGORIES.map((catObj) => {
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
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        isOver ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-slate-800 text-slate-300'
                      }`}>
                        {hasLimit ? `${percentOf(spent, limit)}%` : 'No limit'}
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
                          className={`h-full rounded-full transition-all duration-500 ${
                            isOver ? 'bg-rose-500' : percent >= 80 ? 'bg-amber-400' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Recurring Expenses Card (static reference examples) */}
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

        {/* TAB 4: CHARTS & ANALYTICS */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Monthly Income vs Expense Bar Chart */}
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

              {/* Category Spending Pie Chart */}
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

            {/* Daily Expense Trend Line Chart */}
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

        {/* TAB 5: AI FINANCIAL ADVISOR */}
        {activeTab === 'ai-advisor' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col h-[650px] shadow-2xl">
            {/* Header */}
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

            {/* Chat Body */}
            <div ref={chatBodyRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex gap-3 max-w-2xl ${msg.sender === 'user' ? 'ml-auto flex-row-reverse' : ''}`}
                >
                  <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                    msg.sender === 'user' ? 'bg-emerald-500 text-slate-950' : 'bg-purple-600 text-white'
                  }`}>
                    {msg.sender === 'user' ? 'ME' : 'AI'}
                  </div>
                  <div className={`p-4 rounded-2xl text-xs sm:text-sm whitespace-pre-wrap leading-relaxed ${
                    msg.sender === 'user'
                      ? 'bg-emerald-500 text-slate-950 font-medium rounded-tr-none'
                      : 'bg-slate-800/80 text-slate-200 border border-slate-700/60 rounded-tl-none'
                  }`}>
                    {msg.sender === 'ai' ? renderRichText(msg.text) : msg.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Action Prompt Pills */}
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

            {/* Input Bar */}
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

      {/* MODAL: ADD / EDIT TRANSACTION */}
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
              {/* Type Switcher */}
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, type: 'expense', category: 'Food' }))}
                  className={`py-2 rounded-lg text-xs font-bold transition ${
                    formData.type === 'expense' ? 'bg-rose-500 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Expense
                </button>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, type: 'income', category: 'Salary' }))}
                  className={`py-2 rounded-lg text-xs font-bold transition ${
                    formData.type === 'income' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Income
                </button>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Amount (₹)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">₹</span>
                  <input
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

              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Category</label>
                <select
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

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Description / Notes</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Weekend dinner, client payment..."
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Date</label>
                <input
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
                  className={`w-1/2 py-2.5 rounded-xl text-xs font-bold shadow-lg transition ${
                    formData.type === 'expense'
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

      {/* MODAL: BUDGET SETTINGS */}
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
