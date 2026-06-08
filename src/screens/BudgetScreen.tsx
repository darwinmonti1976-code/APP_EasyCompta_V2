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
import { useBudgets } from '../lib/useBudgets';
import { useCategories } from '../lib/useCategories';
import { RootStackParamList } from '../../App';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Budget'>;
}

export function BudgetScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const { activeWorkspace } = useWorkspace();
  const { budgets, load: loadBudgets, setBudget, removeBudget } = useBudgets(activeWorkspace?.id);
  const { categories } = useCategories(activeWorkspace?.id);

  const [spending, setSpending] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [editModal, setEditModal] = useState<{ cat: string; amount: string } | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [newAmount, setNewAmount] = useState('');

  const now = new Date();
  const monthLabel = now.toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' });
  const fromDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const load = useCallback(async () => {
    if (!activeWorkspace) { setLoading(false); return; }
    setLoading(true);
    await loadBudgets();
    const { data } = await supabase
      .from('transactions')
      .select('category, amount')
      .eq('workspace_id', activeWorkspace.id)
      .eq('type', 'expense')
      .gte('date', fromDate);
    if (data) {
      const map: Record<string, number> = {};
      for (const row of data) map[row.category] = (map[row.category] ?? 0) + row.amount;
      setSpending(map);
    }
    setLoading(false);
  }, [activeWorkspace, loadBudgets, fromDate]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleSaveBudget(cat: string, amountStr: string) {
    const amount = parseFloat(amountStr.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return;
    await setBudget(cat, amount);
    setEditModal(null);
    setAddModal(false);
    setNewCat('');
    setNewAmount('');
  }

  function handleRemove(cat: string) {
    Alert.alert(
      'Supprimer le budget',
      `Supprimer le budget pour "${cat}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => removeBudget(cat) },
      ]
    );
  }

  // Categories with a budget set
  const budgetedCats = Object.keys(budgets).sort();
  // Categories with spending this month but no budget set
  const unbudgetedCats = Object.keys(spending)
    .filter(cat => !(cat in budgets))
    .sort((a, b) => spending[b] - spending[a]);

  const totalBudget  = Object.values(budgets).reduce((s, v) => s + v, 0);
  const totalSpent   = Object.values(spending).reduce((s, v) => s + v, 0);
  const budgetedSpent = budgetedCats.reduce((s, cat) => s + (spending[cat] ?? 0), 0);
  const overallPct   = totalBudget > 0 ? Math.min(budgetedSpent / totalBudget, 1) : 0;
  const overallColor = overallPct >= 1 ? colors.expense : overallPct >= 0.8 ? '#F6AD55' : colors.success;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Budgets</Text>
          <Text style={styles.subtitle}>{monthLabel}</Text>
        </View>
        <TouchableOpacity style={styles.addHeaderBtn} onPress={() => setAddModal(true)}>
          <Text style={styles.addHeaderBtnText}>+ Ajouter</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Summary card */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Dépenses du mois</Text>
                <Text style={[styles.summaryValue, { color: colors.expense }]}>
                  {totalSpent.toFixed(0)} CHF
                </Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Total budgété</Text>
                <Text style={[styles.summaryValue, { color: colors.primary }]}>
                  {totalBudget.toFixed(0)} CHF
                </Text>
              </View>
            </View>
            {totalBudget > 0 && (
              <>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${overallPct * 100}%` as any, backgroundColor: overallColor }]} />
                </View>
                <Text style={[styles.summaryPct, { color: overallColor }]}>
                  {(overallPct * 100).toFixed(0)}% du budget utilisé ({budgetedSpent.toFixed(0)} / {totalBudget.toFixed(0)} CHF)
                </Text>
              </>
            )}
          </View>

          {/* Budgeted categories */}
          {budgetedCats.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Avec budget</Text>
              {budgetedCats.map(cat => {
                const budget  = budgets[cat];
                const spent   = spending[cat] ?? 0;
                const pct     = Math.min(spent / budget, 1);
                const barColor = pct >= 1 ? colors.expense : pct >= 0.8 ? '#F6AD55' : colors.primary;
                const textColor = pct >= 1 ? colors.expense : pct >= 0.8 ? '#856404' : colors.text;
                return (
                  <View key={cat} style={styles.budgetCard}>
                    <View style={styles.budgetCardTop}>
                      <Text style={styles.budgetCat} numberOfLines={1}>{cat}</Text>
                      <View style={styles.budgetCardActions}>
                        <TouchableOpacity
                          style={styles.iconBtn}
                          onPress={() => setEditModal({ cat, amount: budget.toString() })}
                        >
                          <Text style={styles.iconBtnText}>✏</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.iconBtn} onPress={() => handleRemove(cat)}>
                          <Text style={[styles.iconBtnText, { color: colors.expense }]}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${pct * 100}%` as any, backgroundColor: barColor }]} />
                    </View>
                    <View style={styles.budgetAmounts}>
                      <Text style={[styles.spentLabel, { color: textColor }]}>
                        {spent.toFixed(0)} CHF dépensés
                      </Text>
                      <Text style={styles.budgetLabel}>
                        / {budget.toFixed(0)} CHF
                      </Text>
                      {pct >= 1 && (
                        <Text style={styles.overBudgetBadge}>Dépassé</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </>
          )}

          {/* Unbudgeted categories with spending */}
          {unbudgetedCats.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Sans budget ce mois</Text>
              {unbudgetedCats.map(cat => (
                <View key={cat} style={styles.unbudgetedCard}>
                  <Text style={styles.budgetCat} numberOfLines={1}>{cat}</Text>
                  <Text style={styles.unbudgetedSpent}>{spending[cat].toFixed(0)} CHF</Text>
                  <TouchableOpacity
                    style={styles.setBtn}
                    onPress={() => setEditModal({ cat, amount: '' })}
                  >
                    <Text style={styles.setBtnText}>+ Budget</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}

          {budgetedCats.length === 0 && unbudgetedCats.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>💰</Text>
              <Text style={styles.emptyTitle}>Aucun budget défini</Text>
              <Text style={styles.emptyText}>
                Appuie sur "+ Ajouter" pour définir un plafond mensuel par catégorie.
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Edit / Set budget modal */}
      <Modal
        visible={!!editModal}
        animationType="slide"
        transparent
        onRequestClose={() => setEditModal(null)}
      >
        {editModal && (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalOverlay}
          >
            <View style={styles.modalCard}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>
                {budgets[editModal.cat] ? 'Modifier le budget' : 'Définir un budget'}
              </Text>
              <Text style={styles.modalCatName}>{editModal.cat}</Text>
              <Text style={styles.fieldLabel}>Plafond mensuel (CHF)</Text>
              <TextInput
                style={styles.fieldInput}
                value={editModal.amount}
                onChangeText={v => setEditModal(m => m && ({ ...m, amount: v }))}
                keyboardType="decimal-pad"
                placeholder="Ex: 500"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditModal(null)}>
                  <Text style={styles.cancelBtnText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={() => handleSaveBudget(editModal.cat, editModal.amount)}
                >
                  <Text style={styles.saveBtnText}>Enregistrer</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        )}
      </Modal>

      {/* Add new budget modal */}
      <Modal
        visible={addModal}
        animationType="slide"
        transparent
        onRequestClose={() => { setAddModal(false); setNewCat(''); setNewAmount(''); }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Nouveau budget</Text>

            <Text style={styles.fieldLabel}>Catégorie</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 2 }}>
                {categories.filter(c => !(c in budgets)).map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.catChip, newCat === cat && styles.catChipActive]}
                    onPress={() => setNewCat(cat)}
                  >
                    <Text style={[styles.catChipText, newCat === cat && styles.catChipTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <TextInput
              style={styles.fieldInput}
              value={newCat}
              onChangeText={setNewCat}
              placeholder="Ou saisir une catégorie…"
              placeholderTextColor={colors.textMuted}
            />

            <Text style={styles.fieldLabel}>Plafond mensuel (CHF)</Text>
            <TextInput
              style={styles.fieldInput}
              value={newAmount}
              onChangeText={setNewAmount}
              keyboardType="decimal-pad"
              placeholder="Ex: 500"
              placeholderTextColor={colors.textMuted}
              autoFocus={false}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setAddModal(false); setNewCat(''); setNewAmount(''); }}
              >
                <Text style={styles.cancelBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, (!newCat.trim() || !newAmount.trim()) && { opacity: 0.5 }]}
                onPress={() => handleSaveBudget(newCat.trim(), newAmount)}
                disabled={!newCat.trim() || !newAmount.trim()}
              >
                <Text style={styles.saveBtnText}>Créer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

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
    title: { fontSize: 18, fontWeight: '700', color: c.text, textAlign: 'center' },
    subtitle: { fontSize: 12, color: c.textMuted, textAlign: 'center', marginTop: 1 },
    addHeaderBtn: {
      backgroundColor: c.primaryLight, borderRadius: 12,
      paddingHorizontal: 12, paddingVertical: 8,
    },
    addHeaderBtnText: { fontSize: 13, fontWeight: '700', color: c.primary },

    scroll: { padding: 16, paddingBottom: 48, gap: 10 },
    sectionLabel: {
      fontSize: 12, fontWeight: '700', color: c.textMuted,
      textTransform: 'uppercase', letterSpacing: 0.5,
      marginTop: 8, marginBottom: 4, paddingHorizontal: 4,
    },

    // Summary
    summaryCard: {
      backgroundColor: c.surface, borderRadius: 20, padding: 18, gap: 12,
      shadowColor: c.cardShadow, shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1, shadowRadius: 8, elevation: 2,
    },
    summaryRow: { flexDirection: 'row', alignItems: 'center' },
    summaryItem: { flex: 1, alignItems: 'center', gap: 4 },
    summaryDivider: { width: 1, height: 36, backgroundColor: c.border },
    summaryLabel: { fontSize: 11, color: c.textMuted, fontWeight: '600', textTransform: 'uppercase' },
    summaryValue: { fontSize: 20, fontWeight: '800' },
    summaryPct: { fontSize: 12, fontWeight: '600', textAlign: 'center' },

    // Progress bar
    barTrack: {
      height: 8, borderRadius: 4, backgroundColor: c.surfaceAlt, overflow: 'hidden',
    },
    barFill: { height: '100%', borderRadius: 4 },

    // Budget cards
    budgetCard: {
      backgroundColor: c.surface, borderRadius: 18, padding: 16, gap: 10,
      shadowColor: c.cardShadow, shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 1, shadowRadius: 4, elevation: 1,
    },
    budgetCardTop: { flexDirection: 'row', alignItems: 'center' },
    budgetCat: { flex: 1, fontSize: 15, fontWeight: '700', color: c.text },
    budgetCardActions: { flexDirection: 'row', gap: 6 },
    iconBtn: {
      width: 32, height: 32, borderRadius: 9,
      backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center',
    },
    iconBtnText: { fontSize: 13, color: c.textSecondary },
    budgetAmounts: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    spentLabel: { fontSize: 13, fontWeight: '700' },
    budgetLabel: { fontSize: 13, color: c.textMuted, flex: 1 },
    overBudgetBadge: {
      fontSize: 11, fontWeight: '700', color: '#FFFFFF',
      backgroundColor: c.expense, borderRadius: 6,
      paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden',
    },

    // Unbudgeted
    unbudgetedCard: {
      backgroundColor: c.surface, borderRadius: 14,
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 12, gap: 10,
      borderWidth: 1, borderColor: c.border, borderStyle: 'dashed',
    },
    unbudgetedSpent: { fontSize: 14, fontWeight: '600', color: c.textSecondary, flex: 1, textAlign: 'right' },
    setBtn: {
      backgroundColor: c.primaryLight, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 6,
    },
    setBtnText: { fontSize: 12, fontWeight: '700', color: c.primary },

    // Empty
    empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12 },
    emptyIcon: { fontSize: 52 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: c.text, textAlign: 'center' },
    emptyText: { fontSize: 14, color: c.textSecondary, textAlign: 'center', lineHeight: 20, maxWidth: 280 },

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
    modalTitle: { fontSize: 17, fontWeight: '700', color: c.text, textAlign: 'center', marginBottom: 6 },
    modalCatName: { fontSize: 13, color: c.textMuted, textAlign: 'center', marginBottom: 20 },
    fieldLabel: { fontSize: 12, fontWeight: '600', color: c.textMuted, marginBottom: 6, textTransform: 'uppercase' },
    fieldInput: {
      backgroundColor: c.surfaceAlt, borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 12,
      fontSize: 15, color: c.text, marginBottom: 16,
    },
    catChip: {
      paddingHorizontal: 12, paddingVertical: 6,
      borderRadius: 16, backgroundColor: c.surfaceAlt,
    },
    catChipActive: { backgroundColor: c.primaryLight },
    catChipText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
    catChipTextActive: { color: c.primary },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 4 },
    cancelBtn: {
      flex: 1, backgroundColor: c.surfaceAlt, borderRadius: 14,
      paddingVertical: 14, alignItems: 'center',
    },
    cancelBtnText: { fontSize: 15, fontWeight: '600', color: c.text },
    saveBtn: {
      flex: 2, backgroundColor: c.primary, borderRadius: 14,
      paddingVertical: 14, alignItems: 'center',
    },
    saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  });
}
