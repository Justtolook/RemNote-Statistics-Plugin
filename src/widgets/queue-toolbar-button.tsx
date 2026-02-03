import { usePlugin, renderWidget } from '@remnote/plugin-sdk';
import React from 'react';

/**
 * A button that appears in the queue toolbar to open the statistics widget.
 * This provides quick access to statistics while reviewing flashcards.
 */
export const QueueToolbarButton = () => {
  const plugin = usePlugin();

  const handleClick = async () => {
    // Get the current focused Rem for context
    const focusedRem = await plugin.focus.getFocusedRem();
    
    // Save context to session storage
    await plugin.storage.setSession('statistics-context', { 
      focusedRemId: focusedRem?._id 
    });

    // Open the statistics popup
    plugin.widget.openPopup('statistics');
  };

  return (
    <button
      onClick={handleClick}
      className="queue-stats-button"
      title="Open Statistics Dashboard"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.5rem',
        padding: '0.5rem 0.75rem',
        backgroundColor: 'var(--rn-clr-background-secondary)',
        border: '1px solid var(--rn-clr-border-primary)',
        borderRadius: '6px',
        color: 'var(--rn-clr-content-primary)',
        cursor: 'pointer',
        fontSize: '0.875rem',
        fontWeight: '500',
        transition: 'all 0.2s ease',
        whiteSpace: 'nowrap'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--rn-clr-background-tertiary)';
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'var(--rn-clr-background-secondary)';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Statistics Icon */}
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
        style={{ flexShrink: 0 }}
      >
        <line x1="18" y1="20" x2="18" y2="10"></line>
        <line x1="12" y1="20" x2="12" y2="4"></line>
        <line x1="6" y1="20" x2="6" y2="14"></line>
      </svg>
      <span>Statistics</span>
    </button>
  );
};

renderWidget(QueueToolbarButton);
