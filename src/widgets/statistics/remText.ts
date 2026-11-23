import { RNPlugin } from '@remnote/plugin-sdk';
import React from 'react';

/** Plain text of a Rem, truncated, or a placeholder when it is missing or empty. */
export async function getRemDisplayText(plugin: RNPlugin, remId: string, maxLength: number = 80): Promise<string> {
  try {
    const rem = await plugin.rem.findOne(remId);
    if (!rem) return '(Rem not found)';
    const text = rem.text ? await plugin.richText.toString(rem.text) : '';
    if (!text || text.trim().length === 0) return '(Untitled)';
    return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
  } catch {
    return '(Error loading)';
  }
}

/** Loads a Rem's display text; returns 'Loading...' until it is available. */
export function useRemDisplayText(plugin: RNPlugin, remId: string): string {
  const [text, setText] = React.useState('Loading...');
  React.useEffect(() => {
    let cancelled = false;
    getRemDisplayText(plugin, remId).then(value => { if (!cancelled) setText(value); });
    return () => { cancelled = true; };
  }, [plugin, remId]);
  return text;
}

export async function openRemById(plugin: RNPlugin, remId: string): Promise<void> {
  try {
    const rem = await plugin.rem.findOne(remId);
    if (rem) await plugin.window.openRem(rem);
  } catch (error) {
    console.error('Stats Plugin: Error opening Rem:', error);
  }
}
