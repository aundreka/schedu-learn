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

import type { FirebaseBackendShape as BackendShape } from '@/lib/firebase/backend-reference';
import { auth, googleAuthConfig, hasGoogleAuthConfig } from '@/lib/firebase/config';
import {
  addQuickTask,
  addStudyBlock,
  backend,
  completeOnboarding,
  createRecurringClassSchedules as createRecurringClassSchedulesData,
  createTask,
  createTaskAndSchedule,
  ensureUserWorkspace,
  mapPreferences,
  mapProfile,
  mapTask,
  moveSchedule,
  refreshLmsFeed,
  resetCurrentUserData,
  clearImportedEafClassSchedules as clearImportedEafClassSchedulesData,
  subscribeToLmsFeed,
  subscribeToPreferences,
  subscribeToProfile,
  subscribeToSchedules,
  subscribeToTasks,
  updatePreferences,
  updateProfile as updateBackendProfile,
  updateTask,
  updateTaskStatus,
} from '@/lib/firebase/data';
import type {
  CompleteOnboardingInput,
  CreateStudyBlockInput,
  CreateTaskInput,
  EafImportItem,
  ExtractedClass,
  LmsFeedItem,
  ScheduleDraft,
  ScheduleItem,
  TaskItem,
  UserPreferences,
  UserProfile,
} from '@/lib/firebase/types';

WebBrowser.maybeCompleteAuthSession();

type FirebaseContextValue = Omit<
  BackendShape,
  'profile' | 'preferences' | 'tasks' | 'schedules' | 'lmsFeed' | 'createTask' | 'createTaskAndSchedule' | 'createStudyBlock' | 'createTaskFromLmsFeed' | 'updateProfile' | 'completeOnboarding' | 'resetCurrentUserData'
> & {
  authReady: boolean;
  canUseGoogleSignIn: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  signOut: () => Promise<void>;
  savePreferences: (preferences: Partial<UserPreferences>) => Promise<void>;
  createQuickTask: () => Promise<void>;
  profile: UserProfile | null;
  preferences: UserPreferences | null;
  tasks: TaskItem[];
  schedules: ScheduleItem[];
  lmsFeed: LmsFeedItem[];
  createTask: (input: CreateTaskInput) => Promise<TaskItem>;
  createTaskAndSchedule: (input: CreateTaskInput) => Promise<TaskItem>;
  createStudyBlock: (input: CreateStudyBlockInput) => Promise<void>;
  autoScheduleTask: (taskId: string) => Promise<ScheduleDraft[]>;
  regenerateFutureStudyPlanForTask: (taskId: string) => Promise<ScheduleDraft[]>;
  uploadEafFile: (params: { fileUri: string; blob: Blob; filename: string }) => Promise<EafImportItem>;
  saveParsedEafClasses: (importId: string, extractedClasses: ExtractedClass[], extractedText?: string) => Promise<void>;
  confirmEafClasses: (importId: string, confirmedClasses: ExtractedClass[]) => Promise<void>;
  importConfirmedEafClassesToSchedules: (importId: string, weeksToGenerate?: number) => Promise<void>;
  createRecurringClassSchedules: (classes: ExtractedClass[], weeksToGenerate?: number) => Promise<void>;
  updateProfile: (patch: Partial<UserProfile>) => Promise<void>;
  completeOnboarding: (input: CompleteOnboardingInput) => Promise<void>;
  resetCurrentUserData: () => Promise<void>;
};

const FirebaseContext = createContext<FirebaseContextValue | null>(null);

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [rawProfile, setRawProfile] = useState<Omit<UserProfile, 'preferences'> | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
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
      setRawProfile(null);
      setPreferences(null);
      setTasks([]);
      setSchedules([]);
      setLmsFeed([]);
      setLoadingData(false);
      return;
    }

    setLoadingData(true);
    setAuthMessage(null);

    let pendingStreams = 5;
    const settleStream = () => {
      pendingStreams -= 1;
      if (pendingStreams <= 0) {
        setLoadingData(false);
      }
    };

    const handleError = (error: Error) => {
      setAuthMessage(error.message);
      setLoadingData(false);
    };

    const unsubProfile = subscribeToProfile(user.uid, (nextProfile) => {
      setRawProfile(nextProfile);
      settleStream();
    }, handleError);

    const unsubPreferences = subscribeToPreferences(user.uid, (nextPreferences) => {
      setPreferences(nextPreferences ? mapPreferences(nextPreferences) : null);
      settleStream();
    }, handleError);

    const unsubTasks = subscribeToTasks(user.uid, (nextTasks) => {
      setTasks(nextTasks);
      settleStream();
    }, handleError);

    const unsubSchedules = subscribeToSchedules(user.uid, (nextSchedules) => {
      setSchedules(nextSchedules);
      settleStream();
    }, handleError);

    const unsubLms = subscribeToLmsFeed(user.uid, (nextFeed) => {
      setLmsFeed(nextFeed);
      settleStream();
    }, handleError);

    return () => {
      unsubProfile();
      unsubPreferences();
      unsubTasks();
      unsubSchedules();
      unsubLms();
    };
  }, [user]);

  const profile = useMemo(() => mapProfile(rawProfile, preferences), [preferences, rawProfile]);

  const value = useMemo<FirebaseContextValue>(() => ({
    authReady,
    user,
    profile,
    preferences,
    tasks,
    schedules,
    lmsFeed,
    loadingData,
    authMessage,
    canUseGoogleSignIn: hasGoogleAuthConfig,
    ensureUserBootstrap: async () => {
      await backend.ensureUserBootstrap();
    },
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
    savePreferences: async (nextPreferences) => {
      if (!user) throw new Error('Sign in first to save preferences.');
      await updatePreferences(user.uid, nextPreferences);
    },
    createQuickTask: async () => {
      if (!user) throw new Error('Sign in first to create a task.');
      await addQuickTask(user.uid);
    },
    createTask: async (input) => {
      if (!user) throw new Error('Sign in first to create a task.');
      return createTask(user.uid, input);
    },
    createTaskAndSchedule: async (input) => {
      if (!user) throw new Error('Sign in first to create a task.');
      return createTaskAndSchedule(user.uid, input);
    },
    updateTask: async (taskId, patch) => {
      if (!user) throw new Error('Sign in first to update tasks.');
      await updateTask(user.uid, taskId, patch);
    },
    setTaskStatus: async (taskId, status) => {
      if (!user) throw new Error('Sign in first to update tasks.');
      await updateTaskStatus(user.uid, taskId, status);
    },
    refreshMockLmsFeed: async () => {
      if (!user) throw new Error('Sign in first to refresh LMS items.');
      await refreshLmsFeed(user.uid);
    },
    createTaskFromLmsFeed: async (feedId: string) => {
      if (!user) throw new Error('Sign in first to convert LMS items.');
      return mapTask(await backend.createTaskFromLmsFeed(feedId));
    },
    updateProfile: async (patch) => {
      if (!user) throw new Error('Sign in first to update your profile.');
      await updateBackendProfile(user.uid, patch);
    },
    completeOnboarding: async (input) => {
      if (!user) throw new Error('Sign in first to complete onboarding.');
      await completeOnboarding(user.uid, input);
    },
    resetCurrentUserData: async () => {
      if (!user) throw new Error('Sign in first to reset your workspace.');
      await resetCurrentUserData(user.uid);
    },
    createStudyBlock: async (input) => {
      if (!user) throw new Error('Sign in first to add a study block.');
      await addStudyBlock(user.uid, input);
    },
    rescheduleItem: async (scheduleId, startsAt, endsAt) => {
      if (!user) throw new Error('Sign in first to update your schedule.');
      await moveSchedule(user.uid, scheduleId, startsAt, endsAt);
    },
    markScheduleDone: async (scheduleId) => {
      if (!user) throw new Error('Sign in first to update your schedule.');
      await backend.markScheduleDone(scheduleId);
    },
    markScheduleMissed: async (scheduleId) => {
      if (!user) throw new Error('Sign in first to update your schedule.');
      await backend.markScheduleMissed(scheduleId);
    },
    autoScheduleTask: async (taskId) => {
      if (!user) throw new Error('Sign in first to schedule tasks.');
      return backend.autoScheduleTask(taskId);
    },
    regenerateFutureStudyPlanForTask: async (taskId) => {
      if (!user) throw new Error('Sign in first to rebuild schedules.');
      return backend.regenerateFutureStudyPlanForTask(taskId);
    },
    uploadEafFile: async (params) => {
      if (!user) throw new Error('Sign in first to upload EAF files.');
      return backend.uploadEafFile(params);
    },
    saveParsedEafClasses: async (importId, extractedClasses, extractedText) => {
      if (!user) throw new Error('Sign in first to save parsed classes.');
      await backend.saveParsedEafClasses(importId, extractedClasses, extractedText);
    },
    confirmEafClasses: async (importId, confirmedClasses) => {
      if (!user) throw new Error('Sign in first to confirm classes.');
      await backend.confirmEafClasses(importId, confirmedClasses);
    },
    importConfirmedEafClassesToSchedules: async (importId, weeksToGenerate) => {
      if (!user) throw new Error('Sign in first to import classes.');
      await backend.importConfirmedEafClassesToSchedules(importId, weeksToGenerate);
    },
    createRecurringClassSchedules: async (classes, weeksToGenerate) => {
      if (!user) throw new Error('Sign in first to save class schedules.');
      await createRecurringClassSchedulesData(user.uid, classes, weeksToGenerate);
    },
    clearImportedEafClassSchedules: async () => {
      if (!user) throw new Error('Sign in first to clear imported classes.');
      await clearImportedEafClassSchedulesData(user.uid);
    },
  }), [authMessage, authReady, lmsFeed, loadingData, preferences, profile, promptAsync, schedules, tasks, user]);

  return <FirebaseContext.Provider value={value}>{children}</FirebaseContext.Provider>;
}

export function useFirebaseBackend() {
  const context = useContext(FirebaseContext);

  if (!context) {
    throw new Error('useFirebaseBackend must be used inside FirebaseProvider.');
  }

  return context;
}



