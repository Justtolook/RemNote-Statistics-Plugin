import { RNPlugin } from '@remnote/plugin-sdk';

export const STATISTICS_WIDGET = 'statistics';
export const STATISTICS_CONTEXT_KEY = 'statistics-context';

export interface StatisticsSessionContext {
  focusedRemId?: string;
}

/** True on phones (touch device narrower than a tablet), not on tablets or desktops. */
export function isSmallMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  return window.innerWidth < 780 && hasTouch;
}

/** Stores the focused Rem as context and opens the statistics popup. */
export async function openStatisticsPopup(plugin: RNPlugin): Promise<void> {
  const focusedRem = await plugin.focus.getFocusedRem();
  const context: StatisticsSessionContext = { focusedRemId: focusedRem?._id };
  await plugin.storage.setSession(STATISTICS_CONTEXT_KEY, context);
  await plugin.widget.openPopup(STATISTICS_WIDGET);
}
