const path = require('path');
const fs   = require('fs');

const MODULE_SRC = path.join(__dirname, '..', 'modules', 'widget-bridge', 'android', 'src', 'main');
const PROVIDER   = 'expo.modules.widgetbridge.EasyComptaWidgetProvider';

module.exports = function withAndroidWidget(config) {
  const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
  // ── AndroidManifest ──────────────────────────────────────────────────────
  config = withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application[0];
    if (!app.receiver) app.receiver = [];

    const alreadyAdded = app.receiver.some(
      (r) => r.$?.['android:name'] === PROVIDER
    );

    if (!alreadyAdded) {
      app.receiver.push({
        $: {
          'android:name':     PROVIDER,
          'android:label':    'EasyCompta Widget',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } },
            ],
          },
        ],
        'meta-data': [
          {
            $: {
              'android:name':     'android.appwidget.provider',
              'android:resource': '@xml/widget_info',
            },
          },
        ],
      });
    }
    return cfg;
  });

  // ── Copy resource files ───────────────────────────────────────────────────
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const resDir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');

      copyFile(
        path.join(MODULE_SRC, 'res', 'layout', 'widget_easycompta.xml'),
        path.join(resDir, 'layout', 'widget_easycompta.xml')
      );
      copyFile(
        path.join(MODULE_SRC, 'res', 'xml', 'widget_info.xml'),
        path.join(resDir, 'xml', 'widget_info.xml')
      );
      copyFile(
        path.join(MODULE_SRC, 'res', 'drawable', 'widget_background.xml'),
        path.join(resDir, 'drawable', 'widget_background.xml')
      );

      return cfg;
    },
  ]);

  return config;
};

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}
