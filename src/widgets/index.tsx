import { declareIndexPlugin, ReactRNPlugin, WidgetLocation } from '@remnote/plugin-sdk';
import '../style.css';
import '../App.css';

async function onActivate(plugin: ReactRNPlugin) {

  // --- Statistics Dashboard Widget (Merged with Heatmap) ---

  // Register statistics widget with responsive dimensions
  await plugin.app.registerWidget(
    'statistics',
    WidgetLocation.Popup,
    {
      dimensions: { height: 800, width: 1200 },
    }
  );

  // Register queue toolbar button for quick access to statistics
  await plugin.app.registerWidget(
    'queue-toolbar-button',
    WidgetLocation.QueueToolbar,
    {
      dimensions: { height: 'auto', width: 'auto' },
    }
  );
  
  // Command: Open Statistics Dashboard
  await plugin.app.registerCommand({
    id: 'open-statistics',
    name: 'Open Statistics',
    action: async () => {
      const focusedRem = await plugin.focus.getFocusedRem();
      
      // Save the context to session storage
      await plugin.storage.setSession('statistics-context', { 
        focusedRemId: focusedRem?._id 
      });

      plugin.widget.openPopup('statistics');
    },
  });

  // Settings - Chart Color
  await plugin.settings.registerStringSetting({
    id: 'statistics-chart-color',
    defaultValue: '#3362f0',
    title: 'Chart Color',
    description: 'Enter a valid hex color code for the charts (e.g. #3362f0).',
  });

  // Settings - Heatmap Colors
  await plugin.settings.registerStringSetting({
    id: 'HeatmapColorLow',
    title: 'Heatmap: Color for Low values',
    defaultValue: '#b3dff0',
    description: 'Color for low review counts in the heatmap.',
  });
  
  await plugin.settings.registerStringSetting({
    id: 'HeatmapColorHigh',
    title: 'Heatmap: Color for High values',
    defaultValue: '#1302d1',
    description: 'Color for high review counts in the heatmap.',
  });
  
  await plugin.settings.registerNumberSetting({
    id: 'HeatmapTarget',
    title: 'Heatmap: Target number of repetitions',
    defaultValue: 50,
    description: 'Defines the threshold for "High" values in the heatmap.',
  });
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
