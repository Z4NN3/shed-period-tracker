
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'period-tracker',
  webDir: 'www',

  // Local demo configuration only.
  // Keep bundled app assets inside the APK.
  // Do not point server.url to ionic serve.
  server: {
    androidScheme: 'http',
    cleartext: true
  },

  plugins: {
    SystemBars: {
      insetsHandling: 'css',
      style: 'DARK',
      hidden: false
    },

    StatusBar: {
      overlaysWebView: false,
      backgroundColor: '#FFFFFF',
      style: 'DARK'
    }
  }
};

export default config;
