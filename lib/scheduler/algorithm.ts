import { assessTaskUrgency } from '@/lib/urgency';
import type {
  Difficulty,
  ScheduleItem,
  TaskItem,
  UserPreferences,
  UrgencyColor,
} from '@/lib/firebase/types';

const MIN_SESSION_MINUTES = 30;
const DEFAULT_BUFFER_MINUTES = 15;
const HARD_MARGIN_MINUTES = 15;
const PANIC_HOURS_THRESHOLD = 6;
const PANIC_BUFFER_MINUTES = 5;

type FreeWindow = {
  startsAt: Date;
  endsAt: Date;
  minutes: number;
};

export type StudySessionDraft = {
  taskId: string;
  title: string;
  subject: string;
  difficulty: Difficulty;
  startsAt: Date;
  endsAt: Date;
  urgency: UrgencyColor;
  bufferAfterMinutes: number;
};

export type AutoSchedulePlan = {
  sessions: StudySessionDraft[];
  totalMinutes: number;
};

export type ReschedulePlan = {
  missedBlock: ScheduleItem;
  suggestedStart: Date;
  suggestedEnd: Date;
  durationMinutes: number;
  bufferMinutes: number;
  urgency: UrgencyColor;
};

export type PanicPlan = {
  task: TaskItem;
  segments: { startsAt: Date; endsAt: Date; bufferAfterMinutes: number }[];
  totalMinutes: number;
  availableMinutes: number;
};

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function setDayTime(date: Date, hour: number, minute = 0) {
  const next = new Date(date);
  next.setHours(hour, minute, 0, 0);
  return next;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function diffMinutes(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
}

function splitIntoChunks(remainingMinutes: number, preferred: number) {
  const chunks: number[] = [];
  let left = Math.max(remainingMinutes, 0);
  const sessionLength = Math.max(MIN_SESSION_MINUTES, preferred);

  while (left > 0) {
    if (left <= MIN_SESSION_MINUTES) {
      chunks.push(left);
      break;
    }

    const chunk = Math.min(sessionLength, left);
    chunks.push(chunk);
    left -= chunk;
  }

  if (chunks.length >= 2 && chunks[chunks.length - 1] < 20) {
    const tail = chunks.pop()!;
    chunks[chunks.length - 1] += tail;
  }

  return chunks;
}

function hasHardNeighbor(
  start: Date,
  end: Date,
  difficulty: Difficulty,
  existing: ScheduleItem[],
  planned: StudySessionDraft[]
) {
  if (difficulty !== 'hard') return false;

  const candidates = [
    ...existing,
    ...planned.map((session) => ({
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      difficulty: session.difficulty,
      type: 'study' as const,
      status: 'scheduled' as const,
    } as ScheduleItem)),
  ]
    .filter((item) => item.status !== 'cancelled')
    .filter((item) => item.type === 'study' && item.difficulty === 'hard');

  const startTime = start.getTime();
  const endTime = end.getTime();

  return candidates.some((item) => {
    const itemStart = new Date(item.startsAt).getTime();
    const itemEnd = new Date(item.endsAt).getTime();

    const closeBefore = Math.abs(startTime - itemEnd) <= HARD_MARGIN_MINUTES * 60_000;
    const closeAfter = Math.abs(itemStart - endTime) <= HARD_MARGIN_MINUTES * 60_000;

    return closeBefore || closeAfter;
  });
}

function findFreeWindows(
  existingSchedules: ScheduleItem[],
  preferences: UserPreferences,
  now: Date,
  dueDate: Date
) {
  const windows: FreeWindow[] = [];
  const startDay = startOfDay(now);
  const lastDay = startOfDay(dueDate);
  if (dueDate.getTime() <= now.getTime()) {
    return windows;
  }

  const cursorDay = new Date(startDay);

  while (cursorDay.getTime() <= lastDay.getTime()) {
    const dayStart = setDayTime(cursorDay, preferences.startHour ?? 7, 0);
    const dayEnd = setDayTime(cursorDay, preferences.endHour ?? 22, 0);

    let effectiveDayStart = dayStart;
    if (isSameDay(cursorDay, now)) {
      effectiveDayStart = new Date(Math.max(dayStart.getTime(), now.getTime()));
    }

    const daySchedules = existingSchedules
      .filter((item) => item.status !== 'cancelled')
      .filter((item) => isSameDay(new Date(item.startsAt), cursorDay))
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

    let busyCursor = effectiveDayStart;

    for (const item of daySchedules) {
      const itemStart = new Date(item.startsAt);
      const itemEnd = new Date(item.endsAt);

      if (itemEnd.getTime() <= busyCursor.getTime()) {
        continue;
      }

      if (itemStart.getTime() > busyCursor.getTime()) {
        const gapMinutes = diffMinutes(busyCursor, itemStart);
        if (gapMinutes >= MIN_SESSION_MINUTES) {
          windows.push({
            startsAt: new Date(busyCursor),
            endsAt: new Date(itemStart),
            minutes: gapMinutes,
          });
        }
      }

      if (itemEnd.getTime() > busyCursor.getTime()) {
        busyCursor = itemEnd;
      }
    }

    if (dayEnd.getTime() > busyCursor.getTime()) {
      const gapMinutes = diffMinutes(busyCursor, dayEnd);
      if (gapMinutes >= MIN_SESSION_MINUTES) {
        windows.push({
          startsAt: new Date(busyCursor),
          endsAt: new Date(dayEnd),
          minutes: gapMinutes,
        });
      }
    }

    cursorDay.setDate(cursorDay.getDate() + 1);
  }

  return windows.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

function toScheduleItem(session: StudySessionDraft): ScheduleItem {
  return {
    id: `auto-${session.taskId}-${session.startsAt.toISOString()}`,
    title: session.title,
    type: 'study',
    startsAt: session.startsAt.toISOString(),
    endsAt: session.endsAt.toISOString(),
    location: 'Auto-plan',
    taskId: session.taskId,
    subject: session.subject,
    difficulty: session.difficulty,
    status: 'scheduled',
    source: 'auto',
    urgency: session.urgency,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function planAutoSchedule(args: {
  tasks: TaskItem[];
  schedules: ScheduleItem[];
  preferences: UserPreferences | null;
  now: Date;
}): AutoSchedulePlan {
  const { preferences, tasks, schedules, now } = args;
  if (!preferences) {
    return { sessions: [], totalMinutes: 0 };
  }

  const bufferMinutes = preferences.shortBreakMinutes ?? DEFAULT_BUFFER_MINUTES;
  const sortedTasks = tasks
    .filter((task) => task.autoSchedule && task.status !== 'done')
    .map((task) => ({ ...task, urgency: assessTaskUrgency(task) }))
    .filter(
      (task) =>
        new Date(task.dueAt).getTime() > now.getTime() &&
        (task.remainingMinutes ?? task.estimatedMinutes ?? 0) > 0
    )
    .sort((a, b) => b.urgency.score - a.urgency.score);

  const plannedSessions: StudySessionDraft[] = [];
  const sessionsPerDay = new Map<string, number>();
  const combinedSchedules = [...schedules];

  for (const task of sortedTasks) {
    const remaining = Math.max(task.remainingMinutes ?? task.estimatedMinutes ?? 0, 0);
    if (remaining <= 0) continue;

    const chunks = splitIntoChunks(remaining, preferences.preferredSessionMinutes ?? 45);
    const dueDate = new Date(task.dueAt);

    for (const chunk of chunks) {
      let foundIndex = -1;
      let sessionStart: Date | null = null;

      const windows = findFreeWindows(combinedSchedules, preferences, now, dueDate);

      for (let i = 0; i < windows.length; i += 1) {
        const window = windows[i];
        if (window.minutes < chunk + bufferMinutes) continue;

        const dayKey = startOfDay(window.startsAt).toDateString();
        const used = sessionsPerDay.get(dayKey) ?? 0;
        if (used >= (preferences.maxSessionsPerDay ?? 4)) continue;

        const candidateStart = new Date(window.startsAt);
        const candidateEnd = addMinutes(candidateStart, chunk);

        if (!hasHardNeighbor(candidateStart, candidateEnd, task.difficulty, combinedSchedules, plannedSessions)) {
          foundIndex = i;
          sessionStart = candidateStart;
          break;
        }
      }

      if (foundIndex === -1) {
        for (let i = 0; i < windows.length; i += 1) {
          const window = windows[i];
          if (window.minutes < chunk + bufferMinutes) continue;
          const dayKey = startOfDay(window.startsAt).toDateString();
          const used = sessionsPerDay.get(dayKey) ?? 0;
          if (used >= (preferences.maxSessionsPerDay ?? 4)) continue;

          foundIndex = i;
          sessionStart = new Date(window.startsAt);
          break;
        }
      }

      if (foundIndex === -1 || !sessionStart) {
        break;
      }

      const sessionEnd = addMinutes(sessionStart, chunk);
      const session: StudySessionDraft = {
        taskId: task.id,
        title: `${task.subject}: ${task.title}`,
        subject: task.subject,
        difficulty: task.difficulty,
        startsAt: sessionStart,
        endsAt: sessionEnd,
        urgency: task.colorCode,
        bufferAfterMinutes: bufferMinutes,
      };

      plannedSessions.push(session);
      combinedSchedules.push(toScheduleItem(session));

      const dayKey = startOfDay(sessionStart).toDateString();
      sessionsPerDay.set(dayKey, (sessionsPerDay.get(dayKey) ?? 0) + 1);
    }
  }

  const totalMinutes = plannedSessions.reduce(
    (sum, session) => sum + diffMinutes(session.startsAt, session.endsAt),
    0
  );

  return { sessions: plannedSessions, totalMinutes };
}

export function planRescheduleMissedBlock(args: {
  schedules: ScheduleItem[];
  tasks: TaskItem[];
  preferences: UserPreferences | null;
  now: Date;
}): ReschedulePlan | null {
  const { schedules, preferences, tasks, now } = args;
  if (!preferences) return null;

  const candidate = [...schedules]
    .filter(
      (item) =>
        item.type === 'study' &&
        item.status === 'scheduled' &&
        new Date(item.endsAt).getTime() < now.getTime()
    )
    .sort((a, b) => new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime())[0];

  if (!candidate) return null;

  const missingMinutes = diffMinutes(new Date(candidate.startsAt), new Date(candidate.endsAt));
  const bufferMinutes = preferences.shortBreakMinutes ?? DEFAULT_BUFFER_MINUTES;
  const duration = Math.max(30, missingMinutes);

  const task = candidate.taskId ? tasks.find((item) => item.id === candidate.taskId) : null;
  const dueDate = task ? new Date(task.dueAt) : addMinutes(now, 7 * 24 * 60);

  const windows = findFreeWindows(
    schedules.filter((item) => item.id !== candidate.id),
    preferences,
    now,
    dueDate
  );

  for (const window of windows) {
    if (window.minutes < duration + bufferMinutes) continue;

    const start = new Date(window.startsAt);
    const end = addMinutes(start, duration);

    return {
      missedBlock: candidate,
      suggestedStart: start,
      suggestedEnd: end,
      durationMinutes: duration,
      bufferMinutes,
      urgency: task ? assessTaskUrgency(task).color : candidate.urgency,
    };
  }

  return null;
}

export function planPanicMode(args: {
  tasks: TaskItem[];
  schedules: ScheduleItem[];
  preferences: UserPreferences | null;
  now: Date;
}): PanicPlan | null {
  const { tasks, schedules, preferences, now } = args;
  if (!preferences) return null;

  const panicCandidate = [...tasks]
    .filter((task) => task.type === 'exam' && (task.remainingMinutes ?? task.estimatedMinutes ?? 0) > 0)
    .map((task) => ({
      task,
      hoursLeft: (new Date(task.dueAt).getTime() - now.getTime()) / 3_600_000,
    }))
    .filter((entry) => entry.hoursLeft <= PANIC_HOURS_THRESHOLD && entry.hoursLeft > 0)
    .sort((a, b) => a.hoursLeft - b.hoursLeft)[0];

  if (!panicCandidate) return null;

  const dueDate = new Date(panicCandidate.task.dueAt);
  const availableMinutes = diffMinutes(now, dueDate);
  const desiredMinutes = Math.min(
    panicCandidate.task.remainingMinutes ?? panicCandidate.task.estimatedMinutes ?? 0,
    availableMinutes
  );

  if (desiredMinutes <= 0) {
    return null;
  }

  const windows = findFreeWindows(schedules, preferences, now, dueDate);
  const segments: PanicPlan['segments'] = [];
  let remaining = desiredMinutes;
  const sessionLength = Math.max(MIN_SESSION_MINUTES, preferences.preferredSessionMinutes ?? 30);

  for (const window of windows) {
    if (remaining <= 0) break;

    const usable = Math.max(0, window.minutes - PANIC_BUFFER_MINUTES);
    if (usable < MIN_SESSION_MINUTES) continue;

    const duration = Math.min(usable, sessionLength, remaining);
    const start = new Date(window.startsAt);
    const end = addMinutes(start, duration);

    segments.push({ startsAt: start, endsAt: end, bufferAfterMinutes: PANIC_BUFFER_MINUTES });
    remaining -= duration;
  }

  if (!segments.length && remaining > 0) {
    const fallbackDuration = Math.min(sessionLength, remaining);
    const fallbackStart = new Date(now);
    const fallbackEnd = addMinutes(fallbackStart, fallbackDuration);
    segments.push({ startsAt: fallbackStart, endsAt: fallbackEnd, bufferAfterMinutes: PANIC_BUFFER_MINUTES });
    remaining -= fallbackDuration;
  }

  if (!segments.length) {
    return null;
  }

  const totalPlanned = desiredMinutes - remaining;

  return {
    task: panicCandidate.task,
    segments,
    availableMinutes,
    totalMinutes: totalPlanned,
  };
}
