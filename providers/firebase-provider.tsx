import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import {
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';

import { auth, googleAuthConfig, hasGoogleAuthConfig } from '@/lib/firebase/config';
import {
  addQuickTask,
  ensureUserWorkspace,
  seedLmsMockData,
  subscribeToLmsFeed,
  subscribeToProfile,
  subscribeToSchedules,
  subscribeToTasks,
  updatePreferences,
} from '@/lib/firebase/data';
import {
  LmsFeedItem,
  ScheduleItem,
  TaskItem,
  UserPreferences,
  UserProfile,
} from '@/lib/firebase/types';

WebBrowser.maybeCompleteAuthSession();

type FirebaseContextValue = {
  authReady: boolean;
  user: User | null;
  profile: UserProfile | null;
  tasks: TaskItem[];
  schedules: ScheduleItem[];
  lmsFeed: LmsFeedItem[];
  loadingData: boolean;
  authMessage: string | null;
  canUseGoogleSignIn: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  savePreferences: (preferences: Partial<UserPreferences>) => Promise<void>;
  createQuickTask: () => Promise<void>;
  refreshMockLmsFeed: () => Promise<void>;
};

const FirebaseContext = createContext<FirebaseContextValue | null>(null);

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [lmsFeed, setLmsFeed] = useState<LmsFeedItem[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const [, response, promptAsync] = Google.useIdTokenAuthRequest({
    ...googleAuthConfig,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);

      if (nextUser) {
        try {
          await ensureUserWorkspace(nextUser);
        } catch (error) {
          setAuthMessage(error instanceof Error ? error.message : 'Unable to prepare your workspace.');
        }
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (response?.type !== 'success') {
      return;
    }

    const idToken = response.params?.id_token;
    if (!idToken) {
      setAuthMessage('Google login returned without an ID token.');
      return;
    }

    signInWithCredential(auth, GoogleAuthProvider.credential(idToken)).catch((error) => {
      setAuthMessage(error instanceof Error ? error.message : 'Unable to sign in with Google.');
    });
  }, [response]);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setTasks([]);
      setSchedules([]);
      setLmsFeed([]);
      setLoadingData(false);
      return;
    }

    setLoadingData(true);

    const unsubProfile = subscribeToProfile(
      user.uid,
      (nextProfile) => {
        setProfile(nextProfile);
        setLoadingData(false);
      },
      (error) => setAuthMessage(error.message)
    );

    const unsubTasks = subscribeToTasks(user.uid, setTasks, (error) => setAuthMessage(error.message));
    const unsubSchedules = subscribeToSchedules(
      user.uid,
      setSchedules,
      (error) => setAuthMessage(error.message)
    );
    const unsubLms = subscribeToLmsFeed(user.uid, setLmsFeed, (error) => setAuthMessage(error.message));

    return () => {
      unsubProfile();
      unsubTasks();
      unsubSchedules();
      unsubLms();
    };
  }, [user]);

  const value = useMemo<FirebaseContextValue>(
    () => ({
      authReady,
      user,
      profile,
      tasks,
      schedules,
      lmsFeed,
      loadingData,
      authMessage,
      canUseGoogleSignIn: hasGoogleAuthConfig,
      signInWithGoogle: async () => {
        if (!hasGoogleAuthConfig) {
          throw new Error('Add Google client IDs to .env before using Google sign-in.');
        }

        setAuthMessage(null);
        await promptAsync();
      },
      signInWithEmail: async (email, password) => {
        setAuthMessage(null);
        await signInWithEmailAndPassword(auth, email.trim(), password);
      },
      signUpWithEmail: async (email, password, displayName) => {
        setAuthMessage(null);
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);

        if (displayName?.trim()) {
          await updateProfile(credential.user, {
            displayName: displayName.trim(),
          });
        }

        await ensureUserWorkspace(credential.user);
      },
      signOut: async () => {
        await firebaseSignOut(auth);
      },
      savePreferences: async (preferences) => {
        if (!user) {
          throw new Error('Sign in first to save preferences.');
        }

        await updatePreferences(user.uid, preferences);
      },
      createQuickTask: async () => {
        if (!user) {
          throw new Error('Sign in first to create a task.');
        }

        await addQuickTask(user.uid);
      },
      refreshMockLmsFeed: async () => {
        if (!user) {
          throw new Error('Sign in first to refresh LMS items.');
        }

        await seedLmsMockData(user.uid);
      },
    }),
    [authMessage, authReady, lmsFeed, loadingData, profile, promptAsync, schedules, tasks, user]
  );

  return <FirebaseContext.Provider value={value}>{children}</FirebaseContext.Provider>;
}

export function useFirebaseBackend() {
  const context = useContext(FirebaseContext);

  if (!context) {
    throw new Error('useFirebaseBackend must be used inside FirebaseProvider.');
  }

  return context;
}
