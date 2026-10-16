import { memo } from 'react';
import { Check, Container, Subtitle, Texts, Title } from './styles';
import type { TaskItemProps } from './types';

const TaskItemComponent = ({ task, onToggle }: TaskItemProps) => (
  <Container activeOpacity={0.7} onPress={() => onToggle(task.id)} accessibilityRole="checkbox" accessibilityState={{ checked: task.done }}>
    <Check done={task.done} />
    <Texts>
      <Title done={task.done}>{task.title}</Title>
      <Subtitle>{task.subtitle}</Subtitle>
    </Texts>
  </Container>
);

export const TaskItem = memo(TaskItemComponent);
