import type {
  CompleteOnboardingInput,
  CreateStudyBlockInput as BackendCreateStudyBlockInput,
  CreateTaskInput as BackendCreateTaskInput,
  Difficulty,
  EafImportItem,
  ExtractedClass,
  FirebaseBackendShape,
  LmsFeedItem as BackendLmsFeedItem,
  Priority,
  ScheduleDraft,
  ScheduleItem as BackendScheduleItem,
  TaskItem as BackendTaskItem,
  TaskStatus,
  TaskType,
  UrgencyColor,
  UserPreferences as BackendUserPreferences,
  UserProfile as BackendUserProfile,
  YearLevel,
} from '@/lib/firebase/backend-reference';

export type ThemeMode = 'system' | 'light' | 'dark';

export type UserPreferences = BackendUserPreferences & {
  notificationsEnabled: boolean;
  dailyDigestEnabled: boolean;
  compactView: boolean;
  themeMode: ThemeMode;
};

export type UserProfile = BackendUserProfile & {
  preferences: UserPreferences;
};

export type TaskPriority = Priority;

export type TaskItem = BackendTaskItem & {
  course: string;
};

export type ScheduleItem = BackendScheduleItem;

export type LmsFeedItem = BackendLmsFeedItem & {
  due: string;
  syncedAt: string;
};

export type LmsConnectionInput = {
  url: string;
  username: string;
  password: string;
};

export type GroupStudySlot = {
  id: string;
  partnerName: string;
  subject: string;
  topic: string;
  startsAt: string;
  endsAt: string;
  location: string;
  mutualMinutes: number;
  mode: 'online' | 'onsite';
  description?: string;
};

export type CreateTaskInput = BackendCreateTaskInput;
export type CreateStudyBlockInput = BackendCreateStudyBlockInput;

export type {
  CompleteOnboardingInput,
  Difficulty,
  EafImportItem,
  ExtractedClass,
  FirebaseBackendShape,
  Priority,
  ScheduleDraft,
  TaskStatus,
  TaskType,
  UrgencyColor,
  YearLevel,
};
