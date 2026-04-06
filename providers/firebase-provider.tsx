import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';

import type { FirebaseBackendShape as BackendShape } from '@/lib/firebase/backend-reference';
import { auth } from '@/lib/firebase/config';
import {
  addQuickTask,
  addStudyBlock,
  backend,
  clearImportedEafClassSchedules as clearImportedEafClassSchedulesData,
  completeOnboarding,
  connectLms,
  createRecurringClassSchedules as createRecurringClassSchedulesData,
  createTask,
  createTaskAndSchedule,
  ensureUserWorkspace,
  fetchGroupStudySlots,
  mapPreferences,
  mapProfile,
  mapTask,
  moveSchedule,
  refreshLmsFeed,
  resetCurrentUserData,
  resetLmsDemo,
  subscribeToLmsFeed,
  subscribeToPreferences,
  subscribeToProfile,
  subscribeToSchedules,
  subscribeToTasks,
  syncOpenLmsFeed,
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
  GroupStudySlot,
  LmsConnectionInput,
  LmsFeedItem,
  ScheduleDraft,
  ScheduleItem,
  TaskItem,
  UserPreferences,
  UserProfile,
} from '@/lib/firebase/types';


type FirebaseContextValue = Omit<
  BackendShape,
  | 'profile'
  | 'preferences'
  | 'tasks'
  | 'schedules'
  | 'lmsFeed'
  | 'createTask'
  | 'createTaskAndSchedule'
  | 'createStudyBlock'
  | 'createTaskFromLmsFeed'
  | 'updateProfile'
  | 'completeOnboarding'
  | 'resetCurrentUserData'
  | 'refreshMockLmsFeed'
> & {
  authReady: boolean;
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

  connectLms: (credentials: LmsConnectionInput) => Promise<void>;
  syncLmsFeed: () => Promise<void>;
  syncOpenLmsFeed: () => Promise<void>;
  refreshMockLmsFeed: () => Promise<void>; // temporary alias for compatibility
  resetLmsDemo: () => Promise<void>;
  createTaskFromLmsFeed: (feedId: string) => Promise<TaskItem>;
  markLmsFeedItemReviewed: (feedId: string) => Promise<void>;
  dismissLmsFeedItem: (feedId: string) => Promise<void>;
  fetchGroupStudySlots: () => Promise<GroupStudySlot[]>;

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


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);

      if (!nextUser) {
        setRawProfile(null);
        setPreferences(null);
        setTasks([]);
        setSchedules([]);
        setLmsFeed([]);
        setLoadingData(false);
      }
    });

    return unsubscribe;
  }, []);


  useEffect(() => {
    if (!user) return;

    setLoadingData(true);
    setAuthMessage(null);

    const firstLoad = {
      profile: false,
      preferences: false,
      tasks: false,
      schedules: false,
      lms: false,
    };

    const settleStream = (key: keyof typeof firstLoad) => {
      if (firstLoad[key]) return;
      firstLoad[key] = true;

      const allReady = Object.values(firstLoad).every(Boolean);
      if (allReady) {
        setLoadingData(false);
      }
    };

    const handleError = (error: unknown) => {
      setAuthMessage(error instanceof Error ? error.message : 'Unable to load workspace data.');
      setLoadingData(false);
    };

    const unsubProfile = subscribeToProfile(
      user.uid,
      (nextProfile) => {
        setRawProfile(nextProfile);
        settleStream('profile');
      },
      handleError
    );

    const unsubPreferences = subscribeToPreferences(
      user.uid,
      (nextPreferences) => {
        setPreferences(nextPreferences ? mapPreferences(nextPreferences) : null);
        settleStream('preferences');
      },
      handleError
    );

    const unsubTasks = subscribeToTasks(
      user.uid,
      (nextTasks) => {
        setTasks(nextTasks);
        settleStream('tasks');
      },
      handleError
    );

    const unsubSchedules = subscribeToSchedules(
      user.uid,
      (nextSchedules) => {
        setSchedules(nextSchedules);
        settleStream('schedules');
      },
      handleError
    );

    const unsubLms = subscribeToLmsFeed(
      user.uid,
      (nextFeed) => {
        setLmsFeed(nextFeed);
        settleStream('lms');
      },
      handleError
    );

    return () => {
      unsubProfile();
      unsubPreferences();
      unsubTasks();
      unsubSchedules();
      unsubLms();
    };
  }, [user]);

  const profile = useMemo(() => mapProfile(rawProfile, preferences), [preferences, rawProfile]);

  const value = useMemo<FirebaseContextValue>(
    () => ({
      authReady,
      user,
      profile,
      preferences,
      tasks,
      schedules,
      lmsFeed,
      loadingData,
      authMessage,


      ensureUserBootstrap: async () => {
        await backend.ensureUserBootstrap();
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

      connectLms: async (credentials: LmsConnectionInput) => {
        if (!user) throw new Error('Sign in first to connect LMS.');
        await connectLms(user.uid, credentials);
      },

      syncOpenLmsFeed: async () => {
        if (!user) throw new Error('Sign in first to sync LMS items.');
        await syncOpenLmsFeed(user.uid);
      },

      resetLmsDemo: async () => {
        if (!user) throw new Error('Sign in first to reset LMS demo data.');
        await resetLmsDemo(user.uid);
      },

      fetchGroupStudySlots: async () => {
        if (!user) throw new Error('Sign in first to load group study slots.');
        return fetchGroupStudySlots(user.uid);
      },

      syncLmsFeed: async () => {
        if (!user) throw new Error('Sign in first to sync LMS items.');
        await refreshLmsFeed(user.uid);
      },

      refreshMockLmsFeed: async () => {
        if (!user) throw new Error('Sign in first to refresh LMS items.');
        await refreshLmsFeed(user.uid);
      },

      createTaskFromLmsFeed: async (feedId: string) => {
        if (!user) throw new Error('Sign in first to convert LMS items.');
        return mapTask(await backend.createTaskFromLmsFeed(feedId));
      },

      markLmsFeedItemReviewed: async (feedId: string) => {
        if (!user) throw new Error('Sign in first to update LMS items.');
        await backend.markLmsFeedItemReviewed(feedId);
      },

      dismissLmsFeedItem: async (feedId: string) => {
        if (!user) throw new Error('Sign in first to update LMS items.');
        await backend.dismissLmsFeedItem(feedId);
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
    }),
    [authMessage, authReady, lmsFeed, loadingData, preferences, profile, schedules, tasks, user]
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
