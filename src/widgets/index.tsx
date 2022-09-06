import { declareIndexPlugin, ReactRNPlugin, WidgetLocation } from '@remnote/plugin-sdk';
import '../style.css';
import '../App.css';

async function onActivate(plugin: ReactRNPlugin) {
  //Register statistics widget
  await plugin.app.registerWidget(
    'statistics',
    WidgetLocation.Pane,
    {
      dimensions: { height: 'auto', width: 'auto'},
    }
  );
  // A command that opens the heatmap widget in a new pane 
  await plugin.app.registerCommand({
    id: 'open-statistics',
    name: 'Open Statistics',
    action: async () => {
      plugin.window.openWidgetInPane('statistics');
    },
  });
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);
