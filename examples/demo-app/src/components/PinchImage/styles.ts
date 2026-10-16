import Animated from 'react-native-reanimated';
import { RFValue } from 'react-native-responsive-fontsize';
import styled from 'styled-components/native';

export const Frame = styled.View`
  overflow: hidden;
  border-radius: ${({ theme }) => theme.radii.medium}px;
  background-color: ${({ theme }) => theme.colors.background};
`;

export const AnimatedImage = styled(Animated.Image)`
  width: 100%;
  height: ${RFValue(190)}px;
`;
