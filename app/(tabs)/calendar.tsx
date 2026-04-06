import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ClayCard, ClayPill, ClayScreen, ClaySectionHeader } from '@/components/clay-ui';
import { ThemedText } from '@/components/themed-text';
import type { ScheduleItem } from '@/lib/firebase/types';
import { useFirebaseBackend } from '@/providers/firebase-provider';
import { planAutoSchedule } from '@/lib/scheduler/algorithm';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function shiftMonth(date: Date, delta: number) {
  const next = new Date(date);
  const desiredDay = next.getDate();
  next.setDate(1);
  next.setMonth(next.getMonth() + delta);
  const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(desiredDay, daysInMonth));
  return startOfDay(next);
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isSameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function getMonthGridDays(anchor: Date) {
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const startOffset = monthStart.getDay();
  const gridStart = addDays(monthStart, -startOffset);

  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

function formatMonthTitle(date: Date) {
  return date.toLocaleDateString([], {
    month: 'long',
    year: 'numeric',
  });
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

function getDayKey(date: Date) {
  return startOfDay(date).getTime();
}

export default function CalendarScreen() {
  const router = useRouter();
  const { profile, refreshMockLmsFeed, schedules, tasks, preferences, user } =
    useFirebaseBackend();
  const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));

  const monthDays = useMemo(() => getMonthGridDays(selectedDate), [selectedDate]);
  const now = useMemo(() => new Date(), []);
  const autoPlan = useMemo(
    () =>
      planAutoSchedule({
        tasks,
        schedules,
        preferences,
        now,
      }),
    [tasks, schedules, preferences, now]
  );

  const selectedDayAutoSessions = useMemo(
    () => autoPlan.sessions.filter((session) => isSameDay(session.startsAt, selectedDate)),
    [autoPlan.sessions, selectedDate]
  );

  const eventsByDay = useMemo(() => {
    const grouped = new Map<number, ScheduleItem[]>();

    for (const item of schedules) {
      const key = getDayKey(new Date(item.startsAt));
      const group = grouped.get(key) ?? [];
      group.push(item);
      grouped.set(key, group);
    }

    grouped.forEach((items) => {
      items.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    });

    return grouped;
  }, [schedules]);

  const selectedDaySchedules = useMemo(() => {
    const key = getDayKey(selectedDate);
    return eventsByDay.get(key) ?? [];
  }, [eventsByDay, selectedDate]);

  const upcomingForDay = useMemo(
    () =>
      [...selectedDaySchedules].sort(
        (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
      ),
    [selectedDaySchedules]
  );

  const urgentCount = selectedDaySchedules.filter((item) => item.urgency === 'red').length;

  return (
    <ClayScreen
      greeting="Calendar"
      title="Smart Day Timeline"
      avatarLabel={profile?.avatarInitials ?? 'SL'}
      onAvatarPress={() => router.push('/profile')}
      onRefresh={async () => {
        if (user) {
          await refreshMockLmsFeed();
        }
      }}>
      <View style={styles.topRow}>
        <ClayCard style={styles.monthHeaderCard}>
          <View style={styles.monthHeaderTop}>
            <Pressable
              onPress={() => setSelectedDate((current) => shiftMonth(current, -1))}
              style={styles.navButton}>
              <MaterialIcons name="chevron-left" size={20} color="#6B5B8A" />
            </Pressable>

            <View style={styles.monthHeaderCenter}>
              <ThemedText style={styles.monthTitle}>{formatMonthTitle(selectedDate)}</ThemedText>
            </View>

            <Pressable
              onPress={() => setSelectedDate((current) => shiftMonth(current, 1))}
              style={styles.navButton}>
              <MaterialIcons name="chevron-right" size={20} color="#6B5B8A" />
            </Pressable>
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

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        <ClayCard style={styles.monthCard}>
          <View style={styles.weekdayRow}>
            {WEEKDAY_LABELS.map((label) => (
              <ThemedText key={label} style={styles.weekdayLabel}>
                {label}
              </ThemedText>
            ))}
          </View>

          <View style={styles.monthGrid}>
            {monthDays.map((day) => {
              const dayKey = getDayKey(day);
              const dayEvents = eventsByDay.get(dayKey) ?? [];
              const isCurrentMonth = isSameMonth(day, selectedDate);
              const isSelected = isSameDay(day, selectedDate);
              const isToday = isSameDay(day, now);

              return (
                <Pressable
                  key={day.toISOString()}
                  onPress={() => setSelectedDate(startOfDay(day))}
                  style={[
                    styles.dayCell,
                    !isCurrentMonth && styles.dayCellFaded,
                    isSelected && styles.dayCellSelected,
                  ]}>
                  <View
                    style={[
                      styles.dayNumberContainer,
                      isToday && !isSelected && styles.dayNumberToday,
                    ]}>
                    <ThemedText
                      style={[
                        styles.dayNumber,
                        isSelected && styles.dayNumberSelected,
                        !isCurrentMonth && styles.dayNumberInactive,
                      ]}>
                      {day.getDate()}
                    </ThemedText>
                  </View>

                  <View style={styles.dayEvents}>
                    {dayEvents.slice(0, 3).map((item) => {
                      const palette = getUrgencyPalette(item.urgency, item.status);
                      return (
                        <View
                          key={item.id}
                          style={[styles.dayEventStripe, { backgroundColor: palette.border }]}
                        />
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <ThemedText style={styles.moreLabel}>+{dayEvents.length - 3}</ThemedText>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </ClayCard>

        <ClaySectionHeader icon="auto-awesome" title="Auto-schedule preview" />
        <ClayCard style={styles.autoPlanCard}>
          {selectedDayAutoSessions.length ? (
            <>
              {selectedDayAutoSessions.map((session) => {
                const palette = getUrgencyPalette(session.urgency, 'scheduled');

                return (
                  <View
                    key={`${session.taskId}-${session.startsAt.toISOString()}`}
                    style={styles.autoPlanRow}>
                    <View style={[styles.autoPlanDot, { backgroundColor: palette.border }]} />
                    <View style={styles.autoPlanCopy}>
                      <ThemedText style={styles.autoPlanTitle}>{session.title}</ThemedText>
                      <ThemedText style={styles.autoPlanSubtitle}>
                        {formatEventTimeRange(session.startsAt.toISOString(), session.endsAt.toISOString())} •{' '}
                        {session.bufferAfterMinutes} min buffer
                      </ThemedText>
                    </View>
                  </View>
                );
              })}
              <ThemedText style={styles.autoPlanSummary}>
                {selectedDayAutoSessions.length} block
                {selectedDayAutoSessions.length === 1 ? '' : 's'} auto-scheduled.
              </ThemedText>
            </>
          ) : (
            <ThemedText style={styles.autoPlanEmpty}>
              No auto-schedule suggestions for this day yet. Smart Scheduler will surface ideas once it spots open windows.
            </ThemedText>
          )}
        </ClayCard>

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

const styles = StyleSheet.create({
  topRow: {
    gap: 8,
  },
  monthHeaderCard: {
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  monthHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F5F0FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthHeaderCenter: {
    flex: 1,
    alignItems: 'center',
  },
  monthTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#2D2250',
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 4,
    paddingBottom: 24,
    gap: 14,
  },
  monthCard: {
    padding: 8,
    gap: 6,
    minHeight: 320,
    paddingBottom: 14,
    marginBottom: 12,
    overflow: 'hidden',
  },
  weekdayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  weekdayLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#8D80A6',
    width: '14.2%',
    textAlign: 'center',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  dayCell: {
    width: '14.28%',
    minHeight: 72,
    borderRadius: 20,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: '#FFFFFF',
  },
  dayCellFaded: {
    opacity: 0.55,
  },
  dayCellSelected: {
    borderColor: '#4C3A77',
    backgroundColor: '#F4F0FB',
  },
  dayNumberContainer: {
    alignSelf: 'flex-start',
    padding: 4,
    borderRadius: 999,
  },
  dayNumberToday: {
    borderWidth: 1,
    borderColor: '#7A5AF8',
  },
  dayNumber: {
    fontSize: 14,
    fontWeight: '900',
    color: '#2D2250',
  },
  dayNumberSelected: {
    color: '#4C3A77',
  },
  dayNumberInactive: {
    color: '#A6A0B7',
  },
  dayEvents: {
    marginTop: 6,
  },
  dayEventStripe: {
    height: 6,
    borderRadius: 6,
    marginTop: 4,
  },
  moreLabel: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '900',
    color: '#6B5B8A',
  },
  autoPlanCard: {
    borderRadius: 20,
    padding: 12,
    backgroundColor: '#FFFFFF',
    gap: 8,
    borderWidth: 1,
    borderColor: '#ECE8F3',
  },
  autoPlanRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  autoPlanDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  autoPlanCopy: {
    flex: 1,
    gap: 2,
  },
  autoPlanTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2D2250',
  },
  autoPlanSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B5B8A',
  },
  autoPlanSummary: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B5B8A',
  },
  autoPlanEmpty: {
    fontSize: 12,
    color: '#6B5B8A',
    lineHeight: 18,
  },
  accessoryText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B5B8A',
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
