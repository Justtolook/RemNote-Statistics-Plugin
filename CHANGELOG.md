# Changelog

All notable changes to this project are documented in this file.

## [1.7.1] - 2026-11-23

### Fixed

- The Statistics button and the session fatigue pill in the queue toolbar now use a transparent background, so they match RemNote's redesigned queue instead of showing a mismatched box (#20).

## [1.7.0] - 2026-11-22

### Added

- **Live session fatigue in the queue**: next to the Statistics button, a small indicator shows how long the current study session has been running and how tired you likely are (time against your personal break point, recent recall against your usual recall, answer speed against your usual speed). When it is time, it suggests a short break, which can be snoozed for 10 minutes. Can be turned off in the settings.
- **Your forgetting curve**: recall rate by days since the previous review (1 day, 2–3, 4–7, … 241+), compared with your target retention, with a plain-language verdict on the interval where you fall clearly below target.
- **Session fatigue**: reviews are grouped into study sessions (a pause over 10 minutes starts a new one); retention and median answer time are shown by minutes into the session, with a recommended break point when retention drops noticeably.
- **Young vs. mature retention**: retention split by interval (young: 1–20 days, mature: 21+ days), excluding first reviews and same-day relearning, compared against a configurable target retention.
- **Target retention** setting (default 90%), also drawn as a target line on the retention-over-time chart.
- **Workload forecast**: "Overdue now", "Due today" and "Next N days" cards with time estimates based on your median answer time over the last 30 days. Overdue cards are shown as a separate stacked bar on today.
- **Breakdown by document**: reviews, retention, time, lapses and leeches per top-level document (Global) or per child Rem (Current Rem). Loaded on demand; click a row to open the Rem.
- **Leech detection**: cards forgotten 8+ times in the period (configurable) or marked as a leech by RemNote get a "Leech" badge.
- **Maximum answer time** setting (default 60 s): longer answers are capped when adding up time spent.
- ESLint (including React hooks rules), `npm test`, and a GitHub Actions workflow running type checks, lint, tests and build.

### Fixed

- The due-card forecast shifted every bar by one day after a daylight-saving change and could drop the last day.
- The forecast ignored cards that were already due (earlier today or overdue).
- The "7d" and "30d" retention averages spanned 7/30 *study* days and weighted a day with 2 reviews like one with 400. They now cover calendar days and are weighted by review count; the cumulative line is weighted too.
- Skips, leech prompts, resets and manual schedule edits were counted as reviews in "Total Reviews", the heatmap, the cumulative chart and "cards by number of reviews".
- "Cards to Improve" let cards with very few reviews crowd out consistently failed ones. Cards are now ranked by the upper bound of the 95% confidence interval of their retention.
- "Days studied" and the per-day time average counted one day too few for selected ranges.
- "This Week" / "Last Week" always started on Sunday; they now follow your locale's first day of the week.
- The "Cards to Improve" table wrapped its retention column onto a second line on medium and wide screens.
- The chart colour was stored in a mutable module variable, so changing it in the settings did not always re-render the charts.

### Changed

- The dashboard was split into focused modules (`src/widgets/statistics/`), with all derived data computed in one memoised hook and most charts sharing a single pass over the review history.
- Review scores are named constants (`src/lib/reviewScores.ts`) instead of literal numbers.
- The "Current Rem" dataset is only loaded while that mode is selected.

## [1.6.0] - 2026-08-16

### Added

- Review-time tracking, including daily, cumulative, and hourly activity charts.
- Recall-speed trends and response-time distribution statistics.

### Changed

- Improved the average daily review-time calculation and time-chart presentation.

## [1.5.0]

### Added

- Queue toolbar button for quick access during flashcard reviews.
- Retention rate over time chart with daily, 7-day, 30-day and cumulative lines.
- "Hardest flashcards" section ranking cards by retention, with clickable rows.
- Retention rate by time of day in 3-hour blocks.

## [1.4.0]

### Changed

- Visual overhaul with better spacing and typography, stat cards with hover effects, improved mobile responsiveness.

## [1.3.1]

### Added

- Comprehensive context mode for the current Rem scope (thanks to @hugomarins).

## [1.3.0]

### Added

- Quick period presets, custom date range picker, and mobile support (thanks to @hugomarins).

### Changed

- Major refactoring and bug fixes (thanks to @hugomarins).
- Faster data loading for large scopes (>200 Rems).

## [1.1.1]

### Changed

- Scrollable popup widget (thanks to @bjsi).

## [1.0.0]

### Added

- Statistics dashboard with retention rate, review heatmap, button distribution, due-card forecast, global and current-Rem modes, and customisable chart colours.
