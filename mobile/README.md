# MyGuru Android app (Health Connect)

Health Connect has no web API, so this folder is a thin [Capacitor](https://capacitorjs.com) wrapper.
It opens your hosted MyGuru site full-screen and gives it access to Health Connect through
[`@capgo/capacitor-health`](https://github.com/Cap-go/capacitor-health). Every time you open the app
(at most every 30 minutes), the web app reads the last 7 days of **steps, sleep and workouts** and
posts them to `/api/sync/health`. Nothing is written back to Health Connect.

## Build it once

Needs Node 22, Android Studio, and a phone with Health Connect (built into Android 14+).

```bash
cd mobile
npm install
export MYGURU_URL=https://your-myguru.a.run.app
npx cap add android
npx cap sync android
```

Then add the Health Connect read permissions to `android/app/src/main/AndroidManifest.xml`
inside `<manifest>`:

```xml
<uses-permission android:name="android.permission.health.READ_STEPS" />
<uses-permission android:name="android.permission.health.READ_SLEEP" />
<uses-permission android:name="android.permission.health.READ_EXERCISE" />
<uses-permission android:name="android.permission.health.READ_DISTANCE" />
<queries>
  <package android:name="com.google.android.apps.healthdata" />
</queries>
```

and, inside the main `<activity>`, the intent filter Health Connect uses to show your privacy policy:

```xml
<intent-filter>
  <action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" />
</intent-filter>
```

Open the project with `npx cap open android`, plug in the phone, and press Run. Sign in inside the
app; the first launch asks for Health Connect permissions. Steps, sleep and workouts then appear on
the Health page and feed the Move ring and the morning briefing.

For a phone you sideload yourself, a debug build is enough; no Play Store listing is needed.
