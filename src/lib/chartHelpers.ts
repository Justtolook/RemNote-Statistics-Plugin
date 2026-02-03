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
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: {
        enabled: true,
        easing: 'easeinout',
        speed: 800,
        animateGradually: {
          enabled: true,
          delay: 150
        },
        dynamicAnimation: {
          enabled: true,
          speed: 350
        }
      }
    },
    title: {
      text: title,
      style: { 
        color: 'var(--rn-clr-content-primary)',
        fontSize: '16px',
        fontWeight: 600
      },
      align: 'left' as const,
      offsetX: 0,
      offsetY: 0
    },
    colors: [chartColor],
    xaxis: {
      type: xaxisType,
      labels: { 
        style: { colors: 'var(--rn-clr-content-primary)' },
        rotate: xaxisType === 'category' ? -45 : 0,
        rotateAlways: false
      }
    },
    yaxis: {
      decimalsInFloat: 0,
      labels: { 
        style: { colors: 'var(--rn-clr-content-primary)' }
      }
    },
    tooltip: {
      theme: 'light' as const,
      style: {
        fontSize: '12px',
        fontFamily: 'inherit'
      }
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
      },
      padding: {
        top: 0,
        right: 10,
        bottom: 0,
        left: 10
      }
    },
    responsive: [{
      breakpoint: 768,
      options: {
        chart: {
          height: 250
        },
        legend: {
          position: 'bottom' as const
        },
        title: {
          style: {
            fontSize: '14px'
          }
        },
        xaxis: {
          labels: {
            style: {
              fontSize: '10px'
            }
          }
        },
        yaxis: {
          labels: {
            style: {
              fontSize: '10px'
            }
          }
        }
      }
    }]
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
    boxShadow: isSelected ? '0 2px 8px rgba(0, 0, 0, 0.15)' : '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    fontWeight: isSelected ? 600 : 400,
    transform: isSelected ? 'scale(1.02)' : 'scale(1)',
    transition: 'all 0.2s ease-in-out'
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
