package tv.freetvguide.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

/**
 * Plays BBC channels and programmes from the BBC iPlayer website inside Free TV (you sign in to your BBC account once;
 * it stays signed in). Opens straight on the channel and makes the player fill the screen.
 */
public class WebPlayerActivity extends Activity {
    private WebView web;
    private FrameLayout root;
    private View custom;
    private String start;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private int tries = 0;

    // Make the player fill the screen and start it, if the page hasn't already.
    private static final String FILL =
        "(function(){try{" +
        "if(!/bbc\\.co\\.uk\\/iplayer\\/(live|episode)/.test(location.href))return 'not player';" +
        "function big(el){el.style.cssText+=';position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;" +
        "z-index:2147483647!important;background:#000!important;max-width:none!important;max-height:none!important;margin:0!important;border:0!important;transform:none!important';}" +
        "var v=document.querySelector('video');" +
        "var f=[].slice.call(document.querySelectorAll('iframe')).filter(function(x){var r=x.getBoundingClientRect();return r.width>200&&/smp|player|media|emp/i.test((x.src||'')+x.id+x.className+x.title);})[0];" +
        "var t=f||(v&&(v.closest('[class*=player],[id*=player],[class*=Player]')||v));" +
        "if(t){big(t);document.documentElement.style.overflow='hidden';document.body.style.overflow='hidden';}" +
        "if(v&&v.paused){try{v.play();}catch(e){}}" +
        "var b=[].slice.call(document.querySelectorAll('button,[role=button],a')).filter(function(x){return /^(play|start watching|watch live|resume|watch now|play live)/i.test(((x.getAttribute('aria-label')||'')+' '+(x.textContent||'')).trim());})[0];" +
        "if(b&&!(v&&!v.paused)){b.click();}" +
        "return t?'filled':'waiting';}catch(e){return 'err '+e;}})()";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setUserAgentString("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView v, String url) { tries = 0; ui.removeCallbacks(fill); ui.postDelayed(fill, 1500); CookieManager.getInstance().flush(); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onShowCustomView(View view, CustomViewCallback cb) {
                custom = view; root.addView(view, new FrameLayout.LayoutParams(-1, -1)); web.setVisibility(View.GONE);
            }
            @Override public void onHideCustomView() {
                if (custom != null) root.removeView(custom); custom = null; web.setVisibility(View.VISIBLE);
            }
        });
        start = getIntent().getStringExtra("url");
        web.loadUrl(start);
        web.requestFocus();
    }

    private final Runnable fill = new Runnable() {
        @Override public void run() {
            if (web == null) return;
            web.evaluateJavascript(FILL, r -> { if (tries++ < 15 && (r == null || !r.contains("filled") || tries < 4)) ui.postDelayed(fill, 2000); });
        }
    };

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (e.getKeyCode() == KeyEvent.KEYCODE_BACK && e.getAction() == KeyEvent.ACTION_UP) {
            if (custom != null) { web.getWebChromeClient().onHideCustomView(); return true; }
            String u = web.getUrl();
            // during sign-in, Back steps back a page; on the player it returns to the guide
            if (web.canGoBack() && u != null && !u.contains("/iplayer/live/") && !u.contains("/iplayer/episode/")) { web.goBack(); return true; }
            finish();
            return true;
        }
        if (e.getKeyCode() == KeyEvent.KEYCODE_BACK) return true;
        return super.dispatchKeyEvent(e);
    }

    @Override protected void onPause() { super.onPause(); if (web != null) web.onPause(); CookieManager.getInstance().flush(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onDestroy() { ui.removeCallbacks(fill); if (web != null) { web.loadUrl("about:blank"); web.destroy(); web = null; } super.onDestroy(); }
}
