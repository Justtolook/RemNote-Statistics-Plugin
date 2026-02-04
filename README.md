# RemNote Statistics Plugin

A comprehensive analytics dashboard for RemNote that helps you track, visualize, and optimize your flashcard learning progress with beautiful charts and detailed statistics.

## 📊 What This Plugin Does

The RemNote Statistics Plugin transforms your flashcard review data into actionable insights through an intuitive dashboard. It provides a complete picture of your learning journey with interactive visualizations, helping you understand your study patterns, track retention rates, and maintain consistent learning habits.

## ✨ Key Features

### 📈 Comprehensive Analytics Dashboard
- **Retention Rate Tracking**: Monitor your recall success rate over time with daily, weekly (7-day moving average), monthly (30-day moving average), and cumulative average trend lines
- **Review Heatmap**: GitHub-style heatmap showing your learning activity across days and weeks
- **Button Distribution Analysis**: Visualize how often you press Skip, Forgot, Hard, Good, or Easy during reviews
- **Card Repetition Statistics**: See the distribution of cards by number of reviews
- **Future Outlook**: Forecast upcoming due cards for the next 30, 60, or 90 days
- **Hardest Flashcards**: Identify your most challenging cards ranked by lowest retention rate with direct links to improve them
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

The dashboard is organized into four main sections:

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
   - Total reviews count
   - Button distribution breakdown (Forgot vs. Remembered)
   - Interactive charts:
     - Buttons Pressed (with percentages)
     - Cards Grouped by Reviews
     - Cumulative Reviews Over Time
     - Retention Rate Over Time (with smoothing options)

4. **Outlook Section**
   - Select forecast period (7, 14, 30, 60, 90 days)
   - View total due cards for the period
   - Bar chart showing daily due cards distribution

### Customizing Your Experience

**To change chart colors:**
1. Go to RemNote Settings → Plugins → Statistics
2. Enter a hex color code (e.g., `#3362f0`) for Chart Color
3. Customize Heatmap colors (low/high values)
4. Set your target repetition threshold

**To close the dashboard:**
- Press `ESC`
- Click outside the popup area
- Click the close button (if visible)

## 💡 Benefits & Use Cases

### For Students
- **Track Study Consistency**: Use the heatmap to maintain daily learning streaks
- **Identify Weak Areas**: Use the Hardest Flashcards section to find and improve problematic cards
- **Plan Study Sessions**: Forecast view helps you anticipate heavy review days and the time of day chart helps you schedule reviews when you're most productive
- **Target Problem Cards**: Click directly on difficult cards to review and improve their content
- **Optimize Study Schedule**: Review the time of day chart to discover when you have the best retention and schedule important reviews accordingly

### For Power Users
- **Optimize Spaced Repetition**: Monitor retention rate trends to adjust your learning strategy
- **Context-Specific Analysis**: Analyze individual subjects or courses using Current Rem mode
- **Data-Driven Decisions**: Use moving averages to see long-term retention trends beyond daily fluctuations

## 📋 Changelog


### Version 1.5.0
**New Features:**
- ✨ Added Queue Toolbar Button for quick access during flashcard reviews
- 📊 Added Retention Rate Over Time chart with multiple trend lines:
  - Daily retention percentage
  - 7-day moving average (smoothed weekly trends)
  - 30-day moving average (smoothed monthly trends)
  - Cumulative average (all-time retention from start date)
- 🔥 **Hardest Flashcards Section**: New analysis tool that identifies your most challenging cards
  - Ranks cards by lowest retention rate (percentage of successful recalls)
  - Requires minimum 3 reviews per card for statistical significance
  - Displays forgot count, total reviews, and retention percentage
  - **Clickable rows** - click any card to navigate directly to its Rem for editing/improvement
- ⏰ **Retention Rate by Time of Day**: New chart showing productivity patterns throughout the day
  - Displays retention rate in 3-hour blocks (8 blocks from 12 AM to 12 AM)
  - Color-coded bars (green/yellow/orange/red) for quick visual assessment
  - Highlights your most productive time block with best retention rate
  - Shows total reviews, forgot count, and remembered count for each time block
  - Helps identify optimal study times for maximum retention


### Version 1.4.0
**UI/UX Improvements:**
- 🎨 Comprehensive visual overhaul with better spacing and typography
- 🎴 Stat cards with hover effects and color coding
- 📱 Enhanced mobile responsiveness with improved touch interactions


### Version 1.3.1 (thanks to @hugomarins)
**Features:**
- Comprehensive Context Mode: Enhanced Rem scope analysis

### Version 1.3.0 (thanks to @hugomarins)
**Features:**
- Major code refactoring and bug fixes 
- Quick Presets: One-click buttons for Week, Month, Year, Last Year, and All Time (Thanks to @hugomarins)
- Mobile Support: Fully responsive design for tablets and smartphones
- Custom Date Range: Precise date pickers for start/end dates

**Performance:**
- ⚡ Optimized data fetching for large scopes (>200 Rems)


### Version 1.1.1 
**Improvements:**
- Scrollable popup widget (Thanks to @bjsi)

### Version <=1.0.0 (Initial Release)
**Core Features:**
- Basic statistics dashboard with retention rate
- Review heatmap visualization
- Button press distribution analysis
- Future due cards forecast
- Global and Current Rem context modes
- Customizable chart colors

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


