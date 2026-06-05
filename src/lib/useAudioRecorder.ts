import { useState, useRef } from 'react';
import { Platform } from 'react-native';
import { Audio } from 'expo-av';

export type AudioSource = { uri: string } | { blob: Blob };

interface AudioRecorder {
  isRecording: boolean;
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<AudioSource | null>;
}

export function useAudioRecorder(): AudioRecorder {
  const [isRecording, setIsRecording] = useState(false);

  // Mobile refs
  const mobileRecordingRef = useRef<Audio.Recording | null>(null);

  // Web refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  async function startRecording(): Promise<boolean> {
    if (Platform.OS === 'web') {
      return startRecordingWeb();
    }
    return startRecordingMobile();
  }

  async function stopRecording(): Promise<AudioSource | null> {
    if (Platform.OS === 'web') {
      return stopRecordingWeb();
    }
    return stopRecordingMobile();
  }

  // ─── Web ─────────────────────────────────────────────────────────────────

  async function startRecordingWeb(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg';

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.start(100); // collect chunks every 100ms
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      return true;
    } catch {
      return false;
    }
  }

  async function stopRecordingWeb(): Promise<AudioSource | null> {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return null;

    return new Promise((resolve) => {
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        recorder.stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];
        setIsRecording(false);
        resolve({ blob });
      };
      recorder.stop();
    });
  }

  // ─── Mobile ──────────────────────────────────────────────────────────────

  async function startRecordingMobile(): Promise<boolean> {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) return false;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      mobileRecordingRef.current = recording;
      setIsRecording(true);
      return true;
    } catch {
      return false;
    }
  }

  async function stopRecordingMobile(): Promise<AudioSource | null> {
    const recording = mobileRecordingRef.current;
    if (!recording) return null;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      mobileRecordingRef.current = null;
      setIsRecording(false);
      return uri ? { uri } : null;
    } catch {
      mobileRecordingRef.current = null;
      setIsRecording(false);
      return null;
    }
  }

  return { isRecording, startRecording, stopRecording };
}
