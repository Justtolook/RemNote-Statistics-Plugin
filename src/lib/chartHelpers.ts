import { Card } from '@remnote/plugin-sdk';

/**
 * Common chart color - can be overridden by settings
 */
export let chartColor = '#3362f0';

/**
 * Updates the global chart color
 */
export function setChartColor(color: string) {
  chartColor = color;
}

/**
 * Returns common chart configuration options
 */
export function getCommonChartOptions(title: string, xaxisType: 'datetime' | 'category' | 'numeric') {
  return {
    chart: {
      foreColor: 'var(--rn-clr-content-primary)',
      fontFamily: 'inherit',
      toolbar: { show: false }
    },
    title: {
      text: title,
      style: { color: 'var(--rn-clr-content-primary)' }
    },
    colors: [chartColor],
    xaxis: {
      type: xaxisType,
      labels: { style: { colors: 'var(--rn-clr-content-primary)' } }
    },
    yaxis: {
      decimalsInFloat: 0,
      labels: { style: { colors: 'var(--rn-clr-content-primary)' } }
    },
    tooltip: {
      theme: 'light' as const,
    },
    grid: {
      show: true,
      borderColor: 'var(--rn-clr-border-light-accent)',
      strokeDashArray: 4,
      position: 'back' as const,
      xaxis: {
        lines: { show: false }
      },
      yaxis: {
        lines: { show: true }
      }
    }
  };
}

/**
 * Returns standardized container style
 */
export function getContainerStyle() {
  return { color: 'var(--rn-clr-content-primary)' };
}

/**
 * Returns standardized box style
 */
export function getBoxStyle() {
  return { 
    backgroundColor: 'var(--rn-clr-background-secondary)', 
    borderColor: 'var(--rn-clr-border-primary)',
    color: 'var(--rn-clr-content-primary)' 
  };
}

/**
 * Returns standardized input style
 */
export function getInputStyle() {
  return {
    backgroundColor: 'var(--rn-clr-background-primary)',
    borderColor: 'var(--rn-clr-border-primary)',
    color: 'var(--rn-clr-content-primary)',
  };
}

/**
 * Gets button style based on selection state
 */
export function getButtonStyle(isSelected: boolean, color: string = chartColor) {
  return {
    backgroundColor: isSelected ? color : 'var(--rn-clr-background-primary)',
    color: isSelected ? '#fff' : 'var(--rn-clr-content-secondary)',
    border: isSelected ? 'none' : '1px solid var(--rn-clr-border-primary)',
    boxShadow: isSelected ? 'none' : '0 1px 2px 0 rgba(0, 0, 0, 0.05)', 
  };
}

/**
 * Transform object to category format for charts
 */
export function transformObjectToCategoryFormat(data: Record<string, number>) {
  return Object.keys(data).map((key) => {
    return { x: key, y: data[key] };
  });
}

/**
 * Calculate retention rate from button pressed data
 */
export function retentionRate(data: Record<string, number>) {
  const forgot = data["Forgot"] || 0;
  const remembered = (data["Hard"] || 0) + (data["Good"] || 0) + (data["Easy"] || 0);
  if ((forgot + remembered) === 0) return "No Data";
  return (remembered / (forgot + remembered)).toFixed(2);
}
