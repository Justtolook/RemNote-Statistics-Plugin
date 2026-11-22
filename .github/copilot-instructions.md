# RemNote Statistics Plugin - AI Agent Instructions

## Architecture Overview

This is a **RemNote plugin** built with the `@remnote/plugin-sdk` that provides statistics and heatmap visualizations for spaced repetition data. The plugin registers a unified dashboard widget that displays comprehensive analytics about flashcard reviews.

### Core Components

- **Entry Point**: src/widgets/index.tsx - Plugin registration and command/widget setup using `declareIndexPlugin`
- **Statistics Dashboard**: src/widgets/statistics.tsx - Popup widget: controls (context, period) and section layout
- **Dashboard modules**: src/widgets/statistics/ - `useStatisticsData` (all derived data, memoised), `charts.tsx` (ApexCharts components taking an `accent` prop), `HardestCards`, `MaturityRetention`, `DocumentBreakdown`, `EasterEggs`, `data/analysisDataset.ts` (scoped card loading)
- **Chart Helpers**: src/lib/chartHelpers.ts - Shared chart configuration and styling utilities (no global colour state; pass the accent explicitly)
- **Data Processing**: src/lib/dataProcessing.ts - Pure functions for statistics; `buildDailyReviewBuckets` is the shared single pass over review history
- **Review scores**: src/lib/reviewScores.ts - `ReviewScore` constants and `isRecall` / `isForgot` / `isGradedReview`; never compare score literals directly
- **Calendar**: src/lib/calendar.ts - DST-safe local-day helpers (step days with `setDate`, never `+ 24h`) and locale week start
- **Learning insights**: src/lib/insights.ts - Forgetting curve and session fatigue from "spaced" reviews (previous review at least a day earlier); verdicts only use buckets with enough reviews and require the 95% interval to clear the threshold
- **Breakdown**: src/lib/breakdown.ts - Batched parent loading and grouping by document / child Rem
- **Settings**: src/lib/settings.ts - Setting ids, defaults and parsing
- **Opening the popup**: src/lib/openStatistics.ts - `openStatisticsPopup()` used by the command and the queue button
- **Context Utilities**: src/lib/utils.ts - `getComprehensiveContextRems()` for gathering related Rems

### Widget Architecture Pattern

The widget uses **session storage for context persistence**:
```tsx
// Command and queue button both call this helper
await openStatisticsPopup(plugin); // saves { focusedRemId } to session storage, then opens the popup

// Widget reads context from session
const sessionContext = useTrackerPlugin(async (reactivePlugin) => {
  return await reactivePlugin.storage.getSession<{focusedRemId: string}>('statistics-context');
}, []);
```

### Data Fetching Strategy

The widget implements **adaptive fetching** based on scope size:
- **Small scopes (<200 Rems)**: Individual fetching per Rem
- **Large scopes**: Bulk fetch all cards + local filtering (avoids N+1 query problem)

### Scope Modes

Two modes for gathering cards in context:
1. **descendants**: Direct children only (`contextRem.getDescendants()`)
2. **comprehensive**: Uses `getComprehensiveContextRems()` to include documents, portals, folder queues, sources, and referencing Rems

## Development Workflow

### Key Commands
```bash
npm run dev           # Start webpack-dev-server with hot reload
npm run check-types   # Run TypeScript type checking
npm run lint          # ESLint, including React hooks rules
npm test              # Pure-function tests (scripts/testStatistics.ts, scripts/testInsights.ts in TZ=Europe/Berlin)
npm run validate      # Validates README.md exists (required for build)
npm run build         # Full production build + zip for plugin distribution
```

### Build System
- **Webpack** with esbuild-loader for fast TypeScript compilation
- **Tailwind CSS** + PostCSS for styling
- **React Refresh** enabled in dev mode
- Multiple entry points auto-generated from `src/widgets/**.tsx` pattern
- Each widget generates two bundles: normal and `-sandbox` variant
- **Shared Libraries**: Chart helpers and data processing functions in `src/lib/`

## RemNote SDK Patterns

### Plugin Registration
```tsx
// Register widget
await plugin.app.registerWidget('widget-name', WidgetLocation.Popup, { dimensions });

// Register command
await plugin.app.registerCommand({ id, name, action });

// Register settings
await plugin.settings.registerStringSetting({ id, defaultValue, title, description });
```

### Reactive Data with Trackers
Use `useTrackerPlugin` for reactive SDK queries:
```tsx
const setting = useTrackerPlugin(() => plugin.settings.getSetting('setting-id'));
```

### Card Fetching
- Global: `await plugin.card.getAll()`
- Per Rem: `await rem.getCards()`
- Filter cards by `card.remId` to match specific Rems

## Code Conventions

- **State Management**: React hooks (`useState`, `useRunAsync`) - no external state library
- **Date Handling**: Local calendar days. Use `formatLocalDateOnly` / `src/lib/calendar.ts`; never derive a local day from `toISOString()` or by adding 24h
- **Range Modes**: Presets in src/lib/presetRanges.ts (`getPresetRange`), week start from the user's locale
- **Settings Validation**: Hex color regex `/^#[0-9A-F]{6}$/i` before applying custom colors
- **Logging**: Console logs prefixed with `"Stats Plugin:"` or `"Heatmap:"` for debugging

## Common Pitfalls

1. **Widget Context**: Always save context to session storage before opening popup
2. **Large Scopes**: Use bulk fetching strategy (>200 Rems) to avoid performance issues
3. **TypeScript Strictness**: `strict: true` and `strictNullChecks: true` - handle undefined/null explicitly
4. **Mobile**: Enabled (`enableOnMobile: true`); the queue button moves below the top bar on phones
5. **Build Validation**: `npm run build` requires README.md to exist
6. **Chart Types**: Use proper types for xaxisType ('datetime' | 'category' | 'numeric')
7. **Shared Code**: Reuse functions from `src/lib/chartHelpers.ts` and `src/lib/dataProcessing.ts`
8. **Reviews vs. interactions**: Only Forgot/Hard/Good/Easy are reviews. Skips, leech prompts, resets and manual schedule edits must not be counted
9. **Time**: Cap single answers with `capResponseTime` when summing time spent; keep raw values for speed distributions

## Plugin Distribution

- Final artifact: `PluginZip.zip` containing compiled bundle + manifest
- Manifest: public/manifest.json with plugin metadata
- Required scope: Read access to all data (`"type": "All", "level": "Read"`)
