import { useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../lib/supabase';
import { useWorkspace } from '../lib/WorkspaceContext';
import { useTheme } from '../lib/ThemeContext';
import { ColorTheme } from '../constants/colors';
import { Transaction, RecurrenceInterval } from '../lib/types';
import { RootStackParamList } from '../../App';
import { scheduleRecurringReminders } from '../lib/useNotifications';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Recurring'>;
}

const INTERVAL_LABELS: Record<RecurrenceInterval, string> = {
  daily: 'Quotidien',
  weekly: 'Hebdo',
  monthly: 'Mensuel',
  yearly: 'Annuel',
};

function advanceNextDue(fromDate: string, interval: RecurrenceInterval): string {
  const d = new Date(fromDate);
  switch (interval) {
    case 'daily':   d.setDate(d.getDate() + 1); break;
    case 'weekly':  d.setDate(d.getDate() + 7); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'yearly':  d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString().split('T')[0];
}

function isoToDMY(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function dmyToIso(dmy: string): string {
  const parts = dmy.split('.');
  return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : dmy;
}

function dueDays(nextDue: string, today: string): number {
  return Math.round((new Date(nextDue).getTime() - new Date(today).getTime()) / 86400000);
}

export function RecurringScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { activeWorkspace } = useWorkspace();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [editTarget, setEditTarget] = useState<Transaction | null>(null);
  const [editForm, setEditForm] = useState<{
    description: string; amount: string; currency: string;
    category: string; recurrence_interval: RecurrenceInterval; next_due_date: string;
  } | null>(null);

  const today = new Date().toISOString().split('T')[0];

  const load = useCallback(async () => {
    if (!activeWorkspace) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('workspace_id', activeWorkspace.id)
      .eq('is_recurring', true)
      .not('next_due_date', 'is', null)
      .order('next_due_date', { ascending: true });
    setTransactions((data ?? []) as Transaction[]);
    setLoading(false);
  }, [activeWorkspace]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleConfirm(tx: Transaction) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !activeWorkspace) return;
    const newNext = advanceNextDue(today, tx.recurrence_interval as RecurrenceInterval);
    await supabase.from('transactions').insert({
      date: today, amount: tx.amount, currency: tx.currency, type: tx.type,
      category: tx.category, payment_method: tx.payment_method, scope: tx.scope,
      workspace_id: activeWorkspace.id, description_raw: '',
      description_clean: tx.description_clean, has_attachment: false, attachment_url: null,
      created_by_email: user.email ?? '', user_id: user.id,
      is_recurring: true, recurrence_interval: tx.recurrence_interval, next_due_date: newNext,
    });
    await supabase.from('transactions').update({ next_due_date: newNext }).eq('id', tx.id);
    const updated = transactions.map(t => t.id === tx.id ? { ...t, next_due_date: newNext } : t);
    scheduleRecurringReminders(updated);
    load();
  }

  async function handleSkip(tx: Transaction) {
    const newNext = advanceNextDue(today, tx.recurrence_interval as RecurrenceInterval);
    await supabase.from('transactions').update({ next_due_date: newNext }).eq('id', tx.id);
    load();
  }

  function handleOpenEdit(tx: Transaction) {
    setEditTarget(tx);
    setEditForm({
      description: tx.description_clean,
      amount: tx.amount.toString(),
      currency: tx.currency,
      category: tx.category,
      recurrence_interval: tx.recurrence_interval as RecurrenceInterval,
      next_due_date: isoToDMY(tx.next_due_date!),
    });
  }

  async function handleSaveEdit() {
    if (!editTarget || !editForm) return;
    const amount = parseFloat(editForm.amount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return;
    await supabase.from('transactions').update({
      description_clean: editForm.description.trim(),
      amount,
      currency: editForm.currency,
      category: editForm.category.trim(),
      recurrence_interval: editForm.recurrence_interval,
      next_due_date: dmyToIso(editForm.next_due_date),
    }).eq('id', editTarget.id);
    setEditTarget(null);
    setEditForm(null);
    load();
  }

  function handleStop(tx: Transaction) {
    Alert.alert(
      'Arrêter la récurrence',
      `Arrêter "${tx.description_clean}" ?\nLa transaction d'origine est conservée.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Arrêter', style: 'destructive',
          onPress: async () => {
            await supabase.from('transactions')
              .update({ is_recurring: false, next_due_date: null, recurrence_interval: null })
              .eq('id', tx.id);
            load();
          },
        },
      ]
    );
  }

  const overdue  = transactions.filter(t => t.next_due_date! <= today);
  const upcoming = transactions.filter(t => t.next_due_date! > today);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Récurrences</Text>
        {transactions.length > 0 ? (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{transactions.length}</Text>
          </View>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} />
      ) : transactions.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>↻</Text>
          <Text style={styles.emptyTitle}>Aucune récurrence active</Text>
          <Text style={styles.emptyText}>
            Active l'option "Transaction récurrente" lors de la saisie manuelle ou de la correction vocale.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {overdue.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Échus ({overdue.length})</Text>
              {overdue.map(tx => (
                <TxCard
                  key={tx.id}
                  tx={tx}
                  days={dueDays(tx.next_due_date!, today)}
                  colors={colors}
                  styles={styles}
                  onConfirm={handleConfirm}
                  onSkip={handleSkip}
                  onEdit={handleOpenEdit}
                  onStop={handleStop}
                />
              ))}
            </>
          )}
          {upcoming.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>À venir ({upcoming.length})</Text>
              {upcoming.map(tx => (
                <TxCard
                  key={tx.id}
                  tx={tx}
                  days={dueDays(tx.next_due_date!, today)}
                  colors={colors}
                  styles={styles}
                  onConfirm={handleConfirm}
                  onSkip={handleSkip}
                  onEdit={handleOpenEdit}
                  onStop={handleStop}
                />
              ))}
            </>
          )}
        </ScrollView>
      )}

      {/* Edit modal */}
      <Modal
        visible={!!editTarget}
        animationType="slide"
        transparent
        onRequestClose={() => { setEditTarget(null); setEditForm(null); }}
      >
        {editForm && (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalOverlay}
          >
            <View style={styles.modalCard}>
              <View style={styles.modalHandle} />
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <Text style={styles.modalTitle}>Modifier la récurrence</Text>

                <Text style={styles.fieldLabel}>Description</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={editForm.description}
                  onChangeText={v => setEditForm(f => f && ({ ...f, description: v }))}
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                />

                <Text style={styles.fieldLabel}>Montant</Text>
                <View style={styles.amountRow}>
                  <TextInput
                    style={[styles.fieldInput, { flex: 1, marginBottom: 0 }]}
                    value={editForm.amount}
                    onChangeText={v => setEditForm(f => f && ({ ...f, amount: v }))}
                    keyboardType="decimal-pad"
                    placeholderTextColor={colors.textMuted}
                  />
                  {(['CHF', 'EUR', 'USD'] as const).map(c => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.currencyChip, editForm.currency === c && styles.currencyChipActive]}
                      onPress={() => setEditForm(f => f && ({ ...f, currency: c }))}
                    >
                      <Text style={[styles.currencyChipText, editForm.currency === c && styles.currencyChipTextActive]}>
                        {c}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Catégorie</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={editForm.category}
                  onChangeText={v => setEditForm(f => f && ({ ...f, category: v }))}
                  placeholderTextColor={colors.textMuted}
                />

                <Text style={styles.fieldLabel}>Fréquence</Text>
                <View style={styles.chipRow}>
                  {(['daily', 'weekly', 'monthly', 'yearly'] as RecurrenceInterval[]).map(iv => (
                    <TouchableOpacity
                      key={iv}
                      style={[styles.chip, editForm.recurrence_interval === iv && styles.chipActive]}
                      onPress={() => setEditForm(f => f && ({ ...f, recurrence_interval: iv }))}
                    >
                      <Text style={[styles.chipText, editForm.recurrence_interval === iv && styles.chipTextActive]}>
                        {INTERVAL_LABELS[iv]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.fieldLabel}>Prochain échéance</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={editForm.next_due_date}
                  onChangeText={v => setEditForm(f => f && ({ ...f, next_due_date: v }))}
                  placeholder="JJ.MM.AAAA"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => { setEditTarget(null); setEditForm(null); }}
                  >
                    <Text style={styles.cancelBtnText}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveBtn} onPress={handleSaveEdit}>
                    <Text style={styles.saveBtnText}>Enregistrer</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        )}
      </Modal>
    </SafeAreaView>
  );
}

// ─── Card sub-component ───────────────────────────────────────────────────────

interface CardProps {
  tx: Transaction;
  days: number;
  colors: ColorTheme;
  styles: ReturnType<typeof makeStyles>;
  onConfirm: (tx: Transaction) => void;
  onSkip: (tx: Transaction) => void;
  onEdit: (tx: Transaction) => void;
  onStop: (tx: Transaction) => void;
}

function TxCard({ tx, days, colors, styles, onConfirm, onSkip, onEdit, onStop }: CardProps) {
  const isOverdue = days <= 0;
  const isToday   = days === 0;

  const dueBg   = isOverdue && !isToday ? colors.expenseLight
                : isToday               ? '#FFF3CD'
                :                         colors.successLight;
  const dueText = isOverdue && !isToday ? colors.expense
                : isToday               ? '#856404'
                :                         '#2D7A4F';

  const dueLabel = days < 0  ? `${Math.abs(days)} j de retard`
                 : days === 0 ? "Aujourd'hui"
                 :              `Dans ${days} j`;

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardDesc} numberOfLines={1}>{tx.description_clean}</Text>
          <Text style={styles.cardMeta}>{tx.category} · ↻ {INTERVAL_LABELS[tx.recurrence_interval as RecurrenceInterval]}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={styles.cardAmount}>
            {tx.type === 'income' ? '+' : '-'}{tx.amount.toFixed(2)} {tx.currency}
          </Text>
          <View style={[styles.dueBadge, { backgroundColor: dueBg }]}>
            <Text style={[styles.dueBadgeText, { color: dueText }]}>{dueLabel}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.cardNextDate}>
        Prochain : {isoToDMY(tx.next_due_date!)}
      </Text>

      <View style={styles.cardActions}>
        {isOverdue && (
          <TouchableOpacity style={styles.confirmBtn} onPress={() => onConfirm(tx)}>
            <Text style={styles.confirmBtnText}>✓ Confirmer</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.skipBtn} onPress={() => onSkip(tx)}>
          <Text style={styles.skipBtnText}>Ignorer</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.iconBtn} onPress={() => onEdit(tx)}>
          <Text style={styles.iconBtnText}>✏</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={() => onStop(tx)}>
          <Text style={[styles.iconBtnText, { color: colors.expense }]}>✕</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(c: ColorTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
    },
    backButton: {
      width: 40, height: 40, borderRadius: 12,
      backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center',
    },
    backIcon: { fontSize: 20, color: c.text },
    title: { fontSize: 18, fontWeight: '700', color: c.text },
    countBadge: {
      minWidth: 40, height: 28, borderRadius: 14,
      backgroundColor: c.primaryLight, alignItems: 'center', justifyContent: 'center',
      paddingHorizontal: 10,
    },
    countBadgeText: { fontSize: 13, fontWeight: '700', color: c.primary },

    scroll: { padding: 16, paddingBottom: 40, gap: 10 },
    sectionLabel: {
      fontSize: 12, fontWeight: '700', color: c.textMuted,
      textTransform: 'uppercase', letterSpacing: 0.5,
      marginTop: 8, marginBottom: 4, paddingHorizontal: 4,
    },

    card: {
      backgroundColor: c.surface, borderRadius: 18,
      padding: 16, gap: 10,
      shadowColor: c.cardShadow, shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1, shadowRadius: 8, elevation: 2,
    },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    cardDesc: { fontSize: 15, fontWeight: '700', color: c.text },
    cardMeta: { fontSize: 12, color: c.textMuted, marginTop: 2 },
    cardAmount: { fontSize: 15, fontWeight: '700', color: c.text },
    dueBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    dueBadgeText: { fontSize: 11, fontWeight: '700' },
    cardNextDate: { fontSize: 12, color: c.textMuted },

    cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    confirmBtn: {
      backgroundColor: c.successLight, borderRadius: 10,
      paddingHorizontal: 14, paddingVertical: 8,
    },
    confirmBtnText: { fontSize: 13, fontWeight: '700', color: '#2D7A4F' },
    skipBtn: {
      borderRadius: 10, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 12, paddingVertical: 7,
    },
    skipBtnText: { fontSize: 12, fontWeight: '600', color: c.textMuted },
    iconBtn: {
      width: 34, height: 34, borderRadius: 10,
      backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center',
    },
    iconBtnText: { fontSize: 14, color: c.textSecondary },

    empty: {
      flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40,
    },
    emptyIcon: { fontSize: 52, marginBottom: 16 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: c.text, marginBottom: 8, textAlign: 'center' },
    emptyText: { fontSize: 14, color: c.textSecondary, textAlign: 'center', lineHeight: 20 },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'flex-end' },
    modalCard: {
      backgroundColor: c.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
      padding: 28, paddingBottom: 40,
    },
    modalHandle: {
      width: 40, height: 4, backgroundColor: c.border, borderRadius: 2,
      alignSelf: 'center', marginBottom: 20,
    },
    modalTitle: { fontSize: 17, fontWeight: '700', color: c.text, textAlign: 'center', marginBottom: 20 },
    fieldLabel: { fontSize: 12, fontWeight: '600', color: c.textMuted, marginBottom: 6, textTransform: 'uppercase' },
    fieldInput: {
      backgroundColor: c.surfaceAlt, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 15, color: c.text, marginBottom: 16,
    },
    amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
    currencyChip: {
      paddingHorizontal: 10, paddingVertical: 8,
      borderRadius: 10, backgroundColor: c.surfaceAlt,
    },
    currencyChipActive: { backgroundColor: c.primary },
    currencyChipText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },
    currencyChipTextActive: { color: '#FFFFFF' },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: c.surfaceAlt },
    chipActive: { backgroundColor: c.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    chipTextActive: { color: '#FFFFFF' },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
    cancelBtn: { flex: 1, backgroundColor: c.surfaceAlt, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    cancelBtnText: { fontSize: 15, fontWeight: '600', color: c.text },
    saveBtn: { flex: 2, backgroundColor: c.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  });
}
