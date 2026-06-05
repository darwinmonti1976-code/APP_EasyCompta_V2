import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/colors';

type Mode = 'login' | 'register' | 'reset';

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setMessage(null);
  }

  async function handleAuth() {
    if (!email.trim() || !password.trim()) {
      setMessage({ text: 'Remplis les deux champs 😊', type: 'error' });
      return;
    }

    setLoading(true);
    setMessage(null);

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage({ text: 'Email ou mot de passe incorrect', type: 'error' });
      }
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMessage({ text: 'Inscription impossible. Réessaie.', type: 'error' });
      } else if (data.user) {
        await createDefaultWorkspace(data.user.id);
        setMessage({ text: 'Compte créé ! Connecte-toi 🎉', type: 'success' });
        setMode('login');
      }
    }

    setLoading(false);
  }

  async function handleReset() {
    if (!email.trim()) {
      setMessage({ text: 'Entre ton adresse email 😊', type: 'error' });
      return;
    }

    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) {
      setMessage({ text: 'Impossible d\'envoyer le lien. Vérifie l\'email.', type: 'error' });
    } else {
      setMessage({ text: 'Lien envoyé ! Consulte ta boîte mail.', type: 'success' });
    }

    setLoading(false);
  }

  async function createDefaultWorkspace(userId: string) {
    await supabase.from('workspaces').insert({
      name: 'Personnel',
      type: 'personal',
      owner_id: userId,
    });
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoIcon}>💰</Text>
          </View>
          <Text style={styles.title}>EasyCompta</Text>
          <Text style={styles.subtitle}>Ton compagnon financier vocal</Text>
        </View>

        <View style={styles.card}>
          {mode === 'reset' ? (
            /* ── Mot de passe oublié ── */
            <>
              <Text style={styles.resetTitle}>Mot de passe oublié</Text>
              <Text style={styles.resetSubtitle}>
                Entre ton email et on t'envoie un lien pour réinitialiser ton mot de passe.
              </Text>

              <TextInput
                style={[styles.input, styles.resetInput]}
                placeholder="Email"
                placeholderTextColor={Colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoFocus
              />

              {message && (
                <View style={[styles.messageBanner, message.type === 'error' ? styles.messageBannerError : styles.messageBannerSuccess]}>
                  <Text style={[styles.messageText, message.type === 'error' ? styles.messageTextError : styles.messageTextSuccess]}>
                    {message.text}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleReset}
                disabled={loading}
              >
                <Text style={styles.buttonText}>{loading ? '···' : 'Envoyer le lien'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.backLink} onPress={() => switchMode('login')}>
                <Text style={styles.backLinkText}>← Retour à la connexion</Text>
              </TouchableOpacity>
            </>
          ) : (
            /* ── Login / Register ── */
            <>
              <View style={styles.tabs}>
                <TouchableOpacity
                  style={[styles.tab, mode === 'login' && styles.tabActive]}
                  onPress={() => switchMode('login')}
                >
                  <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>
                    Connexion
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tab, mode === 'register' && styles.tabActive]}
                  onPress={() => switchMode('register')}
                >
                  <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>
                    Inscription
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.form}>
                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor={Colors.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Mot de passe"
                  placeholderTextColor={Colors.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="password"
                />
              </View>

              {message && (
                <View style={[styles.messageBanner, message.type === 'error' ? styles.messageBannerError : styles.messageBannerSuccess]}>
                  <Text style={[styles.messageText, message.type === 'error' ? styles.messageTextError : styles.messageTextSuccess]}>
                    {message.text}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleAuth}
                disabled={loading}
              >
                <Text style={styles.buttonText}>
                  {loading ? '···' : mode === 'login' ? 'Se connecter' : "S'inscrire"}
                </Text>
              </TouchableOpacity>

              {mode === 'login' && (
                <TouchableOpacity style={styles.forgotLink} onPress={() => switchMode('reset')}>
                  <Text style={styles.forgotLinkText}>Mot de passe oublié ?</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoIcon: {
    fontSize: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 6,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 24,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 4,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: Colors.surface,
    shadowColor: Colors.cardShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.primary,
  },
  form: {
    gap: 12,
    marginBottom: 16,
  },
  input: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.text,
  },
  messageBanner: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  messageBannerError: {
    backgroundColor: Colors.expenseLight,
  },
  messageBannerSuccess: {
    backgroundColor: Colors.successLight,
  },
  messageText: {
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
  messageTextError: {
    color: '#D64545',
  },
  messageTextSuccess: {
    color: '#2D7A4F',
  },
  button: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  forgotLink: {
    marginTop: 16,
    alignItems: 'center',
  },
  forgotLinkText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '500',
  },
  resetTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  resetSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  resetInput: {
    marginBottom: 16,
  },
  backLink: {
    marginTop: 16,
    alignItems: 'center',
  },
  backLinkText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
});
