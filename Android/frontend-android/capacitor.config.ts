import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.possystem.app',
  appName: 'POS System',
  webDir: 'build',
  server: {
    cleartext: true,
    androidScheme: 'http'
  }
};

export default config;
