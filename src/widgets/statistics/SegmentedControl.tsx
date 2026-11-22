import React from 'react';

interface SegmentedControlProps<T extends string | number> {
  options: Array<{ label: string; value: T }>;
  value: T;
  onChange: (value: T) => void;
  accent: string;
}

/** A small row of mutually exclusive buttons (e.g. Week / Month / Year). */
export function SegmentedControl<T extends string | number>({ options, value, onChange, accent }: SegmentedControlProps<T>) {
  return (
    <div
      className="flex gap-1 md:gap-2 text-xs md:text-sm p-1 md:p-1.5 rounded-lg"
      role="group"
      style={{ backgroundColor: 'var(--rn-clr-background-secondary)', border: '1px solid var(--rn-clr-border-primary)' }}
    >
      {options.map(option => (
        <button
          key={option.label}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className="px-2 md:px-4 py-1 md:py-2 rounded-md transition-all smooth-transition font-medium text-xs md:text-sm"
          style={value === option.value
            ? { backgroundColor: accent, color: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }
            : { color: 'var(--rn-clr-content-secondary)' }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
