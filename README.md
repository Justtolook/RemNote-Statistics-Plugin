# RemNote Statistics Plugin

A comprehensive analytics dashboard for RemNote that helps you track, visualize, and optimize your flashcard learning progress with beautiful charts and detailed statistics.

## 📊 What This Plugin Does

The RemNote Statistics Plugin transforms your flashcard review data into actionable insights through an intuitive dashboard. It provides a complete picture of your learning journey with interactive visualizations, helping you understand your study patterns, track retention rates, and maintain consistent learning habits.

## ✨ Key Features

### ⏱️ Time Tracking & Productivity
- **Time Spent Statistics**: Track total time spent reviewing flashcards (very long answers are capped, 60 seconds by default)
- **Time Spent Chart**: Bar chart showing daily review time in minutes (similar to Anki)
- **Productivity Metrics**: View average time per day, per study day, and per card
- **Study Efficiency**: Cards per minute rate and study day percentage
- **Time Spent Card**: New metric card in Review Statistics section showing total time and daily averages
- **Recall Speed Trend**: Track daily average and median response time from the middle 90% of reviews, a weighted 7-study-day average, and whether recall is getting faster or slower
- **Response Time Distribution**: Inspect the selected period's response-time average, quartiles, Tukey whiskers, and unusually fast or slow review counts

### 📈 Comprehensive Analytics Dashboard
- **Retention Rate Tracking**: Monitor your recall success rate over time with daily, 7-day, 30-day and cumulative trend lines (calendar days, weighted by number of reviews) and your target retention
- **Your Forgetting Curve**: See how well you recall cards after 1 day, a week, a month and longer, and from which interval you fall below your target retention
- **Session Fatigue**: Find out after how many minutes of studying your retention drops and your answers slow down, and when to take a break
- **Young vs. Mature Retention**: See how well you remember young cards (interval under 21 days) and mature cards (21+ days), leaving out first reviews and same-day relearning, compared with your target
- **Review Heatmap**: GitHub-style heatmap showing your learning activity across days and weeks
- **Button Distribution Analysis**: Visualize how often you press Skip, Forgot, Hard, Good, or Easy during reviews
- **Card Repetition Statistics**: See the distribution of cards by number of reviews
- **Workload Forecast**: See your overdue backlog and upcoming due cards for the next week, month or year, with estimated study time based on your own answer speed
- **Cards to Improve**: Identify the cards you most reliably forget, with leech badges and direct links to improve them
- **Breakdown by Document**: Compare reviews, retention, time, lapses and leeches across your top-level documents, or across the children of the current Rem
- **Time of Day Analysis**: Discover your most productive hours with retention rate by time of day in 3-hour blocks

### 📅 Flexible Time Ranges
Quick preset buttons for easy date filtering:
- **Today** / **Yesterday**
- **Week** / **This Week** / **Last Week**
- **Month** / **This Month** / **Last Month**
- **Year** / **This Year** / **Last Year**
- **All Time**
- Custom date range picker for precise control

### 🎯 Context-Aware Statistics
Two powerful modes to analyze your data:
- **Global Mode**: View statistics across all your flashcards
- **Current Rem Mode**: Focus on a specific Rem and its children
  - **Descendants**: Direct children only
  - **Comprehensive**: Includes documents, portals, folder queues, sources, and referencing Rems

### 🎨 Customization
- Customize chart colors to match your preferences
- Configure heatmap colors (low/high values) and target thresholds
- Fully responsive design that works on desktop, tablet, and mobile devices
- Native dark/light mode support using RemNote's theme

### ⚡ Quick Access
- **Queue Toolbar Button**: Access statistics directly from the flashcard review interface
- **Slash Command**: Type `/statistics` from anywhere in RemNote
- Statistics open in a popup overlay for easy reference while studying

## 🚀 How to Use

### Opening the Statistics Dashboard

**Method 1: From the Flashcard Queue**
- While reviewing flashcards, click the **Statistics** button in the queue toolbar
- The dashboard opens with context from your current review session

**Method 2: Using the Slash Command**
- Type `/statistics` anywhere in RemNote
- Select "Open Statistics" from the command menu
- The dashboard opens with your focused Rem as context (or global statistics)

**Method 3: From the Command Palette**
- Press `Ctrl+P` (or `Cmd+P` on Mac) to open the command palette
- Search for "Open Statistics"
- Press Enter to launch the dashboard

### Navigating the Dashboard

The dashboard is organized into seven sections:

1. **Controls Section**
   - Choose between Global or Current Rem context
   - Select time range using preset buttons or custom date pickers
   - View total flashcard count for your selection

2. **Heatmap Section**
   - Visual representation of daily review activity
   - Quick stats: Days Learned, Daily Average, Longest Streak
   - Hover over cells to see exact review counts

3. **Review Statistics Section**
   - Retention rate card with success percentage
   - Total reviews count (skips are not counted)
   - Young and mature retention compared with your target
   - Time spent card with total time and daily average
   - Button distribution breakdown (Forgot vs. Remembered)
   - Interactive charts:
     - Buttons Pressed (with percentages)
     - Cards Grouped by Reviews
     - Cumulative Reviews Over Time
     - Retention Rate Over Time (with smoothing options)
     - Time Spent Reviewing (daily time in minutes with summary statistics)
     - Recall Speed Over Time (daily 5th–95th percentile average and median response time, plus a weighted 7-study-day trend)
     - Response Time Distribution (selected-period box plot with outlier counts)

4. **Learning Insights**
   - Your forgetting curve: recall rate by days since the previous review, against your target
   - Session fatigue: retention and answer speed by minutes into a session, with a recommended break point

5. **Plan Ahead Section**
   - Select forecast period (Week, Month, Year)
   - Overdue cards, cards due today, and total due cards for the period, each with a time estimate
   - Bar chart showing due cards per day, with today's backlog stacked on top

6. **Cards to Improve**
   - Cards ranked by how confidently their retention is low, with leech badges

7. **Breakdown**
   - Click "Show breakdown" to group statistics by document (Global) or by child Rem (Current Rem)

### Customizing Your Experience

**To change chart colors:**
1. Go to RemNote Settings → Plugins → Statistics
2. Enter a hex color code (e.g., `#3362f0`) for Chart Color
3. Customize Heatmap colors (low/high values)
4. Set your target repetition threshold
5. Set your **target retention** (default 90%)
6. Set the **maximum answer time** counted towards time spent (default 60 seconds, 0 to disable)
7. Set the **leech threshold**: how many lapses in the period flag a card as a leech (default 8)

**To close the dashboard:**
- Press `ESC`
- Click outside the popup area
- Click the close button (if visible)

## 💡 Benefits & Use Cases

### For Students
- **Track Study Consistency**: Use the heatmap to maintain daily learning streaks
- **Monitor Study Time**: See exactly how much time you spend reviewing with detailed time statistics
- **Identify Weak Areas**: Use the Cards to Improve section and the breakdown by document to find and fix problematic cards
- **Plan Study Sessions**: Forecast view helps you anticipate heavy review days and the time of day chart helps you schedule reviews when you're most productive
- **Target Problem Cards**: Click directly on difficult cards to review and improve their content
- **Optimize Study Schedule**: Review the time of day chart to discover when you have the best retention and schedule important reviews accordingly
- **Track Efficiency**: Monitor your cards per minute rate to improve review speed over time

### For Power Users
- **Optimize Spaced Repetition**: Monitor retention rate trends to adjust your learning strategy
- **Context-Specific Analysis**: Analyze individual subjects or courses using Current Rem mode
- **Data-Driven Decisions**: Use moving averages to see long-term retention trends beyond daily fluctuations

## 📋 What's New in 1.7.0

- **Your forgetting curve**: recall by time since the last review, against your target
- **Session fatigue**: when your retention drops during a session, and when to take a break
- **Young vs. mature retention** compared against your own target retention
- **Workload forecast** with your overdue backlog and time estimates per day
- **Breakdown by document** (or by child Rem) with retention, time, lapses and leeches
- **Leech badges** on cards you keep forgetting
- Fixes for the forecast around daylight-saving changes, weighted retention averages, skips no longer counted as reviews, and more

See the full history in [CHANGELOG.md](https://github.com/Justtolook/RemNote-Statistics-Plugin/blob/main/CHANGELOG.md).

## 🤝 Contributing

Contributions are welcome! If you'd like to improve the plugin, please:
1. Fork the repository
2. Create a feature branch
3. Submit a pull request

**Special Thanks:**
- **@bjsi** - Made the popup widget scrollable
- **@hugomarins** - Huge refactoring, great improvements, and many fixes

## 📄 License

MIT License  
Copyright (c) 2022-2026 Henrik Lammert

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### Logo

The logo falls under the Attribution 3.0 Unported (CC BY 3.0) license. The original can be found [here](https://www.iconfinder.com/icons/2921799/business_diagram_infographic_marketing_pie_chart_presentation_statistics_icon).


