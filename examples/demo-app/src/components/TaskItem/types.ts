export interface Task {
  id: string;
  title: string;
  subtitle: string;
  done: boolean;
}

export interface TaskItemProps {
  task: Task;
  onToggle: (id: string) => void;
}

export interface CheckProps {
  done: boolean;
}
