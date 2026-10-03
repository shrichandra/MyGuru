import type { CapacitorConfig } from "@capacitor/cli";

// The app loads the hosted MyGuru site; Capacitor injects its bridge so the web app's
// NativeHealthSync component can read Health Connect and post to /api/sync/health.
const url = process.env.MYGURU_URL;
if (!url) throw new Error("Set MYGURU_URL to your Cloud Run URL before `npx cap sync`");

const config: CapacitorConfig = {
  appId: "app.myguru.android",
  appName: "MyGuru",
  webDir: "www",
  server: { url, cleartext: false },
  android: { allowMixedContent: false },
};

export default config;
