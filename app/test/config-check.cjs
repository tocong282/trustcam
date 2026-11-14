const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
(async () => {
  const config = JSON.parse(execFileSync(process.execPath, ['node_modules/expo/bin/cli', 'config', '--type', 'introspect', '--json'], {encoding:'utf8'}));
  const permissions = config._internal.modResults.android.manifest.manifest['uses-permission'];
  const camera = permissions.find(p => p.$['android:name'] === 'android.permission.CAMERA');
  assert.ok(camera && camera.$['tools:node'] !== 'remove', 'Camera permission must not be removed by image picker plugin');
  const info = config._internal.modResults.ios.infoPlist;
  for (const key of ['NSCameraUsageDescription','NSPhotoLibraryUsageDescription']) assert.ok(info[key].includes('TRUSTCAM') && info[key].includes('cần'));
  assert.equal(info.NSMicrophoneUsageDescription, undefined);
  assert.equal(info.NSFaceIDUsageDescription, undefined);
  console.log('PASS native permission introspection: camera enabled, bilingual reasons, no microphone or Face ID');
})().catch(error => { console.error(error); process.exitCode = 1; });
