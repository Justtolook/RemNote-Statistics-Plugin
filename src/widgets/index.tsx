import { declareIndexPlugin, ReactRNPlugin, WidgetLocation } from '@remnote/plugin-sdk';
import '../style.css';
import '../App.css';

async function onActivate(plugin: ReactRNPlugin) {

  // --- General Statistics Widget ---

  //Register statistics widget
  await plugin.app.registerWidget(
    'statistics',
    WidgetLocation.Popup,
    {
      dimensions: { height: 1200, width: 1000},
    }
  );
  // A command that opens the heatmap widget in a new pane 
  await plugin.app.registerCommand({
    id: 'open-statistics',
    name: 'Open Statistics',
    action: async () => {
      plugin.widget.openPopup('statistics');
    },
  });

  //register String setting 
  await plugin.settings.registerStringSetting({
    id: 'statistics-chart-color',
    defaultValue: '#3362f0',
    title: 'Chart Color',
    description: 'Enter a valid hex color code for the charts (e.g. #3362f0). If you enter an invalid color, a default color will be used.',
  });

  await plugin.settings.registerNumberSetting({
    id: 'statistics-nDays-outlook',
    title: 'Number of days to look into the future for due cards',
    defaultValue: 30,
  });

  await plugin.settings.registerDropdownSetting({
    id: 'statistics-context',
    title: 'Context',
    defaultValue: 'Global',
    options: [
      {
        key: "0",
        value: "Global",
        label: "Global",
      },
      {
        key: "1",
        value: "Current Rem",
        label: "Current Rem",
      }
    ]
  });

  // --- Heatmap Widget ---

  //Register heatmap widget
  await plugin.app.registerWidget(
    'heatmap',
    WidgetLocation.Popup,
    {
      dimensions: { height: 'auto', width: 'auto'},
    },
  );
  //await plugin.window.openWidgetInPane('heatmap');
  // Register settings
  await plugin.settings.registerStringSetting({
    id: 'HeatmapColorLow',
    title: 'Color for low values',
    defaultValue: '#b3dff0',
  });
  await plugin.settings.registerStringSetting({
    id: 'HeatmapColorNormal',
    title: 'Color for normal values',
    defaultValue: '#3362f0',
  });
  await plugin.settings.registerNumberSetting({
    id: 'HeatmapLowUpperBound',
    title: 'Upper bound for low number of repetitions',
    defaultValue: 30,
  });

  // A command that opens the heatmap widget in a new pane 
  await plugin.app.registerCommand({
    id: 'open-heatmap',
    name: 'Open Heatmap',
    action: async () => {
      plugin.widget.openPopup('heatmap');
    },
  });
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
