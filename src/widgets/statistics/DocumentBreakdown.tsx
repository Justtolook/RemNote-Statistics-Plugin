import { Card, RNPlugin } from '@remnote/plugin-sdk';
import React from 'react';
import { getGroupBreakdown, GroupStats, loadParentMap, OUTSIDE_GROUP, resolveGroupIds } from '../../lib/breakdown';
import { formatTime } from '../../lib/dataProcessing';
import { SectionHeader } from '../statisticsComponents';
import { getRemDisplayText, openRemById } from './remText';

const INITIAL_ROWS = 15;

interface DocumentBreakdownProps {
  plugin: RNPlugin;
  cards: Card[];
  /** When set, groups by the children of this Rem instead of by top-level document. */
  contextRemId?: string;
  start: number;
  end: number;
  leechThreshold: number;
  maxAnswerMs: number;
  accent: string;
}

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; groupOfRem: Map<string, string> }
  | { status: 'error' };

export function DocumentBreakdown({ plugin, cards, contextRemId, start, end, leechThreshold, maxAnswerMs, accent }: DocumentBreakdownProps) {
  const [requested, setRequested] = React.useState(false);
  const [state, setState] = React.useState<LoadState>({ status: 'idle' });
  const [showAll, setShowAll] = React.useState(false);
  const [names, setNames] = React.useState<Record<string, string>>({});

  // Resolve which group every card's Rem belongs to. Only runs once requested,
  // and again when the scope changes.
  React.useEffect(() => {
    if (!requested) return;
    let cancelled = false;
    setState({ status: 'loading' });

    (async () => {
      try {
        const remIds = [...new Set(cards.map(card => card.remId))];
        const parents = await loadParentMap(remIds, async ids => await plugin.rem.findMany(ids));
        if (!cancelled) setState({ status: 'ready', groupOfRem: resolveGroupIds(remIds, parents, contextRemId) });
      } catch (error) {
        console.error('Stats Plugin: Error building breakdown:', error);
        if (!cancelled) setState({ status: 'error' });
      }
    })();

    return () => { cancelled = true; };
  }, [requested, cards, contextRemId, plugin]);

  const rows = React.useMemo<GroupStats[]>(() => {
    if (state.status !== 'ready') return [];
    return getGroupBreakdown(cards, state.groupOfRem, start, end, leechThreshold, maxAnswerMs);
  }, [state, cards, start, end, leechThreshold, maxAnswerMs]);

  const visibleRows = React.useMemo(() => (showAll ? rows : rows.slice(0, INITIAL_ROWS)), [rows, showAll]);

  // Load names only for the rows on screen.
  React.useEffect(() => {
    const missing = visibleRows.map(row => row.groupId).filter(id => id !== OUTSIDE_GROUP && names[id] === undefined);
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map(async id => [id, await getRemDisplayText(plugin, id, 60)] as const)).then(entries => {
      if (!cancelled) setNames(previous => ({ ...previous, ...Object.fromEntries(entries) }));
    });
    return () => { cancelled = true; };
  }, [visibleRows, names, plugin]);

  const labelFor = (groupId: string) => {
    if (groupId === OUTSIDE_GROUP) return contextRemId ? 'Outside this Rem (references, portals, sources)' : '(Unknown)';
    const name = names[groupId] ?? 'Loading...';
    return groupId === contextRemId ? `${name} (cards on this Rem itself)` : name;
  };

  return (
    <div className="mb-6 md:mb-8 fade-in">
      <SectionHeader
        title={contextRemId ? 'Breakdown by Child Rem' : 'Breakdown by Document'}
        description={contextRemId
          ? 'Reviews, retention, time and leeches for each child of the selected Rem'
          : 'Reviews, retention, time and leeches for each top-level document'}
        icon={<span aria-hidden="true" style={{ color: accent }}>☰</span>}
      />

      {state.status === 'idle' && (
        <button
          type="button"
          onClick={() => setRequested(true)}
          className="px-4 py-2 rounded-md text-sm font-medium"
          style={{ backgroundColor: accent, color: '#fff' }}
        >
          Show breakdown
        </button>
      )}
      {state.status === 'loading' && <div className="text-sm opacity-60" role="status">Grouping {cards.length.toLocaleString()} cards…</div>}
      {state.status === 'error' && (
        <div className="statistics-error-state" role="alert">
          <span>We couldn't build the breakdown.</span>
          <button type="button" onClick={() => { setRequested(false); setState({ status: 'idle' }); }}>Reset</button>
        </div>
      )}

      {state.status === 'ready' && (
        rows.length === 0 ? (
          <div className="text-sm opacity-60">No cards to group.</div>
        ) : (
          <>
            <div className="breakdown-table-wrapper">
              <table className="breakdown-table">
                <thead>
                  <tr>
                    <th scope="col">{contextRemId ? 'Child Rem' : 'Document'}</th>
                    <th scope="col">Cards</th>
                    <th scope="col">Reviews</th>
                    <th scope="col">Retention</th>
                    <th scope="col">Time</th>
                    <th scope="col">Lapses</th>
                    <th scope="col">Leeches</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(row => (
                    <tr
                      key={row.groupId}
                      tabIndex={row.groupId === OUTSIDE_GROUP ? -1 : 0}
                      onClick={() => row.groupId !== OUTSIDE_GROUP && openRemById(plugin, row.groupId)}
                      onKeyDown={event => {
                        if ((event.key === 'Enter' || event.key === ' ') && row.groupId !== OUTSIDE_GROUP) {
                          event.preventDefault();
                          openRemById(plugin, row.groupId);
                        }
                      }}
                    >
                      <td>{labelFor(row.groupId)}</td>
                      <td>{row.cards.toLocaleString()}</td>
                      <td>{row.reviews.toLocaleString()}</td>
                      <td>{row.retentionRate === undefined ? '–' : `${row.retentionRate.toFixed(1)}%`}</td>
                      <td>{formatTime(row.timeMs)}</td>
                      <td style={{ color: row.forgot > 0 ? '#ef4444' : undefined }}>{row.forgot.toLocaleString()}</td>
                      <td>{row.leeches > 0 ? <span className="leech-badge" style={{ marginLeft: 0 }}>{row.leeches}</span> : 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > INITIAL_ROWS && (
              <button type="button" className="text-xs hover:underline mt-2" style={{ color: accent }} onClick={() => setShowAll(value => !value)}>
                {showAll ? 'Show fewer' : `Show all ${rows.length}`}
              </button>
            )}
          </>
        )
      )}
    </div>
  );
}
