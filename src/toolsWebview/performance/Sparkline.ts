const SVG = 'http://www.w3.org/2000/svg';
const WIDTH = 120;
const HEIGHT = 28;

export interface SparklineScale {
  readonly floor: number;
  readonly ceiling: number | undefined;
}

export const sparklinePoints = (values: readonly (number | undefined)[], { floor, ceiling }: SparklineScale): string => {
  const defined = values.filter((value): value is number => value !== undefined);
  if (defined.length === 0) {
    return '';
  }
  const low = Math.min(floor, ...defined);
  const high = Math.max(ceiling ?? Math.max(...defined), ...defined, low + 1);
  const step = values.length > 1 ? WIDTH / (values.length - 1) : 0;
  return values
    .map((value, index) => (value === undefined ? undefined : `${(index * step).toFixed(1)},${(HEIGHT - ((value - low) / (high - low)) * HEIGHT).toFixed(1)}`))
    .filter((point): point is string => point !== undefined)
    .join(' ');
};

export const createSparkline = (): SVGSVGElement => {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('viewBox', `0 0 ${WIDTH} ${HEIGHT}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.append(document.createElementNS(SVG, 'polyline'));
  return svg;
};

export const drawSparkline = (svg: SVGSVGElement, values: readonly (number | undefined)[], scale: SparklineScale): void => {
  (svg.firstElementChild as SVGPolylineElement).setAttribute('points', sparklinePoints(values, scale));
};
