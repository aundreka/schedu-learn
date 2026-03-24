import type { Difficulty, TaskItem, TaskType, UrgencyColor } from '@/lib/firebase/types';

export type UrgencyLevel = 'low' | 'medium' | 'high';

export type UrgencyAssessment = {
  color: UrgencyColor;
  level: UrgencyLevel;
  score: number;
  gradeImpactPercent: number;
};

export function getDefaultGradeImpactPercent(type: TaskType) {
  switch (type) {
    case 'exam':
      return 35;
    case 'project':
      return 30;
    case 'quiz':
      return 20;
    case 'assignment':
      return 15;
    case 'reading':
      return 8;
    default:
      return 10;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function dueSoonScore(dueAt: string) {
  const hoursLeft = (new Date(dueAt).getTime() - Date.now()) / 3_600_000;
  if (hoursLeft <= 0) return 100;
  if (hoursLeft <= 6) return 100;
  if (hoursLeft <= 12) return 95;
  if (hoursLeft <= 24) return 88;
  if (hoursLeft <= 48) return 76;
  if (hoursLeft <= 72) return 64;
  if (hoursLeft <= 7 * 24) return 50;
  if (hoursLeft <= 14 * 24) return 34;
  return 18;
}

function difficultyScore(difficulty: Difficulty) {
  if (difficulty === 'hard') return 12;
  if (difficulty === 'medium') return 6;
  return 0;
}

function taskTypeScore(type: TaskType) {
  switch (type) {
    case 'exam':
      return 14;
    case 'quiz':
      return 10;
    case 'project':
      return 8;
    case 'assignment':
      return 6;
    case 'reading':
      return 2;
    default:
      return 4;
  }
}

export function assessUrgency(input: {
  difficulty: Difficulty;
  dueAt: string;
  estimatedMinutes?: number;
  gradeImpactPercent?: number;
  remainingMinutes?: number;
  scheduledMinutes?: number;
  type: TaskType;
}) {
  const gradeImpactPercent =
    typeof input.gradeImpactPercent === 'number' && Number.isFinite(input.gradeImpactPercent)
      ? clamp(Math.round(input.gradeImpactPercent), 0, 100)
      : getDefaultGradeImpactPercent(input.type);
  const estimatedMinutes = input.estimatedMinutes ?? 0;
  const remainingRatio =
    estimatedMinutes > 0 ? clamp((input.remainingMinutes ?? estimatedMinutes) / estimatedMinutes, 0, 1) : 0;
  const scheduledCoverage =
    estimatedMinutes > 0 ? clamp((input.scheduledMinutes ?? 0) / estimatedMinutes, 0, 1) : 0;
  const score = Math.round(
    clamp(
      dueSoonScore(input.dueAt) * 0.52 +
        (Math.min(gradeImpactPercent, 40) / 40) * 100 * 0.3 +
        difficultyScore(input.difficulty) +
        taskTypeScore(input.type) +
        remainingRatio * 16 +
        (1 - scheduledCoverage) * 10,
      0,
      100
    )
  );
  const level: UrgencyLevel = score >= 75 ? 'high' : score >= 45 ? 'medium' : 'low';
  const color: UrgencyColor = level === 'high' ? 'red' : level === 'medium' ? 'yellow' : 'green';
  return { color, gradeImpactPercent, level, score } satisfies UrgencyAssessment;
}

export function assessTaskUrgency(task: TaskItem) {
  const maybeGradeImpact = (task as TaskItem & { gradeImpactPercent?: number }).gradeImpactPercent;
  return assessUrgency({
    type: task.type,
    dueAt: task.dueAt,
    difficulty: task.difficulty,
    estimatedMinutes: task.estimatedMinutes,
    remainingMinutes: task.remainingMinutes,
    scheduledMinutes: task.scheduledMinutes,
    gradeImpactPercent: maybeGradeImpact,
  });
}

export function formatUrgencyLabel(level: UrgencyLevel) {
  if (level === 'high') return 'High urgency';
  if (level === 'medium') return 'Medium urgency';
  return 'Low urgency';
}
