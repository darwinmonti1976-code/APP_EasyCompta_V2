import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Colors } from '../constants/colors';

interface Props {
  isRecording: boolean;
  isProcessing: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
}

export function MicButton({ isRecording, isProcessing, onPressIn, onPressOut }: Props) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isRecording) {
      Animated.spring(scaleAnim, {
        toValue: 1.1,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }).start();

      const pulse = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(pulseAnim, {
              toValue: 1.6,
              duration: 800,
              useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
              toValue: 0,
              duration: 800,
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 0,
              useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
              toValue: 0.5,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }).start();
      opacityAnim.setValue(0);
    }
  }, [isRecording]);

  const buttonColor = isRecording
    ? Colors.mic.recording
    : isProcessing
    ? Colors.textMuted
    : Colors.mic.idle;

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.pulse,
          {
            transform: [{ scale: pulseAnim }],
            opacity: opacityAnim,
            backgroundColor: isRecording ? Colors.mic.recording : Colors.mic.pulse,
          },
        ]}
      />
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <Pressable
          onPressIn={isProcessing ? undefined : onPressIn}
          onPressOut={isProcessing ? undefined : onPressOut}
          style={[styles.button, { backgroundColor: buttonColor }]}
        >
          <MicIcon isRecording={isRecording} isProcessing={isProcessing} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

function MicIcon({ isRecording, isProcessing }: { isRecording: boolean; isProcessing: boolean }) {
  const dotAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isProcessing) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(dotAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(dotAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      dotAnim.setValue(0);
    }
  }, [isProcessing]);

  if (isProcessing) {
    return (
      <Animated.Text style={[styles.icon, { opacity: dotAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }]}>
        ···
      </Animated.Text>
    );
  }

  return (
    <MicSVG color="#FFFFFF" size={36} />
  );
}

function MicSVG({ color, size }: { color: string; size: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[styles.micBody, { borderColor: color }]} />
      <View style={[styles.micStand, { backgroundColor: color }]} />
      <View style={[styles.micBase, { backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 160,
    height: 160,
  },
  pulse: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
  },
  button: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  icon: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
  },
  micBody: {
    width: 18,
    height: 26,
    borderRadius: 9,
    borderWidth: 3,
    marginBottom: 2,
  },
  micStand: {
    width: 2,
    height: 8,
  },
  micBase: {
    width: 18,
    height: 2,
    borderRadius: 1,
    marginTop: -1,
  },
});
