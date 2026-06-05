import 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';
import { useEffect, useState, Component, ReactNode } from 'react';
import * as Notifications from 'expo-notifications';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import { WorkspaceProvider } from './src/lib/WorkspaceContext';
import { AuthScreen } from './src/screens/AuthScreen';
import { MainScreen } from './src/screens/MainScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { View, ActivityIndicator, StyleSheet, Text, ScrollView } from 'react-native';
import { Colors } from './src/constants/colors';
import { requestNotificationPermissions } from './src/lib/useNotifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() {
    if (this.state.error) {
      return (
        <View style={errStyles.container}>
          <Text style={errStyles.emoji}>😕</Text>
          <Text style={errStyles.title}>Quelque chose s'est mal passé</Text>
          <Text style={errStyles.sub}>Ferme et relance l'application.</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const errStyles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F9FF', padding: 32 },
  emoji: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '700', color: '#2D3748', marginBottom: 8, textAlign: 'center' },
  sub: { fontSize: 14, color: '#718096', textAlign: 'center' },
});

export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  History: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    requestNotificationPermissions();

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <WorkspaceProvider
            userId={session?.user.id ?? ''}
            userEmail={session?.user.email ?? ''}
          >
            <NavigationContainer>
              <Stack.Navigator screenOptions={{ headerShown: false }}>
                {session ? (
                  <>
                    <Stack.Screen name="Main" component={MainScreen} />
                    <Stack.Screen
                      name="History"
                      component={HistoryScreen}
                      options={{ animation: 'slide_from_right' }}
                    />
                    <Stack.Screen
                      name="Settings"
                      component={SettingsScreen}
                      options={{ animation: 'slide_from_right' }}
                    />
                  </>
                ) : (
                  <Stack.Screen name="Auth" component={AuthScreen} />
                )}
              </Stack.Navigator>
            </NavigationContainer>
          </WorkspaceProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
