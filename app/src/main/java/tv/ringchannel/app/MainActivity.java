package tv.ringchannel.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.app.UiModeManager;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Rect;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.net.Uri;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.graphics.Bitmap;
import android.webkit.JavascriptInterface;
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
    private volatile boolean fsWanted = false;   // user turned full-screen video on
    private volatile boolean fsShowing = false;  // video is full screen right now
    private boolean okLong = false;
    private FrameLayout shield;          // phone: catches taps while zoomed in on the player
    private LinearLayout fsButtons;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable hideButtons = () -> { if (fsButtons != null) fsButtons.setVisibility(View.GONE); };
    private int fsHints = 0;
    private volatile String zoomMode = "video";   // "video" or "guide"
    private TextView exitBtn, guideBtn;

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
        buildShield();

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);   // let channels autoplay
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);                         // no pinch-zoom, so the page can't drift sideways
        s.setBuiltInZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);       // normal HTTP caching: picks up site updates
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        // Present as a desktop browser so the site serves its full TV-sized layout.
        s.setUserAgentString(s.getUserAgentString().replace("; wv", "") + " RingChannelTVApp/1.0");

        webView.setBackgroundColor(Color.BLACK);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface public void setFullscreen(boolean on) { fsWanted = on; }
            @JavascriptInterface public void setShowing(boolean on) {
                fsShowing = on;
                runOnUiThread(() -> onShowingChanged(on));
            }
            @JavascriptInterface public void setMode(String mode) {
                zoomMode = "guide".equals(mode) ? "guide" : "video";
            }
            @JavascriptInterface public void zoomTo(float l, float t, float w, float h, float iw, float ih) {
                runOnUiThread(() -> applyZoom(l, t, w, h, iw, ih));
            }
            @JavascriptInterface public boolean isTv() { return MainActivity.this.isTv(); }
        }, "RingApp");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                if (fsShowing) { fsShowing = false; onShowingChanged(false); }
            }

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
                restoreFullscreen(url);
            }

            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                // The site is a single-page app; re-inject on in-app route changes too.
                injectNav();
                restoreFullscreen(url);
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
                // On phones, turn full-screen video sideways
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
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
        // On a TV, show the remote highlight straight away; on phones it waits for a key press
        if (isTv()) webView.evaluateJavascript("window.__tvnav && window.__tvnav.setRemote(true)", null);
    }

    /** Back on the live channel page with full screen left on: put the video back full screen. */
    private void restoreFullscreen(String url) {
        if (!fsWanted || fsShowing || url == null) return;
        String path = Uri.parse(url).getPath();
        if (path == null || path.isEmpty() || path.equals("/")) nav("restoreFullscreen()");
    }

    private void nav(String call) {
        webView.evaluateJavascript("window.__tvnav && window.__tvnav." + call, null);
    }

    private void goBackOrExit() {
        if (webView.canGoBack()) { webView.goBack(); return; }
        long now = System.currentTimeMillis();
        if (now - lastBackPress < 2000) { finish(); return; }
        lastBackPress = now;
        Toast.makeText(this, "Press Back again to exit", Toast.LENGTH_SHORT).show();
    }

    // ---------- full screen: zoom the app's view in on the player, leaving the page untouched ----------

    private void onShowingChanged(boolean on) {
        if (on) {
            boolean guide = "guide".equals(zoomMode);
            phoneFullscreen(true);
            exitBtn.setText(guide ? "\u2715  Close guide" : "\u2715  Exit full screen");
            guideBtn.setVisibility(guide ? View.GONE : View.VISIBLE);
            if (!isTv()) { shield.setVisibility(View.VISIBLE); showButtons(); }
            if (guide) {
                if (isTv() && fsHints < 3) Toast.makeText(this, "Press Back, OK or Menu to close the guide", Toast.LENGTH_SHORT).show();
            } else if (fsHints++ < 2) Toast.makeText(this, isTv()
                    ? "Full screen – hold OK to exit, ▼ or Menu for the TV guide"
                    : "Tap the screen for buttons – double-tap or Back to exit", Toast.LENGTH_LONG).show();
        } else {
            resetZoom();
            phoneFullscreen(false);
            shield.setVisibility(View.GONE);
        }
    }

    /** Player rectangle in page (CSS) pixels -> scale and move the WebView so it fills the screen. */
    private void applyZoom(float l, float t, float w, float h, float iw, float ih) {
        if (!fsShowing || iw <= 0 || w < 20 || h < 20 || webView.getWidth() == 0) return;
        float k = webView.getWidth() / iw;
        float x = l * k, y = t * k, ww = w * k, hh = h * k;
        float rw = root.getWidth(), rh = root.getHeight();
        float sc = Math.min(rw / ww, rh / hh);                 // keep the picture's shape
        webView.setPivotX(0);
        webView.setPivotY(0);
        webView.setScaleX(sc);
        webView.setScaleY(sc);
        webView.setTranslationX(rw / 2f - sc * (x + ww / 2f));
        webView.setTranslationY(rh / 2f - sc * (y + hh / 2f));
        webView.setClipBounds(new Rect(Math.round(x), Math.round(y), Math.round(x + ww), Math.round(y + hh)));
    }

    private void resetZoom() {
        webView.setScaleX(1f);
        webView.setScaleY(1f);
        webView.setTranslationX(0f);
        webView.setTranslationY(0f);
        webView.setClipBounds(null);
    }

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private TextView pill(String text, Runnable action) {
        TextView b = new TextView(this);
        b.setText(text);
        b.setTextColor(Color.WHITE);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        b.setTypeface(b.getTypeface(), android.graphics.Typeface.BOLD);
        b.setPadding(dp(16), dp(10), dp(16), dp(10));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0xE60F0F19);
        bg.setCornerRadius(dp(22));
        bg.setStroke(dp(2), 0xFFFFD400);
        b.setBackground(bg);
        b.setOnClickListener(v -> action.run());
        return b;
    }

    /** Phone only: a clear layer over the zoomed player. Tap = show buttons, double-tap = exit. */
    private void buildShield() {
        shield = new FrameLayout(this);
        shield.setVisibility(View.GONE);
        GestureDetector gd = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override public boolean onDown(MotionEvent e) { return true; }
            @Override public boolean onSingleTapConfirmed(MotionEvent e) {
                if (fsButtons.getVisibility() == View.VISIBLE) hideButtons.run(); else showButtons();
                return true;
            }
            @Override public boolean onDoubleTap(MotionEvent e) {
                nav("guide".equals(zoomMode) ? "guide()" : "toggleFullscreen()"); return true;
            }
        });
        shield.setOnTouchListener((v, e) -> { gd.onTouchEvent(e); return true; });

        fsButtons = new LinearLayout(this);
        fsButtons.setOrientation(LinearLayout.HORIZONTAL);
        TextView exit = pill("\u2715  Exit full screen",
                () -> nav("guide".equals(zoomMode) ? "guide()" : "toggleFullscreen()"));
        TextView guide = pill("\u2630  Guide", () -> nav("guide()"));
        exitBtn = exit;
        guideBtn = guide;
        LinearLayout.LayoutParams gap = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        gap.setMarginStart(dp(10));
        fsButtons.addView(exit);
        fsButtons.addView(guide, gap);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.END);
        lp.setMargins(dp(16), dp(16), dp(20), dp(20));
        shield.addView(fsButtons, lp);
        root.addView(shield, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    }

    private void showButtons() {
        fsButtons.setVisibility(View.VISIBLE);
        handler.removeCallbacks(hideButtons);
        handler.postDelayed(hideButtons, 4000);
    }

    /** On phones: turn sideways and hide the status/navigation bars while the video is full screen. */
    @SuppressWarnings("deprecation")
    private void phoneFullscreen(boolean on) {
        if (isTv()) return;
        setRequestedOrientation(on ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                                   : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        View d = getWindow().getDecorView();
        d.setSystemUiVisibility(on
                ? View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                  | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                  | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                : 0);
    }

    private boolean isTv() {
        UiModeManager m = (UiModeManager) getSystemService(UI_MODE_SERVICE);
        return (m != null && m.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION)
                || !getPackageManager().hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN);
    }

    private void exitFullscreen() {
        if (customView == null) return;
        root.removeView(customView);
        customView = null;
        webView.setVisibility(View.VISIBLE);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        if (customViewCallback != null) customViewCallback.onCustomViewHidden();
        customViewCallback = null;
        webView.requestFocus();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int code = event.getKeyCode();

        // OK button: short press = select (or pause when full screen), hold = full-screen video on/off
        boolean ok = code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER
                || code == KeyEvent.KEYCODE_NUMPAD_ENTER;
        if (ok && customView == null) {
            long held = event.getEventTime() - event.getDownTime();
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                if (event.getRepeatCount() == 0) { okLong = false; return true; }
                if (!okLong && held >= 600) { okLong = true; nav("toggleFullscreen()"); }
                return true;
            }
            if (event.getAction() == KeyEvent.ACTION_UP) {
                if (!okLong && held >= 600) { nav("toggleFullscreen()"); }
                else if (!okLong) {
                    if (fsShowing) nav("zoomKey('ok')");
                    else {
                        webView.dispatchKeyEvent(new KeyEvent(event.getDownTime(), event.getEventTime(),
                                KeyEvent.ACTION_DOWN, code, 0, event.getMetaState(), event.getDeviceId(),
                                event.getScanCode(), event.getFlags(), event.getSource()));
                        webView.dispatchKeyEvent(event);
                    }
                }
                okLong = false;
                return true;
            }
        }

        if (event.getAction() != KeyEvent.ACTION_DOWN) return super.dispatchKeyEvent(event);

        // While the video is full screen: up/down bring up the guide, left/right do nothing
        if (fsShowing && customView == null) {
            switch (code) {
                case KeyEvent.KEYCODE_DPAD_UP:
                    nav("zoomKey('up')"); return true;
                case KeyEvent.KEYCODE_DPAD_DOWN:
                    nav("zoomKey('down')"); return true;
                case KeyEvent.KEYCODE_DPAD_LEFT:
                case KeyEvent.KEYCODE_DPAD_RIGHT:
                    return true;
            }
        }

        switch (code) {
            case KeyEvent.KEYCODE_BACK:
                if (customView != null) { exitFullscreen(); return true; }
                webView.evaluateJavascript("(window.__tvnav && window.__tvnav.back()) || false", r -> {
                    if (!"true".equals(r)) goBackOrExit();
                });
                return true;

            case KeyEvent.KEYCODE_MENU:        // TV guide
            case KeyEvent.KEYCODE_GUIDE:
            case KeyEvent.KEYCODE_INFO:
            case KeyEvent.KEYCODE_PROG_BLUE:
                nav("guide()"); return true;

            case KeyEvent.KEYCODE_WINDOW:      // dedicated full-screen / zoom buttons on some remotes
            case KeyEvent.KEYCODE_TV_ZOOM_MODE:
                nav("toggleFullscreen()"); return true;

            case KeyEvent.KEYCODE_PROG_RED:    // Coloured buttons, if the remote has them
            case KeyEvent.KEYCODE_CHANNEL_UP:
                webView.loadUrl(HOME_URL); return true;
            case KeyEvent.KEYCODE_PROG_GREEN:
            case KeyEvent.KEYCODE_CHANNEL_DOWN:
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
