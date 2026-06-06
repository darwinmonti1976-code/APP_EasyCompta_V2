import 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';
import { useEffect, useRef, useState, Component, ReactNode } from 'react';
import * as Notifications from 'expo-notifications';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './src/lib/supabase';
import { WorkspaceProvider } from './src/lib/WorkspaceContext';
import { ThemeProvider } from './src/lib/ThemeContext';
import { AuthScreen } from './src/screens/AuthScreen';
import { MainScreen } from './src/screens/MainScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { RecurringScreen } from './src/screens/RecurringScreen';
import { BudgetScreen } from './src/screens/BudgetScreen';
import { OnboardingScreen, ONBOARDING_KEY } from './src/screens/OnboardingScreen';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
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
  Onboarding: undefined;
  Main: undefined;
  History: undefined;
  Settings: undefined;
  Recurring: undefined;
  Budget: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationRef = createNavigationContainerRef<RootStackParamList>();

function routeFromNotifData(data: Record<string, unknown>): keyof RootStackParamList | null {
  if (data?.notifType === 'recurring_reminder') return 'Main';
  return null;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const pendingRoute = useRef<keyof RootStackParamList | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session) {
        const done = await AsyncStorage.getItem(ONBOARDING_KEY);
        setOnboardingDone(!!done);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    requestNotificationPermissions();

    // Tap sur une notif quand l'app est en foreground ou background
    const notifSub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      const route = routeFromNotifData(data);
      if (!route) return;
      if (navigationRef.isReady()) {
        navigationRef.navigate(route);
      } else {
        pendingRoute.current = route;
      }
    });

    // Tap sur une notif qui a lancé l'app depuis l'état tué — traité dans onReady()
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (!response) return;
      const data = response.notification.request.content.data as Record<string, unknown>;
      const route = routeFromNotifData(data);
      if (route) pendingRoute.current = route;
    });

    return () => {
      subscription.unsubscribe();
      notifSub.remove();
    };
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
      <ThemeProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <WorkspaceProvider
            userId={session?.user.id ?? ''}
            userEmail={session?.user.email ?? ''}
          >
            <NavigationContainer
              ref={navigationRef}
              onReady={() => {
                if (pendingRoute.current) {
                  navigationRef.navigate(pendingRoute.current);
                  pendingRoute.current = null;
                }
              }}
            >
              <Stack.Navigator screenOptions={{ headerShown: false }}>
                {session ? (
                  <>
                    {!onboardingDone && (
                      <Stack.Screen
                        name="Onboarding"
                        component={OnboardingScreen}
                        options={{ animation: 'fade' }}
                      />
                    )}
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
                    <Stack.Screen
                      name="Recurring"
                      component={RecurringScreen}
                      options={{ animation: 'slide_from_right' }}
                    />
                    <Stack.Screen
                      name="Budget"
                      component={BudgetScreen}
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
      </ThemeProvider>
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
