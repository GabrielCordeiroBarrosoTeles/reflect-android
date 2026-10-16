import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { AnimatedImage, Frame } from './styles';
import type { PinchImageProps } from './types';

const MIN_SCALE = 1;

export const PinchImage = ({ source, maxScale = 4 }: PinchImageProps) => {
  const scale = useSharedValue(MIN_SCALE);
  const savedScale = useSharedValue(MIN_SCALE);

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.min(maxScale, Math.max(MIN_SCALE, savedScale.value * event.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const reset = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      scale.value = withTiming(MIN_SCALE);
      savedScale.value = MIN_SCALE;
    });

  const zoomStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Frame>
      <GestureDetector gesture={Gesture.Exclusive(reset, pinch)}>
        <AnimatedImage source={source} resizeMode="cover" style={zoomStyle} accessibilityLabel="Pinch to zoom poster" />
      </GestureDetector>
    </Frame>
  );
};
