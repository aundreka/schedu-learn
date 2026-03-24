import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { ClayCard, ClayPill, ClayScreen, ClaySectionHeader } from '@/components/clay-ui';
import { ThemedText } from '@/components/themed-text';
import type { ScheduleItem } from '@/lib/firebase/types';
import { useFirebaseBackend } from '@/providers/firebase-provider';

const HOUR_HEIGHT = 72;
const MIN_BLOCK_MINUTES = 30;
const SNAP_MINUTES = 15;
const DEFAULT_DAY_START = 7;
const DEFAULT_DAY_END = 22;

type DayScheduleItem = ScheduleItem & {
  lane: number;
  laneCount: number;
};

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getWeekStart(date: Date) {
  const next = startOfDay(date);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function getWeekDays(anchor: Date) {
  const weekStart = getWeekStart(anchor);
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

function formatWeekRange(anchor: Date) {
  const weekStart = getWeekStart(anchor);
  const weekEnd = addDays(weekStart, 6);

  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const sameYear = weekStart.getFullYear() === weekEnd.getFullYear();

  if (sameMonth && sameYear) {
    return `${weekStart.toLocaleDateString([], {
      month: 'long',
    })} ${weekStart.getDate()}–${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
  }

  if (sameYear) {
    return `${weekStart.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
    })} – ${weekEnd.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`;
  }

  return `${weekStart.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })} – ${weekEnd.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString([], {
    weekday: 'short',
  });
}

function formatTimeLabel(hour: number) {
  const normalized = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const meridiem = hour >= 12 ? 'PM' : 'AM';
  return `${normalized} ${meridiem}`;
}

function formatEventTimeRange(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);

  return `${start.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })} – ${end.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

function diffMinutes(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function snapToStep(minutes: number, step = SNAP_MINUTES) {
  return Math.round(minutes / step) * step;
}

function getStartHour(preferences?: { startHour?: number } | null) {
  return preferences?.startHour ?? DEFAULT_DAY_START;
}

function getEndHour(preferences?: { endHour?: number } | null) {
  return preferences?.endHour ?? DEFAULT_DAY_END;
}

function getMinutesFromDayStart(date: Date, startHour: number) {
  return (date.getHours() - startHour) * 60 + date.getMinutes();
}

function minutesToPixels(minutes: number) {
  return (minutes / 60) * HOUR_HEIGHT;
}

function pixelsToMinutes(px: number) {
  return (px / HOUR_HEIGHT) * 60;
}

function overlaps(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && endA > startB;
}

function getUrgencyPalette(urgency?: string, status?: string) {
  if (status === 'done') {
    return {
      bg: '#ECE8F3',
      border: '#B9AFCB',
      text: '#7D7293',
      handle: '#A89DBD',
    };
  }

  if (urgency === 'red') {
    return {
      bg: '#FFD9D9',
      border: '#EB5757',
      text: '#8C2C2C',
      handle: '#D94848',
    };
  }

  if (urgency === 'yellow') {
    return {
      bg: '#FFECC2',
      border: '#F2B93B',
      text: '#8A6412',
      handle: '#DEAA34',
    };
  }

  return {
    bg: '#D8F5E2',
    border: '#36C780',
    text: '#1F6A45',
    handle: '#2FB06F',
  };
}

function getProductivityZoneColor(hour: number) {
  if (hour >= 9 && hour < 12) {
    return 'rgba(54, 199, 128, 0.08)';
  }

  if (hour >= 13 && hour < 17) {
    return 'rgba(242, 185, 59, 0.08)';
  }

  return 'rgba(125, 114, 147, 0.04)';
}

function getTimelineHours(startHour: number, endHour: number) {
  return Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index);
}

function assignLanes(items: ScheduleItem[]): DayScheduleItem[] {
  const sorted = [...items].sort((a, b) => {
    return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  });

  const result: DayScheduleItem[] = [];
  const active: { end: number; lane: number; group: number }[] = [];
  const groups = new Map<number, number>();
  let groupIdCounter = 0;

  for (const item of sorted) {
    const start = new Date(item.startsAt).getTime();
    const end = new Date(item.endsAt).getTime();

    for (let i = active.length - 1; i >= 0; i -= 1) {
      if (active[i].end <= start) {
        active.splice(i, 1);
      }
    }

    const usedLanes = new Set(active.map((entry) => entry.lane));
    let lane = 0;
    while (usedLanes.has(lane)) {
      lane += 1;
    }

    const overlappingGroups = active.map((entry) => entry.group);
    const group =
      overlappingGroups.length > 0 ? Math.min(...overlappingGroups) : groupIdCounter++;

    active.push({ end, lane, group });

    const currentGroupCount = groups.get(group) ?? 0;
    groups.set(group, Math.max(currentGroupCount, active.length));

    result.push({
      ...item,
      lane,
      laneCount: 1,
    });
  }

  return result.map((item) => {
    const start = new Date(item.startsAt).getTime();
    const end = new Date(item.endsAt).getTime();

    const related = sorted.filter((candidate) => {
      const candidateStart = new Date(candidate.startsAt).getTime();
      const candidateEnd = new Date(candidate.endsAt).getTime();
      return overlaps(start, end, candidateStart, candidateEnd);
    });

    return {
      ...item,
      laneCount: Math.max(1, related.length),
    };
  });
}

function findNearestFreeStart(
  items: ScheduleItem[],
  eventId: string,
  proposedStartMinutes: number,
  durationMinutes: number,
  dayStartHour: number,
  dayEndHour: number
) {
  const dayMin = 0;
  const dayMax = (dayEndHour - dayStartHour) * 60;

  const otherItems = items
    .filter((item) => item.id !== eventId && item.status !== 'cancelled')
    .map((item) => ({
      start: getMinutesFromDayStart(new Date(item.startsAt), dayStartHour),
      end: getMinutesFromDayStart(new Date(item.endsAt), dayStartHour),
    }))
    .sort((a, b) => a.start - b.start);

  let candidate = clamp(
    snapToStep(proposedStartMinutes),
    dayMin,
    Math.max(dayMin, dayMax - durationMinutes)
  );

  for (const item of otherItems) {
    if (overlaps(candidate, candidate + durationMinutes, item.start, item.end)) {
      candidate = snapToStep(item.end);
    }
  }

  candidate = clamp(candidate, dayMin, Math.max(dayMin, dayMax - durationMinutes));

  for (const item of otherItems) {
    if (overlaps(candidate, candidate + durationMinutes, item.start, item.end)) {
      const beforeCandidate = item.start - durationMinutes;
      const clampedBefore = clamp(beforeCandidate, dayMin, Math.max(dayMin, dayMax - durationMinutes));

      const beforeFits = !otherItems.some((other) =>
        overlaps(clampedBefore, clampedBefore + durationMinutes, other.start, other.end)
      );

      if (beforeFits) {
        return snapToStep(clampedBefore);
      }
    }
  }

  return candidate;
}

function resolveResizeWithConflicts(
  items: ScheduleItem[],
  eventId: string,
  startMinutes: number,
  proposedDurationMinutes: number,
  dayEndHour: number,
  dayStartHour: number
) {
  const dayMax = (dayEndHour - dayStartHour) * 60;
  const otherItems = items
    .filter((item) => item.id !== eventId && item.status !== 'cancelled')
    .map((item) => ({
      start: getMinutesFromDayStart(new Date(item.startsAt), dayStartHour),
      end: getMinutesFromDayStart(new Date(item.endsAt), dayStartHour),
    }))
    .sort((a, b) => a.start - b.start);

  let maxAllowedEnd = dayMax;

  for (const item of otherItems) {
    if (item.start >= startMinutes) {
      maxAllowedEnd = item.start;
      break;
    }
  }

  const maxDuration = Math.max(MIN_BLOCK_MINUTES, maxAllowedEnd - startMinutes);
  return clamp(
    snapToStep(proposedDurationMinutes),
    MIN_BLOCK_MINUTES,
    Math.max(MIN_BLOCK_MINUTES, maxDuration)
  );
}

function buildDateWithMinutes(baseDate: Date, startHour: number, minutesFromDayStart: number) {
  const next = startOfDay(baseDate);
  next.setHours(startHour, 0, 0, 0);
  next.setMinutes(next.getMinutes() + minutesFromDayStart);
  return next;
}

export default function CalendarScreen() {
  const router = useRouter();
  const { profile, preferences, refreshMockLmsFeed, rescheduleItem, schedules, user } = useFirebaseBackend();

  const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));

  const dayStartHour = getStartHour(preferences);
  const dayEndHour = getEndHour(preferences);
  const totalDayMinutes = (dayEndHour - dayStartHour) * 60;
  const timelineHeight = minutesToPixels(totalDayMinutes);
  const hours = getTimelineHours(dayStartHour, dayEndHour);
  const weekDays = useMemo(() => getWeekDays(selectedDate), [selectedDate]);

  const selectedDaySchedules = useMemo(() => {
    const filtered = schedules.filter((item) => isSameDay(new Date(item.startsAt), selectedDate));
    return assignLanes(filtered);
  }, [schedules, selectedDate]);

  const upcomingForDay = useMemo(() => {
    return [...selectedDaySchedules].sort((a, b) => {
      return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    });
  }, [selectedDaySchedules]);

  const urgentCount = selectedDaySchedules.filter((item) => item.urgency === 'red').length;

  return (
    <ClayScreen
      greeting="Calendar"
      title="Smart Day Timeline"
      subtitle="Drag, resize, and let the planner snap blocks into the best free slot."
      avatarLabel={profile?.avatarInitials ?? 'SL'}
      onAvatarPress={() => router.push('/profile')}
      onRefresh={async () => {
        if (user) {
          await refreshMockLmsFeed();
        }
      }}>
      <View style={styles.topRow}>
        <ClayCard style={styles.weekHeaderCard}>
          <View style={styles.weekHeaderTop}>
            <Pressable
              onPress={() => setSelectedDate((current) => addDays(current, -7))}
              style={styles.navButton}>
              <MaterialIcons name="chevron-left" size={18} color="#6B5B8A" />
            </Pressable>

            <View style={styles.weekHeaderCenter}>
              <ThemedText style={styles.weekTitle}>{formatWeekRange(selectedDate)}</ThemedText>
              <ThemedText style={styles.weekSubtitle}>Week view</ThemedText>
            </View>

            <Pressable
              onPress={() => setSelectedDate((current) => addDays(current, 7))}
              style={styles.navButton}>
              <MaterialIcons name="chevron-right" size={18} color="#6B5B8A" />
            </Pressable>
          </View>

          <View style={styles.weekStrip}>
            {weekDays.map((day) => {
              const active = isSameDay(day, selectedDate);
              const isToday = isSameDay(day, new Date());

              return (
                <Pressable
                  key={day.toISOString()}
                  onPress={() => setSelectedDate(startOfDay(day))}
                  style={[
                    styles.weekDayPill,
                    active && styles.weekDayPillActive,
                    isToday && !active && styles.weekDayPillToday,
                  ]}>
                  <ThemedText style={[styles.weekDayName, active && styles.weekDayNameActive]}>
                    {formatDayLabel(day)}
                  </ThemedText>
                  <ThemedText style={[styles.weekDayNumber, active && styles.weekDayNumberActive]}>
                    {day.getDate()}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </ClayCard>

        <View style={styles.legendRow}>
          <ClayPill style={styles.legendPill}>
            <View style={[styles.legendDot, { backgroundColor: '#EB5757' }]} />
            <ThemedText style={styles.legendText}>Urgent</ThemedText>
          </ClayPill>
          <ClayPill style={styles.legendPill}>
            <View style={[styles.legendDot, { backgroundColor: '#F2B93B' }]} />
            <ThemedText style={styles.legendText}>Soon</ThemedText>
          </ClayPill>
          <ClayPill style={styles.legendPill}>
            <View style={[styles.legendDot, { backgroundColor: '#36C780' }]} />
            <ThemedText style={styles.legendText}>Planned</ThemedText>
          </ClayPill>
          <ClayPill style={styles.legendPill}>
            <View style={[styles.legendDot, { backgroundColor: '#A89DBD' }]} />
            <ThemedText style={styles.legendText}>Done</ThemedText>
          </ClayPill>
        </View>
      </View>

      <ClaySectionHeader
        icon="schedule"
        title={selectedDate.toLocaleDateString([], {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })}
        accessory={
          <ClayPill>
            <ThemedText style={styles.accessoryText}>
              {selectedDaySchedules.length} blocks • {urgentCount} urgent
            </ThemedText>
          </ClayPill>
        }
      />

      <ClayCard style={styles.zoneLegendCard}>
        <View style={styles.zoneLegendRow}>
          <View style={styles.zoneLegendItem}>
            <View style={[styles.zoneSwatch, { backgroundColor: 'rgba(54, 199, 128, 0.14)' }]} />
            <ThemedText style={styles.zoneLegendText}>Peak focus</ThemedText>
          </View>
          <View style={styles.zoneLegendItem}>
            <View style={[styles.zoneSwatch, { backgroundColor: 'rgba(242, 185, 59, 0.14)' }]} />
            <ThemedText style={styles.zoneLegendText}>Good energy</ThemedText>
          </View>
          <View style={styles.zoneLegendItem}>
            <View style={[styles.zoneSwatch, { backgroundColor: 'rgba(125, 114, 147, 0.08)' }]} />
            <ThemedText style={styles.zoneLegendText}>Low energy</ThemedText>
          </View>
        </View>
      </ClayCard>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <ClayCard style={styles.timelineCard}>
          <View style={[styles.timelineContainer, { height: timelineHeight + 24 }]}>
            <View style={styles.timeColumn}>
              {hours.map((hour, index) => (
                <View
                  key={hour}
                  style={[
                    styles.hourCell,
                    {
                      top: index * HOUR_HEIGHT,
                      height: HOUR_HEIGHT,
                    },
                  ]}>
                  <ThemedText style={styles.hourText}>{formatTimeLabel(hour)}</ThemedText>
                </View>
              ))}
            </View>

            <View style={styles.timelineColumn}>
              {hours.slice(0, -1).map((hour, index) => (
                <View
                  key={hour}
                  style={[
                    styles.hourBand,
                    {
                      top: index * HOUR_HEIGHT,
                      height: HOUR_HEIGHT,
                      backgroundColor: getProductivityZoneColor(hour),
                    },
                  ]}>
                  <View style={styles.hourLine} />
                </View>
              ))}

              {selectedDaySchedules.map((item) => (
                <TimelineEventBlock
                  key={item.id}
                  item={item}
                  allItems={selectedDaySchedules}
                  selectedDate={selectedDate}
                  dayStartHour={dayStartHour}
                  dayEndHour={dayEndHour}
                  onCommit={async (startsAt, endsAt) => {
                    await rescheduleItem(item.id, startsAt, endsAt);
                  }}
                />
              ))}
            </View>
          </View>
        </ClayCard>

        <ClaySectionHeader icon="view-agenda" title="Agenda" />

        <View style={styles.agendaList}>
          {upcomingForDay.length > 0 ? (
            upcomingForDay.map((item) => {
              const palette = getUrgencyPalette(item.urgency, item.status);

              return (
                <ClayCard
                  key={`agenda-${item.id}`}
                  style={[
                    styles.agendaCard,
                    {
                      backgroundColor: palette.bg,
                      borderColor: palette.border,
                    },
                  ]}>
                  <View style={styles.agendaTop}>
                    <ThemedText style={[styles.agendaTitle, { color: palette.text }]}>
                      {item.title}
                    </ThemedText>
                    <ClayPill style={styles.timePill}>
                      <ThemedText style={styles.timePillText}>
                        {formatEventTimeRange(item.startsAt, item.endsAt)}
                      </ThemedText>
                    </ClayPill>
                  </View>

                  <ThemedText style={styles.agendaMeta}>
                    {item.location ?? 'No location'} • {item.type}
                  </ThemedText>
                </ClayCard>
              );
            })
          ) : (
            <ClayCard style={styles.emptyCard}>
              <ThemedText style={styles.emptyTitle}>No events yet</ThemedText>
              <ThemedText style={styles.emptyText}>
                This day is clear. Auto-scheduled blocks and manual reschedules will show up here.
              </ThemedText>
            </ClayCard>
          )}
        </View>
      </ScrollView>
    </ClayScreen>
  );
}

type TimelineEventBlockProps = {
  item: DayScheduleItem;
  allItems: DayScheduleItem[];
  selectedDate: Date;
  dayStartHour: number;
  dayEndHour: number;
  onCommit: (startsAt: string, endsAt: string) => Promise<void>;
};

function TimelineEventBlock({
  item,
  allItems,
  selectedDate,
  dayStartHour,
  dayEndHour,
  onCommit,
}: TimelineEventBlockProps) {
  const startDate = new Date(item.startsAt);
  const endDate = new Date(item.endsAt);

  const originalStartMinutes = getMinutesFromDayStart(startDate, dayStartHour);
  const originalDurationMinutes = Math.max(MIN_BLOCK_MINUTES, diffMinutes(startDate, endDate));

  const [draftTop, setDraftTop] = useState<number | null>(null);
  const [draftHeight, setDraftHeight] = useState<number | null>(null);

  const displayTop =
    draftTop ?? minutesToPixels(clamp(originalStartMinutes, 0, (dayEndHour - dayStartHour) * 60));
  const displayHeight =
    draftHeight ?? minutesToPixels(Math.max(MIN_BLOCK_MINUTES, originalDurationMinutes));

  const palette = getUrgencyPalette(item.urgency, item.status);

  const laneWidthPercent = 100 / item.laneCount;
  const leftPercent = item.lane * laneWidthPercent;

  const dragResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 4,
        onPanResponderMove: (_, gestureState) => {
          const nextMinutes = clamp(
            snapToStep(originalStartMinutes + pixelsToMinutes(gestureState.dy)),
            0,
            Math.max(0, (dayEndHour - dayStartHour) * 60 - originalDurationMinutes)
          );

          setDraftTop(minutesToPixels(nextMinutes));
        },
        onPanResponderRelease: async (_, gestureState) => {
          const proposedMinutes = originalStartMinutes + pixelsToMinutes(gestureState.dy);
          const snappedStart = findNearestFreeStart(
            allItems,
            item.id,
            proposedMinutes,
            originalDurationMinutes,
            dayStartHour,
            dayEndHour
          );

          const newStart = buildDateWithMinutes(selectedDate, dayStartHour, snappedStart);
          const newEnd = buildDateWithMinutes(
            selectedDate,
            dayStartHour,
            snappedStart + originalDurationMinutes
          );

          setDraftTop(null);
          await onCommit(newStart.toISOString(), newEnd.toISOString());
        },
        onPanResponderTerminate: () => {
          setDraftTop(null);
        },
      }),
    [
      allItems,
      dayEndHour,
      dayStartHour,
      item.id,
      onCommit,
      originalDurationMinutes,
      originalStartMinutes,
      selectedDate,
    ]
  );

  const resizeResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 4,
        onPanResponderMove: (_, gestureState) => {
          const nextDuration = clamp(
            snapToStep(originalDurationMinutes + pixelsToMinutes(gestureState.dy)),
            MIN_BLOCK_MINUTES,
            Math.max(MIN_BLOCK_MINUTES, (dayEndHour - dayStartHour) * 60 - originalStartMinutes)
          );

          setDraftHeight(minutesToPixels(nextDuration));
        },
        onPanResponderRelease: async (_, gestureState) => {
          const proposedDuration = originalDurationMinutes + pixelsToMinutes(gestureState.dy);
          const snappedDuration = resolveResizeWithConflicts(
            allItems,
            item.id,
            originalStartMinutes,
            proposedDuration,
            dayEndHour,
            dayStartHour
          );

          const newStart = buildDateWithMinutes(selectedDate, dayStartHour, originalStartMinutes);
          const newEnd = buildDateWithMinutes(
            selectedDate,
            dayStartHour,
            originalStartMinutes + snappedDuration
          );

          setDraftHeight(null);
          await onCommit(newStart.toISOString(), newEnd.toISOString());
        },
        onPanResponderTerminate: () => {
          setDraftHeight(null);
        },
      }),
    [
      allItems,
      dayEndHour,
      dayStartHour,
      item.id,
      onCommit,
      originalDurationMinutes,
      originalStartMinutes,
      selectedDate,
    ]
  );

  return (
    <View
      style={[
        styles.eventWrap,
        {
          top: displayTop,
          height: displayHeight,
          left: `${leftPercent}%`,
          width: `${laneWidthPercent}%`,
        },
      ]}>
      <View
        {...dragResponder.panHandlers}
        style={[
          styles.eventCard,
          {
            backgroundColor: palette.bg,
            borderColor: palette.border,
          },
        ]}>
        <View style={[styles.eventAccent, { backgroundColor: palette.border }]} />
        <View style={styles.eventContent}>
          <ThemedText numberOfLines={1} style={[styles.eventTitle, { color: palette.text }]}>
            {item.title}
          </ThemedText>
          <ThemedText numberOfLines={1} style={styles.eventTime}>
            {formatEventTimeRange(item.startsAt, item.endsAt)}
          </ThemedText>
          {displayHeight >= 70 ? (
            <ThemedText numberOfLines={1} style={styles.eventMeta}>
              {item.location ?? item.subject ?? 'Scheduled block'}
            </ThemedText>
          ) : null}
        </View>

        <View
          {...resizeResponder.panHandlers}
          style={[styles.resizeHandle, { backgroundColor: palette.handle }]}>
          <MaterialIcons name="drag-handle" size={14} color="#FFFFFF" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: {
    gap: 12,
  },
  weekHeaderCard: {
    gap: 12,
  },
  weekHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekHeaderCenter: {
    alignItems: 'center',
    flex: 1,
  },
  weekTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#2D2250',
  },
  weekSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8D80A6',
    marginTop: 2,
  },
  navButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#F5F0FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekStrip: {
    flexDirection: 'row',
    gap: 8,
  },
  weekDayPill: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    backgroundColor: '#F8F5FC',
    borderWidth: 1,
    borderColor: '#ECE5F5',
  },
  weekDayPillActive: {
    backgroundColor: '#E7DDF8',
    borderColor: '#CDBBEF',
  },
  weekDayPillToday: {
    borderColor: '#7A5AF8',
  },
  weekDayName: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8E84A4',
  },
  weekDayNameActive: {
    color: '#5F4B8B',
  },
  weekDayNumber: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: '900',
    color: '#2D2250',
  },
  weekDayNumberActive: {
    color: '#4C3A77',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B5B8A',
  },
  accessoryText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B5B8A',
  },
  zoneLegendCard: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
  },
  zoneLegendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  zoneLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  zoneSwatch: {
    width: 18,
    height: 18,
    borderRadius: 8,
  },
  zoneLegendText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#7D7293',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
    gap: 14,
  },
  timelineCard: {
    padding: 12,
  },
  timelineContainer: {
    flexDirection: 'row',
  },
  timeColumn: {
    width: 62,
    position: 'relative',
  },
  hourCell: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  hourText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#8D80A6',
  },
  timelineColumn: {
    flex: 1,
    position: 'relative',
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#FBF9FE',
    borderWidth: 1,
    borderColor: '#EEE7F7',
  },
  hourBand: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 1,
    backgroundColor: '#E8E0F4',
  },
  eventWrap: {
    position: 'absolute',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  eventCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    shadowColor: '#7158A6',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  eventAccent: {
    width: 5,
  },
  eventContent: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    paddingRight: 28,
  },
  eventTitle: {
    fontSize: 12,
    fontWeight: '900',
  },
  eventTime: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '800',
    color: '#6B5B8A',
  },
  eventMeta: {
    marginTop: 3,
    fontSize: 10,
    color: '#8D80A6',
    fontWeight: '700',
  },
  resizeHandle: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agendaList: {
    gap: 10,
  },
  agendaCard: {
    borderWidth: 1,
  },
  agendaTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  agendaTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
  },
  timePill: {
    backgroundColor: 'rgba(255,255,255,0.62)',
  },
  timePillText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#6B5B8A',
  },
  agendaMeta: {
    marginTop: 6,
    fontSize: 12,
    color: '#6B5B8A',
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#2D2250',
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: '#6B5B8A',
  },
});