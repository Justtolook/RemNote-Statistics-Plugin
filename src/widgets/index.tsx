import { declareIndexPlugin, ReactRNPlugin, WidgetLocation } from '@remnote/plugin-sdk';
import '../style.css';
import '../App.css';

async function onActivate(plugin: ReactRNPlugin) {
  //Register statistics widget
  await plugin.app.registerWidget(
    'statistics',
    WidgetLocation.Popup,
    {
      dimensions: { height: 'auto', width: 'auto'},
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
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
