/**
 * Configuration Capacitor pour empaqueter l'application en véritable APK Android (.apk)
 * avec support natif du plugin `cordova-plugin-inappbrowser` pour piloter E.Leclerc Drive.
 */
const config = {
  appId: 'com.doudoushome.courses',
  appName: 'Doudous Home',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    InAppBrowser: {
      toolbarColor: '#0f172a',
      navigationButtonColor: '#34d399',
    },
  },
};

export default config;
