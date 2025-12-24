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
 // COMMAND 1: Open Statistics (Saves Context)
  await plugin.app.registerCommand({
    id: 'open-statistics',
    name: 'Open Statistics',
    action: async () => {
      const focusedRem = await plugin.focus.getFocusedRem();
      
      // Save the context to session storage (Single Source of Truth)
      await plugin.storage.setSession('statistics-context', { 
        focusedRemId: focusedRem?._id 
      });

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

  // --- Heatmap Widget ---

  //Register heatmap widget
  await plugin.app.registerWidget(
    'heatmap',
    WidgetLocation.Popup,
    {
      dimensions: { height: 800, width: 1000},
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

  // COMMAND 2: Open Heatmap (NOW SAVES CONTEXT TOO)
  await plugin.app.registerCommand({
    id: 'open-heatmap',
    name: 'Open Heatmap',
    action: async () => {
      // 1. Capture Focus
      const focusedRem = await plugin.focus.getFocusedRem();
      
      // 2. Save to Session (Same key as statistics for consistency)
      await plugin.storage.setSession('statistics-context', { 
        focusedRemId: focusedRem?._id 
      });

      // 3. Open Widget
      plugin.widget.openPopup('heatmap');
    },
  });
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
