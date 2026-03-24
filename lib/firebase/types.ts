export type ThemeMode = 'system' | 'light' | 'dark';

export type UserPreferences = {
  notificationsEnabled: boolean;
  dailyDigestEnabled: boolean;
  compactView: boolean;
  themeMode: ThemeMode;
  studyGoalHours: number;
};

export type UserProfile = {
  displayName: string;
  email: string;
  role: string;
  bio: string;
  semester: string;
  avatarInitials: string;
  preferences: UserPreferences;
  createdAt: string;
  updatedAt: string;
};

export type TaskStatus = 'new' | 'in_progress' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type TaskItem = {
  id: string;
  title: string;
  course: string;
  dueAt: string;
  status: TaskStatus;
  priority: TaskPriority;
  source: string;
};

export type ScheduleItem = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string;
  type: 'class' | 'study' | 'deadline';
};

export type LmsFeedItem = {
  id: string;
  source: string;
  course: string;
  title: string;
  due: string;
  status: string;
  syncedAt: string;
};
