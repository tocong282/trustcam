const { withAndroidManifest } = require('expo/config-plugins');
// ponytail: trusted-LAN demo only; remove cleartext allowance when API uses HTTPS.
module.exports = config => withAndroidManifest(config, result => {
  result.modResults.manifest.application[0].$['android:usesCleartextTraffic'] = 'true';
  return result;
});
