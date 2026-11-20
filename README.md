# Ring Channel TV – Android TV app

A lightweight Android TV app that opens https://ring-channel-tv.emergent.host/ full screen
and lets you drive it with the TV remote.

It loads the **live website** every time, so any change you make to the site shows up in the
app automatically. You only need to rebuild the APK to change the app itself (icon, name, buttons).

## Remote controls

| Button | Action |
|---|---|
| D-pad arrows | Move the yellow highlight between items |
| OK / Select | Click the highlighted item |
| Back | Go back a page / leave full-screen video (press twice on the home page to exit) |
| Menu (≡) | Switch between Live and On Demand |
| Red / Green / Yellow (if your remote has them) | Live / On Demand / Reload |
| Play/Pause, FF, Rewind | Control the playing video |

## Getting the APK (no software to install)

1. Create a free account at github.com and make a new repository (private is fine).
2. Click **Add file → Upload files** and drag in the *contents* of this folder (including the
   hidden `.github` folder – on a Mac press Cmd+Shift+. to show it). Commit.
3. Open the **Actions** tab. The "Build APK" job runs by itself (about 3–5 minutes).
4. Open the finished run and download **RingChannelTV-apk** under *Artifacts*. Unzip it to get
   `app-release.apk`.

Or open this folder in Android Studio and choose **Build → Build APK(s)**.

## Installing on the TV

- Easiest: install the **Downloader** app (by AFTVnews) on the TV, put the APK somewhere with a
  link (e.g. Google Drive / Dropbox direct link) and open the link in Downloader.
- Or use **Send Files to TV** from your phone.
- Allow "Install unknown apps" for that app when asked.

The app appears in the TV's app row as "Ring Channel TV".

## Changing things

- Website address: `HOME_URL` and `ON_DEMAND_URL` in
  `app/src/main/java/tv/ringchannel/app/MainActivity.java`
- Remote navigation behaviour / highlight colour: `app/src/main/assets/tvnav.js`
- When you release a new version of the app, raise `versionCode` in `app/build.gradle`
  so it installs over the old one.
