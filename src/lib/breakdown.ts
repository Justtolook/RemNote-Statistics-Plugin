import { DEFAULT_LEECH_THRESHOLD, DEFAULT_MAX_RESPONSE_TIME_MS, capResponseTime } from './dataProcessing';
import { isForgot, isGradedReview, isValidReviewDate, ReviewScore } from './reviewScores';

/** Group id for cards that live outside the selected Rem (e.g. referencing Rems). */
export const OUTSIDE_GROUP = '__outside__';

type ReviewLike = { date: number; score?: number; responseTime?: number };
type CardLike = { _id: string; remId: string; repetitionHistory?: ReviewLike[] | null };
type RemLike = { _id: string; parent: string | null };

/**
 * Loads the parent of every given Rem and of all their ancestors, in batches.
 * Uses one `findMany` call per tree level (per 500 ids) instead of one call per Rem.
 */
export async function loadParentMap(
  remIds: Iterable<string>,
  findMany: (ids: string[]) => Promise<RemLike[] | undefined>,
  batchSize: number = 500,
): Promise<Map<string, string | null>> {
  const parents = new Map<string, string | null>();
  let pending = [...new Set(remIds)];

  while (pending.length > 0) {
    const next = new Set<string>();
    for (let i = 0; i < pending.length; i += batchSize) {
      const ids = pending.slice(i, i + batchSize);
      const rems = (await findMany(ids)) || [];
      const found = new Set<string>();
      for (const rem of rems) {
        if (!rem) continue;
        found.add(rem._id);
        parents.set(rem._id, rem.parent ?? null);
        if (rem.parent && !parents.has(rem.parent)) next.add(rem.parent);
      }
      // Rems that no longer exist are treated as top level.
      for (const id of ids) if (!found.has(id)) parents.set(id, null);
    }
    pending = [...next].filter(id => !parents.has(id));
  }

  return parents;
}

/**
 * Maps every Rem id to the group it belongs to.
 *
 * - Without `contextRemId`, the group is the Rem's top-level ancestor (its document root).
 * - With `contextRemId`, the group is the child of the context Rem the Rem sits under.
 *   Rems that are the context Rem itself map to the context id; Rems that are not
 *   below it at all map to {@link OUTSIDE_GROUP}.
 */
export function resolveGroupIds(
  remIds: Iterable<string>,
  parents: Map<string, string | null>,
  contextRemId?: string,
): Map<string, string> {
  const cache = new Map<string, string>();

  const resolve = (remId: string): string => {
    const path: string[] = [];
    const seen = new Set<string>();
    let current: string | null = remId;
    let group: string | undefined;

    while (current !== null) {
      // Checked before the cache: the context Rem's own group is itself, but Rems
      // below it belong to the child they sit under.
      if (current === contextRemId) { group = path.length === 0 ? contextRemId : path[path.length - 1]; break; }
      const cached = cache.get(current);
      if (cached !== undefined) { group = cached; break; }
      if (seen.has(current)) { group = current; break; } // Defensive: cycle in data.
      seen.add(current);
      path.push(current);
      const parent: string | null | undefined = parents.get(current);
      if (parent === undefined || parent === null) {
        group = contextRemId !== undefined ? OUTSIDE_GROUP : current;
        break;
      }
      current = parent;
    }

    // Every node on the walked path shares the same group (same root, or same
    // child of the context Rem), so they can all be cached.
    const result = group ?? remId;
    for (const node of path) cache.set(node, result);
    return result;
  };

  const groups = new Map<string, string>();
  for (const remId of remIds) groups.set(remId, resolve(remId));
  return groups;
}

export interface GroupStats {
  groupId: string;
  cards: number;
  reviews: number;
  remembered: number;
  forgot: number;
  retentionRate?: number; // 0-100
  timeMs: number;
  leeches: number;
}

/**
 * Aggregates review statistics per group for reviews between `start` and `end`.
 * Sorted by number of reviews (most first), then by card count.
 */
export function getGroupBreakdown(
  cards: CardLike[],
  groupOfRem: Map<string, string>,
  start: number = 0,
  end: number = Infinity,
  leechThreshold: number = DEFAULT_LEECH_THRESHOLD,
  capMs: number = DEFAULT_MAX_RESPONSE_TIME_MS,
): GroupStats[] {
  const groups = new Map<string, GroupStats>();

  for (const card of cards) {
    const groupId = groupOfRem.get(card.remId) ?? OUTSIDE_GROUP;
    let stats = groups.get(groupId);
    if (!stats) {
      stats = { groupId, cards: 0, reviews: 0, remembered: 0, forgot: 0, timeMs: 0, leeches: 0 };
      groups.set(groupId, stats);
    }
    stats.cards++;

    let cardForgot = 0;
    let markedAsLeech = false;
    for (const rep of card.repetitionHistory || []) {
      if (!isValidReviewDate(rep.date) || rep.date < start || rep.date > end) continue;
      if (rep.score === ReviewScore.VIEWED_AS_LEECH) markedAsLeech = true;
      if (!isGradedReview(rep.score)) continue;
      stats.reviews++;
      if (isForgot(rep.score)) { stats.forgot++; cardForgot++; }
      else stats.remembered++;
      if (rep.responseTime && rep.responseTime > 0) stats.timeMs += capResponseTime(rep.responseTime, capMs);
    }
    if (markedAsLeech || cardForgot >= leechThreshold) stats.leeches++;
  }

  return [...groups.values()]
    .map(stats => ({
      ...stats,
      retentionRate: stats.reviews > 0 ? Math.round((stats.remembered / stats.reviews) * 1000) / 10 : undefined,
    }))
    .sort((a, b) => b.reviews - a.reviews || b.cards - a.cards);
}
