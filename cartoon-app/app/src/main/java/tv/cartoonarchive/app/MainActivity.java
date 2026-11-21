package tv.cartoonarchive.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.UiModeManager;
import android.content.Intent;
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
            case KeyEvent.KEYCODE_PROG_YELLOW:
                js("app.refresh(true)"); return true;
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
            case KeyEvent.KEYCODE_CHANNEL_UP:
                js("app.jumpYear(1)"); return true;
            case KeyEvent.KEYCODE_MEDIA_REWIND:
            case KeyEvent.KEYCODE_CHANNEL_DOWN:
                js("app.jumpYear(-1)"); return true;
            case KeyEvent.KEYCODE_PAGE_DOWN:
                js("app.page(1)"); return true;
            case KeyEvent.KEYCODE_PAGE_UP:
                js("app.page(-1)"); return true;
        }
        return super.dispatchKeyEvent(e);
    }

    private File cacheFile() { return new File(getFilesDir(), "catalogue.json"); }

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
                    c.setRequestProperty("User-Agent", "CartoonArchiveTV/1.0 (Android TV)");
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

        /** playlistJson: [{"url":..., "title":...}, ...] */
        @JavascriptInterface
        public void play(String playlistJson, int index) {
            try {
                JSONArray a = new JSONArray(playlistJson);
                String[] urls = new String[a.length()], titles = new String[a.length()];
                for (int i = 0; i < a.length(); i++) {
                    urls[i] = a.getJSONObject(i).getString("url");
                    titles[i] = a.getJSONObject(i).optString("title", "");
                }
                Intent it = new Intent(MainActivity.this, PlayerActivity.class);
                it.putExtra("urls", urls);
                it.putExtra("titles", titles);
                it.putExtra("index", index);
                ui.post(() -> startActivityForResult(it, 1));
            } catch (Exception ignored) { }
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

    /** The player asks for the next / previous show when you skip past the end of a video. */
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == 1 && resultCode == RESULT_OK && data != null) {
            int dir = data.getIntExtra("dir", 0);
            if (dir != 0) js("app.playAdjacent(" + dir + ")");
        }
    }

    @Override
    protected void onDestroy() {
        pool.shutdownNow();
        web.destroy();
        super.onDestroy();
    }
}
