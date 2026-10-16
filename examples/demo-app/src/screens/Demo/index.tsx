import * as Clipboard from 'expo-clipboard';
import { useCallback, useEffect, useState } from 'react';
import { FlatList } from 'react-native';
import { PinchImage } from '../../components/PinchImage';
import { TaskItem } from '../../components/TaskItem';
import type { Task } from '../../components/TaskItem/types';
import { TASKS } from '../../data/tasks';
import {
  Caption,
  Card,
  CardTitle,
  Footer,
  Header,
  Input,
  PrimaryButton,
  PrimaryButtonText,
  Screen,
  SectionTitle,
  Title,
} from './styles';
import type { CopyState } from './types';

const COPY_FEEDBACK_MS = 1500;

const poster = require('../../../assets/poster.png');

export const Demo = () => {
  const [text, setText] = useState('');
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [tasks, setTasks] = useState<Task[]>(TASKS);

  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = setTimeout(() => setCopyState('idle'), COPY_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copyState]);

  const copyToComputer = useCallback(async () => {
    await Clipboard.setStringAsync(text || 'Hello from my phone 👋');
    setCopyState('copied');
  }, [text]);

  const toggleTask = useCallback((id: string) => {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, done: !task.done } : task)));
  }, []);

  return (
    <Screen>
      <Header>
        <Title>Reflect demo</Title>
        <Caption>Mirrored and controlled from VS Code</Caption>
      </Header>

      <Card>
        <CardTitle>Type from your computer</CardTitle>
        <Input value={text} onChangeText={setText} placeholder="Click here and start typing…" />
        <PrimaryButton activeOpacity={0.8} onPress={copyToComputer}>
          <PrimaryButtonText>{copyState === 'copied' ? 'Copied to your computer ✓' : 'Copy to computer'}</PrimaryButtonText>
        </PrimaryButton>
      </Card>

      <Card>
        <CardTitle>Pinch on your trackpad</CardTitle>
        <PinchImage source={poster} />
      </Card>

      <SectionTitle>Scroll me</SectionTitle>
      <FlatList
        data={tasks}
        keyExtractor={(task) => task.id}
        renderItem={({ item }) => <TaskItem task={item} onToggle={toggleTask} />}
        ListFooterComponent={<Footer />}
        keyboardShouldPersistTaps="handled"
      />
    </Screen>
  );
};
