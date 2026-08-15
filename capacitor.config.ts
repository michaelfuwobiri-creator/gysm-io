import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.gysm.app',
  appName: 'GYSM.IO',
  webDir: 'public',
  // GYSM is a full Next.js app with SSR/API routes, so the iOS shell
  // loads the live production site rather than a bundled static export.
  server: {
    url: 'https://www.gysm.io',
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
