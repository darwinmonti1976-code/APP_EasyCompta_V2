module.exports = ({ config }) => {
  const withAndroidWidget = require('./expo-plugins/withAndroidWidget');
  const withIOSWidget = require('./expo-plugins/withIOSWidget');
  return withIOSWidget(withAndroidWidget(config));
};
