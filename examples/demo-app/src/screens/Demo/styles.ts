import { RFValue } from 'react-native-responsive-fontsize';
import styled from 'styled-components/native';

export const Screen = styled.View`
  flex: 1;
  background-color: ${({ theme }) => theme.colors.background};
`;

export const Header = styled.View`
  gap: ${({ theme }) => theme.spacing.xsmall}px;
  padding: ${({ theme }) => theme.spacing.xxlarge}px ${({ theme }) => theme.spacing.large}px ${({ theme }) => theme.spacing.large}px;
`;

export const Title = styled.Text`
  font-size: ${({ theme }) => RFValue(theme.fontSizes.title)}px;
  font-weight: 800;
  color: ${({ theme }) => theme.colors.secondary};
`;

export const Caption = styled.Text`
  font-size: ${({ theme }) => RFValue(theme.fontSizes.medium)}px;
  color: ${({ theme }) => theme.colors.muted};
`;

export const Card = styled.View`
  gap: ${({ theme }) => theme.spacing.medium}px;
  margin: 0 ${({ theme }) => theme.spacing.large}px ${({ theme }) => theme.spacing.large}px;
  padding: ${({ theme }) => theme.spacing.large}px;
  border-radius: ${({ theme }) => theme.radii.large}px;
  background-color: ${({ theme }) => theme.colors.surface};
`;

export const CardTitle = styled.Text`
  font-size: ${({ theme }) => RFValue(theme.fontSizes.large)}px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.secondary};
`;

export const Input = styled.TextInput.attrs(({ theme }) => ({
  underlineColorAndroid: 'transparent',
  placeholderTextColor: theme.colors.muted,
}))`
  height: ${RFValue(48)}px;
  padding: 0 ${({ theme }) => theme.spacing.medium}px;
  border-radius: ${({ theme }) => theme.radii.medium}px;
  border-width: ${RFValue(1)}px;
  border-color: ${({ theme }) => theme.colors.border};
  font-size: ${({ theme }) => RFValue(theme.fontSizes.medium)}px;
  color: ${({ theme }) => theme.colors.secondary};
`;

export const PrimaryButton = styled.TouchableOpacity`
  height: ${RFValue(48)}px;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.radii.medium}px;
  background-color: ${({ theme }) => theme.colors.primary};
`;

export const PrimaryButtonText = styled.Text`
  font-size: ${({ theme }) => RFValue(theme.fontSizes.medium)}px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.onPrimary};
`;

export const SectionTitle = styled.Text`
  margin: 0 ${({ theme }) => theme.spacing.large}px ${({ theme }) => theme.spacing.small}px;
  font-size: ${({ theme }) => RFValue(theme.fontSizes.large)}px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.secondary};
`;

export const Footer = styled.View`
  height: ${({ theme }) => theme.spacing.xxlarge}px;
`;
