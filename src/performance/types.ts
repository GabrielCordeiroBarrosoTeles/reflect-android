export interface FrameStats {
  readonly total: number;
  readonly janky: number;
  readonly p50: number | undefined;
  readonly p90: number | undefined;
  readonly p99: number | undefined;
}

export interface PerformanceReading {
  readonly app: string | undefined;
  readonly pid: number | undefined;
  readonly cpu: number | undefined;
  readonly memoryKb: number | undefined;
  readonly frames: FrameStats | undefined;
}

export interface PerformancePoint {
  readonly time: number;
  readonly cpu: number | undefined;
  readonly memoryMb: number | undefined;
  readonly fps: number | undefined;
  readonly jank: number | undefined;
  readonly p50: number | undefined;
  readonly p90: number | undefined;
  readonly p99: number | undefined;
}

export interface IPerformanceReader {
  read(serial: string): Promise<PerformanceReading>;
  resetFrames(serial: string, app: string): Promise<void>;
}
