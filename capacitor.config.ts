import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.personal.habits',
  appName: 'Habits',
  webDir: 'dist',
  android: { allowMixedContent: false },
};

export default config;
