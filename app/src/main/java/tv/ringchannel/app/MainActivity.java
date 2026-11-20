package tv.ringchannel.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * Android TV wrapper for Ring Channel TV.
 * Loads the live website (so the app always shows the latest version of the site)
 * and injects a remote-control navigation layer (assets/tvnav.js).
 */
public class MainActivity extends Activity {

    private static final String HOME_URL = "https://ring-channel-tv.emergent.host/";
    private static final String ON_DEMAND_URL = "https://ring-channel-tv.emergent.host/on-demand";
    private static final String SITE_HOST = "ring-channel-tv.emergent.host";

    private WebView webView;
    private FrameLayout root;
    private View customView;                       // fullscreen video view
    private WebChromeClient.CustomViewCallback customViewCallback;
    private String navScript = "";
    private long lastBackPress = 0;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        navScript = readAsset("tvnav.js");

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);   // let channels autoplay
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);       // normal HTTP caching: picks up site updates
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        // Present as a desktop browser so the site serves its full TV-sized layout.
        s.setUserAgentString(s.getUserAgentString().replace("; wv", "") + " RingChannelTVApp/1.0");

        webView.setBackgroundColor(Color.BLACK);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    return false;                       // stay inside the app
                }
                try {                                   // intent:, market: etc.
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                injectNav();
            }

            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                // The site is a single-page app; re-inject on in-app route changes too.
                injectNav();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) { callback.onCustomViewHidden(); return; }
                customView = view;
                customViewCallback = callback;
                root.addView(view, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                webView.setVisibility(View.GONE);
                view.requestFocus();
            }

            @Override
            public void onHideCustomView() { exitFullscreen(); }
        });

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState);
        } else {
            webView.loadUrl(HOME_URL);
        }
        webView.requestFocus();
    }

    private void injectNav() {
        if (navScript.isEmpty()) return;
        webView.evaluateJavascript(navScript, null);
    }

    private void exitFullscreen() {
        if (customView == null) return;
        root.removeView(customView);
        customView = null;
        webView.setVisibility(View.VISIBLE);
        if (customViewCallback != null) customViewCallback.onCustomViewHidden();
        customViewCallback = null;
        webView.requestFocus();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getAction() != KeyEvent.ACTION_DOWN) return super.dispatchKeyEvent(event);

        switch (event.getKeyCode()) {
            case KeyEvent.KEYCODE_BACK:
                if (customView != null) { exitFullscreen(); return true; }
                if (webView.canGoBack()) { webView.goBack(); return true; }
                long now = System.currentTimeMillis();
                if (now - lastBackPress < 2000) { finish(); return true; }
                lastBackPress = now;
                Toast.makeText(this, "Press Back again to exit", Toast.LENGTH_SHORT).show();
                return true;

            case KeyEvent.KEYCODE_MENU:        // Menu: jump to On Demand / back to Live
                String url = webView.getUrl();
                webView.loadUrl(url != null && url.contains("/on-demand") ? HOME_URL : ON_DEMAND_URL);
                return true;

            case KeyEvent.KEYCODE_PROG_RED:    // Coloured buttons, if the remote has them
                webView.loadUrl(HOME_URL); return true;
            case KeyEvent.KEYCODE_PROG_GREEN:
                webView.loadUrl(ON_DEMAND_URL); return true;
            case KeyEvent.KEYCODE_PROG_YELLOW:
                webView.reload(); return true;

            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_PLAY:
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
                webView.evaluateJavascript("window.__tvnav && window.__tvnav.playPause()", null);
                return true;
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD:
                webView.evaluateJavascript("window.__tvnav && window.__tvnav.seek(10)", null);
                return true;
            case KeyEvent.KEYCODE_MEDIA_REWIND:
                webView.evaluateJavascript("window.__tvnav && window.__tvnav.seek(-10)", null);
                return true;
        }
        return super.dispatchKeyEvent(event);
    }

    private String readAsset(String name) {
        try (InputStream in = getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        } catch (Exception e) {
            return "";
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        webView.resumeTimers();
    }

    @Override
    protected void onPause() {
        webView.onPause();
        webView.pauseTimers();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
