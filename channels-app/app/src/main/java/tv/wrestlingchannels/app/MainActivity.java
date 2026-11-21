package tv.wrestlingchannels.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.UiModeManager;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Browser UI (assets/index.html) for WCW / WWF shows on the Internet Archive. */
public class MainActivity extends Activity {

    private WebView web;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService pool = Executors.newFixedThreadPool(4);
    private long lastBack = 0;

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
        s.setMediaPlaybackRequiresUserGesture(false);   // channels start playing with sound straight away
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "Native");
        web.loadUrl("file:///android_asset/index.html");
        web.requestFocus();
    }

    private void js(String code) {
        ui.post(() -> web.evaluateJavascript(code, null));
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (e.getAction() != KeyEvent.ACTION_DOWN) return super.dispatchKeyEvent(e);
        switch (e.getKeyCode()) {
            case KeyEvent.KEYCODE_BACK:
                web.evaluateJavascript("app.back()", handled -> {
                    if ("true".equals(handled)) return;
                    long now = System.currentTimeMillis();
                    if (now - lastBack < 2000) finish();
                    else {
                        lastBack = now;
                        Toast.makeText(this, "Press Back again to exit", Toast.LENGTH_SHORT).show();
                    }
                });
                return true;
            case KeyEvent.KEYCODE_MENU:
            case KeyEvent.KEYCODE_GUIDE:
            case KeyEvent.KEYCODE_PROG_BLUE:
                js("app.key('guide')"); return true;
            case KeyEvent.KEYCODE_INFO:
                js("app.key('info')"); return true;
            case KeyEvent.KEYCODE_CHANNEL_UP:
            case KeyEvent.KEYCODE_MEDIA_NEXT:
                js("app.key('chup')"); return true;
            case KeyEvent.KEYCODE_CHANNEL_DOWN:
            case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                js("app.key('chdown')"); return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_PLAY:
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
                js("app.key('playpause')"); return true;
            case KeyEvent.KEYCODE_PROG_YELLOW:
                js("app.key('refresh')"); return true;
        }
        return super.dispatchKeyEvent(e);
    }

    private File cacheFile() { return new File(getFilesDir(), "channels.json"); }

    private static String readAll(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toString("UTF-8");
    }

    /** Methods callable from the page as Native.xxx(). */
    private class Bridge {
        @JavascriptInterface
        public void fetch(final String url, final String cbId) {
            pool.execute(() -> {
                String body = null, err = null;
                HttpURLConnection c = null;
                try {
                    c = (HttpURLConnection) new URL(url).openConnection();
                    c.setConnectTimeout(20000);
                    c.setReadTimeout(60000);
                    c.setRequestProperty("User-Agent", "WrestlingChannelsTV/1.0 (Android TV)");
                    int code = c.getResponseCode();
                    if (code >= 400) err = "HTTP " + code;
                    else body = readAll(c.getInputStream());
                } catch (Exception ex) {
                    err = ex.getClass().getSimpleName() + ": " + ex.getMessage();
                } finally {
                    if (c != null) c.disconnect();
                }
                js("app._cb(" + JSONObject.quote(cbId) + "," +
                        (body == null ? "null" : JSONObject.quote(body)) + "," +
                        (err == null ? "null" : JSONObject.quote(err)) + ")");
            });
        }

        @JavascriptInterface
        public void saveCache(String data) {
            try (FileOutputStream o = new FileOutputStream(cacheFile())) {
                o.write(data.getBytes(StandardCharsets.UTF_8));
            } catch (Exception ignored) { }
        }

        @JavascriptInterface
        public String loadCache() {
            File f = cacheFile();
            if (!f.exists()) return "";
            try (FileInputStream in = new FileInputStream(f)) {
                return readAll(in);
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public boolean isTV() {
            UiModeManager m = (UiModeManager) getSystemService(UI_MODE_SERVICE);
            return (m != null && m.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION)
                    || !getPackageManager().hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN);
        }

        @JavascriptInterface
        public void toast(String msg) {
            ui.post(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        js("app.key('stop')");              // stop the picture when you leave the app
    }

    private boolean started = false;
    @Override
    protected void onResume() {
        super.onResume();
        if (started) js("app.key('resume')");   // coming back: rejoin the channel live
        started = true;
    }

    @Override
    protected void onDestroy() {
        pool.shutdownNow();
        web.destroy();
        super.onDestroy();
    }
}
