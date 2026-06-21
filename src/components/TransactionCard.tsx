import { useRef } from 'react';
import {
  Animated,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  PanResponder,
} from 'react-native';
import { useTheme } from '../lib/ThemeContext';
import { ColorTheme } from '../constants/colors';
import { Transaction, TransactionType } from '../lib/types';

interface Props {
  transaction: Transaction;
  onDelete: (id: string) => void;
  onPress: (transaction: Transaction) => void;
  showCreator?: boolean;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' });
}

function formatAmount(amount: number, type: TransactionType, currency: string): string {
  const sign = type === 'income' ? '+' : type === 'expense' ? '-' : '';
  return `${sign}${amount.toFixed(2)} ${currency}`;
}

function shortEmail(email: string): string {
  return email.split('@')[0];
}

export function TransactionCard({ transaction, onDelete, onPress, showCreator = false }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const TYPE_COLORS: Record<TransactionType, { bg: string; text: string }> = {
    expense:  { bg: colors.expenseLight,  text: colors.expense },
    income:   { bg: colors.incomeLight,   text: colors.income },
    debt:     { bg: colors.debtLight,     text: colors.debt },
    transfer: { bg: colors.primaryLight,  text: colors.primary },
  };
  const translateX    = useRef(new Animated.Value(0)).current;
  const deleteOpacity = useRef(new Animated.Value(0)).current;
  const SWIPE_THRESHOLD = -80;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 5 && Math.abs(g.dy) < 15,
      onPanResponderMove: (_, g) => {
        if (g.dx < 0) {
          translateX.setValue(g.dx);
          deleteOpacity.setValue(Math.min(1, Math.abs(g.dx) / 80));
        }
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < SWIPE_THRESHOLD) {
          Animated.parallel([
            Animated.timing(translateX,    { toValue: -400, duration: 250, useNativeDriver: true }),
            Animated.timing(deleteOpacity, { toValue: 0,    duration: 250, useNativeDriver: true }),
          ]).start(() => onDelete(transaction.id));
        } else {
          Animated.parallel([
            Animated.spring(translateX,    { toValue: 0, useNativeDriver: true, tension: 120, friction: 10 }),
            Animated.timing(deleteOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
          ]).start();
        }
      },
    })
  ).current;

  const typeStyle  = TYPE_COLORS[transaction.type];
  const hasThumbnail = transaction.has_attachment && !!transaction.attachment_url;

  return (
    <View style={styles.wrapper}>
      <Animated.View style={[styles.deleteBackground, { opacity: deleteOpacity }]}>
        <Text style={styles.deleteText}>Supprimer</Text>
      </Animated.View>

      <Animated.View
        style={[styles.card, { transform: [{ translateX }] }]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity activeOpacity={0.85} onPress={() => onPress(transaction)} style={styles.inner}>

          {/* Category badge */}
          <View style={[styles.categoryBadge, { backgroundColor: typeStyle.bg }]}>
            <Text style={[styles.categoryText, { color: typeStyle.text }]}>
              {transaction.category}
            </Text>
          </View>

          {/* Description + meta */}
          <View style={styles.info}>
            <Text style={styles.description} numberOfLines={1}>
              {transaction.description_clean}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.date}>{formatDate(transaction.date)}</Text>
              {showCreator && transaction.created_by_email ? (
                <View style={styles.creatorBadge}>
                  <Text style={styles.creatorText}>
                    {shortEmail(transaction.created_by_email)}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Thumbnail — shown when a photo is attached */}
          {hasThumbnail ? (
            <Image
              source={{ uri: transaction.attachment_url! }}
              style={styles.thumbnail}
            />
          ) : null}

          {/* Recurring badge */}
          {transaction.is_recurring && (
            <View style={styles.recurBadge}>
              <Text style={styles.recurIcon}>↻</Text>
            </View>
          )}

          {/* Amount */}
          <Text style={[
            styles.amount,
            { color: transaction.type === 'income' ? colors.success : colors.text },
          ]}>
            {formatAmount(transaction.amount, transaction.type, transaction.currency)}
          </Text>

        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

function makeStyles(c: ColorTheme) {
  return StyleSheet.create({
    wrapper: {
      marginHorizontal: 16,
      marginVertical: 4,
      borderRadius: 16,
      overflow: 'hidden',
    },
    deleteBackground: {
      position: 'absolute', right: 0, top: 0, bottom: 0, width: 100,
      backgroundColor: c.expense, alignItems: 'center', justifyContent: 'center', borderRadius: 16,
    },
    deleteText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },

    card: {
      backgroundColor: c.surface, borderRadius: 16,
      shadowColor: c.cardShadow, shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 1, shadowRadius: 8, elevation: 2,
    },
    inner: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 12, paddingHorizontal: 14, gap: 10,
    },

    categoryBadge: {
      paddingHorizontal: 10, paddingVertical: 5,
      borderRadius: 10, minWidth: 70, alignItems: 'center',
    },
    categoryText: { fontSize: 12, fontWeight: '600' },

    info: { flex: 1 },
    description: { fontSize: 14, fontWeight: '600', color: c.text, marginBottom: 4 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    date: { fontSize: 12, color: c.textMuted },
    creatorBadge: {
      backgroundColor: c.primaryLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
    },
    creatorText: { fontSize: 11, fontWeight: '600', color: c.primary },

    thumbnail: {
      width: 44,
      height: 44,
      borderRadius: 8,
      backgroundColor: c.surfaceAlt,
    },

    amount: { fontSize: 15, fontWeight: '700' },

    recurBadge: {
      width: 22, height: 22, borderRadius: 11,
      backgroundColor: c.primaryLight,
      alignItems: 'center', justifyContent: 'center',
    },
    recurIcon: { fontSize: 12, color: c.primary, fontWeight: '700' },
  });
}
