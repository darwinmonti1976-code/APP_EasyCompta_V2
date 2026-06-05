import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Animated,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { transcribeAudio, parseTransaction } from '../lib/openai';
import { useAudioRecorder } from '../lib/useAudioRecorder';
import { useWorkspace } from '../lib/WorkspaceContext';
import { Colors } from '../constants/colors';
import { MicButton } from '../components/MicButton';
import { TransactionCard } from '../components/TransactionCard';
import { Transaction, RecurrenceInterval } from '../lib/types';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { scheduleRecurringReminders } from '../lib/useNotifications';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Main'>;
}

type FeedbackKind = 'success' | 'error' | 'info';
type FeedbackState = { text: string; kind: FeedbackKind } | null;

const WS_TYPE_ICONS: Record<string, string> = {
  personal: '👤',
  family: '👨‍👩‍👧',
  business: '💼',
};

function nextDueDate(fromDate: string, interval: RecurrenceInterval): string {
  const d = new Date(fromDate);
  switch (interval) {
    case 'daily':   d.setDate(d.getDate() + 1); break;
    case 'weekly':  d.setDate(d.getDate() + 7); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'yearly':  d.setFullYear(d.getFullYear() + 1); break;
  }
  return d.toISOString().split('T')[0];
}

export function MainScreen({ navigation }: Props) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [pendingPhotoTxId, setPendingPhotoTxId] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [dueRecurring, setDueRecurring] = useState<Transaction[]>([]);
  const [monthSummary, setMonthSummary] = useState<{ income: number; expense: number } | null>(null);
  const recurBarAnim = useRef(new Animated.Value(0)).current;

  const { isRecording, startRecording, stopRecording } = useAudioRecorder();
  const { activeWorkspace, workspaceLoadError, refreshWorkspaces } = useWorkspace();

  const feedbackAnim = useRef(new Animated.Value(0)).current;
  const photoBarAnim = useRef(new Animated.Value(0)).current;
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photoTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      refreshWorkspaces();
    }, [refreshWorkspaces])
  );

  useEffect(() => {
    if (activeWorkspace) {
      loadTransactions();
      checkDueRecurring();
      loadMonthSummary();
      scheduleAllRecurringNotifications();
    }
  }, [activeWorkspace]);

  async function loadMonthSummary() {
    if (!activeWorkspace) return;
    const now = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const { data } = await supabase
      .from('transactions')
      .select('amount, type')
      .eq('workspace_id', activeWorkspace.id)
      .gte('date', from);
    if (!data) return;
    const income  = data.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = data.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    setMonthSummary({ income, expense });
  }

  async function scheduleAllRecurringNotifications() {
    if (!activeWorkspace) return;
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('workspace_id', activeWorkspace.id)
      .eq('is_recurring', true)
      .not('next_due_date', 'is', null);
    if (data?.length) scheduleRecurringReminders(data as Transaction[]);
  }

  async function loadTransactions() {
    if (!activeWorkspace) return;
    try {
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .eq('workspace_id', activeWorkspace.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (data) setTransactions(data as Transaction[]);
    } catch {
      // silent fail — main screen shows empty list
    }
  }

  async function checkDueRecurring() {
    if (!activeWorkspace) return;
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('workspace_id', activeWorkspace.id)
      .eq('is_recurring', true)
      .lte('next_due_date', today)
      .order('next_due_date', { ascending: true })
      .limit(5);
    if (data?.length) {
      setDueRecurring(data as Transaction[]);
      Animated.spring(recurBarAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }).start();
    }
  }

  function dismissRecurBar() {
    Animated.timing(recurBarAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setDueRecurring([]));
  }

  async function handleConfirmRecurring(tx: Transaction) {
    if (!activeWorkspace) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];
    const newNext = nextDueDate(today, tx.recurrence_interval as RecurrenceInterval);
    await supabase.from('transactions').insert({
      date: today, amount: tx.amount, currency: tx.currency, type: tx.type,
      category: tx.category, payment_method: tx.payment_method, scope: tx.scope,
      workspace_id: activeWorkspace.id, description_raw: '',
      description_clean: tx.description_clean, has_attachment: false, attachment_url: null,
      created_by_email: user.email ?? '', user_id: user.id,
      is_recurring: true, recurrence_interval: tx.recurrence_interval, next_due_date: newNext,
    });
    await supabase.from('transactions').update({ next_due_date: newNext }).eq('id', tx.id);
    const remaining = dueRecurring.filter(t => t.id !== tx.id);
    setDueRecurring(remaining);
    if (remaining.length === 0) dismissRecurBar();
    loadTransactions();
    scheduleAllRecurringNotifications();
    showFeedback(`↻ ${tx.description_clean} ajouté`, 'success');
  }

  async function handleSkipRecurring(tx: Transaction) {
    const today = new Date().toISOString().split('T')[0];
    const newNext = nextDueDate(today, tx.recurrence_interval as RecurrenceInterval);
    await supabase.from('transactions').update({ next_due_date: newNext }).eq('id', tx.id);
    const remaining = dueRecurring.filter(t => t.id !== tx.id);
    setDueRecurring(remaining);
    if (remaining.length === 0) dismissRecurBar();
    scheduleAllRecurringNotifications();
  }

  function showFeedback(text: string, kind: FeedbackKind = 'success') {
    if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
    setFeedback({ text, kind });
    Animated.sequence([
      Animated.spring(feedbackAnim, { toValue: 1, useNativeDriver: true, tension: 120, friction: 8 }),
      Animated.delay(2500),
      Animated.timing(feedbackAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setFeedback(null));
  }

  function showPhotoPrompt(txId: string) {
    setPendingPhotoTxId(txId);
    Animated.spring(photoBarAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }).start();
    photoTimeout.current = setTimeout(() => dismissPhotoPrompt(), 8000);
  }

  function dismissPhotoPrompt() {
    if (photoTimeout.current) clearTimeout(photoTimeout.current);
    Animated.timing(photoBarAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
      setPendingPhotoTxId(null);
    });
  }

  async function handleAddPhoto(source: 'camera' | 'gallery') {
    const txId = pendingPhotoTxId;
    if (!txId) return;

    if (source === 'camera') {
      const { granted } = await ImagePicker.requestCameraPermissionsAsync();
      if (!granted) {
        showFeedback('Accès caméra refusé', 'error');
        dismissPhotoPrompt();
        return;
      }
    } else {
      const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!granted) {
        showFeedback('Accès photos refusé', 'error');
        dismissPhotoPrompt();
        return;
      }
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [4, 3], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.7 });

    if (result.canceled) { dismissPhotoPrompt(); return; }

    dismissPhotoPrompt();
    setUploadingPhoto(true);

    try {
      const uri = result.assets[0].uri;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('no user');

      const ext = uri.split('.').pop() ?? 'jpg';
      const path = `${user.id}/${txId}.${ext}`;

      const response = await fetch(uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('transaction-photos')
        .upload(path, blob, { contentType: `image/${ext}`, upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('transaction-photos')
        .getPublicUrl(path);

      await supabase
        .from('transactions')
        .update({ has_attachment: true, attachment_url: publicUrl })
        .eq('id', txId);

      setTransactions(prev =>
        prev.map(t =>
          t.id === txId
            ? { ...t, has_attachment: true, attachment_url: publicUrl }
            : t
        )
      );
      showFeedback('📎 Photo ajoutée !', 'success');
    } catch {
      showFeedback('Oups, photo non sauvegardée', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handlePressIn() {
    const granted = await startRecording();
    if (!granted) showFeedback('Micro non autorisé', 'error');
  }

  async function handlePressOut() {
    setIsProcessing(true);
    try {
      const source = await stopRecording();
      if (!source) throw new Error('No audio');

      const audioInput = 'uri' in source ? source.uri : source.blob;
      const transcription = await transcribeAudio(audioInput);
      if (!transcription.trim()) {
        showFeedback("Je n'ai pas entendu. Réessaie !", 'info');
        return;
      }

      const parsed = await parseTransaction(transcription);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !activeWorkspace) {
        showFeedback('Espace de travail non chargé — réessaie', 'error');
        refreshWorkspaces();
        return;
      }

      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('transactions')
        .insert({
          date: today,
          amount: parsed.amount,
          currency: parsed.currency || 'CHF',
          type: parsed.type,
          category: parsed.category,
          payment_method: parsed.payment_method,
          scope: parsed.scope,
          workspace_id: activeWorkspace.id,
          description_raw: transcription,
          description_clean: parsed.description_clean,
          has_attachment: false,
          attachment_url: null,
          created_by_email: user.email ?? '',
          user_id: user.id,
          is_recurring: parsed.is_recurring ?? false,
          recurrence_interval: parsed.recurrence_interval ?? null,
          next_due_date: (parsed.is_recurring && parsed.recurrence_interval)
            ? nextDueDate(today, parsed.recurrence_interval)
            : null,
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        const saved = data as Transaction;
        setTransactions(prev => [saved, ...prev.slice(0, 9)]);
        showFeedback(`✓ ${parsed.description_clean} — ${parsed.amount} ${parsed.currency || 'CHF'}`, 'success');
        setTimeout(() => showPhotoPrompt(saved.id), 600);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showFeedback(msg.slice(0, 90), 'error');
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleDeleteTransaction(id: string) {
    await supabase.from('transactions').delete().eq('id', id);
    setTransactions(prev => prev.filter(t => t.id !== id));
  }

  const feedbackTranslateY = feedbackAnim.interpolate({ inputRange: [0, 1], outputRange: [-80, 0] });
  const photoBarTranslateY = photoBarAnim.interpolate({ inputRange: [0, 1], outputRange: [120, 0] });
  const recurBarTranslateY = recurBarAnim.interpolate({ inputRange: [0, 1], outputRange: [120, 0] });

  const isSharedWs = activeWorkspace?.type === 'family' || activeWorkspace?.type === 'business';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Bonjour 👋</Text>
          {activeWorkspace && (
            <Text style={styles.wsIndicator}>
              {WS_TYPE_ICONS[activeWorkspace.type]} {activeWorkspace.name}
            </Text>
          )}
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate('History')}>
            <Text style={styles.iconButtonText}>📋</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate('Settings')}>
            <Text style={styles.iconButtonText}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!activeWorkspace && !feedback && (
        <TouchableOpacity style={styles.noWsBanner} onPress={() => refreshWorkspaces()}>
          <Text style={styles.noWsText}>
            {workspaceLoadError
              ? `Erreur: ${workspaceLoadError.slice(0, 100)}`
              : 'Espace de travail non chargé — appuie pour réessayer'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Month summary card */}
      {monthSummary && activeWorkspace && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryCardItem}>
            <Text style={styles.summaryCardLabel}>Revenus</Text>
            <Text style={[styles.summaryCardValue, { color: Colors.success }]}>
              +{monthSummary.income.toFixed(0)}
            </Text>
          </View>
          <View style={styles.summaryCardDivider} />
          <View style={styles.summaryCardItem}>
            <Text style={styles.summaryCardLabel}>Dépenses</Text>
            <Text style={[styles.summaryCardValue, { color: Colors.expense }]}>
              -{monthSummary.expense.toFixed(0)}
            </Text>
          </View>
          <View style={styles.summaryCardDivider} />
          <View style={styles.summaryCardItem}>
            <Text style={styles.summaryCardLabel}>Solde</Text>
            <Text style={[styles.summaryCardValue, {
              color: monthSummary.income - monthSummary.expense >= 0 ? Colors.success : Colors.expense,
            }]}>
              {monthSummary.income - monthSummary.expense >= 0 ? '+' : ''}
              {(monthSummary.income - monthSummary.expense).toFixed(0)}
            </Text>
          </View>
        </View>
      )}

      {feedback && (
        <Animated.View
          style={[
            styles.feedbackBanner,
            feedback.kind === 'success' ? styles.feedbackSuccess :
            feedback.kind === 'error' ? styles.feedbackError : styles.feedbackInfo,
            { opacity: feedbackAnim, transform: [{ translateY: feedbackTranslateY }] },
          ]}
        >
          <Text style={styles.feedbackText}>{feedback.text}</Text>
        </Animated.View>
      )}

      <View style={styles.micSection}>
        <MicButton
          isRecording={isRecording}
          isProcessing={isProcessing || uploadingPhoto}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        />
        <Text style={styles.micHint}>
          {isRecording ? "Je t'écoute…" : isProcessing ? 'Analyse en cours…' : 'Maintiens pour parler'}
        </Text>
      </View>

      {transactions.length > 0 && (
        <View style={styles.listSection}>
          <Text style={styles.listTitle}>Dernières transactions</Text>
          <FlatList
            data={transactions}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TransactionCard
                transaction={item}
                onDelete={handleDeleteTransaction}
                onPress={() => navigation.navigate('History')}
                showCreator={isSharedWs}
              />
            )}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          />
        </View>
      )}

      {transactions.length === 0 && !isProcessing && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🎙</Text>
          <Text style={styles.emptyText}>Parle pour noter ta première transaction</Text>
        </View>
      )}

      {/* Recurring due bar — slides up when a recurring transaction is due */}
      {dueRecurring.length > 0 && !pendingPhotoTxId && (
        <Animated.View style={[styles.recurBar, { transform: [{ translateY: recurBarTranslateY }] }]}>
          <View style={styles.recurInfo}>
            <Text style={styles.recurIcon}>↻</Text>
            <View>
              <Text style={styles.recurTitle} numberOfLines={1}>{dueRecurring[0].description_clean}</Text>
              <Text style={styles.recurMeta}>{dueRecurring[0].amount.toFixed(2)} {dueRecurring[0].currency}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.recurConfirmBtn} onPress={() => handleConfirmRecurring(dueRecurring[0])}>
            <Text style={styles.recurConfirmText}>Confirmer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.recurSkipBtn} onPress={() => handleSkipRecurring(dueRecurring[0])}>
            <Text style={styles.recurSkipText}>Ignorer</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Photo prompt bar — slides up after a transaction save */}
      {pendingPhotoTxId && (
        <Animated.View
          style={[styles.photoBar, { transform: [{ translateY: photoBarTranslateY }] }]}
        >
          <TouchableOpacity style={styles.photoSourceBtn} onPress={() => handleAddPhoto('camera')}>
            <Text style={styles.photoSourceIcon}>📷</Text>
            <Text style={styles.photoSourceText}>Caméra</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.photoSourceBtn} onPress={() => handleAddPhoto('gallery')}>
            <Text style={styles.photoSourceIcon}>🖼</Text>
            <Text style={styles.photoSourceText}>Galerie</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.photoSkipBtn} onPress={dismissPhotoPrompt}>
            <Text style={styles.photoSkipText}>Ignorer</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8,
  },

  summaryCard: {
    flexDirection: 'row', marginHorizontal: 24, marginBottom: 8,
    backgroundColor: Colors.surface, borderRadius: 16, padding: 14,
    shadowColor: Colors.cardShadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1, shadowRadius: 8, elevation: 2,
  },
  summaryCardItem: { flex: 1, alignItems: 'center', gap: 3 },
  summaryCardDivider: { width: 1, backgroundColor: Colors.border, marginVertical: 2 },
  summaryCardLabel: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', textTransform: 'uppercase' },
  summaryCardValue: { fontSize: 16, fontWeight: '800' },
  greeting: { fontSize: 22, fontWeight: '800', color: Colors.text },
  wsIndicator: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconButton: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.cardShadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1, shadowRadius: 4, elevation: 2,
  },
  iconButtonText: { fontSize: 18 },
  feedbackBanner: {
    marginHorizontal: 24, marginVertical: 8,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
  },
  feedbackSuccess: { backgroundColor: Colors.successLight },
  feedbackError: { backgroundColor: Colors.expenseLight },
  feedbackInfo: { backgroundColor: Colors.primaryLight },
  feedbackText: { fontSize: 14, fontWeight: '600', color: Colors.text, textAlign: 'center' },
  micSection: { alignItems: 'center', paddingVertical: 32 },
  micHint: { marginTop: 16, fontSize: 14, color: Colors.textSecondary, fontWeight: '500' },
  listSection: { flex: 1 },
  listTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginHorizontal: 24, marginBottom: 8 },
  listContent: { paddingBottom: 120 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 15, color: Colors.textSecondary, textAlign: 'center', maxWidth: 220 },
  photoBar: {
    position: 'absolute', bottom: 24, left: 24, right: 24,
    backgroundColor: Colors.surface, borderRadius: 20,
    flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12,
    shadowColor: Colors.cardShadow, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1, shadowRadius: 16, elevation: 6,
  },
  photoSourceBtn: { flex: 1, alignItems: 'center', gap: 4 },
  photoSourceIcon: { fontSize: 22 },
  photoSourceText: { fontSize: 12, fontWeight: '700', color: Colors.text },
  photoSkipBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  photoSkipText: { fontSize: 13, color: Colors.textMuted, fontWeight: '500' },

  recurBar: {
    position: 'absolute', bottom: 24, left: 24, right: 24,
    backgroundColor: Colors.surface, borderRadius: 20,
    flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10,
    shadowColor: Colors.cardShadow, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1, shadowRadius: 16, elevation: 6,
  },
  recurInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  recurIcon: { fontSize: 20, color: Colors.primary },
  recurTitle: { fontSize: 13, fontWeight: '700', color: Colors.text, maxWidth: 140 },
  recurMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 1 },
  recurConfirmBtn: { backgroundColor: Colors.successLight, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  recurConfirmText: { fontSize: 12, fontWeight: '700', color: '#2D7A4F' },
  recurSkipBtn: { paddingHorizontal: 6, paddingVertical: 8 },
  recurSkipText: { fontSize: 12, color: Colors.textMuted },

  noWsBanner: {
    marginHorizontal: 24, marginVertical: 4,
    backgroundColor: Colors.expenseLight, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10,
  },
  noWsText: { fontSize: 13, fontWeight: '600', color: Colors.expense, textAlign: 'center' },
});
