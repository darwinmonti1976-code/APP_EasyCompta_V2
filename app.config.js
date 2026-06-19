module.exports = ({ config }) => {
  try {
    const withAndroidWidget = require('./expo-plugins/withAndroidWidget');
    const withIOSWidget = require('./expo-plugins/withIOSWidget');
    return withIOSWidget(withAndroidWidget(config));
  } catch {
    // Plugin files not yet available (EAS pre-clone config check)
    return config;
  }
};
