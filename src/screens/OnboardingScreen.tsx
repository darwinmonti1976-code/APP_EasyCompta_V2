import { useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/colors';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';

export const ONBOARDING_KEY = '@onboarding_done';

const SLIDES = [
  {
    icon: '🎙️',
    color: Colors.primaryLight,
    title: 'Parle pour noter',
    body: 'Appuie longuement sur le micro et dis ce que tu as dépensé ou reçu.',
    example: '"J\'ai payé 45 francs au supermarché"',
  },
  {
    icon: '📊',
    color: Colors.successLight,
    title: 'Suis tes finances',
    body: 'Historique complet, filtres par période, graphiques et export PDF ou CSV.',
    example: null,
  },
  {
    icon: '👨‍👩‍👧',
    color: Colors.debtLight,
    title: 'Partage en famille',
    body: 'Crée des espaces famille ou pro pour suivre les finances ensemble.',
    example: 'Invitations par email, transactions partagées en temps réel.',
  },
];

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;
}

export function OnboardingScreen({ navigation }: Props) {
  const [current, setCurrent] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const isLast = current === SLIDES.length - 1;

  function transition(nextIndex: number) {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    setTimeout(() => setCurrent(nextIndex), 120);
  }

  async function finish() {
    await AsyncStorage.setItem(ONBOARDING_KEY, '1');
    navigation.replace('Main');
  }

  const slide = SLIDES[current];

  return (
    <SafeAreaView style={styles.container}>

      {/* Slide content */}
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <View style={[styles.iconCircle, { backgroundColor: slide.color }]}>
          <Text style={styles.icon}>{slide.icon}</Text>
        </View>

        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.body}>{slide.body}</Text>

        {slide.example && (
          <View style={styles.exampleBox}>
            <Text style={styles.exampleText}>{slide.example}</Text>
          </View>
        )}
      </Animated.View>

      {/* Dots */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === current && styles.dotActive]} />
        ))}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={isLast ? finish : () => transition(current + 1)}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>
            {isLast ? 'Commencer 🚀' : 'Suivant'}
          </Text>
        </TouchableOpacity>

        {!isLast && (
          <TouchableOpacity style={styles.skipBtn} onPress={finish}>
            <Text style={styles.skipBtnText}>Passer</Text>
          </TouchableOpacity>
        )}
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 32,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 32,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  icon: {
    fontSize: 56,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  body: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 300,
  },
  exampleBox: {
    marginTop: 24,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 2,
  },
  exampleText: {
    fontSize: 15,
    color: Colors.primary,
    fontWeight: '600',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 32,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
  },
  dotActive: {
    width: 24,
    backgroundColor: Colors.primary,
  },
  actions: {
    paddingBottom: 16,
    gap: 12,
  },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  skipBtnText: {
    fontSize: 15,
    color: Colors.textMuted,
    fontWeight: '500',
  },
});
