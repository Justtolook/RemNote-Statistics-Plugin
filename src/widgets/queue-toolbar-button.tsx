import { usePlugin, renderWidget } from '@remnote/plugin-sdk';
import React from 'react';

/**
 * A button that appears in the queue toolbar to open the statistics widget.
 * This provides quick access to statistics while reviewing flashcards.
 */
export const QueueToolbarButton = () => {
  const plugin = usePlugin();

  // Detect if device is a small mobile device (smartphone, not tablet)
  const isSmallMobile = window.innerWidth < 780 && // Width less than tablet breakpoint
    ('ontouchstart' in window || navigator.maxTouchPoints > 0); // Touch device

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
        gap: '0.25rem',
        padding: '0.5rem 0.25rem',
        backgroundColor: 'var(--rn-clr-background-secondary)',
        border: '1px solid var(--rn-clr-border-primary)',
        borderRadius: '6px',
        color: 'var(--rn-clr-content-primary)',
        cursor: 'pointer',
        fontSize: '0.875rem',
        fontWeight: '500',
        transition: 'all 0.2s ease',
        margin: '0 0.5rem',
        whiteSpace: 'nowrap',
        ...(isSmallMobile && {
          marginLeft: '1rem',
          marginRight: '1rem',
          marginBottom: '0.5rem'
        })
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
      <span
        style={{
          fontSize: '0.625rem',
          fontWeight: '700',
          color: 'white',
          backgroundColor: '#ef4444',
          padding: '0.125rem 0.25rem',
          borderRadius: '3px',
          letterSpacing: '0.025em',
          textTransform: 'uppercase',
          lineHeight: '1'
        }}
      >
        NEW
      </span>
    </button>
  );
};

renderWidget(QueueToolbarButton);
