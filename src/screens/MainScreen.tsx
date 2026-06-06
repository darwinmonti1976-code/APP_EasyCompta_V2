import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Alert,
  Animated,
  FlatList,
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
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { transcribeAudio, parseTransaction, ocrReceipt } from '../lib/openai';
import { useAudioRecorder } from '../lib/useAudioRecorder';
import { useWorkspace } from '../lib/WorkspaceContext';
import { useTheme } from '../lib/ThemeContext';
import { ColorTheme } from '../constants/colors';
import { MicButton } from '../components/MicButton';
import { TransactionCard } from '../components/TransactionCard';
import { Transaction, RecurrenceInterval, TransactionType } from '../lib/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { scheduleRecurringReminders } from '../lib/useNotifications';
import { updateWidget } from '../lib/widgetBridge';

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

function todayDMY(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

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
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [pendingPhotoTxId, setPendingPhotoTxId] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [isScanningReceipt, setIsScanningReceipt] = useState(false);
  const [dueRecurring, setDueRecurring] = useState<Transaction[]>([]);
  const [monthSummary, setMonthSummary] = useState<{ income: number; expense: number } | null>(null);
  const [defaultCurrency, setDefaultCurrency] = useState('CHF');
  const [savedTx, setSavedTx] = useState<Transaction | null>(null);
  const [showQuickEdit, setShowQuickEdit] = useState(false);
  const [quickForm, setQuickForm] = useState<{
    description: string; amount: string; category: string; type: TransactionType;
  }>({ description: '', amount: '', category: '', type: 'expense' });
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualForm, setManualForm] = useState<{
    description: string; amount: string; currency: string; category: string;
    type: TransactionType; date: string; is_recurring: boolean;
    recurrence_interval: RecurrenceInterval | null;
  }>({ description: '', amount: '', currency: 'CHF', category: '', type: 'expense', date: '', is_recurring: false, recurrence_interval: null });
  const recurBarAnim = useRef(new Animated.Value(0)).current;

  const { isRecording, startRecording, stopRecording } = useAudioRecorder();
  const { activeWorkspace, workspaceLoadError, refreshWorkspaces } = useWorkspace();

  const feedbackAnim    = useRef(new Animated.Value(0)).current;
  const feedbackAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const photoBarAnim    = useRef(new Animated.Value(0)).current;
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photoTimeout    = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      refreshWorkspaces();
      AsyncStorage.getItem('@default_currency').then(v => {
        if (v) setDefaultCurrency(v);
      });
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

  // Stable ref so the Realtime callback always calls the latest loaders
  const realtimeReloadRef = useRef<() => void>(() => {});
  useEffect(() => {
    realtimeReloadRef.current = () => {
      loadTransactions();
      loadMonthSummary();
    };
  });

  useEffect(() => {
    if (!activeWorkspace || activeWorkspace.type === 'personal') return;
    const channel = supabase
      .channel(`main-ws-${activeWorkspace.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `workspace_id=eq.${activeWorkspace.id}` },
        () => realtimeReloadRef.current()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeWorkspace?.id]);

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
    updateWidget(income, expense, defaultCurrency);
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
    if (feedbackAnimRef.current) feedbackAnimRef.current.stop();
    setFeedback({ text, kind });
    feedbackAnimRef.current = Animated.sequence([
      Animated.spring(feedbackAnim, { toValue: 1, useNativeDriver: true, tension: 120, friction: 8 }),
      Animated.delay(2500),
      Animated.timing(feedbackAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]);
    feedbackAnimRef.current.start(() => setFeedback(null));
  }

  function handleOpenQuickEdit() {
    if (!savedTx) return;
    if (feedbackAnimRef.current) feedbackAnimRef.current.stop();
    feedbackAnim.setValue(0);
    setFeedback(null);
    setQuickForm({
      description: savedTx.description_clean,
      amount:      savedTx.amount.toString(),
      category:    savedTx.category,
      type:        savedTx.type,
    });
    setShowQuickEdit(true);
  }

  async function handleQuickEditSave() {
    if (!savedTx) return;
    const amount = parseFloat(quickForm.amount);
    if (isNaN(amount) || amount <= 0) return;
    const updates = {
      description_clean: quickForm.description.trim(),
      amount,
      category: quickForm.category.trim(),
      type: quickForm.type,
    };
    await supabase.from('transactions').update(updates).eq('id', savedTx.id);
    setTransactions(prev =>
      prev.map(t => t.id === savedTx.id ? { ...t, ...updates } : t)
    );
    setSavedTx(null);
    setShowQuickEdit(false);
    showFeedback('✓ Transaction corrigée', 'success');
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

  function openReceiptScanner() {
    Alert.alert(
      'Scanner un reçu',
      'Choisir la source',
      [
        { text: '📷 Caméra', onPress: () => handleScanReceipt('camera') },
        { text: '🖼 Galerie', onPress: () => handleScanReceipt('gallery') },
        { text: 'Annuler', style: 'cancel' },
      ]
    );
  }

  async function handleScanReceipt(source: 'camera' | 'gallery') {
    if (!activeWorkspace) return;

    if (source === 'camera') {
      const { granted } = await ImagePicker.requestCameraPermissionsAsync();
      if (!granted) { showFeedback('Accès caméra refusé', 'error'); return; }
    } else {
      const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!granted) { showFeedback('Accès photos refusé', 'error'); return; }
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });

    if (result.canceled) return;

    setIsScanningReceipt(true);
    try {
      const uri = result.assets[0].uri;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('no user');

      const ext = uri.split('.').pop() ?? 'jpg';
      const path = `${user.id}/ocr_${Date.now()}.${ext}`;
      const fetchRes = await fetch(uri);
      const blob = await fetchRes.blob();

      const { error: uploadError } = await supabase.storage
        .from('transaction-photos')
        .upload(path, blob, { contentType: `image/${ext}` });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('transaction-photos')
        .getPublicUrl(path);

      showFeedback('🔍 Lecture du reçu…', 'info');
      const parsed = await ocrReceipt(publicUrl, defaultCurrency);

      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          date: today,
          amount: parsed.amount,
          currency: parsed.currency || defaultCurrency,
          type: parsed.type,
          category: parsed.category,
          payment_method: parsed.payment_method,
          scope: parsed.scope,
          workspace_id: activeWorkspace.id,
          description_raw: null,
          description_clean: parsed.description_clean,
          has_attachment: true,
          attachment_url: publicUrl,
          created_by_email: user.email ?? '',
          user_id: user.id,
          is_recurring: false,
          recurrence_interval: null,
          next_due_date: null,
        })
        .select()
        .single();

      if (error) throw error;

      const saved = data as Transaction;
      setSavedTx(saved);
      setTransactions(prev => [saved, ...prev.slice(0, 9)]);
      setQuickForm({
        description: parsed.description_clean,
        amount: parsed.amount.toString(),
        category: parsed.category,
        type: parsed.type,
      });
      setShowQuickEdit(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showFeedback(msg.slice(0, 90), 'error');
    } finally {
      setIsScanningReceipt(false);
    }
  }

  function openManualEntry() {
    setManualForm({
      description: '',
      amount: '',
      currency: defaultCurrency,
      category: '',
      type: 'expense',
      date: todayDMY(),
      is_recurring: false,
      recurrence_interval: null,
    });
    setShowManualEntry(true);
  }

  async function handleManualSave() {
    const amount = parseFloat(manualForm.amount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0 || !manualForm.description.trim() || !manualForm.category.trim()) return;
    const parts = manualForm.date.split('.');
    const isoDate = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : new Date().toISOString().split('T')[0];
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !activeWorkspace) return;
      const scope = activeWorkspace.type === 'family' ? 'family' : activeWorkspace.type === 'business' ? 'business' : 'personal';
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          date: isoDate, amount, currency: manualForm.currency, type: manualForm.type,
          category: manualForm.category.trim(), payment_method: 'unknown', scope,
          workspace_id: activeWorkspace.id, description_raw: '',
          description_clean: manualForm.description.trim(), has_attachment: false,
          attachment_url: null, created_by_email: user.email ?? '', user_id: user.id,
          is_recurring: manualForm.is_recurring,
          recurrence_interval: manualForm.is_recurring ? manualForm.recurrence_interval : null,
          next_due_date: (manualForm.is_recurring && manualForm.recurrence_interval)
            ? nextDueDate(isoDate, manualForm.recurrence_interval)
            : null,
        })
        .select()
        .single();
      if (error) throw error;
      const saved = data as Transaction;
      setSavedTx(saved);
      setTransactions(prev => [saved, ...prev.slice(0, 9)]);
      setShowManualEntry(false);
      loadMonthSummary();
      showFeedback(`✓ ${manualForm.description.trim()} — ${amount.toFixed(2)} ${manualForm.currency}`, 'success');
      setTimeout(() => showPhotoPrompt(saved.id), 600);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showFeedback(msg.slice(0, 90), 'error');
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

      const parsed = await parseTransaction(transcription, defaultCurrency);
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
          currency: parsed.currency || defaultCurrency,
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
        setSavedTx(saved);
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
          <TouchableOpacity style={styles.iconButton} onPress={() => navigation.navigate('Recurring')}>
            <Text style={styles.iconButtonText}>↻</Text>
          </TouchableOpacity>
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
            <Text style={[styles.summaryCardValue, { color: colors.success }]}>
              +{monthSummary.income.toFixed(0)}
            </Text>
          </View>
          <View style={styles.summaryCardDivider} />
          <View style={styles.summaryCardItem}>
            <Text style={styles.summaryCardLabel}>Dépenses</Text>
            <Text style={[styles.summaryCardValue, { color: colors.expense }]}>
              -{monthSummary.expense.toFixed(0)}
            </Text>
          </View>
          <View style={styles.summaryCardDivider} />
          <View style={styles.summaryCardItem}>
            <Text style={styles.summaryCardLabel}>Solde</Text>
            <Text style={[styles.summaryCardValue, {
              color: monthSummary.income - monthSummary.expense >= 0 ? colors.success : colors.expense,
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
          <Text style={styles.feedbackText} numberOfLines={1}>{feedback.text}</Text>
          {feedback.kind === 'success' && savedTx && (
            <TouchableOpacity onPress={handleOpenQuickEdit} style={styles.quickEditBtn}>
              <Text style={styles.quickEditBtnText}>Modifier</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      )}

      {/* Modal correction rapide */}
      <Modal
        visible={showQuickEdit}
        animationType="slide"
        transparent
        onRequestClose={() => { setShowQuickEdit(false); setSavedTx(null); }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Corriger la transaction</Text>

              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={styles.fieldInput}
                value={quickForm.description}
                onChangeText={v => setQuickForm(f => ({ ...f, description: v }))}
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.fieldLabel}>Montant</Text>
              <TextInput
                style={styles.fieldInput}
                value={quickForm.amount}
                onChangeText={v => setQuickForm(f => ({ ...f, amount: v }))}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.fieldLabel}>Catégorie</Text>
              <TextInput
                style={styles.fieldInput}
                value={quickForm.category}
                onChangeText={v => setQuickForm(f => ({ ...f, category: v }))}
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.fieldLabel}>Type</Text>
              <View style={styles.typeRow}>
                {(['expense', 'income', 'debt', 'transfer'] as TransactionType[]).map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeChip, quickForm.type === t && styles.typeChipActive]}
                    onPress={() => setQuickForm(f => ({ ...f, type: t }))}
                  >
                    <Text style={[styles.typeChipText, quickForm.type === t && styles.typeChipTextActive]}>
                      {{ expense: 'Dépense', income: 'Revenu', debt: 'Dette', transfer: 'Transfert' }[t]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => { setShowQuickEdit(false); setSavedTx(null); }}
                >
                  <Text style={styles.cancelBtnText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleQuickEditSave}>
                  <Text style={styles.saveBtnText}>Enregistrer</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Modal saisie manuelle */}
      <Modal
        visible={showManualEntry}
        animationType="slide"
        transparent
        onRequestClose={() => setShowManualEntry(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Saisie manuelle</Text>

              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={styles.fieldInput}
                value={manualForm.description}
                onChangeText={v => setManualForm(f => ({ ...f, description: v }))}
                placeholder="Ex: Loyer, Courses Migros…"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />

              <Text style={styles.fieldLabel}>Montant</Text>
              <View style={styles.amountRow}>
                <TextInput
                  style={[styles.fieldInput, { flex: 1, marginBottom: 0 }]}
                  value={manualForm.amount}
                  onChangeText={v => setManualForm(f => ({ ...f, amount: v }))}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={colors.textMuted}
                />
                {(['CHF', 'EUR', 'USD'] as const).map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.currencySmallChip, manualForm.currency === c && styles.currencySmallChipActive]}
                    onPress={() => setManualForm(f => ({ ...f, currency: c }))}
                  >
                    <Text style={[styles.currencySmallText, manualForm.currency === c && styles.currencySmallTextActive]}>
                      {c}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Catégorie</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 2 }}>
                  {['Courses', 'Restaurant', 'Transport', 'Logement', 'Santé', 'Loisirs', 'Shopping', 'Salaire', 'Autre'].map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.catChip, manualForm.category === cat && styles.catChipActive]}
                      onPress={() => setManualForm(f => ({ ...f, category: cat }))}
                    >
                      <Text style={[styles.catChipText, manualForm.category === cat && styles.catChipTextActive]}>
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <TextInput
                style={styles.fieldInput}
                value={manualForm.category}
                onChangeText={v => setManualForm(f => ({ ...f, category: v }))}
                placeholder="Ou saisir une catégorie…"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.fieldLabel}>Type</Text>
              <View style={styles.typeRow}>
                {(['expense', 'income', 'debt', 'transfer'] as TransactionType[]).map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeChip, manualForm.type === t && styles.typeChipActive]}
                    onPress={() => setManualForm(f => ({ ...f, type: t }))}
                  >
                    <Text style={[styles.typeChipText, manualForm.type === t && styles.typeChipTextActive]}>
                      {{ expense: 'Dépense', income: 'Revenu', debt: 'Dette', transfer: 'Transfert' }[t]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Date</Text>
              <TextInput
                style={styles.fieldInput}
                value={manualForm.date}
                onChangeText={v => setManualForm(f => ({ ...f, date: v }))}
                placeholder="JJ.MM.AAAA"
                placeholderTextColor={colors.textMuted}
                keyboardType="numbers-and-punctuation"
                maxLength={10}
              />

              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() => setManualForm(f => ({
                  ...f,
                  is_recurring: !f.is_recurring,
                  recurrence_interval: !f.is_recurring ? 'monthly' : null,
                }))}
                activeOpacity={0.7}
              >
                <Text style={styles.toggleLabel}>Transaction récurrente</Text>
                <View style={[styles.toggle, manualForm.is_recurring && styles.toggleOn]}>
                  <View style={[styles.toggleKnob, manualForm.is_recurring && styles.toggleKnobOn]} />
                </View>
              </TouchableOpacity>

              {manualForm.is_recurring && (
                <View style={[styles.typeRow, { marginBottom: 12 }]}>
                  {(['daily', 'weekly', 'monthly', 'yearly'] as RecurrenceInterval[]).map(iv => (
                    <TouchableOpacity
                      key={iv}
                      style={[styles.typeChip, manualForm.recurrence_interval === iv && styles.typeChipActive]}
                      onPress={() => setManualForm(f => ({ ...f, recurrence_interval: iv }))}
                    >
                      <Text style={[styles.typeChipText, manualForm.recurrence_interval === iv && styles.typeChipTextActive]}>
                        {{ daily: 'Quotidien', weekly: 'Hebdo', monthly: 'Mensuel', yearly: 'Annuel' }[iv]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <View style={[styles.modalActions, { marginTop: 8 }]}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowManualEntry(false)}>
                  <Text style={styles.cancelBtnText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleManualSave}>
                  <Text style={styles.saveBtnText}>Enregistrer</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
        <TouchableOpacity
          style={[styles.scanBtn, (isScanningReceipt || isProcessing || isRecording) && { opacity: 0.4 }]}
          onPress={openReceiptScanner}
          disabled={isScanningReceipt || isProcessing || isRecording || !activeWorkspace}
        >
          <Text style={styles.scanBtnText}>
            {isScanningReceipt ? '🔍 Lecture…' : '🧾 Scanner un reçu'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.manualEntryBtn, (isProcessing || isRecording) && { opacity: 0.4 }]}
          onPress={openManualEntry}
          disabled={isProcessing || isRecording || !activeWorkspace}
        >
          <Text style={styles.manualEntryBtnText}>✏️ Saisie manuelle</Text>
        </TouchableOpacity>
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

function makeStyles(c: ColorTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    header: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8,
    },

    summaryCard: {
      flexDirection: 'row', marginHorizontal: 24, marginBottom: 8,
      backgroundColor: c.surface, borderRadius: 16, padding: 14,
      shadowColor: c.cardShadow, shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1, shadowRadius: 8, elevation: 2,
    },
    summaryCardItem: { flex: 1, alignItems: 'center', gap: 3 },
    summaryCardDivider: { width: 1, backgroundColor: c.border, marginVertical: 2 },
    summaryCardLabel: { fontSize: 10, color: c.textMuted, fontWeight: '600', textTransform: 'uppercase' },
    summaryCardValue: { fontSize: 16, fontWeight: '800' },
    greeting: { fontSize: 22, fontWeight: '800', color: c.text },
    wsIndicator: { fontSize: 13, color: c.textSecondary, marginTop: 2 },
    headerActions: { flexDirection: 'row', gap: 8 },
    iconButton: {
      width: 40, height: 40, borderRadius: 12,
      backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center',
      shadowColor: c.cardShadow, shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1, shadowRadius: 4, elevation: 2,
    },
    iconButtonText: { fontSize: 18 },
    feedbackBanner: {
      marginHorizontal: 24, marginVertical: 8,
      borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12,
      flexDirection: 'row', alignItems: 'center', gap: 10,
    },
    feedbackSuccess: { backgroundColor: c.successLight },
    feedbackError: { backgroundColor: c.expenseLight },
    feedbackInfo: { backgroundColor: c.primaryLight },
    feedbackText: { fontSize: 14, fontWeight: '600', color: c.text, flex: 1 },
    quickEditBtn: {
      backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 5,
    },
    quickEditBtnText: { fontSize: 12, fontWeight: '700', color: c.text },
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
    typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
    typeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: c.surfaceAlt },
    typeChipActive: { backgroundColor: c.primary },
    typeChipText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    typeChipTextActive: { color: '#FFFFFF' },
    modalActions: { flexDirection: 'row', gap: 12 },
    cancelBtn: { flex: 1, backgroundColor: c.surfaceAlt, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    cancelBtnText: { fontSize: 15, fontWeight: '600', color: c.text },
    saveBtn: { flex: 2, backgroundColor: c.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
    saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
    micSection: { alignItems: 'center', paddingVertical: 32 },
    micHint: { marginTop: 16, fontSize: 14, color: c.textSecondary, fontWeight: '500' },
    scanBtn: {
      marginTop: 14,
      backgroundColor: c.surfaceAlt,
      borderRadius: 20,
      paddingHorizontal: 18,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: c.border,
    },
    scanBtnText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    manualEntryBtn: {
      marginTop: 10,
      backgroundColor: c.surfaceAlt,
      borderRadius: 20,
      paddingHorizontal: 18,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: c.border,
    },
    manualEntryBtnText: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
    currencySmallChip: {
      paddingHorizontal: 10, paddingVertical: 8,
      borderRadius: 10, backgroundColor: c.surfaceAlt,
    },
    currencySmallChipActive: { backgroundColor: c.primary },
    currencySmallText: { fontSize: 13, fontWeight: '700', color: c.textSecondary },
    currencySmallTextActive: { color: '#FFFFFF' },
    catChip: {
      paddingHorizontal: 12, paddingVertical: 6,
      borderRadius: 16, backgroundColor: c.surfaceAlt,
    },
    catChipActive: { backgroundColor: c.primaryLight },
    catChipText: { fontSize: 12, fontWeight: '600', color: c.textSecondary },
    catChipTextActive: { color: c.primary },
    toggleRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 14, marginBottom: 8,
      borderTopWidth: 1, borderTopColor: c.border,
    },
    toggleLabel: { fontSize: 14, fontWeight: '600', color: c.text },
    toggle: {
      width: 46, height: 26, borderRadius: 13,
      backgroundColor: c.surfaceAlt, padding: 3,
    },
    toggleOn: { backgroundColor: c.primary },
    toggleKnob: {
      width: 20, height: 20, borderRadius: 10,
      backgroundColor: c.textMuted,
    },
    toggleKnobOn: {
      backgroundColor: '#FFFFFF',
      transform: [{ translateX: 20 }],
    },
    listSection: { flex: 1 },
    listTitle: { fontSize: 16, fontWeight: '700', color: c.text, marginHorizontal: 24, marginBottom: 8 },
    listContent: { paddingBottom: 120 },
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
    emptyIcon: { fontSize: 48, marginBottom: 12 },
    emptyText: { fontSize: 15, color: c.textSecondary, textAlign: 'center', maxWidth: 220 },
    photoBar: {
      position: 'absolute', bottom: 24, left: 24, right: 24,
      backgroundColor: c.surface, borderRadius: 20,
      flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12,
      shadowColor: c.cardShadow, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 1, shadowRadius: 16, elevation: 6,
    },
    photoSourceBtn: { flex: 1, alignItems: 'center', gap: 4 },
    photoSourceIcon: { fontSize: 22 },
    photoSourceText: { fontSize: 12, fontWeight: '700', color: c.text },
    photoSkipBtn: { paddingHorizontal: 12, paddingVertical: 8 },
    photoSkipText: { fontSize: 13, color: c.textMuted, fontWeight: '500' },

    recurBar: {
      position: 'absolute', bottom: 24, left: 24, right: 24,
      backgroundColor: c.surface, borderRadius: 20,
      flexDirection: 'row', alignItems: 'center', padding: 16, gap: 10,
      shadowColor: c.cardShadow, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 1, shadowRadius: 16, elevation: 6,
    },
    recurInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    recurIcon: { fontSize: 20, color: c.primary },
    recurTitle: { fontSize: 13, fontWeight: '700', color: c.text, maxWidth: 140 },
    recurMeta: { fontSize: 12, color: c.textMuted, marginTop: 1 },
    recurConfirmBtn: { backgroundColor: c.successLight, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
    recurConfirmText: { fontSize: 12, fontWeight: '700', color: '#2D7A4F' },
    recurSkipBtn: { paddingHorizontal: 6, paddingVertical: 8 },
    recurSkipText: { fontSize: 12, color: c.textMuted },

    noWsBanner: {
      marginHorizontal: 24, marginVertical: 4,
      backgroundColor: c.expenseLight, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10,
    },
    noWsText: { fontSize: 13, fontWeight: '600', color: c.expense, textAlign: 'center' },
  });
}
