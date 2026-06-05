import { useState, useEffect, useCallback } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { supabase } from '../lib/supabase';
import { useWorkspace } from '../lib/WorkspaceContext';
import { useBudgets } from '../lib/useBudgets';
import { Colors } from '../constants/colors';
import { TransactionCard } from '../components/TransactionCard';
import { Transaction, TransactionType } from '../lib/types';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, 'History'>;
}

type Period = 'month' | '3months' | 'year' | 'all';

const PERIOD_LABELS: Record<Period, string> = {
  month:   'Ce mois',
  '3months': '3 mois',
  year:    'Cette année',
  all:     'Tout',
};

const TYPE_LABELS: Record<TransactionType, string> = {
  expense: 'Dépense',
  income:  'Revenu',
  debt:    'Dette',
  transfer:'Transfert',
};

function periodToDateRange(period: Period): { from: string; to: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const to = fmt(now);
  if (period === 'all') return { from: '2000-01-01', to };
  if (period === 'month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: fmt(from), to };
  }
  if (period === '3months') {
    const from = new Date(now);
    from.setMonth(from.getMonth() - 3);
    return { from: fmt(from), to };
  }
  return { from: `${now.getFullYear()}-01-01`, to };
}

function buildPdfHtml(rows: Transaction[], wsName: string, periodLabel: string): string {
  const totalExpense = rows.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const totalIncome  = rows.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const balance = totalIncome - totalExpense;
  const typeLabel: Record<string, string> = { expense: 'Dépense', income: 'Revenu', debt: 'Dette', transfer: 'Transfert' };
  const rowsHtml = rows.map(t => `
    <tr>
      <td>${t.date}</td>
      <td>${t.description_clean}</td>
      <td>${t.category}</td>
      <td>${typeLabel[t.type] ?? t.type}</td>
      <td style="text-align:right;color:${t.type === 'income' ? '#2D7A4F' : '#C0392B'}">
        ${t.type === 'income' ? '+' : '-'}${t.amount.toFixed(2)} ${t.currency}
        ${t.is_recurring ? ' ↻' : ''}
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>EasyCompta — ${wsName}</title>
  <style>
    body{font-family:-apple-system,Arial,sans-serif;margin:40px;color:#1A1A2E;font-size:13px}
    h1{font-size:22px;color:#7C9EFF;margin:0 0 4px}
    .sub{font-size:13px;color:#888;margin-bottom:28px}
    .summary{display:flex;gap:20px;margin-bottom:28px}
    .card{background:#F8F9FF;border-radius:10px;padding:14px 20px}
    .label{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px}
    .val{font-size:18px;font-weight:700;margin-top:3px}
    table{width:100%;border-collapse:collapse}
    th{text-align:left;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;padding:8px 10px;border-bottom:2px solid #EAEAEA}
    td{padding:9px 10px;border-bottom:1px solid #F4F4F4}
    .footer{font-size:10px;color:#ccc;text-align:center;margin-top:32px}
  </style></head><body>
  <h1>EasyCompta</h1>
  <div class="sub">${wsName} · ${periodLabel} · Généré le ${new Date().toLocaleDateString('fr-CH')}</div>
  <div class="summary">
    <div class="card"><div class="label">Dépenses</div><div class="val" style="color:#C0392B">-${totalExpense.toFixed(2)}</div></div>
    <div class="card"><div class="label">Revenus</div><div class="val" style="color:#2D7A4F">+${totalIncome.toFixed(2)}</div></div>
    <div class="card"><div class="label">Solde</div><div class="val" style="color:${balance >= 0 ? '#2D7A4F' : '#C0392B'}">${balance >= 0 ? '+' : ''}${balance.toFixed(2)}</div></div>
  </div>
  <table><thead><tr>
    <th>Date</th><th>Description</th><th>Catégorie</th><th>Type</th><th style="text-align:right">Montant</th>
  </tr></thead><tbody>${rowsHtml}</tbody></table>
  <div class="footer">↻ = transaction récurrente</div>
  </body></html>`;
}

function buildCsv(rows: Transaction[]): string {
  const headers = ['Date', 'Description', 'Montant', 'Devise', 'Type', 'Catégorie', 'Paiement', 'Ajouté par'];
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = rows.map(t => [
    t.date,
    escape(t.description_clean),
    t.amount.toFixed(2),
    t.currency,
    t.type,
    escape(t.category),
    t.payment_method,
    escape(t.created_by_email ?? ''),
  ].join(','));
  return [headers.join(','), ...lines].join('\n');
}

export function HistoryScreen({ navigation }: Props) {
  const { activeWorkspace } = useWorkspace();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('all');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TransactionType | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<{ description: string; amount: string; category: string; type: TransactionType; date: string }>({ description: '', amount: '', category: '', type: 'expense', date: '' });
  const [exporting, setExporting] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsTab, setAnalyticsTab] = useState<'cat' | 'trend'>('cat');
  const [budgetTarget, setBudgetTarget] = useState<{ cat: string; current: string } | null>(null);
  const { budgets, load: loadBudgets, setBudget, removeBudget } = useBudgets(activeWorkspace?.id);

  const isSharedWs = activeWorkspace?.type === 'family' || activeWorkspace?.type === 'business';

  const loadTransactions = useCallback(async () => {
    if (!activeWorkspace) { setLoading(false); return; }
    setLoading(true);
    setLoadError(false);
    try {
      const { from, to } = periodToDateRange(period);
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('workspace_id', activeWorkspace.id)
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data) setTransactions(data as Transaction[]);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace, period]);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);
  useEffect(() => { loadBudgets(); }, [loadBudgets]);

  function handleStartEdit(tx: Transaction) {
    const [y, m, d] = tx.date.split('-');
    setEditForm({
      description: tx.description_clean,
      amount: tx.amount.toString(),
      category: tx.category,
      type: tx.type,
      date: `${d}.${m}.${y}`,
    });
    setIsEditing(true);
  }

  async function handleSaveEdit() {
    if (!selectedTransaction) return;
    const amount = parseFloat(editForm.amount);
    if (isNaN(amount) || amount <= 0) return;
    const parts = editForm.date.split('.');
    const isoDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : selectedTransaction.date;
    const updates = {
      description_clean: editForm.description.trim(),
      amount,
      category: editForm.category.trim(),
      type: editForm.type,
      date: isoDate,
    };
    await supabase.from('transactions').update(updates).eq('id', selectedTransaction.id);
    const updated = { ...selectedTransaction, ...updates };
    setTransactions(prev => prev.map(t => t.id === selectedTransaction.id ? updated : t));
    setSelectedTransaction(updated);
    setIsEditing(false);
  }

  async function handleDelete(id: string) {
    await supabase.from('transactions').delete().eq('id', id);
    setTransactions(prev => prev.filter(t => t.id !== id));
  }

  async function handleExportPdf() {
    if (transactions.length === 0) return;
    setExporting(true);
    try {
      const wsName = activeWorkspace?.name ?? 'EasyCompta';
      const html = buildPdfHtml(transactions, wsName, PERIOD_LABELS[period]);

      if (Platform.OS === 'web') {
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;top:-200%;left:-200%;width:0;height:0;opacity:0';
        document.body.appendChild(iframe);
        iframe.onload = () => {
          iframe.contentWindow?.print();
          setTimeout(() => document.body.removeChild(iframe), 500);
        };
        iframe.setAttribute('srcdoc', html);
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        const date = new Date().toISOString().slice(0, 7);
        const filename = `EasyCompta_${wsName}_${date}.pdf`.replace(/\s/g, '_');
        const dest = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.moveAsync({ from: uri, to: dest });
        await Sharing.shareAsync(dest, { mimeType: 'application/pdf', dialogTitle: 'Exporter PDF' });
      }
    } catch {
      // silent fail
    } finally {
      setExporting(false);
    }
  }

  async function handleExport() {
    if (transactions.length === 0) return;
    setExporting(true);
    try {
      const csv = buildCsv(transactions);
      const date = new Date().toISOString().slice(0, 7);
      const filename = `EasyCompta_${activeWorkspace?.name ?? 'export'}_${date}.csv`.replace(/\s/g, '_');

      if (Platform.OS === 'web') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const path = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
        await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Exporter CSV' });
      }
    } catch {
      // silent fail — no error modal needed for export
    } finally {
      setExporting(false);
    }
  }

  function formatDateLong(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('fr-CH', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  const filtered = transactions.filter(t => {
    const matchSearch = search.trim() === '' ||
      t.description_clean.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === null || t.type === typeFilter;
    return matchSearch && matchType;
  });

  const totalExpense = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const totalIncome  = filtered.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);

  const categoryStats = Object.entries(
    filtered.filter(t => t.type === 'expense').reduce<Record<string, number>>((acc, t) => {
      acc[t.category] = (acc[t.category] ?? 0) + t.amount;
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const maxCat = categoryStats[0]?.[1] ?? 1;

  const monthlyStats = Object.entries(
    transactions.reduce<Record<string, { expense: number; income: number }>>((acc, t) => {
      const key = t.date.slice(0, 7);
      if (!acc[key]) acc[key] = { expense: 0, income: 0 };
      if (t.type === 'expense') acc[key].expense += t.amount;
      if (t.type === 'income')  acc[key].income  += t.amount;
      return acc;
    }, {})
  )
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-6);
  const maxMonthly = Math.max(...monthlyStats.map(([, v]) => Math.max(v.expense, v.income)), 1);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Historique</Text>
        <View style={styles.exportRow}>
          <TouchableOpacity
            style={[styles.analyticsBtn, showAnalytics && styles.analyticsBtnActive]}
            onPress={() => setShowAnalytics(v => !v)}
          >
            <Text style={[styles.analyticsBtnText, showAnalytics && styles.analyticsBtnTextActive]}>
              📊
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.exportButton, exporting && { opacity: 0.6 }]}
            onPress={handleExportPdf}
            disabled={exporting || transactions.length === 0}
          >
            <Text style={styles.exportText}>{exporting ? '···' : '↓ PDF'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.exportButtonCSV, exporting && { opacity: 0.6 }]}
            onPress={handleExport}
            disabled={exporting || transactions.length === 0}
          >
            <Text style={styles.exportTextCSV}>{exporting ? '···' : '↓ CSV'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Period filter */}
      <View style={styles.periodRow}>
        {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.periodChip, period === p && styles.periodChipActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
              {PERIOD_LABELS[p]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher…"
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      {/* Type filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.typeFilterScroll}
        contentContainerStyle={styles.typeFilterRow}
      >
        {([null, 'expense', 'income', 'debt', 'transfer'] as (TransactionType | null)[]).map(t => {
          const active = typeFilter === t;
          const CHIP_COLORS: Record<string, { bg: string; text: string }> = {
            expense:  { bg: Colors.expenseLight,  text: Colors.expense },
            income:   { bg: Colors.incomeLight,   text: '#1B5E20' },
            debt:     { bg: Colors.debtLight,     text: '#7A4F00' },
            transfer: { bg: Colors.primaryLight,  text: Colors.primaryDark },
          };
          const activePalette = t ? CHIP_COLORS[t] : { bg: Colors.primary, text: '#FFFFFF' };
          const bg        = active ? activePalette.bg   : '#E8EAF0';
          const textColor = active ? activePalette.text : '#4A5568';
          return (
            <TouchableOpacity
              key={t ?? 'all'}
              style={[styles.typeChip, { backgroundColor: bg }]}
              onPress={() => setTypeFilter(t)}
            >
              <Text style={[styles.typeChipText, { color: textColor, fontWeight: active ? '800' : '600' }]}>
                {t === null ? 'Tout' : TYPE_LABELS[t]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Summary bar */}
      {filtered.length > 0 && (
        <View style={styles.summaryBar}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Dépenses</Text>
            <Text style={[styles.summaryValue, { color: Colors.expense }]}>
              -{totalExpense.toFixed(2)}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Revenus</Text>
            <Text style={[styles.summaryValue, { color: Colors.success }]}>
              +{totalIncome.toFixed(2)}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Solde</Text>
            <Text style={[styles.summaryValue, { color: Colors.text }]}>
              {(totalIncome - totalExpense).toFixed(2)}
            </Text>
          </View>
        </View>
      )}

      {/* Analytics panel */}
      {showAnalytics && (
        <View style={styles.analyticsPanel}>
          {/* Tabs */}
          <View style={styles.analyticsTabs}>
            <TouchableOpacity
              style={[styles.analyticsTabBtn, analyticsTab === 'cat' && styles.analyticsTabBtnActive]}
              onPress={() => setAnalyticsTab('cat')}
            >
              <Text style={[styles.analyticsTabText, analyticsTab === 'cat' && styles.analyticsTabTextActive]}>
                Catégories
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.analyticsTabBtn, analyticsTab === 'trend' && styles.analyticsTabBtnActive]}
              onPress={() => setAnalyticsTab('trend')}
            >
              <Text style={[styles.analyticsTabText, analyticsTab === 'trend' && styles.analyticsTabTextActive]}>
                Tendance
              </Text>
            </TouchableOpacity>
          </View>

          {analyticsTab === 'cat' ? (
            categoryStats.length === 0
              ? <Text style={styles.analyticsEmpty}>Aucune dépense sur cette période</Text>
              : <>
                  <Text style={styles.budgetHint}>Appuie longuement sur une catégorie pour définir un budget</Text>
                  {categoryStats.map(([cat, amount]) => {
                    const budget = budgets[cat];
                    const pct = budget ? Math.min(amount / budget, 1) : amount / maxCat;
                    const barColor = budget
                      ? pct >= 1 ? Colors.expense : pct >= 0.8 ? Colors.debt : Colors.primary
                      : Colors.primary;
                    return (
                      <TouchableOpacity
                        key={cat}
                        style={styles.catRow}
                        onLongPress={() => setBudgetTarget({ cat, current: budget ? budget.toString() : '' })}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.catName} numberOfLines={1}>{cat}</Text>
                        <View style={styles.catBarCol}>
                          <View style={styles.barTrack}>
                            <View style={[styles.barFill, { width: `${pct * 100}%` as any, backgroundColor: barColor }]} />
                          </View>
                          {budget ? (
                            <Text style={styles.budgetLabel}>{amount.toFixed(0)} / {budget} CHF</Text>
                          ) : null}
                        </View>
                        <Text style={[styles.catAmount, (budget !== undefined && amount >= budget) ? { color: Colors.expense } : null]}>
                          {amount.toFixed(0)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </>
          ) : (
            monthlyStats.length === 0
              ? <Text style={styles.analyticsEmpty}>Aucune donnée</Text>
              : monthlyStats.map(([month, { expense, income }]) => (
                <View key={month} style={styles.trendRow}>
                  <Text style={styles.trendMonth}>{month.slice(5)}/{month.slice(2, 4)}</Text>
                  <View style={styles.trendBars}>
                    <View style={styles.trendBarRow}>
                      <View style={[styles.trendBarExpense, { width: `${(expense / maxMonthly) * 100}%` as any }]} />
                    </View>
                    <View style={styles.trendBarRow}>
                      <View style={[styles.trendBarIncome,  { width: `${(income  / maxMonthly) * 100}%` as any }]} />
                    </View>
                  </View>
                  <View style={styles.trendAmounts}>
                    <Text style={styles.trendExpense}>-{expense.toFixed(0)}</Text>
                    <Text style={styles.trendIncome}>+{income.toFixed(0)}</Text>
                  </View>
                </View>
              ))
          )}
        </View>
      )}

      {loading ? (
        <View style={styles.centered}>
          <Text style={styles.loadingText}>Chargement…</Text>
        </View>
      ) : loadError ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={styles.emptyText}>Impossible de charger les transactions.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadTransactions}>
            <Text style={styles.retryButtonText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>{transactions.length === 0 ? '📭' : '🔍'}</Text>
          <Text style={styles.emptyText}>
            {transactions.length === 0 ? 'Aucune transaction sur cette période' : 'Aucun résultat'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TransactionCard
              transaction={item}
              onDelete={handleDelete}
              onPress={setSelectedTransaction}
              showCreator={isSharedWs}
            />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Transaction detail / edit modal */}
      <Modal
        visible={!!selectedTransaction}
        animationType="slide"
        transparent
        onRequestClose={() => { setIsEditing(false); setSelectedTransaction(null); }}
      >
        {selectedTransaction && (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalOverlay}
          >
            <View style={styles.modalCard}>
              <View style={styles.modalHandle} />

              {isEditing ? (
                /* ── Edit form ── */
                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={styles.editTitle}>Modifier la transaction</Text>

                  <Text style={styles.editLabel}>Date (JJ.MM.AAAA)</Text>
                  <TextInput
                    style={styles.editInput}
                    value={editForm.date}
                    onChangeText={v => setEditForm(f => ({ ...f, date: v }))}
                    placeholder="ex: 28.05.2025"
                    placeholderTextColor={Colors.textMuted}
                    keyboardType="numeric"
                  />

                  <Text style={styles.editLabel}>Description</Text>
                  <TextInput
                    style={styles.editInput}
                    value={editForm.description}
                    onChangeText={v => setEditForm(f => ({ ...f, description: v }))}
                    placeholder="Description"
                    placeholderTextColor={Colors.textMuted}
                  />

                  <Text style={styles.editLabel}>Montant</Text>
                  <TextInput
                    style={styles.editInput}
                    value={editForm.amount}
                    onChangeText={v => setEditForm(f => ({ ...f, amount: v }))}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={Colors.textMuted}
                  />

                  <Text style={styles.editLabel}>Catégorie</Text>
                  <TextInput
                    style={styles.editInput}
                    value={editForm.category}
                    onChangeText={v => setEditForm(f => ({ ...f, category: v }))}
                    placeholder="Catégorie"
                    placeholderTextColor={Colors.textMuted}
                  />

                  <Text style={styles.editLabel}>Type</Text>
                  <View style={styles.typeRow}>
                    {(['expense', 'income', 'debt', 'transfer'] as TransactionType[]).map(t => (
                      <TouchableOpacity
                        key={t}
                        style={[styles.typeBtn, editForm.type === t && styles.typeBtnActive]}
                        onPress={() => setEditForm(f => ({ ...f, type: t }))}
                      >
                        <Text style={[styles.typeBtnText, editForm.type === t && styles.typeBtnTextActive]}>
                          {TYPE_LABELS[t]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.editActions}>
                    <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsEditing(false)}>
                      <Text style={styles.cancelBtnText}>Annuler</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.saveBtn} onPress={handleSaveEdit}>
                      <Text style={styles.saveBtnText}>Enregistrer</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              ) : (
                /* ── Detail view ── */
                <>
                  <Text style={styles.modalAmount}>
                    {selectedTransaction.type === 'income' ? '+' : '-'}
                    {selectedTransaction.amount.toFixed(2)} {selectedTransaction.currency}
                  </Text>
                  <Text style={styles.modalDescription}>{selectedTransaction.description_clean}</Text>

                  {selectedTransaction.attachment_url ? (
                    <Image
                      source={{ uri: selectedTransaction.attachment_url }}
                      style={styles.attachmentImage}
                      resizeMode="cover"
                    />
                  ) : null}

                  <View style={styles.modalDetails}>
                    <DetailRow label="Catégorie"  value={selectedTransaction.category} />
                    <DetailRow label="Type"       value={TYPE_LABELS[selectedTransaction.type]} />
                    <DetailRow label="Date"       value={formatDateLong(selectedTransaction.date)} />
                    <DetailRow
                      label="Paiement"
                      value={
                        selectedTransaction.payment_method === 'cash' ? 'Espèces' :
                        selectedTransaction.payment_method === 'card' ? 'Carte' :
                        selectedTransaction.payment_method === 'transfer' ? 'Virement' : 'Inconnu'
                      }
                    />
                    {isSharedWs && selectedTransaction.created_by_email ? (
                      <DetailRow label="Ajouté par" value={selectedTransaction.created_by_email} />
                    ) : null}
                    {selectedTransaction.description_raw ? (
                      <DetailRow label="Phrase d'origine" value={`"${selectedTransaction.description_raw}"`} />
                    ) : null}
                  </View>

                  <TouchableOpacity style={styles.editButton} onPress={() => handleStartEdit(selectedTransaction)}>
                    <Text style={styles.editButtonText}>✏️ Modifier</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteModalButton}
                    onPress={() => {
                      Alert.alert(
                        'Supprimer',
                        'Supprimer cette transaction ?',
                        [
                          { text: 'Annuler', style: 'cancel' },
                          {
                            text: 'Supprimer', style: 'destructive',
                            onPress: () => {
                              handleDelete(selectedTransaction.id);
                              setSelectedTransaction(null);
                            },
                          },
                        ]
                      );
                    }}
                  >
                    <Text style={styles.deleteModalButtonText}>🗑 Supprimer</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.closeButton} onPress={() => setSelectedTransaction(null)}>
                    <Text style={styles.closeButtonText}>Fermer</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </KeyboardAvoidingView>
        )}
      </Modal>

      {/* Budget input modal */}
      <Modal
        visible={!!budgetTarget}
        animationType="fade"
        transparent
        onRequestClose={() => setBudgetTarget(null)}
      >
        {budgetTarget && (
          <View style={styles.budgetOverlay}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles.budgetCard}>
                <Text style={styles.budgetCardTitle}>Budget mensuel</Text>
                <Text style={styles.budgetCardCat}>{budgetTarget.cat}</Text>
                <TextInput
                  style={styles.editInput}
                  value={budgetTarget.current}
                  onChangeText={v => setBudgetTarget(t => t ? { ...t, current: v } : null)}
                  keyboardType="decimal-pad"
                  placeholder="Montant CHF"
                  placeholderTextColor={Colors.textMuted}
                  autoFocus
                />
                <View style={styles.editActions}>
                  {budgets[budgetTarget.cat] ? (
                    <TouchableOpacity style={styles.cancelBtn} onPress={() => {
                      removeBudget(budgetTarget.cat);
                      setBudgetTarget(null);
                    }}>
                      <Text style={[styles.cancelBtnText, { color: Colors.expense }]}>Supprimer</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={styles.cancelBtn} onPress={() => setBudgetTarget(null)}>
                      <Text style={styles.cancelBtnText}>Annuler</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.saveBtn} onPress={() => {
                    const amt = parseFloat(budgetTarget.current);
                    if (!isNaN(amt) && amt > 0) setBudget(budgetTarget.cat, amt);
                    setBudgetTarget(null);
                  }}>
                    <Text style={styles.saveBtnText}>Enregistrer</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        )}
      </Modal>
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={3}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backButton: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { fontSize: 20, color: Colors.text },
  title: { fontSize: 18, fontWeight: '700', color: Colors.text },
  searchRow: { paddingHorizontal: 16, marginBottom: 6 },
  searchInput: {
    backgroundColor: Colors.surface, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: Colors.text,
    borderWidth: 1, borderColor: Colors.border,
  },
  typeFilterScroll: { flexShrink: 0, marginBottom: 8 },
  typeFilterRow: { paddingHorizontal: 16, paddingVertical: 4, alignItems: 'center' },
  typeChip: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20,
    marginRight: 8,
  },
  typeChipText: { fontSize: 13 },

  exportRow: { flexDirection: 'row', gap: 8 },
  exportButton: {
    backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
  },
  exportText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  exportButtonCSV: {
    backgroundColor: Colors.primaryLight, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
  },
  exportTextCSV: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  periodRow: {
    flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 8,
  },
  periodChip: {
    flex: 1, paddingVertical: 7, borderRadius: 10,
    backgroundColor: Colors.surface, alignItems: 'center',
  },
  periodChipActive: { backgroundColor: Colors.primary },
  periodText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  periodTextActive: { color: '#FFFFFF' },

  summaryBar: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 8,
    backgroundColor: Colors.surface, borderRadius: 14, padding: 12,
  },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 4 },
  summaryLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  summaryValue: { fontSize: 14, fontWeight: '800' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: Colors.textSecondary, fontSize: 15 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', maxWidth: 200 },
  retryButton: {
    marginTop: 4, backgroundColor: Colors.primaryLight,
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12,
  },
  retryButtonText: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  listContent: { paddingVertical: 8, paddingBottom: 32 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 28, paddingBottom: 40,
  },
  modalHandle: {
    width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2,
    alignSelf: 'center', marginBottom: 24,
  },
  modalAmount: { fontSize: 36, fontWeight: '800', color: Colors.text, textAlign: 'center', marginBottom: 8 },
  modalDescription: { fontSize: 18, color: Colors.textSecondary, textAlign: 'center', marginBottom: 20 },
  attachmentImage: {
    width: '100%', height: 160, borderRadius: 12, marginBottom: 20,
  },
  modalDetails: { gap: 14, marginBottom: 28 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  detailLabel: { fontSize: 14, color: Colors.textMuted, flex: 1 },
  detailValue: { fontSize: 14, fontWeight: '600', color: Colors.text, flex: 2, textAlign: 'right' },
  editButton: {
    backgroundColor: Colors.primaryLight, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginBottom: 10,
  },
  editButtonText: { fontSize: 15, fontWeight: '700', color: Colors.primary },
  closeButton: {
    backgroundColor: Colors.surfaceAlt, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
  },
  closeButtonText: { fontSize: 16, fontWeight: '600', color: Colors.text },

  editTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 20, textAlign: 'center' },
  editLabel: { fontSize: 12, fontWeight: '600', color: Colors.textMuted, marginBottom: 6, textTransform: 'uppercase' },
  editInput: {
    backgroundColor: Colors.surfaceAlt, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: Colors.text, marginBottom: 16,
  },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  typeBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.surfaceAlt,
  },
  typeBtnActive: { backgroundColor: Colors.primary },
  typeBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  typeBtnTextActive: { color: '#FFFFFF' },
  editActions: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  cancelBtn: {
    flex: 1, backgroundColor: Colors.surfaceAlt, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: Colors.text },
  saveBtn: {
    flex: 2, backgroundColor: Colors.primary, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  analyticsBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  analyticsBtnActive: { backgroundColor: Colors.primary },
  analyticsBtnText: { fontSize: 16 },
  analyticsBtnTextActive: { fontSize: 16 },

  analyticsPanel: {
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: Colors.surface, borderRadius: 14, padding: 16,
  },
  catRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  catName: { fontSize: 12, color: Colors.textSecondary, width: 80 },
  barTrack: { flex: 1, height: 8, backgroundColor: Colors.surfaceAlt, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: Colors.primary, borderRadius: 4 },
  catAmount: { fontSize: 12, fontWeight: '700', color: Colors.text, width: 48, textAlign: 'right' },

  deleteModalButton: {
    backgroundColor: Colors.expenseLight, borderRadius: 14, paddingVertical: 14,
    alignItems: 'center', marginBottom: 10,
  },
  deleteModalButtonText: { fontSize: 15, fontWeight: '700', color: Colors.expense },

  budgetHint: { fontSize: 10, color: Colors.textMuted, textAlign: 'center', marginBottom: 10, fontStyle: 'italic' },
  catBarCol: { flex: 1, gap: 2 },
  budgetLabel: { fontSize: 9, color: Colors.textMuted },
  budgetOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', paddingHorizontal: 32,
  },
  budgetCard: {
    backgroundColor: Colors.surface, borderRadius: 20, padding: 24,
  },
  budgetCardTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, textAlign: 'center', marginBottom: 4 },
  budgetCardCat: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', marginBottom: 16 },

  analyticsTabs: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  analyticsTabBtn: {
    flex: 1, paddingVertical: 7, borderRadius: 10,
    backgroundColor: Colors.surfaceAlt, alignItems: 'center',
  },
  analyticsTabBtnActive: { backgroundColor: Colors.primary },
  analyticsTabText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  analyticsTabTextActive: { color: '#FFFFFF' },
  analyticsEmpty: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingVertical: 8 },

  trendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  trendMonth: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, width: 36 },
  trendBars: { flex: 1, gap: 3 },
  trendBarRow: { height: 7, backgroundColor: Colors.surfaceAlt, borderRadius: 4, overflow: 'hidden' },
  trendBarExpense: { height: 7, backgroundColor: Colors.expense, borderRadius: 4 },
  trendBarIncome:  { height: 7, backgroundColor: Colors.success, borderRadius: 4 },
  trendAmounts: { width: 64, alignItems: 'flex-end', gap: 2 },
  trendExpense: { fontSize: 10, fontWeight: '700', color: Colors.expense },
  trendIncome:  { fontSize: 10, fontWeight: '700', color: Colors.success },
});
