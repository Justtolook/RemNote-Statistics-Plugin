import { declareIndexPlugin, ReactRNPlugin, WidgetLocation } from '@remnote/plugin-sdk';
import { isSmallMobileDevice, openStatisticsPopup, STATISTICS_WIDGET } from '../lib/openStatistics';
import { SETTINGS, SETTING_DEFAULTS } from '../lib/settings';
import '../style.css';
import '../App.css';

async function onActivate(plugin: ReactRNPlugin) {
  await plugin.app.registerWidget(STATISTICS_WIDGET, WidgetLocation.Popup, {
    dimensions: { height: 800, width: 1200 },
  });

  // On phones the queue toolbar is crowded, so place the button below the top bar instead.
  await plugin.app.registerWidget(
    'queue-toolbar-button',
    isSmallMobileDevice() ? WidgetLocation.QueueBelowTopBar : WidgetLocation.QueueToolbar,
    { dimensions: { height: 'auto', width: 'auto' } }
  );

  await plugin.app.registerCommand({
    id: 'open-statistics',
    name: 'Open Statistics',
    action: async () => openStatisticsPopup(plugin),
  });

  await plugin.settings.registerStringSetting({
    id: SETTINGS.chartColor,
    defaultValue: SETTING_DEFAULTS.chartColor,
    title: 'Chart Color',
    description: 'Enter a valid hex color code for the charts (e.g. #3362f0).',
  });

  await plugin.settings.registerStringSetting({
    id: SETTINGS.heatmapColorLow,
    title: 'Heatmap: Color for Low values',
    defaultValue: SETTING_DEFAULTS.heatmapColorLow,
    description: 'Color for low review counts in the heatmap.',
  });

  await plugin.settings.registerStringSetting({
    id: SETTINGS.heatmapColorHigh,
    title: 'Heatmap: Color for High values',
    defaultValue: SETTING_DEFAULTS.heatmapColorHigh,
    description: 'Color for high review counts in the heatmap.',
  });

  await plugin.settings.registerNumberSetting({
    id: SETTINGS.heatmapTarget,
    title: 'Heatmap: Target number of repetitions',
    defaultValue: SETTING_DEFAULTS.heatmapTarget,
    description: 'Defines the threshold for "High" values in the heatmap.',
  });

  await plugin.settings.registerNumberSetting({
    id: SETTINGS.targetRetention,
    title: 'Target retention (%)',
    defaultValue: SETTING_DEFAULTS.targetRetention,
    description: 'The retention you aim for, e.g. 90. Shown as a target line and compared with your young and mature retention.',
  });

  await plugin.settings.registerNumberSetting({
    id: SETTINGS.maxAnswerSeconds,
    title: 'Maximum answer time (seconds)',
    defaultValue: SETTING_DEFAULTS.maxAnswerSeconds,
    description: 'Longer answers are counted as this many seconds when adding up time spent, so a card left open does not inflate your study time. Set to 0 to disable.',
  });

  await plugin.settings.registerNumberSetting({
    id: SETTINGS.leechThreshold,
    title: 'Leech threshold (lapses)',
    defaultValue: SETTING_DEFAULTS.leechThreshold,
    description: 'A card that you forget this many times within the selected period is flagged as a leech.',
  });

  await plugin.settings.registerBooleanSetting({
    id: SETTINGS.liveFatigue,
    title: 'Show session fatigue in the queue',
    defaultValue: SETTING_DEFAULTS.liveFatigue,
    description: 'While reviewing, show how long the current session has been running and suggest a break when your recall or speed drops.',
  });
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
