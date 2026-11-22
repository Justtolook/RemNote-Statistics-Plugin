import {
  AppEvents,
  RNPlugin,
  useAPIEventListener,
  useTrackerPlugin,
  WidgetLocation,
} from '@remnote/plugin-sdk';
import React from 'react';
import {
  appendLiveReview,
  assessLiveFatigue,
  buildFatigueProfile,
  FatigueLevel,
  FatigueProfile,
  getLatestLiveReview,
  LiveFatigue,
  LiveSession,
  PROFILE_MAX_AGE_MS,
} from '../../lib/liveFatigue';
import { SETTINGS } from '../../lib/settings';

const SESSION_KEY = 'statistics-live-session';
const SNOOZE_KEY = 'statistics-fatigue-snooze-until';
const PROFILE_KEY = 'statistics-fatigue-profile';
const SNOOZE_MS = 10 * 60 * 1000;
/** Only answers this recent are recorded, so opening the queue never imports old history. */
const MAX_REVIEW_AGE_MS = 2 * 60 * 1000;

const LEVEL_COLORS: Record<FatigueLevel, string> = { low: '#10b981', medium: '#f59e0b', high: '#ef4444' };
const LEVEL_LABELS: Record<FatigueLevel, string> = { low: 'Fresh', medium: 'Getting tired', high: 'Tired' };

function describe(fatigue: LiveFatigue): string {
  const lines = [
    `Study session: ${Math.floor(fatigue.minutes)} min, ${fatigue.reviews} answers`,
    fatigue.personalBreakPoint
      ? `Your retention usually drops after about ${fatigue.breakAfterMinutes} min.`
      : `Suggested break after ${fatigue.breakAfterMinutes} min (general guideline until there is enough history).`,
  ];
  const { retention, speed } = fatigue.signals;
  if (retention) {
    lines.push(`Recent recall: ${retention.recentRate.toFixed(0)}% (usually ${retention.baselineRate.toFixed(0)}%)${retention.dropped ? ' ⚠' : ''}`);
  }
  if (speed) {
    const change = speed.slowdownPercent >= 0 ? `${speed.slowdownPercent}% slower` : `${-speed.slowdownPercent}% faster`;
    lines.push(`Answer speed: ${(speed.recentMedianMs / 1000).toFixed(1)}s, ${change} than usual${speed.slowed ? ' ⚠' : ''}`);
  }
  lines.push('A pause of 10+ minutes starts a new session.');
  return lines.join('\n');
}

/**
 * Shows how long the current study session has been running and how tired the
 * user likely is, and suggests a break when it is time.
 */
export function FatigueIndicator({ plugin }: { plugin: RNPlugin }) {
  const enabled = useTrackerPlugin(rp => rp.settings.getSetting<boolean>(SETTINGS.liveFatigue));
  const context = useTrackerPlugin(rp => rp.widget.getWidgetContext<WidgetLocation.QueueToolbar>());
  const session = useTrackerPlugin(rp => rp.storage.getSession<LiveSession>(SESSION_KEY));
  const snoozeUntil = useTrackerPlugin(rp => rp.storage.getSession<number>(SNOOZE_KEY));
  const profile = useTrackerPlugin(rp => rp.storage.getSynced<FatigueProfile>(PROFILE_KEY));
  const [now, setNow] = React.useState(Date.now());
  const isEnabled = enabled !== false;
  // The event listener may be registered once, so read the latest values through refs.
  const enabledRef = React.useRef(isEnabled);
  enabledRef.current = isEnabled;

  // Tick so the minutes update between answers.
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  // Refresh the personal profile at most once a day, a few seconds after the
  // queue opens so it never delays the first card.
  React.useEffect(() => {
    if (!isEnabled) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const stored = await plugin.storage.getSynced<FatigueProfile>(PROFILE_KEY);
        if (stored && Date.now() - stored.computedAt < PROFILE_MAX_AGE_MS) return;
        const cards = await plugin.card.getAll();
        if (cancelled) return;
        await plugin.storage.setSynced(PROFILE_KEY, buildFatigueProfile(cards));
      } catch (error) {
        console.error('Stats Plugin: Error building fatigue profile:', error);
      }
    }, 3000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [isEnabled, plugin]);

  const record = React.useCallback(async (cardId: string | undefined) => {
    if (!cardId) return;
    try {
      const review = getLatestLiveReview(cardId, await plugin.card.findOne(cardId));
      if (!review || Date.now() - review.date > MAX_REVIEW_AGE_MS) return;
      const current = await plugin.storage.getSession<LiveSession>(SESSION_KEY);
      const next = appendLiveReview(current, review);
      if (next !== current) await plugin.storage.setSession(SESSION_KEY, next);
      setNow(Date.now());
    } catch (error) {
      console.error('Stats Plugin: Error recording review:', error);
    }
  }, [plugin]);

  // Primary signal: RemNote reports a completed card. The payload is not
  // documented, so fall back to the card that was on screen.
  const currentCardId = React.useRef<string | undefined>();
  const recordRef = React.useRef(record);
  recordRef.current = record;
  useAPIEventListener(AppEvents.QueueCompleteCard, undefined, (args: any) => {
    if (!enabledRef.current) return;
    const cardId = typeof args?.cardId === 'string' ? args.cardId : currentCardId.current;
    // Give RemNote a moment to write the answer to the card's history.
    setTimeout(() => recordRef.current(cardId), 300);
  });

  // Fallback: when the next card appears, the previous one was answered.
  const cardId = context?.cardId;
  React.useEffect(() => {
    const previous = currentCardId.current;
    currentCardId.current = cardId;
    if (isEnabled && previous && previous !== cardId) record(previous);
  }, [cardId, isEnabled, record]);

  if (!isEnabled) return null;
  const fatigue = assessLiveFatigue(session, now, profile);
  if (!fatigue.active) return null;

  const color = LEVEL_COLORS[fatigue.level];
  const showBreak = fatigue.level === 'high' && !(snoozeUntil && now < snoozeUntil);

  return (
    <div className="fatigue-indicator" role="status" aria-live="polite">
      <div className="fatigue-pill" title={describe(fatigue)}>
        <span className="fatigue-dot" style={{ backgroundColor: color }} aria-hidden="true" />
        <span className="fatigue-minutes">{Math.floor(fatigue.minutes)} min</span>
        <span className="fatigue-bar" aria-hidden="true">
          <span className="fatigue-bar-fill" style={{ width: `${fatigue.score}%`, backgroundColor: color }} />
        </span>
        <span className="fatigue-label">{LEVEL_LABELS[fatigue.level]}</span>
      </div>
      {showBreak && (
        <div className="fatigue-break">
          <span>☕ Time for a short break</span>
          <button
            type="button"
            aria-label="Remind me in 10 minutes"
            title="Remind me in 10 minutes"
            onClick={() => plugin.storage.setSession(SNOOZE_KEY, Date.now() + SNOOZE_MS)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
