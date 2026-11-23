import { usePlugin, renderWidget } from '@remnote/plugin-sdk';
import React from 'react';
import { isSmallMobileDevice, openStatisticsPopup } from '../lib/openStatistics';
import { FatigueIndicator } from './queue/FatigueIndicator';

/**
 * Queue toolbar: the live session-fatigue indicator and a button that opens
 * the statistics popup.
 */
export const QueueToolbarButton = () => {
  const plugin = usePlugin();
  const isSmallMobile = isSmallMobileDevice();

  return (
    <div className={`queue-toolbar-group${isSmallMobile ? ' queue-toolbar-group-mobile' : ''}`}>
      <FatigueIndicator plugin={plugin} />
      <button
        type="button"
        onClick={() => openStatisticsPopup(plugin)}
        className={`queue-stats-button${isSmallMobile ? ' queue-stats-button-mobile' : ''}`}
        title="Open Statistics Dashboard"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ flexShrink: 0 }}
        >
          <line x1="18" y1="20" x2="18" y2="10"></line>
          <line x1="12" y1="20" x2="12" y2="4"></line>
          <line x1="6" y1="20" x2="6" y2="14"></line>
        </svg>
        <span>Statistics</span>
      </button>
    </div>
  );
};

renderWidget(QueueToolbarButton);
