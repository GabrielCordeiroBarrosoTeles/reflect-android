import 'styled-components/native';
import type { AppTheme } from './theme';

declare module 'styled-components/native' {
  export interface DefaultTheme extends AppTheme {}
}
