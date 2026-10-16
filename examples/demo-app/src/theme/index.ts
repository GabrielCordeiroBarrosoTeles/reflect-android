export const theme = {
  colors: {
    primary: '#2D5BFF',
    secondary: '#121212',
    background: '#F4F2EE',
    surface: '#FFFFFF',
    muted: '#6B6B70',
    border: '#E3E1DC',
    onPrimary: '#FFFFFF',
    success: '#1F9D5C',
  },
  spacing: {
    xsmall: 4,
    small: 8,
    medium: 12,
    large: 16,
    xlarge: 24,
    xxlarge: 48,
  },
  fontSizes: {
    small: 12,
    medium: 14,
    large: 18,
    title: 28,
  },
  radii: {
    medium: 12,
    large: 20,
  },
} as const;

export type AppTheme = typeof theme;
