import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const { initializeAuth, getReactNativePersistence } = require('@firebase/auth') as {
  initializeAuth: (app: ReturnType<typeof getApp>, deps?: { persistence?: unknown }) => Auth;
  getReactNativePersistence: (storage: typeof AsyncStorage) => unknown;
};

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let authInstance: Auth;

try {
  authInstance = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  authInstance = getAuth(app);
}

export const firebaseApp = app;
export const auth = authInstance;
export const db = getFirestore(app);

export const hasFirebaseConfig = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
);

export const googleAuthConfig = {
  androidClientId: process.env.EXPO_PUBLIC_FIREBASE_ANDROID_CLIENT_ID,
  iosClientId: process.env.EXPO_PUBLIC_FIREBASE_IOS_CLIENT_ID,
  webClientId: process.env.EXPO_PUBLIC_FIREBASE_WEB_CLIENT_ID,
};

export const hasGoogleAuthConfig = Boolean(
  googleAuthConfig.androidClientId || googleAuthConfig.iosClientId || googleAuthConfig.webClientId
);
