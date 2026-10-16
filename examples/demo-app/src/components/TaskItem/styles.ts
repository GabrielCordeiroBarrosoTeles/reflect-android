import { RFValue } from 'react-native-responsive-fontsize';
import styled from 'styled-components/native';
import type { CheckProps } from './types';

export const Container = styled.TouchableOpacity`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.medium}px;
  padding: ${({ theme }) => theme.spacing.large}px;
  margin: 0 ${({ theme }) => theme.spacing.large}px ${({ theme }) => theme.spacing.small}px;
  border-radius: ${({ theme }) => theme.radii.medium}px;
  background-color: ${({ theme }) => theme.colors.surface};
`;

export const Check = styled.View<CheckProps>`
  width: ${RFValue(22)}px;
  height: ${RFValue(22)}px;
  border-radius: ${RFValue(11)}px;
  border-width: ${RFValue(2)}px;
  border-color: ${({ theme, done }) => (done ? theme.colors.success : theme.colors.border)};
  background-color: ${({ theme, done }) => (done ? theme.colors.success : 'transparent')};
`;

export const Texts = styled.View`
  flex: 1;
  gap: ${({ theme }) => theme.spacing.xsmall}px;
`;

export const Title = styled.Text<CheckProps>`
  font-size: ${({ theme }) => RFValue(theme.fontSizes.medium)}px;
  font-weight: 600;
  color: ${({ theme, done }) => (done ? theme.colors.muted : theme.colors.secondary)};
  text-decoration-line: ${({ done }) => (done ? 'line-through' : 'none')};
`;

export const Subtitle = styled.Text`
  font-size: ${({ theme }) => RFValue(theme.fontSizes.small)}px;
  color: ${({ theme }) => theme.colors.muted};
`;
