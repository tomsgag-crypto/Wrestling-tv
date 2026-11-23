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
    private android.widget.TextView cover;
    private final Runnable reveal = () -> { if (cover != null) cover.setVisibility(View.GONE); };
    private static boolean isPlayer(String u) { return u != null && u.matches(".*bbc\\.co\\.uk/iplayer/(live|episode)/.*"); }

    // Make the player fill the screen and start it, if the page hasn't already.
    // Make the player fill the screen: find the video (the BBC player keeps it inside sealed-off "shadow" parts of the page),
    // pin its outer box to the whole screen and hide everything else.
    private static final String FILL = "(function(){try{if(!/bbc\\.co\\.uk\\/iplayer\\/(live|episode)/.test(location.href))return 'not player';function deep(root,depth){if(!root||depth>8)return null;var v=root.querySelector&&root.querySelector('video');if(v)return v; var all=root.querySelectorAll?root.querySelectorAll('*'):[];for(var i=0;i<all.length;i++){if(all[i].shadowRoot){var f=deep(all[i].shadowRoot,depth+1);if(f)return f;}}return null;}var v=deep(document,0);var t=null;if(v){t=v;while(t.getRootNode&&t.getRootNode()!==document){t=t.getRootNode().host;} var host=t;var p=t;while(p&&p.parentElement&&p.parentElement!==document.body){var r=p.parentElement.getBoundingClientRect(),q=t.getBoundingClientRect();if(r.width>q.width*1.15||r.height>q.height*1.3)break;p=p.parentElement;}t=p;}else{t=[].slice.call(document.querySelectorAll('iframe')).filter(function(x){return x.getBoundingClientRect().width>300;})[0]||null;}if(!t)return 'waiting';var W=window.innerWidth,H=window.innerHeight;var st=document.getElementById('ftv-fill');if(!st){st=document.createElement('style');st.id='ftv-fill';document.head.appendChild(st);}st.textContent='html,body{overflow:hidden!important;background:#000!important}'+ '.ftv-hide{visibility:hidden!important}.ftv-anc{transform:none!important;filter:none!important;contain:none!important;overflow:visible!important;z-index:auto!important;visibility:visible!important}'+ '.ftv-full{width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;margin:0!important;transform:none!important}.ftv-big{position:fixed!important;left:0!important;top:0!important;width:'+W+'px!important;height:'+H+'px!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;border:0!important;z-index:2147483647!important;background:#000!important;visibility:visible!important;transform:none!important}';t.classList.add('ftv-big');if(v){var c=v,n=0;while(c&&c!==t&&n++<60){if(c.style){['width','height'].forEach(function(k){c.style.setProperty(k,'100%','important');});c.style.setProperty('max-width','none','important');c.style.setProperty('max-height','none','important');c.style.setProperty('transform','none','important');c.style.setProperty('padding','0','important');c.style.setProperty('margin','0','important');try{var cs=getComputedStyle(c);if(cs.position==='absolute'||cs.position==='fixed'){c.style.setProperty('top','0','important');c.style.setProperty('left','0','important');c.style.setProperty('bottom','auto','important');c.style.setProperty('right','auto','important');}}catch(e){}}c=c.parentElement||(c.getRootNode&&c.getRootNode().host)||null;}v.style.setProperty('object-fit','contain','important');}var a=t.parentElement;while(a&&a!==document.documentElement){a.classList.add('ftv-anc');[].forEach.call(a.children,function(c){if(c!==t&&!c.contains(t)&&!c.classList.contains('ftv-anc'))c.classList.add('ftv-hide');});a=a.parentElement;}window.scrollTo(0,0);if(v){v.style.objectFit='contain';if(v.paused){try{v.play();}catch(e){}}}return 'filled';}catch(e){return 'err '+e;}})()";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        cover = new android.widget.TextView(this);
        cover.setBackgroundColor(Color.BLACK);
        cover.setTextColor(0xFFC3CCE4);
        cover.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 22);
        cover.setGravity(android.view.Gravity.CENTER);
        String what = getIntent().getStringExtra("title");
        cover.setText("Loading " + (what == null || what.isEmpty() ? "BBC iPlayer" : what) + "…");
        root.addView(cover, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(false);
        s.setLoadWithOverviewMode(false);
        web.setInitialScale(0);
        s.setUserAgentString("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView v, String url, android.graphics.Bitmap icon) {
                // keep the page hidden while the player is set up; show other pages (sign-in, TV licence) straight away
                ui.removeCallbacks(reveal);
                if (isPlayer(url)) { cover.setVisibility(View.VISIBLE); ui.postDelayed(reveal, 15000); } else cover.setVisibility(View.GONE);
            }
            @Override public void onPageFinished(WebView v, String url) {
                if (!isPlayer(url)) cover.setVisibility(View.GONE); tries = 0; ui.removeCallbacks(fill); ui.postDelayed(fill, 1500); CookieManager.getInstance().flush(); }
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
            web.evaluateJavascript(FILL, r -> {
                boolean ok = r != null && r.contains("filled");
                if (ok && cover.getVisibility() == View.VISIBLE) ui.postDelayed(reveal, 600);   // a moment for the new size to settle
                if (tries++ < 20) ui.postDelayed(fill, ok ? 4000 : 800);
            });
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
