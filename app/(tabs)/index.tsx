import { AppScreen } from '@/components/app-screen';
import { useFirebaseBackend } from '@/providers/firebase-provider';

export default function HomeScreen() {
  const { schedules, tasks, user } = useFirebaseBackend();
  const openTasks = tasks.filter((task) => task.status !== 'done');
  const nextSchedule = schedules[0];

  return (
    <AppScreen
      eyebrow="Home"
      title="Organize your classes, tasks, and study flow."
      description="Start your day with the essentials in one place so you always know what needs attention next."
      summary={[
        { label: 'Open tasks', value: `${openTasks.length}` },
        { label: 'Next class', value: nextSchedule ? nextSchedule.title : 'Connect Firebase' },
        { label: 'Study goal', value: user ? 'Synced' : 'Sign in' },
        { label: 'LMS feed', value: user ? 'Live' : 'Offline' },
      ]}
      agenda={[
        {
          title: openTasks[0]?.title ?? 'Morning overview',
          subtitle:
            openTasks[0]?.course ??
            'Check deadlines, class times, and your highest-priority tasks.',
          icon: 'home-filled',
        },
        {
          title: openTasks[1]?.title ?? 'Priority queue',
          subtitle:
            openTasks[1]?.course ?? 'Finish your highest-priority work before the next class.',
          icon: 'checklist',
        },
        {
          title: nextSchedule?.title ?? 'Evening review',
          subtitle:
            nextSchedule?.location ?? 'Wrap the day with a short summary and tomorrow plan.',
          icon: 'nightlight-round',
        },
      ]}
    />
  );
}
