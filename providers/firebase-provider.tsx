import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  User,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { doc, writeBatch } from 'firebase/firestore';
import { ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react';

import type { FirebaseBackendShape as BackendShape } from '@/lib/firebase/backend-reference';
import { auth, db } from '@/lib/firebase/config';
import {
  addQuickTask,
  addStudyBlock,
  backend,
  clearImportedEafClassSchedules as clearImportedEafClassSchedulesData,
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
  subscribeToLmsFeed,
  subscribeToPreferences,
  subscribeToProfile,
  subscribeToSchedules,
  subscribeToTasks,
  updateProfile as updateBackendProfile,
  updatePreferences,
  updateTask
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
  suggestGroupStudySlots: (...args: Parameters<typeof backend.suggestGroupStudySlots>) => Promise<any[]>;

  syncLmsFeed: () => Promise<void>;
  refreshMockLmsFeed: () => Promise<void>; 
  createTaskFromLmsFeed: (feedId: string) => Promise<TaskItem>;
  markLmsFeedItemReviewed: (feedId: string) => Promise<void>;
  dismissLmsFeedItem: (feedId: string) => Promise<void>;

  uploadEafFile: (params: { fileUri: string; blob: Blob; filename: string }) => Promise<EafImportItem>;
  saveParsedEafClasses: (importId: string, extractedClasses: ExtractedClass[], extractedText?: string) => Promise<void>;
  confirmEafClasses: (importId: string, confirmedClasses: ExtractedClass[]) => Promise<void>;
  importConfirmedEafClassesToSchedules: (importId: string, weeksToGenerate?: number) => Promise<void>;
  createRecurringClassSchedules: (classes: ExtractedClass[], weeksToGenerate?: number) => Promise<void>;

  updateProfile: (patch: Partial<UserProfile>) => Promise<void>;
  completeOnboarding: (input: CompleteOnboardingInput) => Promise<void>;
  resetCurrentUserData: () => Promise<void>;

  connectLms: (credentials: { url: string; username: string; password: string }) => Promise<void>;
  syncOpenLmsFeed: () => Promise<void>;
  resetLmsDemo: () => Promise<void>;
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
        setRawProfile(null); setPreferences(null); setTasks([]); setSchedules([]); setLmsFeed([]); setLoadingData(false);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoadingData(true);
    
    const loadSavedMocks = async () => {
      try {
        const savedLms = await AsyncStorage.getItem('@mock_lms');
        const savedTasks = await AsyncStorage.getItem('@mock_tasks');
        const savedScheds = await AsyncStorage.getItem('@mock_scheds');
        
        if (savedLms) setLmsFeed((current) => [...current.filter(f => f.source !== 'Mock LMS'), ...JSON.parse(savedLms)]);
        if (savedTasks) setTasks((current) => [...current.filter(t => !t.id.includes('mock-task-') && !t.id.includes('past-')), ...JSON.parse(savedTasks)]);
        if (savedScheds) setSchedules((current) => [...current.filter(s => !s.id.includes('mock-sched-')), ...JSON.parse(savedScheds)]);
      } catch (e) {
        console.error("Failed to load local mock data", e);
      }
    };
    loadSavedMocks();

    const handleError = (error: unknown) => { setLoadingData(false); };

    const unsubProfile = subscribeToProfile(user.uid, (p) => { setRawProfile(p); }, handleError);
    const unsubPreferences = subscribeToPreferences(user.uid, (p) => { setPreferences(p ? mapPreferences(p) : null); }, handleError);

    const unsubTasks = subscribeToTasks(user.uid, (nextTasks) => {
        setTasks((current) => {
          const mocks = current.filter((t) => t.id.includes('mock-task-') || t.id.includes('past-'));
          return [...nextTasks.filter((t) => !t.id.includes('mock-task-') && !t.id.includes('past-')), ...mocks];
        });
        setLoadingData(false);
    }, handleError);

    const unsubSchedules = subscribeToSchedules(user.uid, (nextSchedules) => {
        setSchedules((current) => {
          const mocks = current.filter((s) => s.id.includes('mock-sched-'));
          return [...nextSchedules.filter((s) => !s.id.includes('mock-sched-')), ...mocks];
        });
    }, handleError);

    const unsubLms = subscribeToLmsFeed(user.uid, (nextFeed) => {
        setLmsFeed((current) => {
          const mocks = current.filter((f) => f.source === 'Mock LMS');
          return [...nextFeed.filter((f) => f.source !== 'Mock LMS'), ...mocks];
        });
    }, handleError);

    return () => { unsubProfile(); unsubPreferences(); unsubTasks(); unsubSchedules(); unsubLms(); };
  }, [user]);

  const profile = useMemo(() => mapProfile(rawProfile, preferences), [preferences, rawProfile]);

  const value = useMemo<FirebaseContextValue>(
    () => ({
      authReady, user, profile, preferences, tasks, schedules, lmsFeed, loadingData, authMessage,
      ensureUserBootstrap: async () => { await backend.ensureUserBootstrap(); },
      signInWithEmail: async (email, password) => { await signInWithEmailAndPassword(auth, email.trim(), password); },
      signUpWithEmail: async (email, password, displayName) => {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (displayName?.trim()) { await updateProfile(cred.user, { displayName: displayName.trim() }); }
        await ensureUserWorkspace(cred.user);
      },
      signOut: async () => { await firebaseSignOut(auth); },
      savePreferences: async (nextPreferences) => { if (!user) throw new Error('Sign in first'); await updatePreferences(user.uid, nextPreferences); },
      createQuickTask: async () => { if (!user) throw new Error('Sign in first'); await addQuickTask(user.uid); },
      createTask: async (input) => { if (!user) throw new Error('Sign in first'); return createTask(user.uid, input); },
      createTaskAndSchedule: async (input) => { if (!user) throw new Error('Sign in first'); return createTaskAndSchedule(user.uid, input); },

      updateTask: async (taskId, patch) => {
        if (!user) throw new Error('Sign in first');
        if (taskId.includes('mock-task-') || taskId.includes('past-')) {
          setTasks((prev) => {
            const next = prev.map((t) => (t.id === taskId ? { ...t, ...patch } as unknown as TaskItem : t));
            AsyncStorage.setItem('@mock_tasks', JSON.stringify(next.filter(t => t.id.includes('mock-task-') || t.id.includes('past-'))));
            return next;
          });
          return;
        }
        await updateTask(user.uid, taskId, patch);
      },

      setTaskStatus: async (taskId, status) => {
        if (!user) throw new Error('Sign in first');
        if (taskId.includes('mock-task-') || taskId.includes('past-')) {
          setTasks((prev) => {
            const next = prev.map((t) => {
              if (t.id === taskId) {
                const patch: any = { ...t, status };
                if (status === 'done') patch.completedAt = new Date().toISOString();
                return patch as unknown as TaskItem;
              }
              return t;
            });
            AsyncStorage.setItem('@mock_tasks', JSON.stringify(next.filter(t => t.id.includes('mock-task-') || t.id.includes('past-'))));
            return next;
          });
          return;
        }
        const backendPatch: any = { status };
        if (status === 'done') backendPatch.completedAt = new Date().toISOString();
        await updateTask(user.uid, taskId, backendPatch);
      },

      syncLmsFeed: async () => { if (!user) throw new Error('Sign in first'); await refreshLmsFeed(user.uid); },
      refreshMockLmsFeed: async () => { if (!user) throw new Error('Sign in first'); await refreshLmsFeed(user.uid); },
      createTaskFromLmsFeed: async (feedId) => { if (!user) throw new Error('Sign in first'); return mapTask(await backend.createTaskFromLmsFeed(feedId)); },
      markLmsFeedItemReviewed: async (feedId) => { if (!user) throw new Error('Sign in first'); await backend.markLmsFeedItemReviewed(feedId); },
      dismissLmsFeedItem: async (feedId) => { if (!user) throw new Error('Sign in first'); await backend.dismissLmsFeedItem(feedId); },
      updateProfile: async (patch) => { if (!user) throw new Error('Sign in first'); await updateBackendProfile(user.uid, patch); },
      completeOnboarding: async (input) => { if (!user) throw new Error('Sign in first'); await completeOnboarding(user.uid, input); },
      resetCurrentUserData: async () => { if (!user) throw new Error('Sign in first'); await resetCurrentUserData(user.uid); },
      createStudyBlock: async (input) => { if (!user) throw new Error('Sign in first'); await addStudyBlock(user.uid, input); },
      rescheduleItem: async (id, s, e) => {
        if (!user) throw new Error('Sign in first');
        if (id.includes('mock-sched-')) {
          setSchedules((prev) => {
            const next = prev.map((item) => (item.id === id ? { ...item, startsAt: s, endsAt: e } as unknown as ScheduleItem : item));
            AsyncStorage.setItem('@mock_scheds', JSON.stringify(next.filter(sc => sc.id.includes('mock-sched-'))));
            return next;
          });
          return;
        }
        await moveSchedule(user.uid, id, s, e);
      },
      markScheduleDone: async (id) => {
        if (!user) throw new Error('Sign in first');
        if (id.includes('mock-sched-')) {
          setSchedules((prev) => {
            const next = prev.map((s) => (s.id === id ? { ...s, status: 'done' } as unknown as ScheduleItem : s));
            AsyncStorage.setItem('@mock_scheds', JSON.stringify(next.filter(sc => sc.id.includes('mock-sched-'))));
            return next;
          });
          return;
        }
        await backend.markScheduleDone(id);
      },
      markScheduleMissed: async (id) => {
        if (!user) throw new Error('Sign in first');
        if (id.includes('mock-sched-')) {
          setSchedules((prev) => {
            const next = prev.map((s) => (s.id === id ? { ...s, status: 'missed' } as unknown as ScheduleItem : s));
            AsyncStorage.setItem('@mock_scheds', JSON.stringify(next.filter(sc => sc.id.includes('mock-sched-'))));
            return next;
          });
          return;
        }
        await backend.markScheduleMissed(id);
      },
      regenerateFutureStudyPlanForTask: async (taskId) => { if (!user) throw new Error('Sign in first'); return backend.regenerateFutureStudyPlanForTask(taskId); },
      suggestGroupStudySlots: async (...args: Parameters<typeof backend.suggestGroupStudySlots>) => { if (!user) throw new Error('Sign in first'); return backend.suggestGroupStudySlots(...args); },
      uploadEafFile: async (params) => { if (!user) throw new Error('Sign in first'); return backend.uploadEafFile(params); },
      saveParsedEafClasses: async (importId, extractedClasses, extractedText) => { if (!user) throw new Error('Sign in first'); await backend.saveParsedEafClasses(importId, extractedClasses, extractedText); },
      confirmEafClasses: async (importId, confirmedClasses) => { if (!user) throw new Error('Sign in first'); await backend.confirmEafClasses(importId, confirmedClasses); },
      importConfirmedEafClassesToSchedules: async (importId, weeksToGenerate) => { if (!user) throw new Error('Sign in first'); await backend.importConfirmedEafClassesToSchedules(importId, weeksToGenerate); },
      createRecurringClassSchedules: async (classes, weeksToGenerate) => { if (!user) throw new Error('Sign in first'); await createRecurringClassSchedulesData(user.uid, classes, weeksToGenerate); },
      clearImportedEafClassSchedules: async () => { if (!user) throw new Error('Sign in first'); await clearImportedEafClassSchedulesData(user.uid); },

      autoScheduleTask: async (taskId) => { 
        if (!user) throw new Error('Sign in first'); 
        if (taskId === 'mock-task-101') {
          const now = new Date();
          const newScheds = [1, 2, 3].map((num) => ({
             id: `mock-sched-auto-${num}`, type: 'study', title: `Study Block ${num}/3: Expert Systems Lab`, subject: 'CSELC03C - Artificial Intelligence',
             startsAt: new Date(now.getTime() + num * 24 * 60 * 60 * 1000).toISOString(), endsAt: new Date(now.getTime() + num * 24 * 60 * 60 * 1000 + 3600000).toISOString(),
             status: 'scheduled', taskId: taskId, difficulty: 'hard', location: 'Library', createdAt: now.toISOString(), updatedAt: now.toISOString(), source: 'auto', urgency: 'high'
          })) as unknown as ScheduleItem[];

          const batch = writeBatch(db);
          newScheds.forEach(s => batch.set(doc(db, 'users', user.uid, 'schedules', s.id), s));
          await batch.commit();

          setSchedules(prev => [...prev.filter(s => !s.id.includes('mock-sched-auto')), ...newScheds]);
          const currentScheds = await AsyncStorage.getItem('@mock_scheds');
          const parsedScheds = currentScheds ? JSON.parse(currentScheds) : [];
          AsyncStorage.setItem('@mock_scheds', JSON.stringify([...parsedScheds, ...newScheds]));

          return []; 
        }
        return backend.autoScheduleTask(taskId); 
      },

      connectLms: async () => { await new Promise((resolve) => setTimeout(resolve, 800)); },

      syncOpenLmsFeed: async () => {
        if (!user) return;
        
        if (tasks.some(t => t.id === 'mock-task-101')) {
          throw new Error('UP_TO_DATE'); 
        }
        
        const now = new Date();
        const midtermsDueDate = "2026-04-08T00:00:00.000Z";
        const lab67DueDate = "2026-04-20T00:00:00.000Z"; // Lab 6 & 7

        // 1. ACTIVE TASKS (Now including Lab 6 & 7)
        const generatedFeed: any[] = [
          { id: 'mock-101', title: 'Midterms Lab - Expert Systems', course: 'CSELC03C - Artificial Intelligence', type: 'assignment', detectedDueAt: midtermsDueDate, due: midtermsDueDate, status: 'synced', source: 'Mock LMS', updatedAt: now.toISOString(), provider: 'moodle', externalKey: 'mock-101', firstSeenAt: now.toISOString(), lastSeenAt: now.toISOString(), createdAt: now.toISOString(), syncedAt: now.toISOString(), linkedTaskId: 'mock-task-101' },
          { id: 'mock-102', title: 'Midterms - Expert Systems Documentation Submission', course: 'CSELC03C - Artificial Intelligence', type: 'assignment', detectedDueAt: midtermsDueDate, due: midtermsDueDate, status: 'synced', source: 'Mock LMS', updatedAt: now.toISOString(), provider: 'moodle', externalKey: 'mock-102', firstSeenAt: now.toISOString(), lastSeenAt: now.toISOString(), createdAt: now.toISOString(), syncedAt: now.toISOString(), linkedTaskId: 'mock-task-102' },
          { id: 'mock-103', title: 'Lab Activity 6: Exploring Parameter Passing Methods', course: 'CSCN09C - Programming Language', type: 'assignment', detectedDueAt: lab67DueDate, due: lab67DueDate, status: 'synced', source: 'Mock LMS', updatedAt: now.toISOString(), provider: 'moodle', externalKey: 'mock-103', firstSeenAt: now.toISOString(), lastSeenAt: now.toISOString(), createdAt: now.toISOString(), syncedAt: now.toISOString(), linkedTaskId: 'mock-task-103' },
          { id: 'mock-104', title: 'Lab 7: Implementing Memory Management Strategies...', course: 'CSCN09C - Programming Language', type: 'assignment', detectedDueAt: lab67DueDate, due: lab67DueDate, status: 'synced', source: 'Mock LMS', updatedAt: now.toISOString(), provider: 'moodle', externalKey: 'mock-104', firstSeenAt: now.toISOString(), lastSeenAt: now.toISOString(), createdAt: now.toISOString(), syncedAt: now.toISOString(), linkedTaskId: 'mock-task-104' }
        ];

        const labDescription = "1. Activity Overview\n\nIn this 3-hour session, your group will build a simple web-based expert system that gives legal advice on a specific topic. You will research a few relevant laws, create IF-THEN rules, and develop a working prototype using HTML, CSS, and JavaScript.\n\n2. Objectives\n\n1. Understand the basic components of an expert system (knowledge base, inference engine, user interface).\n2. Translate real laws into simple IF-THEN rules.\n3. Build a working prototype that asks questions and gives legal advice.\n4. Present and demonstrate your system to the class.";

        const mockActiveTasks = generatedFeed.map((item, idx) => ({
          id: item.linkedTaskId, title: item.title, subject: item.course, type: item.type,
          dueAt: item.detectedDueAt, estimatedMinutes: idx === 0 ? 180 : 60, remainingMinutes: idx === 0 ? 180 : 60, scheduledMinutes: 0,
          difficulty: idx === 0 || idx === 3 ? 'hard' : 'medium', status: 'todo', priority: idx === 0 ? 'urgent' : 'planned', colorCode: idx === 0 ? 'red' : 'blue', createdAt: now.toISOString(), updatedAt: now.toISOString(), source: 'lms', autoSchedule: true,
          notes: idx === 0 ? labDescription : (idx === 1 ? "Submit the documentation for your Expert Systems Midterm Lab here." : "")
        })) as unknown as TaskItem[];

        // 2. PAST HISTORY TASKS
        const rawPastActivities = [
          { id: 'past-1', title: 'Lab Activity 5 (Midterm)', subject: 'CSCN09C - Programming Language', type: 'assignment', difficulty: 'hard', dueAt: '2026-03-30T00:00:00.000Z', completedAt: '2026-03-29T16:45:00.000Z', description: 'H – Minute to Hour\nInput your choice: H\n------------------------\nCONVERT MINUTE TO HOUR\nInput minute: 190\nHour: 3.16666\nLess than a day processing.\nDo both programs in Python, Java and C++ you may use programiz web app.\n\nQUESTIONS\n1. Explain and compare three programming languages in terms of their structure.\n2. Describe how each language organizes its code, including elements such as syntax, program layout, and the use of functions, classes, or statements.\n3. Highlight the similarities and differences between the three languages.\n\ncopy your code and output then save it along with your answers to questions as PDF with filename Surname_Lab5' },
          { id: 'past-2', title: 'CPU Scheduling in Python - CS301', subject: 'CSCN12C - Operating Systems', type: 'assignment', difficulty: 'hard', dueAt: '2026-03-26T00:00:00.000Z', completedAt: '2026-03-25T21:10:00.000Z', description: '' },
          { id: 'past-3', title: 'Midterm Assignment - CS301', subject: 'CSCN12C - Operating Systems', type: 'project', difficulty: 'medium', dueAt: '2026-03-25T11:00:00.000Z', completedAt: '2026-03-24T18:20:00.000Z', description: '' },
          { id: 'past-4', title: 'MIDTERM-PROBLEMSET-NO. 1', subject: 'CSCN13C - Software Engineering 2', type: 'assignment', difficulty: 'hard', dueAt: '2026-03-20T00:00:00.000Z', completedAt: '2026-03-19T23:50:00.000Z', description: 'A mid-sized retail company developed an Online Retail Management System to handle customer orders, inventory, and payments through a web platform. The system was developed by several development teams working on different modules. These modules include the User Authentication Module, Product Catalog Module, Shopping Cart Module, Order Processing Module, Payment Processing Module, and Inventory Management Module. Each module was individually developed and tested through unit testing to ensure that its internal functions worked correctly.' },
          { id: 'past-5', title: 'Midterm Lab Activity # 1 - NLTK', subject: 'CSELC03C - Artificial Intelligence', type: 'assignment', difficulty: 'hard', dueAt: '2026-03-17T00:00:00.000Z', completedAt: '2026-03-16T15:30:00.000Z', description: '' },
          { id: 'past-6', title: 'Midterm Quiz 1 - CS301', subject: 'CSCN12C - Operating Systems', type: 'quiz', difficulty: 'medium', dueAt: '2026-03-11T00:00:00.000Z', completedAt: '2026-03-10T14:00:00.000Z', description: 'Answer the quiz on the last slide of the lesson CPU scheduling' },
          { id: 'past-7', title: 'Lab Activity 4 (Midterm)', subject: 'CSCN09C - Programming Language', type: 'assignment', difficulty: 'medium', dueAt: '2026-03-11T00:00:00.000Z', completedAt: '2026-03-09T10:15:00.000Z', description: 'Lab Activity: Exploring Python Data Types\nObjective:\n- int: 32-bit integer\n- long: 64-bit integer\n- float: Single-precision floating-point\n- double: Double-precision floating-point\n- char: Single 16-bit Unicode character\n- boolean: Boolean values (true, false)\n\n2. Non-Primitive Data Types (Reference Types)\n- String: Strings\n- Arrays: Arrays\n- Classes: User-defined types\n- Interfaces: Abstract types\n- Enums: Enumerations' },
          { id: 'past-8', title: 'PRELIM closes', subject: 'CSCN09C - Programming Language', type: 'exam', difficulty: 'hard', dueAt: '2026-03-08T23:59:00.000Z', completedAt: '2026-03-08T19:30:00.000Z', description: '' },
          { id: 'past-9', title: 'Lab Activity 3', subject: 'CSCN09C - Programming Language', type: 'assignment', difficulty: 'medium', dueAt: '2026-03-07T00:00:00.000Z', completedAt: '2026-03-06T16:00:00.000Z', description: 'Follow the instruction on the attached pdf file, upload your answer with filename Lab3_Surname' },
          { id: 'past-10', title: 'Lab Activity 2', subject: 'CSCN09C - Programming Language', type: 'assignment', difficulty: 'medium', dueAt: '2026-03-07T17:00:00.000Z', completedAt: '2026-03-07T11:45:00.000Z', description: 'Create a program that will get the First Name and Last Name of the instructor and the grade information of 10 students (Student Last Name and CSCN09C Grade). The program should be able to display the Last Name of the Instructor and w/c is the lowest grade among the 10 students.\n\nSample Output:\nInstructor First Name: Maricris\nInstructor Last Name: Mojica\n1st Entry – Student Last Name: Balabat\nStudent Grade: 70\n...\nInstructor Name: Maricris Mojica\nThe lowest grade of your students is 70.\n\nUpload your code and Screenshot of output/s on MS Word with filename Lab2_Surname.' },
          { id: 'past-11', title: 'Lab Activity 1', subject: 'CSCN09C - Programming Language', type: 'assignment', difficulty: 'easy', dueAt: '2026-03-07T00:00:00.000Z', completedAt: '2026-03-05T13:20:00.000Z', description: '' },
          { id: 'past-12', title: 'Midterm Lab 1 - CS301', subject: 'CSCN12C - Operating Systems', type: 'assignment', difficulty: 'medium', dueAt: '2026-03-02T10:00:00.000Z', completedAt: '2026-03-01T20:10:00.000Z', description: '' },
        ];

        const mockHistoryTasks = rawPastActivities.map((item) => ({
          id: item.id, title: item.title, subject: item.subject, type: item.type,
          dueAt: item.dueAt, completedAt: item.completedAt, estimatedMinutes: 60, remainingMinutes: 0, scheduledMinutes: 60,
          difficulty: item.difficulty, status: 'done', priority: 'planned', colorCode: 'gray', createdAt: now.toISOString(), updatedAt: now.toISOString(), source: 'lms', autoSchedule: false,
          notes: item.description 
        })) as unknown as TaskItem[];

        const allNewTasks = [...mockActiveTasks, ...mockHistoryTasks];

        const batch = writeBatch(db);
        const lmsRef = doc(db, 'lmsFeeds', user.uid);
        batch.set(lmsRef, { items: generatedFeed }, { merge: true });
        
        allNewTasks.forEach((task) => batch.set(doc(db, 'users', user.uid, 'tasks', task.id), task));
        await batch.commit();

        AsyncStorage.setItem('@mock_lms', JSON.stringify(generatedFeed));
        AsyncStorage.setItem('@mock_tasks', JSON.stringify(allNewTasks));
        
        setLmsFeed((prev) => [...prev.filter((f) => f.source !== 'Mock LMS'), ...generatedFeed]);
        setTasks((prev) => [...prev.filter((t) => !t.id.includes('mock-task-') && !t.id.includes('past-')), ...allNewTasks]);
      },

      resetLmsDemo: async () => {
        if (!user) return;
        await AsyncStorage.multiRemove(['@mock_lms', '@mock_tasks', '@mock_scheds']);
        setLmsFeed((prev) => prev.filter((f) => f.source !== 'Mock LMS'));
        setTasks((prev) => prev.filter((t) => !t.id.includes('mock-task-') && !t.id.includes('past-')));
        setSchedules((prev) => prev.filter((s) => !s.id.includes('mock-sched-')));
        
        const batch = writeBatch(db);
        batch.set(doc(db, 'lmsFeeds', user.uid), { items: [] });
        batch.delete(doc(db, 'users', user.uid, 'tasks', 'mock-task-101'));
        batch.delete(doc(db, 'users', user.uid, 'tasks', 'mock-task-102'));
        batch.delete(doc(db, 'users', user.uid, 'tasks', 'mock-task-103'));
        batch.delete(doc(db, 'users', user.uid, 'tasks', 'mock-task-104'));
        for (let i = 1; i <= 12; i++) {
          batch.delete(doc(db, 'users', user.uid, 'tasks', `past-${i}`));
        }
        batch.delete(doc(db, 'users', user.uid, 'schedules', 'mock-sched-auto-1'));
        batch.delete(doc(db, 'users', user.uid, 'schedules', 'mock-sched-auto-2'));
        batch.delete(doc(db, 'users', user.uid, 'schedules', 'mock-sched-auto-3'));
        await batch.commit();
      }
    }),
    [authMessage, authReady, lmsFeed, loadingData, preferences, profile, schedules, tasks, user]
  );

  return <FirebaseContext.Provider value={value}>{children}</FirebaseContext.Provider>;
}

export function useFirebaseBackend() {
  const context = useContext(FirebaseContext);
  if (!context) throw new Error('useFirebaseBackend must be used inside FirebaseProvider.');
  return context;
}