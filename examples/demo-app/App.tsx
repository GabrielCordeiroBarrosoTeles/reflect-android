import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ThemeProvider } from 'styled-components/native';
import { Demo } from './src/screens/Demo';
import { RootView } from './src/styles';
import { theme } from './src/theme';

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <RootView as={GestureHandlerRootView}>
        <StatusBar style="dark" />
        <Demo />
      </RootView>
    </ThemeProvider>
  );
}
