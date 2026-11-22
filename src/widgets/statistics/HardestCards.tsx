import { RNPlugin } from '@remnote/plugin-sdk';
import React from 'react';
import { HardCardData } from '../../lib/dataProcessing';
import { SegmentedControl } from './SegmentedControl';
import { openRemById, useRemDisplayText } from './remText';

const LIMIT_OPTIONS = [
  { label: 'Top 10', value: 10 },
  { label: 'Top 20', value: 20 },
  { label: 'Top 50', value: 50 },
];

const retentionColor = (rate: number) => {
  if (rate <= 30) return '#ef4444';
  if (rate <= 50) return '#f97316';
  if (rate <= 70) return '#eab308';
  return '#22c55e';
};

interface HardestCardsSectionProps {
  plugin: RNPlugin;
  cards: HardCardData[];
  limit: number;
  onLimitChange: (limit: number) => void;
  leechThreshold: number;
}

export function HardestCardsSection({ plugin, cards, limit, onLimitChange, leechThreshold }: HardestCardsSectionProps) {
  const leechCount = cards.filter(card => card.isLeech).length;

  return (
    <div className="mb-6 md:mb-8 fade-in">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 md:gap-4 mb-4 md:mb-6">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="p-1.5 md:p-2 rounded-lg" style={{ backgroundColor: 'var(--rn-clr-background-secondary)' }}>
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 md:w-6 md:h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#ef4444' }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
          </div>
          <div>
            <div className="font-bold text-lg md:text-xl">Cards to Improve</div>
            <div className="text-xs md:text-sm opacity-60 hidden sm:block">
              Cards most likely to have low retention (min. 3 reviews)
              <span
                className="opacity-60 hover:opacity-100 cursor-help ml-1"
                title={'Ranked by the upper end of the 95% confidence interval of each card\'s retention, so a card that failed 5 of 50 reviews ranks above one that failed 3 of 3.\n'
                  + `Leech: forgotten ${leechThreshold}+ times in the period, or marked as a leech by RemNote.`}
              >ⓘ</span>
            </div>
          </div>
        </div>
        <SegmentedControl options={LIMIT_OPTIONS} value={limit} onChange={onLimitChange} accent="#ef4444" />
      </div>

      {cards.length === 0 ? (
        <div className="stat-card p-6 md:p-8 border rounded-lg text-center" style={{ borderColor: 'var(--rn-clr-border-primary)', backgroundColor: 'var(--rn-clr-background-secondary)' }}>
          <div className="text-sm opacity-60">No difficult cards found with 3+ reviews</div>
          <div className="text-xs opacity-40 mt-1">Keep studying to collect more data!</div>
        </div>
      ) : (
        <>
          {leechCount > 0 && (
            <div className="text-xs opacity-70 mb-2">
              {leechCount === 1 ? '1 of these cards is a leech' : `${leechCount} of these cards are leeches`}: consider rewriting or splitting {leechCount === 1 ? 'it' : 'them'}.
            </div>
          )}
          <div className="border rounded-lg overflow-hidden" style={{ borderColor: 'var(--rn-clr-border-primary)' }}>
            <div className="grid grid-cols-12 gap-2 p-3 text-xs font-semibold uppercase tracking-wide opacity-70" style={{ backgroundColor: 'var(--rn-clr-background-tertiary)' }}>
              <div className="col-span-1 text-center">#</div>
              <div className="col-span-5">Flashcard</div>
              <div className="col-span-2 text-center hidden sm:block">Reviews</div>
              <div className="col-span-2 text-center hidden sm:block">Forgot</div>
              <div className="col-span-6 sm:col-span-2 text-center">Retention</div>
            </div>
            <div className="divide-y" style={{ borderColor: 'var(--rn-clr-border-primary)' }}>
              {cards.map((card, index) => (
                <HardestCardRow key={card.cardId} card={card} index={index} plugin={plugin} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function HardestCardRow({ card, index, plugin }: { card: HardCardData; index: number; plugin: RNPlugin }) {
  const remText = useRemDisplayText(plugin, card.remId);
  const color = retentionColor(card.retentionRate);

  return (
    <div
      role="button"
      tabIndex={0}
      className="hardest-card-row grid grid-cols-12 gap-2 p-3 items-center cursor-pointer transition-all"
      onClick={() => openRemById(plugin, card.remId)}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openRemById(plugin, card.remId); } }}
    >
      <div className="col-span-1 text-center">
        <span className="text-sm font-medium opacity-60">{index + 1}</span>
      </div>
      <div className="col-span-5 flex items-center min-w-0">
        <div className="hardest-card-text text-sm truncate" title={remText}>{remText}</div>
        {card.isLeech && <span className="leech-badge" title="Leech: forgotten many times">Leech</span>}
      </div>
      <div className="col-span-2 text-center hidden sm:block">
        <span className="text-sm">{card.totalReviews}</span>
      </div>
      <div className="col-span-2 text-center hidden sm:block">
        <span className="text-sm" style={{ color: '#ef4444' }}>{card.forgotCount}</span>
      </div>
      <div className="col-span-6 sm:col-span-2 text-center">
        <span
          className="inline-block px-2 py-1 rounded-full text-xs font-semibold"
          style={{ backgroundColor: `${color}20`, color }}
          title={`Likely at most ${card.retentionUpperBound.toFixed(0)}% (95% confidence)`}
        >
          {card.retentionRate.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
