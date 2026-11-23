package tv.freetvguide.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.UiModeManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyCharacterMap;
import android.view.KeyEvent;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/** Free TV: a guide to free live TV and on-demand films and shows; opens each one in the app that streams it. */
public class MainActivity extends Activity {

    private WebView web;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService pool = Executors.newFixedThreadPool(4);
    private long lastBack = 0;
    private static MainActivity current;
    private boolean visible = false;

    /** A reminder went off while the app is open: show it in the app as well. */
    static void reminderFired(String id, String title, String text) {
        MainActivity a = current;
        if (a != null && a.visible) a.js("app.reminderDue(" + JSONObject.quote(id) + "," + JSONObject.quote(title) + "," + JSONObject.quote(text) + ")");
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        root = new android.widget.FrameLayout(this);
        root.addView(web, new android.widget.FrameLayout.LayoutParams(-1, -1));
        miniView = new android.view.TextureView(this);
        miniView.setVisibility(android.view.View.GONE);
        root.addView(miniView, new android.widget.FrameLayout.LayoutParams(1, 1));
        setContentView(root);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "Native");
        web.loadUrl("file:///android_asset/index.html");
        web.requestFocus();
        current = this;
        ReminderReceiver.ensureChannel(this);
        pendingReminder = getIntent() != null ? getIntent().getStringExtra("reminder") : null;
    }

    private String pendingReminder;

    // ---------------- the small window in the guide: keeps a channel playing after you go back from full screen
    private android.widget.FrameLayout root;
    private android.view.TextureView miniView;
    private androidx.media3.exoplayer.ExoPlayer mini;
    private androidx.media3.datasource.DefaultHttpDataSource.Factory miniHttp;
    private JSONArray miniChans;
    private int miniIdx;
    private boolean miniShown = false;

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != 7 || res != RESULT_OK || data == null) return;
        try {
            miniChans = new JSONArray(data.getStringExtra("channels"));
            miniIdx = data.getIntExtra("index", 0);
            JSONObject c = miniChans.getJSONObject(miniIdx);
            startMini(c);
            js("window.app && app.miniStarted(" + JSONObject.quote(c.optString("gid")) + "," + JSONObject.quote(c.optString("name")) + ")");
        } catch (Exception ignored) { }
    }
    private void startMini(final JSONObject c) {
        stopMini();
        miniHttp = new androidx.media3.datasource.DefaultHttpDataSource.Factory().setAllowCrossProtocolRedirects(true).setUserAgent(PlayerActivity.userAgent(c));
        mini = new androidx.media3.exoplayer.ExoPlayer.Builder(this)
                .setMediaSourceFactory(new androidx.media3.exoplayer.source.DefaultMediaSourceFactory(miniHttp)).build();
        mini.setVideoTextureView(miniView);
        final androidx.media3.exoplayer.ExoPlayer p = mini;
        pool.execute(() -> {
            try {
                final String url = PlayerActivity.streamUrl(MainActivity.this, c);
                ui.post(() -> {
                    if (mini != p) return;
                    p.setMediaItem(new androidx.media3.common.MediaItem.Builder().setUri(android.net.Uri.parse(url)).setMimeType(androidx.media3.common.MimeTypes.APPLICATION_M3U8).build());
                    p.prepare();
                    p.setPlayWhenReady(true);
                });
            } catch (Exception e) { ui.post(this::stopMiniAndTell); }
        });
    }
    private void stopMiniAndTell() { stopMini(); js("window.app && app.miniStopped()"); }
    private void stopMini() {
        if (mini != null) { mini.release(); mini = null; }
        if (miniView != null) miniView.setVisibility(android.view.View.GONE);
        miniShown = false;
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (mini != null) stopMiniAndTell();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String id = intent.getStringExtra("reminder");
        if (id != null) js("app.openReminder(" + JSONObject.quote(id) + ")");
    }

    @Override
    protected void onPause() {
        okArmed = false; super.onPause(); visible = false; }

    @Override
    protected void onResume() {
        super.onResume();
        visible = true;
        current = this;
        if (web != null) js("window.app && app.key('resume')");
        if (pendingReminder != null) {
            final String id = pendingReminder;
            pendingReminder = null;
            ui.postDelayed(() -> js("window.app && app.openReminder(" + JSONObject.quote(id) + ")"), 2500);
        }
    }

    private long okDown = 0;
    private boolean okHeld = false, okArmed = false;

    private void js(String code) { ui.post(() -> web.evaluateJavascript(code, null)); }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        // OK on the remote: a short press is 'ok', holding it is 'hold' (worked out here, as WebView key timing isn't reliable on TVs)
        int kc = e.getKeyCode();
        if (kc == KeyEvent.KEYCODE_DPAD_CENTER || kc == KeyEvent.KEYCODE_NUMPAD_ENTER || (kc == KeyEvent.KEYCODE_ENTER && e.getDeviceId() != KeyCharacterMap.VIRTUAL_KEYBOARD && !e.isFromSource(android.view.InputDevice.SOURCE_KEYBOARD))) {
            if (e.getAction() == KeyEvent.ACTION_DOWN) {
                if (e.getRepeatCount() == 0) { okDown = e.getEventTime(); okHeld = false; okArmed = true; }
                else if (okArmed && !okHeld && e.getEventTime() - okDown > 650) { okHeld = true; js("app.key('hold')"); }
            } else if (e.getAction() == KeyEvent.ACTION_UP) {
                // only count a press that started here (returning from another app can deliver just the "up")
                if (okArmed && !okHeld && !e.isCanceled()) js(e.getEventTime() - okDown > 650 ? "app.key('hold')" : "app.key('ok')");
                okHeld = false; okArmed = false;
            }
            return true;
        }
        if (e.getAction() != KeyEvent.ACTION_DOWN) return super.dispatchKeyEvent(e);
        switch (e.getKeyCode()) {
            case KeyEvent.KEYCODE_BACK:
                web.evaluateJavascript("app.back()", handled -> {
                    if ("true".equals(handled)) return;
                    long now = System.currentTimeMillis();
                    if (now - lastBack < 2000) finish();
                    else { lastBack = now; Toast.makeText(this, "Press Back again to exit", Toast.LENGTH_SHORT).show(); }
                });
                return true;
            case KeyEvent.KEYCODE_MENU:
            case KeyEvent.KEYCODE_PROG_YELLOW:
                js("app.key('menu')"); return true;
            case KeyEvent.KEYCODE_GUIDE:
            case KeyEvent.KEYCODE_PROG_BLUE:
                js("app.key('guide')"); return true;
            case KeyEvent.KEYCODE_CHANNEL_UP:
                js("app.key('pagedown')"); return true;
            case KeyEvent.KEYCODE_CHANNEL_DOWN:
                js("app.key('pageup')"); return true;
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
            case KeyEvent.KEYCODE_MEDIA_NEXT:
                js("app.key('ff')"); return true;
            case KeyEvent.KEYCODE_MEDIA_REWIND:
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                js("app.key('rw')"); return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_PROG_GREEN:
                js("app.key('add')"); return true;
        }
        return super.dispatchKeyEvent(e);
    }

    void askForNotifications() {
        if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED)
            ui.post(() -> requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 7));
    }

    private static String readAll(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[32768];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toString("UTF-8");
    }

    /** Launchable apps on this device: package -> label. */
    private JSONArray launchable() {
        PackageManager pm = getPackageManager();
        JSONArray out = new JSONArray();
        Set<String> seen = new HashSet<>();
        for (String cat : new String[]{Intent.CATEGORY_LEANBACK_LAUNCHER, Intent.CATEGORY_LAUNCHER}) {
            Intent i = new Intent(Intent.ACTION_MAIN).addCategory(cat);
            List<ResolveInfo> list = pm.queryIntentActivities(i, 0);
            for (ResolveInfo r : list) {
                String pkg = r.activityInfo.packageName;
                if (!seen.add(pkg) || pkg.equals(getPackageName())) continue;
                try { out.put(new JSONObject().put("pkg", pkg).put("label", String.valueOf(r.loadLabel(pm)))); } catch (Exception ignored) { }
            }
        }
        return out;
    }

    private Intent launchIntent(String pkg) {
        PackageManager pm = getPackageManager();
        Intent i = pm.getLeanbackLaunchIntentForPackage(pkg);
        if (i == null) i = pm.getLaunchIntentForPackage(pkg);
        return i;
    }

    /** Methods callable from the page as Native.xxx(). */
    private class Bridge {
        @JavascriptInterface
        public void fetch(final String url, final String cbId) {
            pool.execute(() -> {
                String body = null, err = null;
                HttpURLConnection c = null;
                try {
                    // extras after '#': bearer=TOKEN (session header), post (send as POST), h=Name:Value (another header)
                    String u = url;
                    String[] extra = new String[0];
                    int h = u.indexOf('#');
                    if (h >= 0) { extra = u.substring(h + 1).split("#"); u = u.substring(0, h); }
                    c = (HttpURLConnection) new URL(u).openConnection();
                    c.setConnectTimeout(20000);
                    c.setReadTimeout(60000);
                    c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 12; Android TV) FreeTVGuide/1.0");
                    c.setRequestProperty("Accept", "application/json");
                    boolean post = false;
                    for (String x : extra) {
                        if (x.startsWith("bearer=")) c.setRequestProperty("Authorization", "Bearer " + x.substring(7));
                        else if (x.equals("post")) post = true;
                        else if (x.startsWith("h=")) { String hv = Uri.decode(x.substring(2)); int k = hv.indexOf(':'); if (k > 0) c.setRequestProperty(hv.substring(0, k).trim(), hv.substring(k + 1).trim()); }
                    }
                    if (post) { c.setRequestMethod("POST"); c.setDoOutput(true); c.getOutputStream().close(); }
                    int code = c.getResponseCode();
                    if (code >= 400) err = "HTTP " + code;
                    else body = readAll(u.endsWith(".gz") ? new java.util.zip.GZIPInputStream(c.getInputStream()) : c.getInputStream());
                } catch (Exception ex) {
                    err = ex.getClass().getSimpleName() + ": " + ex.getMessage();
                } finally {
                    if (c != null) c.disconnect();
                }
                js("app._cb(" + JSONObject.quote(cbId) + "," + (body == null ? "null" : JSONObject.quote(body)) + "," +
                        (err == null ? "null" : JSONObject.quote(err)) + ")");
            });
        }

        @JavascriptInterface
        public void save(String name, String data) {
            if (!name.matches("[a-z0-9_-]+")) return;
            try (FileOutputStream o = new FileOutputStream(new File(getFilesDir(), name + ".json"))) {
                o.write(data.getBytes(StandardCharsets.UTF_8));
            } catch (Exception ignored) { }
        }

        @JavascriptInterface
        public String load(String name) {
            if (!name.matches("[a-z0-9_-]+")) return "";
            File f = new File(getFilesDir(), name + ".json");
            if (!f.exists()) return "";
            try (FileInputStream in = new FileInputStream(f)) { return readAll(in); } catch (Exception e) { return ""; }
        }

        @JavascriptInterface
        public String apps() { return launchable().toString(); }

        /**
         * Open something in the app that streams it. `labels` is a pattern for the app's name (e.g. "iplayer");
         * `url` is a web link to the channel or programme. Tries: the app with the link, then just the app,
         * then the Play Store page for it. Returns what happened.
         */
        @JavascriptInterface
        public String open(String labels, String url, String store) { return open2(labels, url, store, ""); }

        /** As open(), and if no link works, ask the app itself to search for `query` (the way Google Assistant does). */
        @JavascriptInterface
        public String open2(String labels, String url, String store, String query) {
            PackageManager pm = getPackageManager();
            String pkg = null;
            try {
                Pattern p = Pattern.compile(labels, Pattern.CASE_INSENSITIVE);
                JSONArray a = launchable();
                for (int i = 0; i < a.length(); i++) {
                    JSONObject o = a.getJSONObject(i);
                    if (p.matcher(o.getString("label")).find() || p.matcher(o.getString("pkg")).find()) { pkg = o.getString("pkg"); break; }
                }
            } catch (Exception ignored) { }
            // several possible links (one per line): use the first one this app says it can open
            if (pkg != null && url != null && url.length() > 0) {
                for (String u : url.split("\n")) {
                    if (u.trim().isEmpty()) continue;
                    try {
                        Intent v = new Intent(Intent.ACTION_VIEW, Uri.parse(u.trim())).setPackage(pkg).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        if (u.contains("netflix.com/watch") || u.contains("netflix.com/title")) v.putExtra("source", "30");
                        if (v.resolveActivity(pm) != null) { startActivity(v); return "link"; }
                    } catch (Exception ignored) { }
                }
            }
            if (pkg != null && query != null && query.length() > 0) {
                String[] actions = {"com.google.android.gms.actions.SEARCH_ACTION", Intent.ACTION_SEARCH, "android.media.action.MEDIA_PLAY_FROM_SEARCH"};
                for (String a : actions) {
                    try {
                        Intent i = new Intent(a).setPackage(pkg).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                .putExtra(android.app.SearchManager.QUERY, query).putExtra("query", query);
                        if (i.resolveActivity(pm) != null) { startActivity(i); return "search"; }
                    } catch (Exception ignored) { }
                }
            }
            if (pkg != null) {
                Intent l = launchIntent(pkg);
                if (l != null) { startActivity(l.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return "app"; }
            }
            if (store != null && store.length() > 0) {
                String q = store.startsWith("q:") ? "search?q=" + Uri.encode(store.substring(2)) + "&c=apps" : "details?id=" + store;
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("market://" + q)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return "store"; }
                catch (Exception ignored) { }
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/" + q)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return "store"; }
                catch (Exception ignored) { }
            }
            return "none";
        }

        /** Book a reminder notification for `at` (milliseconds). */
        @JavascriptInterface
        public void remind(String id, double at, String title, String text) {
            ReminderReceiver.schedule(MainActivity.this, id, (long) at, title, text);
            askForNotifications();
        }

        @JavascriptInterface
        public void unremind(String id) { ReminderReceiver.cancel(MainActivity.this, id); }

        @JavascriptInterface
        public boolean notificationsAllowed() {
            if (android.os.Build.VERSION.SDK_INT >= 33)
                return checkSelfPermission("android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED;
            return true;
        }

        /** Link tester: send exactly this one link to the app. */
        @JavascriptInterface
        public String tryLink(String labels, String url) {
            PackageManager pm = getPackageManager();
            String pkg = null;
            try {
                Pattern p = Pattern.compile(labels, Pattern.CASE_INSENSITIVE);
                JSONArray a = launchable();
                for (int i = 0; i < a.length(); i++) {
                    JSONObject o = a.getJSONObject(i);
                    if (p.matcher(o.getString("label")).find() || p.matcher(o.getString("pkg")).find()) { pkg = o.getString("pkg"); break; }
                }
            } catch (Exception ignored) { }
            if (pkg == null) return "not installed";
            try {
                Intent v = new Intent(Intent.ACTION_VIEW, Uri.parse(url)).setPackage(pkg).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (v.resolveActivity(pm) == null) return "not accepted";
                startActivity(v);
                return "sent";
            } catch (Exception e) { return "error"; }
        }

        // ---------------- Pluto TV player
        @JavascriptInterface
        public void playPluto(String channelsJson, int index) {
            Intent i = new Intent(MainActivity.this, PlayerActivity.class).putExtra("channels", channelsJson).putExtra("index", index);
            ui.post(() -> { stopMini(); startActivityForResult(i, 7); });
        }
        /** Play a page from a broadcaster's website inside Free TV (used for BBC iPlayer on the TV). */
        @JavascriptInterface
        public void openWeb(String url, String title) {
            Intent i = new Intent(MainActivity.this, WebPlayerActivity.class).putExtra("url", url).putExtra("title", title);
            ui.post(() -> { stopMini(); startActivity(i); });
        }
        /** Open a website that has no per-channel links and pick the channel on it (Virgin TV Go). */
        @JavascriptInterface
        public void openWebFind(String url, String title, String find) {
            Intent i = new Intent(MainActivity.this, WebPlayerActivity.class).putExtra("url", url).putExtra("title", title).putExtra("find", find);
            ui.post(() -> { stopMini(); startActivity(i); });
        }
        /** Same, for a programme rated 12+: type the saved parental PIN on Virgin's number pad. */
        @JavascriptInterface
        public void openWebFindPin(String url, String title, String find) {
            Intent i = new Intent(MainActivity.this, WebPlayerActivity.class).putExtra("url", url).putExtra("title", title).putExtra("find", find).putExtra("pin", true);
            ui.post(() -> { stopMini(); startActivity(i); });
        }
        /** Your Virgin channels ({ids, names}), as last read from the Virgin TV Go page; "" if not checked yet. */
        @JavascriptInterface
        public String virginOwned() { return getSharedPreferences("player", MODE_PRIVATE).getString("owned", ""); }
        /** Open Virgin TV Go briefly to read which channels you have. */
        @JavascriptInterface
        public void virginSync() {
            Intent i = new Intent(MainActivity.this, WebPlayerActivity.class).putExtra("url", "https://virgintvgo.virginmedia.com/en/watchtv").putExtra("title", "Checking which channels you have").putExtra("sync", true);
            ui.post(() -> { stopMini(); startActivity(i); });
        }
        @JavascriptInterface
        public boolean hasVirginPin() { return !getSharedPreferences("player", MODE_PRIVATE).getString("vpin", "").isEmpty(); }
        /** Ask for the Virgin TV Go parental PIN; it stays on this TV only. */
        @JavascriptInterface
        public void setVirginPin() {
            ui.post(() -> {
                android.widget.EditText in = new android.widget.EditText(MainActivity.this);
                in.setInputType(android.text.InputType.TYPE_CLASS_NUMBER | android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD);
                in.setFilters(new android.text.InputFilter[]{ new android.text.InputFilter.LengthFilter(4) });
                in.setHint("4 digits");
                new android.app.AlertDialog.Builder(MainActivity.this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                    .setTitle("Virgin TV Go parental PIN")
                    .setMessage("Saved on this TV only. Leave empty and choose Save to remove it.")
                    .setView(in)
                    .setPositiveButton("Save", (d, w) -> {
                        String v = in.getText().toString().replaceAll("[^0-9]", "");
                        getSharedPreferences("player", MODE_PRIVATE).edit().putString("vpin", v.length() == 4 ? v : "").apply();
                        android.widget.Toast.makeText(MainActivity.this, v.length() == 4 ? "PIN saved" : "PIN removed", android.widget.Toast.LENGTH_SHORT).show();
                    })
                    .setNegativeButton("Cancel", null)
                    .show();
                in.requestFocus();
            });
        }
        /** Where the small window goes (in page pixels); w = 0 hides it. */
        @JavascriptInterface
        public void miniRect(final double x, final double y, final double w, final double h) {
            ui.post(() -> {
                if (mini == null) return;
                float d = getResources().getDisplayMetrics().density;
                if (w <= 0 || h <= 0) { miniView.setVisibility(android.view.View.GONE); return; }
                android.widget.FrameLayout.LayoutParams lp = new android.widget.FrameLayout.LayoutParams((int) (w * d), (int) (h * d));
                lp.leftMargin = (int) (x * d); lp.topMargin = (int) (y * d);
                miniView.setLayoutParams(lp);
                miniView.setVisibility(android.view.View.VISIBLE);
            });
        }
        @JavascriptInterface
        public void miniStop() { ui.post(MainActivity.this::stopMini); }
        /** Back to full screen on the channel in the small window. */
        @JavascriptInterface
        public void miniFull() {
            ui.post(() -> {
                if (miniChans == null) return;
                Intent i = new Intent(MainActivity.this, PlayerActivity.class).putExtra("channels", miniChans.toString()).putExtra("index", miniIdx);
                stopMini();
                startActivityForResult(i, 7);
            });
        }
        @JavascriptInterface
        public void playPlutoFilm(String id, String title) {
            Intent i = new Intent(MainActivity.this, PlayerActivity.class).putExtra("episode", id).putExtra("title", title);
            ui.post(() -> { stopMini(); startActivity(i); });
        }

        // ---------------- helper (works iPlayer and U for you)
        @JavascriptInterface
        public boolean helperOn() { return HelperService.isOn(); }
        /** Give the helper its job before opening the app: labels = which app, mode = live | find. */
        @JavascriptInterface
        public void helperJob(String labels, String mode, String targets, String profile) {
            String pkg = null;
            try {
                Pattern p = Pattern.compile(labels, Pattern.CASE_INSENSITIVE);
                JSONArray a = launchable();
                for (int i = 0; i < a.length(); i++) {
                    JSONObject o = a.getJSONObject(i);
                    if (p.matcher(o.getString("label")).find() || p.matcher(o.getString("pkg")).find()) { pkg = o.getString("pkg"); break; }
                }
            } catch (Exception ignored) { }
            if (pkg != null) HelperService.setJob(pkg, mode, targets, profile);
        }
        @JavascriptInterface
        public void openHelperSettings() {
            ui.post(() -> {
                try { startActivity(new Intent(android.provider.Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
                catch (Exception e) { Toast.makeText(MainActivity.this, "Open Settings → System → Accessibility", Toast.LENGTH_LONG).show(); }
            });
        }
        @JavascriptInterface
        public void recordLayouts(int minutes) { HelperService.recordUntil = System.currentTimeMillis() + minutes * 60000L; HelperService.note("recording " + minutes + " min"); }
        @JavascriptInterface
        public int layoutCount() { synchronized (HelperService.layouts) { return HelperService.layouts.size(); } }
        /** Show the recorded layouts on the home network for 10 minutes; returns the address to open on a phone. */
        @JavascriptInterface
        public String shareLayouts() { return LayoutServer.start(MainActivity.this); }

        @JavascriptInterface
        public String version() { try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return ""; } }

        /** Update Free TV in place (also lifts Android's block on the helper for downloaded apps). */
        @JavascriptInterface
        public String updateSelf() {
            if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
                ui.post(() -> {
                    try { startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()))); }
                    catch (Exception e) { Toast.makeText(MainActivity.this, "Allow Free TV to install apps in Settings → Apps → Security & restrictions → Unknown sources", Toast.LENGTH_LONG).show(); }
                });
                return "allow";
            }
            // Android only lets an app reopen itself after updating if it may "display over other apps": ask once
            if (Build.VERSION.SDK_INT >= 23 && !android.provider.Settings.canDrawOverlays(MainActivity.this)
                    && !getSharedPreferences("update", MODE_PRIVATE).getBoolean("skipOverlay", false)) return "overlay";
            pool.execute(() -> SelfUpdate.run(MainActivity.this, msg -> js("window.app && app.updateMsg(" + JSONObject.quote(msg) + ")")));
            return "started";
        }
        @JavascriptInterface
        public void skipOverlay() { getSharedPreferences("update", MODE_PRIVATE).edit().putBoolean("skipOverlay", true).apply(); }
        @JavascriptInterface
        public void openOverlaySettings() {
            ui.post(() -> {
                try { startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()))); }
                catch (Exception e) {
                    try { startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION)); }
                    catch (Exception e2) {
                        getSharedPreferences("update", MODE_PRIVATE).edit().putBoolean("skipOverlay", true).apply();
                        Toast.makeText(MainActivity.this, "This TV doesn't have that setting – Free TV will show a notification to reopen instead", Toast.LENGTH_LONG).show();
                    }
                }
            });
        }

        /** The device's own search (Google TV / Google): finds a title across all your apps and can play it. */
        @JavascriptInterface
        public boolean search(String q) {
            // Google TV's own search first (named directly, so Android doesn't ask which app to use)
            String[] pkgs = {"com.google.android.katniss", "com.google.android.apps.tv.launcherx", "com.google.android.googlequicksearchbox"};
            String[] tvActions = {"android.search.action.GLOBAL_SEARCH", Intent.ACTION_SEARCH};
            for (String p : pkgs) for (String a : tvActions) {
                try {
                    Intent i = new Intent(a).setPackage(p).putExtra(android.app.SearchManager.QUERY, q).putExtra("query", q).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    if (i.resolveActivity(getPackageManager()) != null) { startActivity(i); return true; }
                } catch (Exception ignored) { }
            }
            String[] actions = {"android.search.action.GLOBAL_SEARCH", Intent.ACTION_SEARCH};
            for (String a : actions) {
                try {
                    Intent i = new Intent(a).putExtra(android.app.SearchManager.QUERY, q).putExtra("query", q).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    if (i.resolveActivity(getPackageManager()) != null) { startActivity(i); return true; }
                } catch (Exception ignored) { }
            }
            return false;
        }

        @JavascriptInterface
        public void toast(final String msg) { ui.post(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show()); }

        @JavascriptInterface
        public boolean isTV() {
            UiModeManager m = (UiModeManager) getSystemService(UI_MODE_SERVICE);
            if (m != null && m.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION) return true;
            return getPackageManager().hasSystemFeature(PackageManager.FEATURE_LEANBACK);
        }
    }
}
