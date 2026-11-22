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
        setContentView(web);
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

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String id = intent.getStringExtra("reminder");
        if (id != null) js("app.openReminder(" + JSONObject.quote(id) + ")");
    }

    @Override
    protected void onPause() { super.onPause(); visible = false; }

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
    private boolean okHeld = false;

    private void js(String code) { ui.post(() -> web.evaluateJavascript(code, null)); }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        // OK on the remote: a short press is 'ok', holding it is 'hold' (worked out here, as WebView key timing isn't reliable on TVs)
        int kc = e.getKeyCode();
        if (kc == KeyEvent.KEYCODE_DPAD_CENTER || kc == KeyEvent.KEYCODE_NUMPAD_ENTER || (kc == KeyEvent.KEYCODE_ENTER && e.getDeviceId() != KeyCharacterMap.VIRTUAL_KEYBOARD && !e.isFromSource(android.view.InputDevice.SOURCE_KEYBOARD))) {
            if (e.getAction() == KeyEvent.ACTION_DOWN) {
                if (e.getRepeatCount() == 0) { okDown = e.getEventTime(); okHeld = false; }
                else if (!okHeld && e.getEventTime() - okDown > 650) { okHeld = true; js("app.key('hold')"); }
            } else if (e.getAction() == KeyEvent.ACTION_UP) {
                if (!okHeld && !e.isCanceled()) js(e.getEventTime() - okDown > 650 ? "app.key('hold')" : "app.key('ok')");
                okHeld = false;
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
                    String u = url, bearer = null;
                    int h = u.indexOf("#bearer=");
                    if (h >= 0) { bearer = u.substring(h + 8); u = u.substring(0, h); }   // a session token to send as a header
                    c = (HttpURLConnection) new URL(u).openConnection();
                    if (bearer != null) c.setRequestProperty("Authorization", "Bearer " + bearer);
                    c.setConnectTimeout(20000);
                    c.setReadTimeout(60000);
                    c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 12; Android TV) FreeTVGuide/1.0");
                    c.setRequestProperty("Accept", "application/json");
                    int code = c.getResponseCode();
                    if (code >= 400) err = "HTTP " + code;
                    else body = readAll(c.getInputStream());
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

        /** The device's own search (Google TV / Google): finds a title across all your apps and can play it. */
        @JavascriptInterface
        public boolean search(String q) {
            String[] actions = {"android.search.action.GLOBAL_SEARCH", Intent.ACTION_SEARCH, Intent.ACTION_WEB_SEARCH};
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
