# RemNote Statistics Plugin - AI Agent Instructions

## Architecture Overview

This is a **RemNote plugin** built with the `@remnote/plugin-sdk` that provides statistics and heatmap visualizations for spaced repetition data. The plugin registers a unified dashboard widget that displays comprehensive analytics about flashcard reviews.

### Core Components

- **Entry Point**: src/widgets/index.tsx - Plugin registration and command/widget setup using `declareIndexPlugin`
- **Statistics Dashboard**: src/widgets/statistics.tsx - Unified widget with review analytics, heatmap, and outlook charts using ApexCharts
- **Chart Helpers**: src/lib/chartHelpers.ts - Shared chart configuration and styling utilities
- **Data Processing**: src/lib/dataProcessing.ts - Functions for processing card data, calculating statistics, and preparing chart data
- **Context Utilities**: src/lib/utils.ts - `getComprehensiveContextRems()` for gathering related Rems

### Widget Architecture Pattern

The widget uses **session storage for context persistence**:
```tsx
// Command saves focused Rem to session
await plugin.storage.setSession('statistics-context', { focusedRemId: focusedRem?._id });
plugin.widget.openPopup('statistics');

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
- **Date Handling**: Native `Date` objects with ISO string formatting (`toISOString().split('T')[0]`)
- **Range Modes**: Pre-defined time ranges ('Today', 'Week', 'Month', 'Year', 'Last Year', 'All') with date calculation logic
- **Settings Validation**: Hex color regex `/^#[0-9A-F]{6}$/i` before applying custom colors
- **Logging**: Console logs prefixed with `"Stats Plugin:"` or `"Heatmap:"` for debugging

## Common Pitfalls

1. **Widget Context**: Always save context to session storage before opening popup
2. **Large Scopes**: Use bulk fetching strategy (>200 Rems) to avoid performance issues
3. **TypeScript Strictness**: `strict: true` and `strictNullChecks: true` - handle undefined/null explicitly
4. **Mobile**: Not supported yet (`enableOnMobile: false` in manifest)
5. **Build Validation**: `npm run build` requires README.md to exist
6. **Chart Types**: Use proper types for xaxisType ('datetime' | 'category' | 'numeric')
7. **Shared Code**: Reuse functions from `src/lib/chartHelpers.ts` and `src/lib/dataProcessing.ts`

## Plugin Distribution

- Final artifact: `PluginZip.zip` containing compiled bundle + manifest
- Manifest: public/manifest.json with plugin metadata
- Required scope: Read access to all data (`"type": "All", "level": "Read"`)
