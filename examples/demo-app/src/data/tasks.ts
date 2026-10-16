import type { Task } from '../components/TaskItem/types';

const TITLES = [
  'Review pull request',
  'Fix login crash on Android 14',
  'Ship onboarding animation',
  'Update app icon',
  'Write release notes',
  'Profile list rendering',
  'Add dark mode tokens',
  'Reply to design feedback',
];

export const TASKS: Task[] = Array.from({ length: 40 }, (_, index) => ({
  id: String(index + 1),
  title: TITLES[index % TITLES.length],
  subtitle: `Task #${index + 1} · ${index % 3 === 0 ? 'Today' : index % 3 === 1 ? 'Tomorrow' : 'This week'}`,
  done: index % 4 === 0,
}));
