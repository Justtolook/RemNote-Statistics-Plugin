import { DEFAULT_CHART_COLOR } from './chartHelpers';
import { DEFAULT_LEECH_THRESHOLD, DEFAULT_MAX_RESPONSE_TIME_MS } from './dataProcessing';

/** Setting ids. The existing ids are kept unchanged so saved user settings survive. */
export const SETTINGS = {
  chartColor: 'statistics-chart-color',
  heatmapColorLow: 'HeatmapColorLow',
  heatmapColorHigh: 'HeatmapColorHigh',
  heatmapTarget: 'HeatmapTarget',
  targetRetention: 'statistics-target-retention',
  maxAnswerSeconds: 'statistics-max-answer-seconds',
  leechThreshold: 'statistics-leech-threshold',
} as const;

export const SETTING_DEFAULTS = {
  chartColor: DEFAULT_CHART_COLOR,
  heatmapColorLow: '#b3dff0',
  heatmapColorHigh: '#1302d1',
  heatmapTarget: 50,
  targetRetention: 90,
  maxAnswerSeconds: DEFAULT_MAX_RESPONSE_TIME_MS / 1000,
  leechThreshold: DEFAULT_LEECH_THRESHOLD,
} as const;

/** Parses a numeric setting, falling back when it is missing or outside [min, max]. */
export function readNumberSetting(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}
