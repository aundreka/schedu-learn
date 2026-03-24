import { AppScreen } from '@/components/app-screen';

export default function StatsScreen() {
  return (
    <AppScreen
      eyebrow="Stats"
      title="Measure consistency, not just busywork."
      description="See how your routines are trending so you can adjust early and protect your strongest habits."
      summary={[
        { label: 'Hours this week', value: '17.5' },
        { label: 'Completion rate', value: '91%' },
        { label: 'Top subject', value: 'Math' },
        { label: 'Avg. focus', value: '42m' },
      ]}
      agenda={[
        {
          title: 'Weekly trend',
          subtitle: 'Your study time is up 18% compared with last week.',
          icon: 'trending-up',
        },
        {
          title: 'Best window',
          subtitle: 'Most productive sessions happen between 6 PM and 8 PM.',
          icon: 'insights',
        },
        {
          title: 'Improvement cue',
          subtitle: 'Calendar planning is strong; quick-task capture can improve.',
          icon: 'query-stats',
        },
      ]}
    />
  );
}
