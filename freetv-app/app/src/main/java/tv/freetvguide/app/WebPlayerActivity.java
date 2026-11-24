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
    private CursorView cursor;
    /** The pointer is used whenever the page itself is showing (not the loading screen or full-screen video). */
    private boolean pointerOn() { return cursor != null && !watching() && cover.getVisibility() != View.VISIBLE; }
    private boolean pageFull = false;
    private volatile boolean skyPage = false, adPage = false;
    private volatile int adHits = 0;
    volatile int pieces = 0, retries = 0;
    // ---- Sky video pieces: Free TV fetches them itself – a second copy if one is slow, and the next two ahead of time
    private static final class Piece { int code; String type, reason; java.util.Map<String, String> hdrs; byte[] body; }
    private final java.util.concurrent.ExecutorService netPool = java.util.concurrent.Executors.newCachedThreadPool();   // grows as needed, so waiting downloads never block each other
    private final java.util.Map<String, java.util.concurrent.Future<Piece>> ahead = java.util.Collections.synchronizedMap(new java.util.LinkedHashMap<String, java.util.concurrent.Future<Piece>>() {
        @Override protected boolean removeEldestEntry(java.util.Map.Entry<String, java.util.concurrent.Future<Piece>> e) { return size() > 16; }
    });
    private final java.util.Map<String, Long> lastNum = new java.util.concurrent.ConcurrentHashMap<>(), pieceStep = new java.util.concurrent.ConcurrentHashMap<>();
    private static final java.util.regex.Pattern NUM = java.util.regex.Pattern.compile("^(.*[/\\-_=])(\\d{3,})([^/]*)$");

    private Piece download(String url, java.util.Map<String, String> reqHdrs, int readMs) throws Exception {
        java.net.HttpURLConnection c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
        try {
            c.setConnectTimeout(3000); c.setReadTimeout(readMs); c.setInstanceFollowRedirects(true);
            for (java.util.Map.Entry<String, String> e : reqHdrs.entrySet()) {
                if (e.getKey() == null || e.getKey().equalsIgnoreCase("Accept-Encoding") || e.getKey().equalsIgnoreCase("Range")) continue;
                c.setRequestProperty(e.getKey(), e.getValue());
            }
            String ck = CookieManager.getInstance().getCookie(url);
            if (ck != null && !ck.isEmpty()) c.setRequestProperty("Cookie", ck);
            Piece p = new Piece();
            p.code = c.getResponseCode();
            if (p.code >= 500) throw new java.io.IOException("server " + p.code);
            java.io.InputStream in = p.code >= 400 ? c.getErrorStream() : c.getInputStream();
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream(Math.max(64 * 1024, c.getContentLength()));
            byte[] buf = new byte[64 * 1024]; int n;
            while (in != null && (n = in.read(buf)) > 0) out.write(buf, 0, n);
            if (in != null) in.close();
            p.body = out.toByteArray();
            p.hdrs = new java.util.HashMap<>();
            for (java.util.Map.Entry<String, java.util.List<String>> e : c.getHeaderFields().entrySet()) {
                if (e.getKey() == null || e.getValue() == null || e.getValue().isEmpty()) continue;
                String k = e.getKey();
                if (k.equalsIgnoreCase("Content-Encoding") || k.equalsIgnoreCase("Transfer-Encoding") || k.equalsIgnoreCase("Content-Length")) continue;
                p.hdrs.put(k, e.getValue().get(0));
            }
            p.type = c.getContentType() == null ? "application/octet-stream" : c.getContentType().split(";")[0];
            p.reason = c.getResponseMessage() == null || c.getResponseMessage().isEmpty() ? "OK" : c.getResponseMessage();
            return p;
        } finally { c.disconnect(); }
    }

    /** One piece, as quickly as possible: a second download starts if the first is slow (2.5 s); up to 3 rounds. */
    private Piece fast(String url, java.util.Map<String, String> reqHdrs) {
        for (int round = 0; round < 3; round++) {
            java.util.concurrent.ExecutorCompletionService<Piece> cs = new java.util.concurrent.ExecutorCompletionService<>(netPool);
            int running = 1;
            cs.submit(() -> download(url, reqHdrs, 6000));
            long until = android.os.SystemClock.uptimeMillis() + 9000;
            try {
                java.util.concurrent.Future<Piece> f = cs.poll(2500, java.util.concurrent.TimeUnit.MILLISECONDS);
                if (f == null) { cs.submit(() -> download(url, reqHdrs, 6000)); running++; retries++; }
                while (running > 0) {
                    if (f == null) f = cs.poll(Math.max(1, until - android.os.SystemClock.uptimeMillis()), java.util.concurrent.TimeUnit.MILLISECONDS);
                    if (f == null) break;
                    running--;
                    try { Piece p = f.get(); if (p != null) return p; } catch (Exception ignored) { }
                    f = null;
                }
            } catch (InterruptedException e) { return null; }
            retries++;
        }
        return null;
    }

    private android.webkit.WebResourceResponse fetchPiece(android.webkit.WebResourceRequest req) {
        final String url = req.getUrl().toString();
        final java.util.Map<String, String> hdrs = new java.util.HashMap<>(req.getRequestHeaders());
        Piece p = null;
        java.util.concurrent.Future<Piece> pre = ahead.remove(url);
        if (pre != null) { try { p = pre.get(9, java.util.concurrent.TimeUnit.SECONDS); if (p != null) aheadHits++; } catch (Exception ignored) { } }
        if (p == null) p = fast(url, hdrs);
        if (p == null || p.code >= 400) return null;   // let the page deal with it as usual
        pieces++;
        // fetch the next two pieces of this stream ahead of time (piece names count up by a steady amount)
        try {
            String path = req.getUrl().getPath(), q = req.getUrl().getEncodedQuery();
            java.util.regex.Matcher m = NUM.matcher(path == null ? "" : path);
            if (m.matches()) {
                String key = m.group(1) + "#" + m.group(3);
                long num = Long.parseLong(m.group(2));
                Long prev = lastNum.put(key, num);
                if (prev != null && num > prev && num - prev < 1_000_000_000L) pieceStep.put(key, num - prev);
                Long st = pieceStep.get(key);
                if (st != null) for (int k = 1; k <= 2; k++) {
                    String nextPath = m.group(1) + (num + k * st) + m.group(3);
                    String nextUrl = req.getUrl().getScheme() + "://" + req.getUrl().getEncodedAuthority() + nextPath + (q == null ? "" : "?" + q);
                    if (!ahead.containsKey(nextUrl)) ahead.put(nextUrl, netPool.submit(() -> { try { return fast(nextUrl, hdrs); } catch (Exception e) { return null; } }));
                }
            }
        } catch (Exception ignored) { }
        java.util.Map<String, String> out = new java.util.HashMap<>();
        for (java.util.Map.Entry<String, String> e : p.hdrs.entrySet()) if (!e.getKey().toLowerCase().startsWith("access-control-")) out.put(e.getKey(), e.getValue());
        // always name the page's own site (never "*"): Sky's player may ask with its sign-in attached, and then "*" is refused
        String origin = req.getRequestHeaders().get("Origin");
        if (origin == null || origin.isEmpty() || "null".equals(origin)) origin = "https://www.skysports.com";
        out.put("Access-Control-Allow-Origin", origin);
        out.put("Access-Control-Allow-Credentials", "true");
        out.put("Access-Control-Expose-Headers", "Content-Length, Content-Range, Date, Age, Last-Modified, ETag");
        out.put("Vary", "Origin");
        return new android.webkit.WebResourceResponse(p.type, null, p.code, p.reason, out, new java.io.ByteArrayInputStream(p.body));
    }
    volatile int aheadHits = 0;   // Sky's page player stretched to fill the screen (instead of TV full screen)
    private boolean watching() { return custom != null || pageFull; }
    private android.content.SharedPreferences prefs() { return getSharedPreferences("player", MODE_PRIVATE); }
    /** Opened from a "Sign in" tile: show every page as it is (no loading screen, no player tricks). */
    private boolean signIn() { String t = getIntent().getStringExtra("title"); return t != null && t.toLowerCase().endsWith("sign in"); }
    private boolean onSky() { if (signIn()) return false; String u = web == null ? null : web.getUrl(); return u != null && u.contains("skysports.com"); }
    private boolean pageMode() { return onSky() && prefs().getBoolean("skypage", true); }
    private void showCursor() { if (cursor != null) { cursor.setVisibility(pointerOn() ? View.VISIBLE : View.GONE); cursor.bringToFront(); cursor.invalidate(); } }
    private boolean userPaused = false;
    // No sound until the picture shows: while the loading screen is up, every video/audio on the page is muted; when it goes, only the ones Free TV muted are turned back on
    private boolean hushOn = false;
    private static final String DEEP_MEDIA = "function deep(r,d,o){if(!r||d>8)return o;var a=r.querySelectorAll?r.querySelectorAll('video,audio'):[];for(var i=0;i<a.length;i++)o.push(a[i]);" +
        "var all=r.querySelectorAll?r.querySelectorAll('*'):[];for(var j=0;j<all.length;j++)if(all[j].shadowRoot)deep(all[j].shadowRoot,d+1,o);return o;}";
    private final Runnable hush = new Runnable() { @Override public void run() {
        if (web == null) return;
        boolean up = cover != null && cover.getVisibility() == View.VISIBLE;
        if (!up && !hushOn) { ui.postDelayed(this, 500); return; }
        if (up) web.evaluateJavascript("(function(){" + DEEP_MEDIA + "var m=deep(document,0,[]);for(var i=0;i<m.length;i++){if(!m[i].muted){m[i].muted=true;m[i].__ftvHushed=1;}}})()", null);
        else if (hushOn) web.evaluateJavascript("(function(){" + DEEP_MEDIA + "var m=deep(document,0,[]);for(var i=0;i<m.length;i++){if(m[i].__ftvHushed&&!m[i].__ftvAd){m[i].muted=false;m[i].__ftvHushed=0;}}})()", null);
        hushOn = up;
        ui.postDelayed(this, 500);
    } };
    private final Runnable keepPlaying = new Runnable() { @Override public void run() {
        if (web == null) return;
        // ITVX / Prime with "Adverts" switched off: adverts are short separate videos – mute them and run them at 16x so they're over in seconds
        String cu = web.getUrl();
        if ((autoSite(cu) || (cu != null && cu.contains("amazon.co.uk"))) && prefs().getBoolean("webNoAds", false))
            web.evaluateJavascript("(function(){var n=0;function all(r,o){o=o||[];[].push.apply(o,[].slice.call(r.querySelectorAll('video')));[].forEach.call(r.querySelectorAll('*'),function(e){if(e.shadowRoot)all(e.shadowRoot,o);});return o;}" +
                "all(document).forEach(function(v){var d=v.duration;if(isFinite(d)&&d>0&&d<=240&&!v.paused){if(!v.__ftvAd){v.__ftvAd={m:v.__ftvHushed?false:v.muted};}v.muted=true;try{v.playbackRate=16;}catch(e){}n++;}else if(v.__ftvAd&&isFinite(d)&&d>240){v.muted=v.__ftvAd.m;v.playbackRate=1;v.__ftvAd=null;}});return n;})()", r -> {
                    if (r != null && !r.equals("0") && cover.getVisibility() == View.VISIBLE && autoMode) cover.setText("Skipping adverts – " + getIntent().getStringExtra("title") + " starts in a moment…");
                });
        if (!userPaused && find == null) web.evaluateJavascript("(function(){function deep(r,d){if(!r||d>8)return null;var v=r.querySelector&&r.querySelector('video');if(v)return v;var a=r.querySelectorAll?r.querySelectorAll('*'):[];" +
            "for(var i=0;i<a.length;i++){if(a[i].shadowRoot){var f=deep(a[i].shadowRoot,d+1);if(f)return f;}}return null;}var v=deep(document,0);if(!v)return '';" +
            // watch the picture: restart it the moment the site pauses it, and note buffering, so we can tell which is happening
            "if(!v.__ftvW){v.__ftvW=1;window.__ftvLog=window.__ftvLog||[];v.addEventListener('pause',function(){if(window.__ftvUserPaused||v.ended||!/bbc\\.co\\.uk/.test(location.host))return;window.__ftvLog.push('paused');setTimeout(function(){if(v.paused&&!window.__ftvUserPaused)v.play();},150);});" +
            "v.addEventListener('waiting',function(){window.__ftvLog.push('buffering');if(!v.__ftvWait)v.__ftvWait=Date.now();});v.addEventListener('stalled',function(){window.__ftvLog.push('buffering');});v.addEventListener('playing',function(){v.__ftvWait=0;});}" +
            // Sky: waiting although the video is already here (a tiny hole in it, or the decoder stuck) → jump over the hole or nudge it on, instead of sitting on "Buffering"
            "var tfr=v.getVideoPlaybackQuality?v.getVideoPlaybackQuality().totalVideoFrames:-1;if(v.paused||tfr!==v.__ftvF){if(!v.paused&&v.__ftvF>=0&&tfr>v.__ftvF)v.__ftvWait=0;v.__ftvF=tfr;v.__ftvFs=0;}else if(!v.__ftvFs){v.__ftvFs=Date.now();}" +
            "if(/skysports/.test(location.host)&&!window.__ftvUserPaused&&!v.paused&&v.__ftvFs&&Date.now()-v.__ftvFs>1500&&!v.__ftvWait)v.__ftvWait=v.__ftvFs;" +
            "if(/skysports/.test(location.host)&&!window.__ftvUserPaused&&!v.paused&&v.__ftvWait&&Date.now()-v.__ftvWait>1200){v.__ftvFs=0;var ct=v.currentTime,inside=false,nx=-1;for(var g=0;g<v.buffered.length;g++){var bs=v.buffered.start(g),be=v.buffered.end(g);if(bs<=ct+0.02&&be>ct+0.5)inside=true;else if(bs>ct&&(nx<0||bs<nx))nx=bs;}" +
            "if(!inside&&nx>0&&nx-ct<6){v.currentTime=nx+0.1;window.__ftvUnstuck=(window.__ftvUnstuck||0)+1;}else if(inside){v.currentTime=ct+0.2;window.__ftvUnstuck=(window.__ftvUnstuck||0)+1;}v.__ftvWait=Date.now();}" +
            "if(v.paused&&!v.ended&&v.currentTime>1&&/bbc\\.co\\.uk/.test(location.host)){v.play();window.__ftvLog=(window.__ftvLog||[]);window.__ftvLog.push('paused');}" +
            "if(/skysports/.test(location.host)&&!window.__ftvUserPaused&&v.seekable&&v.seekable.length){var end=v.seekable.end(v.seekable.length-1);if(end-v.currentTime>40&&end-v.currentTime<7200&&!window.__ftvJump&&v.currentTime>0){window.__ftvJump=Date.now();" +
            "try{localStorage.removeItem('timeToLiveEdgeInMs');}catch(e){}v.currentTime=end-15;window.__ftvLog=(window.__ftvLog||[]);window.__ftvLog.push('caughtup');}}" +
            "var b=0;for(var i=0;i<v.buffered.length;i++)if(v.buffered.start(i)<=v.currentTime+0.5&&v.buffered.end(i)>v.currentTime)b=v.buffered.end(i)-v.currentTime;" +
            "var q=v.getVideoPlaybackQuality?v.getVideoPlaybackQuality():{};var N=window.__ftvNet||{};var sp=N.ms?Math.round(N.kb*8/N.ms*10)/10:0;" +
            "var bl=v.seekable&&v.seekable.length?Math.round(v.seekable.end(v.seekable.length-1)-v.currentTime):-1;window.__ftvStat=(bl>=0?'behind live '+bl+'s · ':'')+'ahead '+b.toFixed(1)+'s · '+v.videoHeight+'p'+(window.__ftvQs?' (Sky offers '+window.__ftvQs+')':'')+' · net '+sp+' Mb/s · got '+(N.ok||0)+' failed '+(N.bad||0)+(N.bad?' '+JSON.stringify(N.codes)+' last: '+String(N.last).slice(-40):'')+' · dropped '+(q.droppedVideoFrames||0)+'/'+(q.totalVideoFrames||0)+(window.__ftvCapped?' · capped':'')+' · '+(v.paused?'paused':'playing')+(window.__ftvUnstuck?' · unstuck '+window.__ftvUnstuck:'');" +
            "if(/skysports/.test(location.host)&&document.querySelector('[data-is-behind-live=\\'true\\']'))(window.__ftvLog=window.__ftvLog||[]).push('behind');" +
            "var sb=false;if(/skysports/.test(location.host)){try{var roots=[],rn=v.getRootNode?v.getRootNode():document,hops=0;while(rn&&hops++<4){roots.push(rn);if(rn===document||!rn.host)break;rn=rn.host.getRootNode?rn.host.getRootNode():document;}" +
            // Sky's own "Buffering…" message on the player: if it's showing, it's buffering, whatever the clock says
            "roots.forEach(function(R){if(sb)return;var es=R.querySelectorAll?R.querySelectorAll('*'):[];for(var e=0;e<es.length&&e<4000;e++){var x=es[e];if(x.childElementCount===0&&/^\\s*Buffering/i.test(x.textContent||'')){var bx=x.getBoundingClientRect();if(bx.width>0&&bx.height>0){var cs=getComputedStyle(x);if(cs.visibility!=='hidden'&&cs.display!=='none'&&cs.opacity!=='0'){sb=true;break;}}}}});}catch(e){}}" +
            "var L=(window.__ftvLog||[]).concat(['F'+tfr]).concat(sb?['skybuf']:[]).join(',');window.__ftvLog=[];return L+'|'+window.__ftvStat+'|'+(isFinite(v.duration)?Math.round(v.duration):0)+'|'+v.currentTime.toFixed(2)+'|'+(v.paused?1:0);})()", r -> {
                if (r == null) return;
                int bar = r.indexOf('|');
                if (bar > 0 && stats != null) { String st = r.substring(bar + 1).replace("\"", ""); int b2 = st.indexOf('|'); if (b2 >= 0) st = st.substring(0, b2);   // (length, position and paused follow)
                    if (onSky()) st += " · pieces by Free TV " + pieces + " (ready early " + aheadHits + ", second copies " + retries + ")" + " · advert requests " + adHits + (prefs().getBoolean("skyNoAds", true) ? " (blocked)" : ""); stats.setText(st); stats.setVisibility(watching() && showStats ? View.VISIBLE : View.GONE); if (watching()) stats.bringToFront(); }
                if (r.contains("capped")) { android.widget.Toast.makeText(WebPlayerActivity.this, "Smoother picture on (top quality skipped)", android.widget.Toast.LENGTH_SHORT).show(); }
                long now2 = android.os.SystemClock.uptimeMillis();
                if (!watching() && !autoFilled) {
                    String u0 = web.getUrl();
                    if (autoSite(u0)) {
                        String[] pp = r.replace("\"", "").split("\\|");
                        // a short video playing behind the loading screen is an advert break
                        try { if (autoMode && cover.getVisibility() == View.VISIBLE && pp.length >= 3 && Double.parseDouble(pp[pp.length - 3]) > 0 && Double.parseDouble(pp[pp.length - 3]) <= 240 && "0".equals(pp[pp.length - 1].trim()))
                            cover.setText("Adverts playing – " + getIntent().getStringExtra("title") + " starts after them…"); } catch (Exception ignored) { }
                        // a programme (over 4 minutes long, playing) – not a trailer or preview on the page
                        try { if (pp.length >= 3 && Double.parseDouble(pp[pp.length - 3]) > 240 && Double.parseDouble(pp[pp.length - 2]) > 1.5 && "0".equals(pp[pp.length - 1].trim())) {
                            autoFilled = true; fsTries = 0; tries = 0; web.evaluateJavascript("window.__ftvFillOK=1", null); ui.postDelayed(fill, 200); } } catch (Exception ignored) { }
                    }
                }
                // Sky: if the picture has stood still for 5 seconds (and you didn't pause it), restart at live – that's what fixes it
                if (onSky() && watching()) {
                    String[] parts = r.replace("\"", "").split("\\|");
                    double ct = -1; boolean paused = false;
                    try { ct = Double.parseDouble(parts[parts.length - 2]); paused = "1".equals(parts[parts.length - 1].trim()); } catch (Exception ignored) { }
                    if (ct > 0 && !userPaused && Math.abs(ct - lastCt) < 0.3) stillSecs++; else stillSecs = 0;
                    if (ct >= 0) lastCt = ct;
                    if (stillSecs >= 5 && now2 - lastLiveReload > 15000) {
                        stillSecs = 0; lastLiveReload = now2;
                        applyQuality(); String tt = getIntent().getStringExtra("title"); cover.setText("Loading " + (tt == null ? "" : tt) + "…");
                        return;
                    }
                }
                if (r.contains("buffering")) lastBuffer = now2;
                // Sky: buffered twice within 2 minutes (not paused by you) → restart the channel at live, like changing a setting does
                // buffering = the picture has stopped although nobody paused it (Sky only says "buffering" once, when it starts)
                double sct = -1; boolean spz = false;
                try { String[] sp = r.replace("\"", "").split("\\|"); sct = Double.parseDouble(sp[sp.length - 2]); spz = "1".equals(sp[sp.length - 1].trim()); } catch (Exception ignored) { }
                long fr = -1;
                try { java.util.regex.Matcher fm = java.util.regex.Pattern.compile("(?:^|,)F(\\d+)").matcher(r); if (fm.find()) fr = Long.parseLong(fm.group(1)); } catch (Exception ignored) { }
                // stopped = the clock isn't moving, or the picture isn't (Sky can keep the clock and sound going on a frozen picture)
                boolean bufNow = !userPaused && (r.contains("skybuf") || (sct > 0 && !spz && ((stallCt >= 0 && Math.abs(sct - stallCt) < 0.3) || (fr >= 0 && fr == stallFr))));
                if (sct >= 0) stallCt = sct;
                stallFr = fr;
                // the start-up wait is over (shown or not): from now on watch for buffering, even if it never settled
                if (onSky() && !skySettled && now2 > skyGateUntil + 1000) skySettled = true;
                if (onSky() && skySettled && watching() && !userPaused) {
                    // 3 separate buffers within 90 seconds, or one lasting 6 seconds → restart at live
                    if (bufNow && !wasBuffering) { bufStarts.add(now2); }
                    while (!bufStarts.isEmpty() && now2 - bufStarts.peekFirst() > 90000) bufStarts.pollFirst();
                    stallRun = bufNow ? stallRun + 1 : 0;
                    if ((bufStarts.size() >= 3 || stallRun >= 6) && prefs().getBoolean("skyAutoRestart", true) && now2 - lastLiveReload > 15000) {
                        lastLiveReload = now2; wasBuffering = false; bufStarts.clear(); stallRun = 0; stallCt = -1; stallFr = -2;
                        applyQuality(); String tt = getIntent().getStringExtra("title"); cover.setText("Buffering – restarting " + (tt == null ? "" : tt) + "…");
                        return;
                    }
                }
                wasBuffering = bufNow;
                // starting a Sky channel: behind the loading screen, wait for it to be at live and moving; if it starts behind, restart it (up to twice)
                if (onSky() && !skySettled && android.os.SystemClock.uptimeMillis() - switchedAt < 5000) { settleTicks = 0; settleCt = -1; return; }
                if (onSky() && !skySettled) {
                    String[] q = r.replace("\"", "").split("\\|");
                    double ct2 = -1; boolean pz = true;
                    try { ct2 = Double.parseDouble(q[q.length - 2]); pz = "1".equals(q[q.length - 1].trim()); } catch (Exception ignored) { }
                    // Sky's own "behind live" marker can't be trusted (it says so even at live), so go by the picture actually moving
                    boolean moving = ct2 > 0 && !pz && ct2 - settleCt > 0.5;
                    settleCt = ct2;
                    settleTicks = moving ? settleTicks + 1 : 0;
                    // Sky's first start often lands on old video and buffers; a second start (what a settings change does) is smooth – so do it once, behind the loading screen
                    boolean fresh = prefs().getBoolean("skyFresh", true) && startReloads == 0;
                    boolean slow = android.os.SystemClock.uptimeMillis() > skyGateUntil - 8000;   // 12 s and still not moving
                    if (fresh && (settleTicks >= 2 || slow)) {
                        startReloads = 1; settleTicks = 0; settleCt = -1;
                        applyQuality(); String tt = getIntent().getStringExtra("title"); cover.setText("Loading " + (tt == null ? "" : tt) + "…");
                        return;
                    }
                    if (settleTicks >= 2) { skySettled = true; reveal.run(); }
                    return;
                }
                // Sky says it's behind live after buffering (and you didn't pause it): restart the channel at live, like a quality change does
                if (r.contains("behind") && !userPaused && now2 - lastToggle > 300000 && now2 - lastBuffer < 120000) behindSecs++; else if (!r.contains("behind")) behindSecs = 0;
                if (false && behindSecs >= 5 && lastLiveReload == 0 && now2 - openedAt < 90000) {   // replaced by the start-up wait above
                    behindSecs = 0; lastLiveReload = now2;
                    applyQuality(); cover.setText("Catching up to live…");
                    return;
                }
                if (r.contains("caughtup")) { lastNote = 0; note("Fell behind live – catching up"); }
                else if (r.contains("paused")) note("Sky paused it – restarting");
                else if (r.contains("buffering")) note("Buffering…");
            });
        ui.postDelayed(this, 1000);
    } };
    private boolean showStats = false;
    private android.widget.TextView stats;   // playback figures in the corner (to work out the buffering)
    private long lastNote = 0, lastBuffer = 0, lastLiveReload = 0;
    private int behindSecs = 0, stillSecs = 0;
    private double settleCt = -1;
    private boolean autoFilled = false;
    private double lastCt = -1;
    private final long openedAt = android.os.SystemClock.uptimeMillis();
    private void note(String m) {
        long t = android.os.SystemClock.uptimeMillis();
        if (t - lastNote < 4000 || !watching()) return;
        lastNote = t;
        android.widget.Toast.makeText(this, m, android.widget.Toast.LENGTH_SHORT).show();
    }
    private static final int[] QS = {0, 1080, 720, 540, 360};
    // ITVX / Prime: do the clicks their apps do for you – pick the title from the search results, then press Play
    private static final String AUTOPLAY = "(function(T,S,E){try{function n(s){return String(s||'').toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]/g,'');}" +
        "function vis(e){var r=e.getBoundingClientRect();return r.width>8&&r.height>8;}var want=n(T),h=location.host+location.pathname;" +
        "if([].some.call(document.querySelectorAll('video'),function(v){return !v.paused&&v.currentTime>1&&isFinite(v.duration)&&v.duration>240;}))return 'playing';" +
        "if(/signin|sign-in|\\/ap\\/|login|account\\/(create|register)/i.test(location.href)||[].some.call(document.querySelectorAll('input[type=password],input[type=email]'),vis))return 'login';" +
        "var bad=/ad-?free|premium|subscribe|sign ?in|sign ?up|trial|buy|rent|channels|trailer|add to|watchlist|download|share|more like|parental|turn on|settings|set up|pin/i;" +
        "function lab(e){return ((e.getAttribute('aria-label')||'')+' '+(e.innerText||e.textContent||'')).trim();}" +
        "if(/primevideo|amazon|disneyplus/.test(h)&&/\\/search/.test(h)){var links=[].slice.call(document.querySelectorAll('a[href*=\"/detail/\"],a[href*=\"/browse/entity\"],a[href*=\"/movies/\"],a[href*=\"/series/\"]')).filter(vis);" +
        "function tt(a){return n(a.getAttribute('aria-label')||(a.querySelector('img')?a.querySelector('img').alt:'')||a.innerText);}" +
        "var hit=links.filter(function(a){return want&&tt(a)===want;})[0]||links.filter(function(a){return want&&tt(a).indexOf(want)===0;})[0]||links.filter(function(a){return want&&tt(a).indexOf(want)>=0;})[0];if(hit){hit.click();return 'picked';}return 'looking';}" +
        "var ok=[].slice.call(document.querySelectorAll('[role=dialog] button,[role=dialog] a,[class*=odal] button,[class*=ialog] button,[class*=uidance] button,button')).filter(vis).filter(function(b){var l=lab(b);return l.length<40&&!bad.test(l)&&/^(continue( watching)?|i understand|i'?m (over|aged)|i am (over|aged)|yes|confirm|accept|ok|got it|watch anyway|proceed)\\b/i.test(l);})[0];" +
        "if(ok){ok.click();return 'play';}if(S)return 'series';" +
        // an episode chosen in Free TV: pick the series/season, then the episode (by number or title), then Play as usual
        "if(E&&!window.__ftvEpDone){var ew=window.__ftvEpW=(window.__ftvEpW||0)+1;var all=[].slice.call(document.querySelectorAll('a,button,[role=tab],[role=button],[role=option],li,h3,h4,span,div')).filter(vis);" +
        "var sre=new RegExp('^(series|season|s)\\\\s*0*'+E.s+'$','i');var sb=all.filter(function(b){var l=(b.innerText||b.textContent||'').trim();return l.length<20&&sre.test(l);})[0];" +
        "if(sb&&!window.__ftvSeason){window.__ftvSeason=1;(sb.closest('a,button,[role=tab],[role=option]')||sb).click();return 'season';}" +
        "var sel=[].slice.call(document.querySelectorAll('select')).filter(function(x){return [].some.call(x.options,function(o){return sre.test(o.text.trim());});})[0];" +
        "if(sel&&!window.__ftvSeason){window.__ftvSeason=1;[].forEach.call(sel.options,function(o){if(sre.test(o.text.trim()))sel.value=o.value;});sel.dispatchEvent(new Event('change',{bubbles:true}));return 'season';}" +
        "var et=n(E.t),ere=new RegExp('(^|[^0-9a-z])(episode|ep\\\\.?|e)\\\\s*0*'+E.e+'([^0-9]|$)','i'),ese=new RegExp('s\\\\s*0*'+E.s+'\\\\s*[:.]?\\\\s*e\\\\s*0*'+E.e+'([^0-9]|$)','i');" +
        "var cands=all.filter(function(b){var l=(b.getAttribute('aria-label')||'')+' '+(b.innerText||b.textContent||'');return l.length<400&&(ese.test(l)||(et.length>3&&n(l).indexOf(et)>=0)||ere.test(l));});" +
        "cands.sort(function(a,b){return (a.innerText||'').length-(b.innerText||'').length;});var hit=cands[0];" +
        "if(hit){window.__ftvEpDone=1;var c=hit.closest('a')||hit.querySelector('a,button')||hit.closest('button,[role=button]')||hit;" +
        "var pl=(c.parentElement||c).querySelector('[aria-label*=Play i],[data-automation-id*=play i],button');if(pl&&pl!==c&&/play/i.test(lab(pl)))pl.click();else c.click();return 'episode';}" +
        "if(ew>12)return 'noep';return 'looking';}" +
        "var btns=[].slice.call(document.querySelectorAll('button,a,[role=button]')).filter(vis).filter(function(b){var l=lab(b);return l.length<40&&!bad.test(l)&&/^(play|watch|resume|continue|start|watch now|play now|watch from (the )?start|play (movie|episode|film|s\\d)|watch (movie|episode|film|s\\d))/i.test(l);});" +
        "var pb=btns.filter(function(b){return /play/i.test(lab(b));})[0]||btns[0]||document.querySelector('[data-automation-id*=play-button],[data-testid*=play],[class*=PlayButton],[class*=play-button]');" +
        "if(pb&&vis(pb)){pb.click();return 'play';}return 'looking';}catch(e){return 'err';}})";
    private int apTries = 0;
    /** The episode chosen in Free TV ({s, e, t}), or null. */
    private String episodeJson() {
        String u = getIntent().getStringExtra("url");
        int i = u == null ? -1 : u.indexOf("#ftv-ep=");
        if (i < 0) return "null";
        try { return new org.json.JSONObject(android.net.Uri.decode(u.substring(i + 8))).toString(); } catch (Exception e) { return "null"; }
    }
    private boolean series() { String u = getIntent().getStringExtra("url"); return u != null && u.contains("#ftv-series"); }
    private boolean autoMode = true;   // Free TV is doing the clicks behind the loading screen
    private static boolean autoSite(String u) { return u != null && (u.contains("itv.com") || u.contains("primevideo.com") || u.contains("amazon.co.uk/gp/video") || u.contains("disneyplus.com")); }
    private void autoGiveUp(String why) {
        autoMode = false; reveal.run();
        if (why != null) android.widget.Toast.makeText(this, why, android.widget.Toast.LENGTH_LONG).show();
    }
    private final Runnable autoplay = new Runnable() { @Override public void run() {
        if (web == null || watching() || autoFilled) return;
        String u = web.getUrl() == null ? "" : web.getUrl();
        if (!autoSite(u)) return;
        String want = getIntent().getStringExtra("title");
        web.evaluateJavascript(AUTOPLAY + "(" + org.json.JSONObject.quote(want == null ? "" : want) + "," + series() + "," + episodeJson() + ")", r -> {
            if (r != null && r.contains("noep")) { autoGiveUp("Couldn't find that episode on the page – pick it with the pointer"); return; }
            if (r != null && (r.contains("season") || r.contains("episode"))) { if (++apTries < 30) ui.postDelayed(autoplay, 2500); return; }
            if (r != null && r.contains("series")) { if (cover.getVisibility() == View.VISIBLE) autoGiveUp("Pick an episode – it goes full screen when it starts"); if (++apTries < 60) ui.postDelayed(autoplay, 3000); return; }
            boolean clicked = r != null && (r.contains("play") || r.contains("picked"));
            if (r != null && r.contains("playing")) return;
            if (r != null && r.contains("login")) { autoGiveUp("Sign in once with the pointer – after that Free TV starts things for you"); return; }
            if (++apTries < 30) ui.postDelayed(autoplay, clicked ? 3500 : 1500);
            else autoGiveUp("Couldn't start it by itself – pick it with the pointer");
        });
    } };
    private boolean onDemandSite() { String u = web == null ? null : web.getUrl(); return autoSite(u) || (u != null && u.contains("amazon.co.uk")); }
    private android.widget.Toast seekToast;
    /** Jump through the programme (the longest video on the page is the programme). */
    private void seekBy(int secs) {
        web.evaluateJavascript("(function(s){var best=null;function all(r,o){o=o||[];[].push.apply(o,[].slice.call(r.querySelectorAll('video')));[].forEach.call(r.querySelectorAll('*'),function(e){if(e.shadowRoot)all(e.shadowRoot,o);});return o;}" +
            "all(document).forEach(function(v){if(isFinite(v.duration)&&v.duration>240&&(!best||v.duration>best.duration))best=v;});if(!best)return '';" +
            "var t=Math.max(0,Math.min(best.duration-2,best.currentTime+s));best.currentTime=t;if(best.paused&&!window.__ftvUserPaused)best.play();" +
            "function f(x){x=Math.floor(x);var h=Math.floor(x/3600),m=Math.floor(x%3600/60),c=x%60;return (h?h+':'+('0'+m).slice(-2):m)+':'+('0'+c).slice(-2);}return f(t)+' / '+f(best.duration);})(" + secs + ")", r -> {
            String t = r == null ? "" : r.replace("\"", "");
            if (t.isEmpty()) return;
            if (seekToast != null) seekToast.cancel();
            seekToast = android.widget.Toast.makeText(this, (secs > 0 ? "▶▶ " : "◀◀ ") + t, android.widget.Toast.LENGTH_SHORT);
            seekToast.show();
        });
    }
    /** ▲ on ITVX / Prime: the adverts switch. */
    private void adMenu() {
        boolean noAds = prefs().getBoolean("webNoAds", false);
        new android.app.AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("Player")
            .setItems(new String[]{ "Adverts: " + (noAds ? "blocked – OK to allow (if the programme won't play)" : "allowed – OK to try blocking them") }, (d, w) -> {
                prefs().edit().putBoolean("webNoAds", !noAds).apply();
                android.widget.Toast.makeText(this, noAds ? "Adverts allowed – reloading" : "Trying to block adverts – reloading", android.widget.Toast.LENGTH_SHORT).show();
                if (custom != null) { root.removeView(custom); custom = null; }
                pageFull = false; autoFilled = false; web.reload();
            }).show();
    }
    private void qualityMenu() {
        web.evaluateJavascript("(function(){return window.__ftvQs||'';})()", r -> {
            String offers = r == null ? "" : r.replace("\"", "");
            int cur = quality();
            String[] names = new String[QS.length + 6];
            boolean autoR = prefs().getBoolean("skyAutoRestart", true);
            names[QS.length + 5] = "Auto restart: " + (autoR ? "on – restarts if it keeps buffering – OK to turn off" : "off – OK to restart when it keeps buffering");
            boolean freshOn = prefs().getBoolean("skyFresh", true);
            names[QS.length + 4] = "Fresh start: " + (freshOn ? "on – restarts each channel once as it opens – OK to turn off" : "off – OK to restart each channel once as it opens");
            for (int i = 0; i < QS.length; i++) names[i] = (QS[i] == cur ? "✓ " : "    ") + (QS[i] == 0 ? "Picture: Auto – Sky chooses" : "Picture: " + QS[i] + "p");
            boolean clock = prefs().getBoolean("skyclock", false), page = prefs().getBoolean("skypage", true);
            names[QS.length] = "Page clock: " + (clock ? "8 seconds behind (on) – OK for normal" : "normal – OK for 8 seconds behind");
            boolean noAds = prefs().getBoolean("skyNoAds", true);
            boolean net = prefs().getBoolean("skyNet", true);
            names[QS.length + 3] = "Video downloads: " + (net ? "Free TV (retries stalls) – OK for the browser's" : "the browser's – OK to let Free TV do them (retries stalls)");
            names[QS.length + 2] = "Adverts & promos: " + (noAds ? "blocked – OK to allow" : "allowed – OK to block (test)");
            names[QS.length + 1] = "Full screen: " + (page ? "stretch Sky's page player – OK for TV full screen" : "TV full screen – OK to stretch Sky's page player instead");
            new android.app.AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Sky Sports player" + (offers.isEmpty() ? "" : "  (Sky offers " + offers + ")"))
                .setItems(names, (d, which) -> {
                    if (which < QS.length) { if (QS[which] == quality()) return; prefs().edit().putInt("skyq", QS[which]).apply(); }
                    else if (which == QS.length) prefs().edit().putBoolean("skyclock", !clock).apply();
                    else if (which == QS.length + 1) prefs().edit().putBoolean("skypage", !page).apply();
                    else if (which == QS.length + 2) prefs().edit().putBoolean("skyNoAds", !noAds).apply();
                    else if (which == QS.length + 3) prefs().edit().putBoolean("skyNet", !net).apply();
                    else if (which == QS.length + 4) prefs().edit().putBoolean("skyFresh", !freshOn).apply();
                    else prefs().edit().putBoolean("skyAutoRestart", !autoR).apply();
                    applyQuality();
                })
                .show();
        });
    }
    // If a fixed picture quality won't start (Sky only allows some qualities on some devices), go back to Auto
    private int qChecks = 0;
    private final Runnable qualityWatch = new Runnable() { @Override public void run() {
        if (web == null || quality() == 0 || !onSky()) return;
        web.evaluateJavascript("(function(){function deep(r,d){if(!r||d>8)return null;var v=r.querySelector&&r.querySelector('video');if(v)return v;var a=r.querySelectorAll?r.querySelectorAll('*'):[];" +
            "for(var i=0;i<a.length;i++){if(a[i].shadowRoot){var f=deep(a[i].shadowRoot,d+1);if(f)return f;}}return null;}var v=deep(document,0);return v&&v.currentTime>2?'ok':'no';})()", r -> {
            if (r != null && r.contains("ok")) return;
            if (++qChecks < 12) { ui.postDelayed(this, 2500); return; }
            int q = quality();
            prefs().edit().putInt("skyq", 0).apply();
            android.widget.Toast.makeText(WebPlayerActivity.this, q + "p wouldn't start on this TV – back to Auto", android.widget.Toast.LENGTH_LONG).show();
            applyQuality();
        });
    } };
    /** Restart the channel with the new quality. */
    private void applyQuality() {
        try {
            if (startScript instanceof androidx.webkit.ScriptHandler) ((androidx.webkit.ScriptHandler) startScript).remove();
            if (androidx.webkit.WebViewFeature.isFeatureSupported(androidx.webkit.WebViewFeature.DOCUMENT_START_SCRIPT))
                startScript = androidx.webkit.WebViewCompat.addDocumentStartJavaScript(web, desktopJs(), java.util.Collections.singleton("*"));
        } catch (Throwable ignored) { }
        userPaused = false;
        cover.setText("Changing picture quality…");
        cover.setVisibility(View.VISIBLE);
        if (custom != null) { root.removeView(custom); custom = null; }
        pageFull = false; fsTries = 0; tries = 0; adHits = 0;
        if (onSky()) skyGate();
        String want = getIntent().getStringExtra("url");
        if (onSky() && want != null && want.contains("skysports.com")) web.loadUrl(want); else web.reload();
        qChecks = 0; ui.removeCallbacks(qualityWatch); ui.postDelayed(qualityWatch, 5000);
    }
    // Which Virgin channels are in your package: read from Virgin's own lists on the signed-in page, kept on this TV
    static final String OWNED = "(function(){if(window.__ftvOwned)return window.__ftvOwned;if(!window.__ftvOwnedGo){var R=performance.getEntriesByType('resource').map(function(e){return e.name;});" +
        "var eu=R.filter(function(n){return /purchase-service.*entitlements/.test(n);})[0],cu=R.filter(function(n){return /linear-service\\/v2\\/channels/.test(n);})[0];" +
        "if(eu&&cu){window.__ftvOwnedGo=1;Promise.all([fetch(eu,{credentials:'include'}).then(function(r){return r.json();}),fetch(cu).then(function(r){return r.json();})]).then(function(a){" +
        "var E=(a[0].entitlements||[]).map(function(e){return e.id;});var C=Array.isArray(a[1])?a[1]:(a[1].channels||[]);" +
        "var mine=C.filter(function(c){return (c.linearProducts||[]).some(function(p){return E.indexOf(p)>=0;});});" +
        "if(mine.length>20)window.__ftvOwned=JSON.stringify({ids:mine.map(function(c){return c.id;}),names:mine.map(function(c){return c.name;}),at:Date.now()});else window.__ftvOwnedGo=0;}).catch(function(){window.__ftvOwnedGo=0;});}}return '';})()";
    private int ownedTries = 0;
    private final Runnable ownedSync = new Runnable() { @Override public void run() {
        if (web == null) return;
        String u = web.getUrl();
        if (u == null || !u.contains("virgintvgo.virginmedia.com")) return;
        web.evaluateJavascript(OWNED, r -> {
            String v = null;
            try { Object o = new org.json.JSONTokener(r).nextValue(); if (o instanceof String && ((String) o).startsWith("{")) v = (String) o; } catch (Exception ignored) { }
            if (v != null) {
                prefs().edit().putString("owned", v).apply();
                if (getIntent().getBooleanExtra("sync", false)) {
                    android.widget.Toast.makeText(WebPlayerActivity.this, "Checked your Virgin channels – the guide now shows only the ones you have", android.widget.Toast.LENGTH_LONG).show();
                    finish();
                }
                return;
            }
            if (++ownedTries < 30) ui.postDelayed(ownedSync, 2000);
            else if (getIntent().getBooleanExtra("sync", false)) reveal.run();   // maybe you need to sign in: show the page
        });
    } };
    private int pinWaits = 0, startWaits = 0;
    /** Tap the saved PIN on Virgin's number pad (a dialog in the middle of the screen: 1-9 in a 3x3 grid, 0 below). */
    private void enterPin() {
        String pin = getSharedPreferences("player", MODE_PRIVATE).getString("vpin", "");
        if (pin.length() != 4 || web == null) return;
        float d = getResources().getDisplayMetrics().density, cx = web.getWidth() / 2f, cy = web.getHeight() / 2f;
        float[] col = {-129, 0, 129}, row = {43, 102, 159, 217};
        // clear anything already in the boxes (delete key, bottom right), then type each number with a pause
        for (int i = 0; i < 4; i++) ui.postDelayed(() -> tap(cx + col[2] * d, cy + row[3] * d), 200 + i * 350L);
        for (int i = 0; i < 4; i++) {
            int n = pin.charAt(i) - '0';
            float x = n == 0 ? cx : cx + col[(n - 1) % 3] * d, y = cy + (n == 0 ? row[3] : row[(n - 1) / 3]) * d;
            ui.postDelayed(() -> tap(x, y), 1800 + i * 700L);
        }
    }
    // ---- mini guide: ▲▼ shows what's on the channels above and below; OK watches it
    private android.widget.TextView zapBox;
    private boolean zapOn = false, zapping = false;
    private int zapAt = -1;
    private org.json.JSONArray zapArr;
    private final Runnable zapHide = this::hideZap;
    private void moveZap(int dir) {
        try { if (zapArr == null) zapArr = new org.json.JSONArray(MainActivity.zapList); } catch (Exception x) { zapArr = new org.json.JSONArray(); }
        int n = zapArr.length();
        if (n == 0) { android.widget.Toast.makeText(this, "Open channels from the TV guide to flick through them here", android.widget.Toast.LENGTH_SHORT).show(); return; }
        if (zapAt < 0) zapAt = MainActivity.zapIndex;
        zapAt = ((zapAt + dir) % n + n) % n;
        org.json.JSONObject c = zapArr.optJSONObject(zapAt);
        if (c == null) return;
        String now = c.optString("now"), next = c.optString("next");
        zapBox.setText(android.text.Html.fromHtml("<small>" + android.text.TextUtils.htmlEncode(c.optString("sec")) + "  ·  ▲▼ more channels  ·  OK watch  ·  Back stay here</small><br><big><b>"
            + android.text.TextUtils.htmlEncode(c.optString("name")) + "</b></big>"
            + (now.isEmpty() ? "" : "<br>Now: " + android.text.TextUtils.htmlEncode(now)) + (next.isEmpty() ? "" : "<br>Next: " + android.text.TextUtils.htmlEncode(next))));
        zapBox.setVisibility(View.VISIBLE); zapBox.bringToFront(); zapOn = true;
        ui.removeCallbacks(zapHide); ui.postDelayed(zapHide, 8000);
    }
    private void hideZap() { zapOn = false; zapAt = -1; if (zapBox != null) zapBox.setVisibility(View.GONE); ui.removeCallbacks(zapHide); }
    private void goZap() {
        int at = zapAt;
        org.json.JSONObject c = zapArr == null || at < 0 ? null : zapArr.optJSONObject(at);
        hideZap();
        if (c == null) return;
        MainActivity.zapIndex = at;
        if (switchHere(c)) return;
        // keep this screen up (with a note) until the new channel opens on top, so the guide never flashes up
        cover.setText("Switching to " + c.optString("name") + "…"); cover.setVisibility(View.VISIBLE); cover.bringToFront();
        if (custom != null) { root.removeView(custom); custom = null; }
        web.loadUrl("about:blank");
        zapping = true;
        if (!MainActivity.zapNow(c.optString("id"))) { MainActivity.pendingZap = c.optString("id"); finish(); return; }
        ui.postDelayed(this::finish, 10000);
    }
    /** Sky → Sky or Virgin → Virgin: change channel in this player instead of starting a new one (much quicker). */
    private boolean switchHere(org.json.JSONObject c) {
        String kind = c.optString("kind"), url = c.optString("url"), name = c.optString("name");
        String cur = web.getUrl() == null ? "" : web.getUrl();
        boolean onVirgin = cur.contains("virgintvgo.virginmedia.com"), onSkyNow = cur.contains("skysports.com");
        if (url.isEmpty() || !("virgin".equals(kind) && onVirgin)) return false;   // Sky channels: a fresh player each time (switching inside one kept the old channel)
        android.content.Intent ni = new android.content.Intent(getIntent()).putExtra("title", name).putExtra("url", url);
        if ("virgin".equals(kind)) { ni.putExtra("find", c.optString("find", name)); ni.putExtra("pin", c.optBoolean("pin")); }
        else { ni.removeExtra("find"); ni.removeExtra("pin"); }
        setIntent(ni);
        find = ni.getStringExtra("find");
        skySettled = false; startReloads = 0; settleTicks = 0; settleCt = -1; switchedAt = android.os.SystemClock.uptimeMillis();
        web.evaluateJavascript("(function(){" + DEEP_MEDIA + "var m=deep(document,0,[]);for(var i=0;i<m.length;i++){try{m[i].pause();m[i].muted=true;}catch(e){}}})()", null);   // stop the old channel straight away
        steps = 0; pinWaits = 0; startWaits = 0; cacheWaits = 0; fromCache = false; userPaused = false; pageFull = false;
        fsTries = 0; tries = 0; autoFilled = false; adHits = 0; stillSecs = 0; lastCt = -1; lastLiveReload = 0; behindSecs = 0; qChecks = 0;
        ui.removeCallbacks(step); ui.removeCallbacks(fill); ui.removeCallbacks(spaFallback);
        cover.setText("Loading " + name + "…"); cover.setVisibility(View.VISIBLE); cover.bringToFront();
        if (custom != null) { root.removeView(custom); custom = null; }
        if ("virgin".equals(kind) && onVirgin) {
            // Virgin TV Go is one web app: move it to the new channel without reloading it; reload only if that doesn't take
            String path = url.replace("https://virgintvgo.virginmedia.com", "");
            web.evaluateJavascript("(function(p){try{document.querySelectorAll('video').forEach(function(v){v.pause();});history.pushState({},'',p);window.dispatchEvent(new PopStateEvent('popstate',{state:{}}));}catch(e){}})(" + org.json.JSONObject.quote(path) + ")", null);
            spaUrl = url;
            ui.postDelayed(step, 2500);
            ui.postDelayed(spaFallback, 12000);
        } else {
            web.loadUrl(url);
            if (find != null) ui.postDelayed(step, 1500);
        }
        return true;
    }
    private String spaUrl = "";
    private final Runnable spaFallback = () -> { if (web != null && !watching() && this.find != null) web.loadUrl(spaUrl); };
    private long lastToggle = 0;
    private void togglePause() {
        long now = android.os.SystemClock.uptimeMillis();
        if (now - lastToggle < 700) return;
        lastToggle = now;
        userPaused = !userPaused;
        web.evaluateJavascript("(function(p){function deep(r,d){if(!r||d>8)return null;var v=r.querySelector&&r.querySelector('video');if(v)return v;var a=r.querySelectorAll?r.querySelectorAll('*'):[];" +
            "for(var i=0;i<a.length;i++){if(a[i].shadowRoot){var f=deep(a[i].shadowRoot,d+1);if(f)return f;}}return null;}window.__ftvUserPaused=p;var v=deep(document,0);if(v){if(p)v.pause();else v.play();}})(" + userPaused + ")", null);
        android.widget.Toast.makeText(this, userPaused ? "Paused" : "Playing", android.widget.Toast.LENGTH_SHORT).show();
    }
    private final Runnable cursorWatch = new Runnable() { @Override public void run() { showCursor(); ui.postDelayed(this, 500); } };
    private void tap(float x, float y) {
        long t = android.os.SystemClock.uptimeMillis();
        android.view.MotionEvent d = android.view.MotionEvent.obtain(t, t, android.view.MotionEvent.ACTION_DOWN, x, y, 0);
        android.view.MotionEvent u = android.view.MotionEvent.obtain(t, t + 60, android.view.MotionEvent.ACTION_UP, x, y, 0);
        d.setSource(android.view.InputDevice.SOURCE_TOUCHSCREEN); u.setSource(android.view.InputDevice.SOURCE_TOUCHSCREEN);
        web.dispatchTouchEvent(d); web.dispatchTouchEvent(u); d.recycle(); u.recycle();
    }
    private void wheel(float x, float y, float amount) {
        long t = android.os.SystemClock.uptimeMillis();
        android.view.MotionEvent.PointerProperties[] pp = { new android.view.MotionEvent.PointerProperties() };
        pp[0].id = 0; pp[0].toolType = android.view.MotionEvent.TOOL_TYPE_MOUSE;
        android.view.MotionEvent.PointerCoords[] pc = { new android.view.MotionEvent.PointerCoords() };
        pc[0].x = x; pc[0].y = y; pc[0].setAxisValue(android.view.MotionEvent.AXIS_VSCROLL, amount);
        android.view.MotionEvent m = android.view.MotionEvent.obtain(t, t, android.view.MotionEvent.ACTION_SCROLL, 1, pp, pc, 0, 0, 1f, 1f, 0, 0, android.view.InputDevice.SOURCE_MOUSE, 0);
        web.dispatchGenericMotionEvent(m);
        m.recycle();
    }
    private void scrollAt(float x, float y, int dy) {
        wheel(cursor.x, cursor.y, dy > 0 ? -2f : 2f);
        float dpr = getResources().getDisplayMetrics().density;
        if (true) return;
        web.evaluateJavascript("(function(x,y,dy){var e=document.elementFromPoint(x,y);while(e&&e!==document.body){var s=getComputedStyle(e);" +
            "if(/(auto|scroll)/.test(s.overflowY)&&e.scrollHeight>e.clientHeight){e.scrollBy(0,dy);return;}e=e.parentElement;}window.scrollBy(0,dy);})(" +
            (x / dpr) + "," + (y / dpr) + "," + dy + ")", null);
    }
    private final Runnable reveal = () -> {
        if (cover == null) return;
        if (onSky() && !this.skySettled && android.os.SystemClock.uptimeMillis() < this.skyGateUntil) return;   // Sky: wait until it's live and smooth
        cover.setVisibility(View.GONE);
    };
    private boolean skySettled = false;
    private long skyGateUntil = 0;
    private int settleTicks = 0, startReloads = 0;
    private long switchedAt = 0, firstBufAt = 0;
    private boolean wasBuffering = false;
    private final java.util.ArrayDeque<Long> bufStarts = new java.util.ArrayDeque<>();
    private double stallCt = -1; private int stallRun = 0; private long stallFr = -2;
    /** Sky: start the "wait for live" check over (a new channel, or a restart). */
    private void skyGate() { if (signIn()) return; skySettled = false; settleTicks = 0; settleCt = -1; skyGateUntil = android.os.SystemClock.uptimeMillis() + 20000; ui.postDelayed(reveal, 20500); }
    private String find;   // a channel to pick on the site (Virgin TV Go), or null
    private boolean isPlayer(String u) { return find != null || (u != null && (u.matches(".*bbc\\.co\\.uk/iplayer/(live|episode)/.*") || u.matches(".*skysports\\.com/watch/.*"))); }

    /** What the last stuck page looked like (shared on the home network with "Record app screens for Claude"). */
    static String lastDump = "";

    // One step of working the site like a person would: sign-in shows the page; otherwise open Live TV, pick the channel, press Watch.
    private static final String STEP = "(function(T){try{" +
        "function deep(r,d){if(!r||d>8)return null;var v=r.querySelector&&r.querySelector('video');if(v)return v;var a=r.querySelectorAll?r.querySelectorAll('*'):[];" +
        "for(var i=0;i<a.length;i++){if(a[i].shadowRoot){var f=deep(a[i].shadowRoot,d+1);if(f)return f;}}return null;}" +
        "var v=deep(document,0);if(v&&!v.paused&&v.currentTime>0.5)return 'playing';" +
        "var pw=document.querySelector('input[type=password]');if(pw&&pw.getBoundingClientRect().width>0)return 'login';" +
        "function n(s){return String(s||'').toLowerCase().replace(/&/g,' and ').replace(/\\bhd\\b/g,'').replace(/[^a-z0-9]/g,'');}" +
        "var want=T.split('|').map(n).filter(Boolean);" +
        "function lab(e){return [e.getAttribute('aria-label'),e.getAttribute('title'),e.getAttribute('alt'),e.getAttribute('data-channel-name'),(e.children.length<3?e.textContent:'')].map(n);}" +
        "function vis(e){var r=e.getBoundingClientRect();return r.width>0&&r.height>0;}" +
        "function hit(e){var l=lab(e);return want.some(function(w){return l.indexOf(w)>=0;});}" +
        "function press(e){var c=e.closest('a,button,[role=button],[role=link],[role=gridcell],[tabindex]')||e;c.scrollIntoView({block:'center'});c.click();}" +
        "var all=[].slice.call(document.querySelectorAll('a,button,[role],img,[aria-label],[title],li,span,div'));" +
        "var w=window.__ftv=window.__ftv||{ch:0,play:0,nav:0,now:0};" +
        "if(w.ch<3){var c=all.filter(function(e){return vis(e)&&hit(e)&&e.tagName!=='INPUT';})[0];if(c){w.ch++;press(c);return 'channel';}}" +
        "var q=[].slice.call(document.querySelectorAll('input')).filter(function(e){return vis(e)&&/search/i.test((e.placeholder||'')+(e.getAttribute('aria-label')||''));})[0];" +
        "var name=T.split('|')[1]||T.split('|')[0];" +
        "if(q&&q.value!==name&&(w.tp||0)<3){w.tp=(w.tp||0)+1;w.typed=1;w.card=0;q.focus();var set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(q,name);" +
        "q.dispatchEvent(new Event('input',{bubbles:true}));q.dispatchEvent(new Event('change',{bubbles:true}));" +
        "q.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:'a'}));return 'typed';}" +
        "if(w.typed&&w.typed++>3&&!w.card){var cards=all.filter(function(e){var r=e.getBoundingClientRect();return r.width>120&&r.height>60&&r.top>=(q?q.getBoundingClientRect().bottom-2:0)&&(e.querySelector('img')||/tile|card|channel/i.test(e.className));}).sort(function(a,b){var x=a.getBoundingClientRect(),y=b.getBoundingClientRect();return x.width*x.height-y.width*y.height;});" +
        "if(cards[0]){w.card=1;press(cards[0]);return 'card';}}" +
        "if(!q&&w.now<2){var nt=all.filter(function(e){return vis(e)&&/^now on tv$/i.test((e.textContent||'').trim());})[0];if(nt){w.now=(w.now||0)+1;press(nt);return 'now';}}" +
        "var b=all.filter(function(e){return vis(e)&&/^(watch( live| now)?|play( live)?|start watching|watch on tv go)$/i.test(((e.getAttribute('aria-label')||'')+' '+(e.children.length<2?e.textContent:'')).trim());})[0];" +
        "if(b&&w.play<3){w.play++;press(b);return 'play';}" +
        "if(!q&&w.nav<2){var l=all.filter(function(e){return vis(e)&&/^(live tv|tv guide|guide|channels|live)$/i.test((e.getAttribute('aria-label')||e.textContent||'').trim());})[0];if(l){w.nav++;press(l);return 'nav';}}" +
        "return 'looking';}catch(x){return 'err '+x;}})";
    private static final String DUMP = "(function(){var o=['URL '+location.href];[].slice.call(document.querySelectorAll('a,button,[role],img[alt],[aria-label],input')).slice(0,400).forEach(function(e){" +
        "var r=e.getBoundingClientRect();if(r.width<=0)return;o.push(e.tagName+' '+(e.getAttribute('role')||'')+' |'+(e.getAttribute('aria-label')||'')+'|'+(e.getAttribute('alt')||'')+'|'+String(e.children.length<3?e.textContent:'').trim().slice(0,60)+'| '+(e.getAttribute('href')||'')+' @'+Math.round(r.left)+','+Math.round(r.top));});return o.join('\\n');})()";
    // Virgin TV Go is a Flutter app: switch on its accessibility layer to see its buttons, then say where to tap or what to type.
    private static final String STEP2 = "(function(T){try{" +
        "function deep(r,d){if(!r||d>8)return null;var v=r.querySelector&&r.querySelector('video');if(v)return v;var a=r.querySelectorAll?r.querySelectorAll('*'):[];" +
        "for(var i=0;i<a.length;i++){if(a[i].shadowRoot){var f=deep(a[i].shadowRoot,d+1);if(f)return f;}}return null;}" +
        "function qa(sel){var out=[];(function walk(r,d){if(!r||d>6)return;out.push.apply(out,[].slice.call(r.querySelectorAll(sel)));[].forEach.call(r.querySelectorAll('*'),function(e){if(e.shadowRoot)walk(e.shadowRoot,d+1);});})(document,0);return out;}" +
        "var v=deep(document,0);if(v&&!v.paused&&v.currentTime>0.5)return JSON.stringify({act:'playing'});" +
        "var pw=qa('input[type=password]')[0];if(pw&&pw.getBoundingClientRect().width>0)return JSON.stringify({act:'login'});" +
        "function nn(s){return String(s||'').toLowerCase().replace(/&/g,' and ').replace(/\\bhd\\b/g,'').replace(/[^a-z0-9]/g,'').replace(/hd$/,'');}" +
        "var L=window.__ftvList;" +
        "if(!L&&!window.__ftvListLoading){var cu=performance.getEntriesByType('resource').map(function(e){return e.name;}).filter(function(u){return /linear-service\\/v2\\/channels/.test(u);})[0];" +
        "if(cu){window.__ftvListLoading=1;fetch(cu,{credentials:'include'}).then(function(r){return r.json();}).then(function(j){window.__ftvList=Array.isArray(j)?j:(j.channels||[]);}).catch(function(){window.__ftvListLoading=0;});}}" +
        "if(L&&L.length){var ws=T.split('|').map(nn).filter(Boolean),hit=null;" +
        "L.forEach(function(c){if(!hit&&!c.isHidden&&ws.indexOf(nn(c.name))>=0)hit=c;});" +
        "if(!hit)L.forEach(function(c){if(!hit&&!c.isHidden&&!/\\+1|javu/i.test(c.name)&&ws.some(function(w){return w.length>3&&nn(c.name).indexOf(w)===0;}))hit=c;});" +
        "if(hit&&hit.streamedViaExternalApp){var web=(hit.streamingApplications||[]).filter(function(a){return a.deviceCode==='web';})[0];if(web)return JSON.stringify({act:'go',url:web.url,why:'opening '+hit.name});}" +
        "if(/linearplayer/.test(location.pathname))return JSON.stringify({act:'wait',why:'starting the channel'});" +
        "if(hit){return JSON.stringify({act:'go',path:'/en/watchtv/linearplayer/'+encodeURIComponent(hit.id)+'/'+encodeURIComponent(hit.name),why:'opening '+hit.name});}" +
        "if(!window.__ftvNoHit){window.__ftvNoHit=1;}}" +
        "if(/linearplayer/.test(location.pathname))return JSON.stringify({act:'wait',why:'starting the channel'});" +
        "var ph=qa('flt-semantics-placeholder')[0];" +
        "var labelled=qa('flt-semantics,a').filter(function(e){return (e.getAttribute('aria-label')||(e.querySelector('flt-semantics')?'':e.textContent)||'').trim().length>2;}).length;" +
        "var info=' · s='+qa('flt-semantics').length+' l='+labelled+(ph?' ph':'')+' '+location.pathname+(qa('flt-glass-pane').some(function(g){return g.shadowRoot;})?' shadow':'');" +
        "if(!ph&&labelled<4&&qa('flt-glass-pane,flutter-view').length){" +
        // no labels to read (the TV's browser): Virgin's Live TV page is laid out the same every time, so tap by position
        "var W=innerWidth,c=window.__ftvC=window.__ftvC||{st:0,n:0};c.n++;" +
        "if(!/watchtv/.test(location.pathname)){if(c.n%3===1)return JSON.stringify({act:'tap',x:50,y:202,why:'live tv (by position)'+info});return JSON.stringify({act:'wait',why:'opening live tv'+info});}" +
        "if(c.st===0){c.st=1;return JSON.stringify({act:'type',x:W-140,y:136,text:T.split('|')[0].replace(/\\s*HD$/i,''),why:'searching (by position)'+info});}" +
        "var nm0=T.split('|')[0].replace(/\\s*HD$/i,'').toLowerCase(),typedOk=qa('input,textarea').some(function(e){return (e.value||'').toLowerCase().indexOf(nm0.slice(0,3))>=0;});" +
        "if(c.st===1){if(typedOk){c.st=2;return JSON.stringify({act:'wait',why:'found the channel'+info});}c.tries=(c.tries||0)+1;" +
        "if(c.tries%3===0&&c.tries<12)return JSON.stringify({act:'type',x:W-140,y:136,text:T.split('|')[0].replace(/\\s*HD$/i,''),why:'searching again (by position)'+info});" +
        "var ae=document.activeElement;while(ae&&ae.shadowRoot&&ae.shadowRoot.activeElement)ae=ae.shadowRoot.activeElement;" +
        "return JSON.stringify({act:'wait',why:'typing the channel name · texts='+qa('input,textarea').filter(function(e){return e.tagName!=='INPUT'||/^(text|search|)$/.test(e.type);}).length+' active='+(ae?ae.tagName.toLowerCase()+(ae.parentElement?'<'+ae.parentElement.tagName.toLowerCase():''):'-')+info});}" +
        "if(c.st===2){c.st=3;return JSON.stringify({act:'wait',why:'looking for the channel'+info});}" +
        "if(c.st<6){c.st++;return JSON.stringify({act:'wait',why:'starting the channel'+info});}" +
        "if(c.st===6){c.st=7;return JSON.stringify({act:'wait',why:'looking for the channel'+info});}" +
        "}" +
        "if(ph&&labelled<4){window.__ftvEn=(window.__ftvEn||0)+1;try{ph.click();}catch(x){}ph.setAttribute('tabindex','0');ph.focus();var r0=ph.getBoundingClientRect();" +
        "return JSON.stringify({act:'enable',x:Math.max(0,r0.left+r0.width/2),y:Math.max(0,r0.top+r0.height/2),why:'switching on accessibility'+info});}" +
        "var lt=qa('a,flt-semantics').filter(function(e){return /^live tv\b/i.test((e.textContent||'').trim())&&!e.querySelector('a,flt-semantics')&&e.getBoundingClientRect().width>0;})[0];" +
        "if(!/watchtv/.test(location.pathname)&&lt&&(window.__ftvNav=(window.__ftvNav||0)+1)<4){var rr=lt.getBoundingClientRect();return JSON.stringify({act:'tap',x:rr.left+rr.width/2,y:rr.top+rr.height/2,why:'live tv'});}" +
        "function n(s){return String(s||'').toLowerCase().replace(/&/g,' and ').replace(/\\bhd\\b/g,'').replace(/[^a-z0-9]/g,'');}" +
        "var want=T.split('|').map(n).filter(Boolean);" +
        "function own(e){return e.getAttribute('aria-label')||(e.querySelector('flt-semantics')?'':e.textContent)||'';}" +
        "function vis(e){var r=e.getBoundingClientRect();return r.width>20&&r.height>20&&r.top>=0&&r.top<innerHeight-30&&r.left<innerWidth-20;}" +
        "function at(e,act,extra){var r=e.getBoundingClientRect();var o={act:act,x:r.left+r.width/2,y:r.top+Math.min(r.height/2,60)};for(var k in extra)o[k]=extra[k];return JSON.stringify(o);}" +
        "var w=window.__ftv=window.__ftv||{typed:0,tile:0,play:0};" +
        "var sem=qa('flt-semantics,a,button');" +
        "if(w.tile<2){var t=sem.filter(function(e){var m=/^\\s*\\[([^\\]]+)\\]/.exec(own(e));return m&&want.indexOf(n(m[1]))>=0&&vis(e);})[0];if(t){w.tile++;return at(t,'tap',{why:'channel'});}}" +
        "if(w.tile>0&&w.play<2){var b=sem.filter(function(e){return vis(e)&&/^(watch( live| now)?|play( live)?|start watching)\\b/i.test(own(e).trim());})[0];if(b){w.play++;return at(b,'tap',{why:'watch'});}}" +
        "var inp=sem.filter(function(e){return vis(e)&&/^search channel/i.test((e.getAttribute('aria-label')||'').trim());})[0]||qa('input').filter(function(e){return vis(e)&&/search/i.test(e.placeholder||'');})[0];" +
        "var boxText=inp?(inp.getAttribute('aria-label')||'')+' '+((inp.querySelector('input')||{}).value||''):'';" +
        "if(inp&&w.typed>=1&&w.typed<4&&w.tile===0&&(w.wait=(w.wait||0)+1)%3===0&&!/\\w{3,}/.test(boxText.replace(/search channel/i,''))){w.typed++;var nm=T.split('|')[1]||T.split('|')[0];return at(inp,'type',{text:nm.replace(/\\s*HD$/i,''),why:'typing again'});}" +
        "if(inp&&w.typed<1&&w.tile===0){w.typed++;var name=T.split('|')[1]||T.split('|')[0];return at(inp,'type',{text:name.replace(/\\s*HD$/i,'')});}" +
        "var list=sem.filter(function(e){return /^\\s*\\[/.test(own(e))&&vis(e);});" +
        "if(list.length&&w.tile===0&&(w.sc=(w.sc||0)+1)<25&&w.typed>=2){var lr=list[0].getBoundingClientRect();return JSON.stringify({act:'scroll',x:lr.left+lr.width/2,y:lr.top+lr.height/2,why:'scrolling the channel list'});}" +
        "return JSON.stringify({act:'wait',why:(inp?'searching for the channel':(list.length?'looking at the channel list':'waiting for the page'))+info});}catch(x){return JSON.stringify({act:'wait',why:'err '+x});}})";
    private int steps = 0;
    private boolean loginShown = false;
    private boolean fromCache = false;
    private int cacheWaits = 0;
    static String norm(String s) {
        return s == null ? "" : s.toLowerCase(java.util.Locale.UK).replace("&", " and ").replaceAll("\\bhd\\b", "").replaceAll("[^a-z0-9]", "").replaceAll("hd$", "");
    }
    private final Runnable step = new Runnable() {
        @Override public void run() {
            if (web == null || find == null || custom != null) return;
            web.evaluateJavascript(STEP2 + "(" + org.json.JSONObject.quote(find) + ")", r -> {
                org.json.JSONObject o;
                try { o = new org.json.JSONObject(new org.json.JSONTokener(r).nextValue().toString()); } catch (Exception x) { o = new org.json.JSONObject(); }
                String act = o.optString("act", "wait");
                float d = getResources().getDisplayMetrics().density;
                long next = 800;
                String why = o.optString("why", act);
                if (!act.equals("login") && cover.getVisibility() != View.VISIBLE && loginShown) { cover.setVisibility(View.VISIBLE); loginShown = false; }
                cover.setText("Loading " + getIntent().getStringExtra("title") + "…\n\n(" + why + ")");
                if (act.equals("login")) { reveal.run(); loginShown = true; steps = 0; }   // let you sign in
                else if (act.equals("playing")) { if (fsTries == 0) { cover.setText("Starting " + getIntent().getStringExtra("title") + "…"); cover.setVisibility(View.VISIBLE); goFull(); } return; }
                else if (act.equals("enable")) {
                    long t = android.os.SystemClock.uptimeMillis();
                    web.requestFocus();
                    web.dispatchKeyEvent(new KeyEvent(t, t, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_ENTER, 0));
                    web.dispatchKeyEvent(new KeyEvent(t, t + 40, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_ENTER, 0));
                    web.dispatchKeyEvent(new KeyEvent(t, t, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_SPACE, 0));
                    web.dispatchKeyEvent(new KeyEvent(t, t + 40, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_SPACE, 0));
                    tap((float) o.optDouble("x") * d + 1, (float) o.optDouble("y") * d + 1);
                    next = 2000;
                }
                else if (act.equals("go") && o.has("url")) {
                    // e.g. Sky Sports: Virgin sends these to skysports.com, so play them there like BBC iPlayer
                    android.content.SharedPreferences.Editor ed = getSharedPreferences("virgin", MODE_PRIVATE).edit();
                    for (String t : find.split("\\|")) if (!norm(t).isEmpty()) ed.remove(norm(t));
                    ed.apply();
                    find = null; ui.removeCallbacks(step);
                    cover.setText("Loading " + getIntent().getStringExtra("title") + "…");
                    web.loadUrl(o.optString("url"));
                    return;
                }
                else if (act.equals("go")) {
                    String path = o.optString("path");
                    android.content.SharedPreferences.Editor ed = getSharedPreferences("virgin", MODE_PRIVATE).edit();
                    for (String t : find.split("\\|")) if (!norm(t).isEmpty()) ed.putString(norm(t), path);
                    ed.apply();
                    fromCache = true;
                    web.loadUrl("https://virgintvgo.virginmedia.com" + path);
                    next = 1500;
                }
                else if (act.equals("scroll")) { wheel((float) o.optDouble("x") * d, (float) o.optDouble("y") * d, -2f); next = 1200; }
                else if (act.equals("tap")) { tap((float) o.optDouble("x") * d, (float) o.optDouble("y") * d); next = 2500; }
                else if (act.equals("type")) {
                    tap((float) o.optDouble("x") * d, (float) o.optDouble("y") * d);
                    final String text = o.optString("text");
                    ui.postDelayed(() -> {
                        typeText(text);
                    }, 700);
                    ui.postDelayed(() -> {
                        // backup: put the text into the box the page is using, in case key presses didn't arrive
                        web.evaluateJavascript("(function(t){function qa(sel){var out=[];(function walk(r,d){if(!r||d>8)return;out.push.apply(out,[].slice.call(r.querySelectorAll(sel)));" +
                            "[].forEach.call(r.querySelectorAll('*'),function(e){if(e.shadowRoot)walk(e.shadowRoot,d+1);});})(document,0);return out;}" +
                            "var n=0;qa('input,textarea').forEach(function(a){if(a.tagName==='INPUT'&&!/^(text|search|)$/.test(a.type))return;if(String(a.value).toLowerCase().indexOf(t.toLowerCase())>=0)return;" +
                            "var s=Object.getOwnPropertyDescriptor(a.tagName==='INPUT'?HTMLInputElement.prototype:HTMLTextAreaElement.prototype,'value').set;s.call(a,t);" +
                            "a.dispatchEvent(new InputEvent('input',{bubbles:true,data:t,inputType:'insertText'}));a.dispatchEvent(new Event('change',{bubbles:true}));n++;});return n;})(" + org.json.JSONObject.quote(text) + ")", null);
                    }, 1600);
                    next = 3000;
                }
                if (act.equals("wait") && o.optString("why").startsWith("starting") && getIntent().getBooleanExtra("pin", false)) {
                    pinWaits++;
                    if (pinWaits == 5 || pinWaits == 20 || pinWaits == 35) enterPin();
                }
                // Virgin's page hasn't started the picture after ~15 s: show the page (there may be a message or button), keep watching for the picture
                if (act.equals("wait") && o.optString("why").startsWith("starting") && ++startWaits == 18 && cover.getVisibility() == View.VISIBLE) {
                    reveal.run();
                    android.widget.Toast.makeText(WebPlayerActivity.this, "Virgin hasn't started the channel – showing its page so you can see why", android.widget.Toast.LENGTH_LONG).show();
                }
                if (fromCache && act.equals("wait") && o.optString("why").startsWith("starting") && ++cacheWaits > 25) {
                    android.content.SharedPreferences.Editor ed = getSharedPreferences("virgin", MODE_PRIVATE).edit();
                    for (String t : find.split("\\|")) ed.remove(norm(t));
                    ed.apply();
                    fromCache = false; cacheWaits = 0;
                    web.loadUrl("https://virgintvgo.virginmedia.com/en/watchtv");
                    ui.postDelayed(step, 2000);
                    return;
                }
                if (++steps > 45) {                                             // stuck: keep a note of the page for Claude
                    reveal.run();
                    android.widget.Toast.makeText(WebPlayerActivity.this, "Couldn't start " + getIntent().getStringExtra("title") + " – pick it yourself with the pointer", android.widget.Toast.LENGTH_LONG).show();
                    web.evaluateJavascript(DUMP, dd -> lastDump = dd == null ? "" : dd.replace("\\n", "\n").replace("\\\"", "\""));
                    return;
                }
                ui.postDelayed(step, next);
            });
        }
    };
    /** Type like a keyboard would (the Flutter page only listens to real key presses). */
    private static final String BOXVAL = "(function(){var a=document.activeElement;while(a&&a.shadowRoot&&a.shadowRoot.activeElement)a=a.shadowRoot.activeElement;return a&&a.value!=null?String(a.value):'';})()";
    /** Type like a keyboard would: first the way on-screen keyboards do, then key presses if that didn't land. */
    private void typeText(final String text) {
        if (web == null) return;
        web.requestFocus();
        try {
            android.view.inputmethod.InputConnection ic = web.onCreateInputConnection(new android.view.inputmethod.EditorInfo());
            if (ic != null) { ic.commitText(text, 1); }
        } catch (Exception ignored) { }
        ui.postDelayed(() -> web.evaluateJavascript(BOXVAL, v -> {
            if (v != null && v.toLowerCase().contains(text.toLowerCase().substring(0, Math.min(3, text.length())))) return;
            android.view.KeyCharacterMap km = android.view.KeyCharacterMap.load(android.view.KeyCharacterMap.VIRTUAL_KEYBOARD);
            KeyEvent[] evs = km.getEvents(text.toCharArray());
            if (evs != null) for (KeyEvent e : evs) web.dispatchKeyEvent(e);
        }), 400);
    }

    // Make the player fill the screen and start it, if the page hasn't already.
    // Make the player fill the screen: find the video (the BBC player keeps it inside sealed-off "shadow" parts of the page),
    // pin its outer box to the whole screen and hide everything else.
    private static final String FILL = "(function(){try{if(!/bbc\\.co\\.uk\\/iplayer\\/(live|episode)|skysports\\.com\\/watch/.test(location.href)&&!window.__ftvFillOK)return 'not player';var sky=/skysports/.test(location.host);function deep(root,depth){if(!root||depth>8)return null;var v=root.querySelector&&root.querySelector('video');if(v)return v; var all=root.querySelectorAll?root.querySelectorAll('*'):[];for(var i=0;i<all.length;i++){if(all[i].shadowRoot){var f=deep(all[i].shadowRoot,depth+1);if(f)return f;}}return null;}var v=deep(document,0);var t=null;if(v){t=v;while(t.getRootNode&&t.getRootNode()!==document){t=t.getRootNode().host;} var host=t;var p=t;while(p&&p.parentElement&&p.parentElement!==document.body){var r=p.parentElement.getBoundingClientRect(),q=t.getBoundingClientRect();if(r.width>q.width*1.15||r.height>q.height*1.3)break;p=p.parentElement;}t=p;}else if(sky){var pb=[].slice.call(document.querySelectorAll('button,[role=button],[class*=play],[class*=Play]')).filter(function(e){var r=e.getBoundingClientRect();return r.width>24&&r.width<260&&r.top>0&&/play/i.test((e.getAttribute('aria-label')||'')+' '+(typeof e.className==='string'?e.className:''))&&!/playlist|player-/i.test(e.className);})[0];if(pb&&(window.__ftvPb=(window.__ftvPb||0)+1)%6===1)pb.click();return 'waiting';}else{t=[].slice.call(document.querySelectorAll('iframe')).filter(function(x){return x.getBoundingClientRect().width>300;})[0]||null;}if(!t)return 'waiting';var W=window.innerWidth,H=window.innerHeight;var st=document.getElementById('ftv-fill');if(!st){st=document.createElement('style');st.id='ftv-fill';document.head.appendChild(st);}st.textContent='html,body{overflow:hidden!important;background:#000!important}'+ '.ftv-hide{visibility:hidden!important}.ftv-anc{transform:none!important;filter:none!important;contain:none!important;overflow:visible!important;z-index:auto!important;visibility:visible!important}'+ '.ftv-full{width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;margin:0!important;transform:none!important}.ftv-big{position:fixed!important;left:0!important;top:0!important;width:'+W+'px!important;height:'+H+'px!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;border:0!important;z-index:2147483647!important;background:#000!important;visibility:visible!important;transform:none!important}';t.classList.add('ftv-big');if(v){var c=v,n=0;while(c&&c!==t&&n++<60){if(c.style){['width','height'].forEach(function(k){c.style.setProperty(k,'100%','important');});c.style.setProperty('max-width','none','important');c.style.setProperty('max-height','none','important');c.style.setProperty('transform','none','important');c.style.setProperty('padding','0','important');c.style.setProperty('margin','0','important');try{var cs=getComputedStyle(c);if(cs.position==='absolute'||cs.position==='fixed'){c.style.setProperty('top','0','important');c.style.setProperty('left','0','important');c.style.setProperty('bottom','auto','important');c.style.setProperty('right','auto','important');}}catch(e){}}c=c.parentElement||(c.getRootNode&&c.getRootNode().host)||null;}v.style.setProperty('object-fit','contain','important');}var a=t.parentElement;while(a&&a!==document.documentElement){a.classList.add('ftv-anc');[].forEach.call(a.children,function(c){if(c!==t&&!c.contains(t)&&!c.classList.contains('ftv-anc'))c.classList.add('ftv-hide');});a=a.parentElement;}window.scrollTo(0,0);if(v){v.style.objectFit='contain';if(v.paused&&!sky&&!window.__ftvUserPaused&&!window.__ftvStarted){try{v.play();}catch(e){}}if(!v.paused)window.__ftvStarted=1;}return 'filled';}catch(e){return 'err '+e;}})()";

    // Pressing F2 (sent by Free TV, so it counts as a real key press) asks the page for proper full screen on the video.
    private static final String ARM = "(function(){if(window.__ftvArmed)return 'armed';window.__ftvArmed=1;" +
        "function deep(r,d){if(!r||d>8)return null;var v=r.querySelector&&r.querySelector('video');if(v)return v;var a=r.querySelectorAll?r.querySelectorAll('*'):[];" +
        "for(var i=0;i<a.length;i++){if(a[i].shadowRoot){var f=deep(a[i].shadowRoot,d+1);if(f)return f;}}return null;}" +
        "window.addEventListener('keydown',function(e){if(e.keyCode!==113)return;e.preventDefault();e.stopPropagation();" +
        "var v=deep(document,0);if(!v)return;v.removeAttribute('controls');v.controls=false;var f=v.requestFullscreen||v.webkitRequestFullscreen||v.webkitEnterFullscreen;" +
        "try{var p=f.call(v);if(p&&p.catch)p.catch(function(){});}catch(x){}},true);return 'ok';})()";

    private static final String PLAYING = "(function(){function deep(r,d){if(!r||d>8)return null;var v=r.querySelector&&r.querySelector('video');if(v)return v;" +
        "var a=r.querySelectorAll?r.querySelectorAll('*'):[];for(var i=0;i<a.length;i++){if(a[i].shadowRoot){var f=deep(a[i].shadowRoot,d+1);if(f)return f;}}return null;}" +
        "var v=deep(document,0);if(!v)return 'no';v.removeAttribute('controls');v.controls=false;" +
        "if(v.paused){try{v.play();}catch(e){}}return (!v.paused&&v.readyState>=3&&v.currentTime>0.5)?'yes':'no';})()";
    private void waitForPicture(int n) {
        if (web == null) return;
        web.evaluateJavascript(PLAYING, r -> {
            if ((r != null && r.contains("yes")) || n > 30) ui.postDelayed(reveal, 400);
            else ui.postDelayed(() -> waitForPicture(n + 1), 400);
        });
    }

    private int fsTries = 0;
    private void goFull() {
        if (web == null || custom != null || fsTries++ > 4) { reveal.run(); return; }
        web.evaluateJavascript(ARM, r -> {
            web.requestFocus();
            long t = android.os.SystemClock.uptimeMillis();
            web.dispatchKeyEvent(new KeyEvent(t, t, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_F2, 0));
            web.dispatchKeyEvent(new KeyEvent(t, t + 50, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_F2, 0));
            ui.postDelayed(() -> { if (custom == null) goFull(); }, 1500);
        });
    }

    // Sky Sports only plays in a computer's browser (on phones and TVs it says "open our app"), so look like Chrome on a Linux PC throughout:
    // the browser hints sent to sites, and what the page's scripts can see.
    private static final String DESKTOP = "(function(){try{var P=Navigator.prototype;function g(k,v){try{Object.defineProperty(P,k,{get:function(){return v;},configurable:true});}catch(e){}}" +
        "var brands=[{brand:'Chromium',version:'124'},{brand:'Google Chrome',version:'124'},{brand:'Not-A.Brand',version:'99'}];" +
        "var ua={brands:brands,mobile:false,platform:'Linux',getHighEntropyValues:function(h){return Promise.resolve({brands:brands,mobile:false,platform:'Linux',platformVersion:'6.5.0',architecture:'x86',bitness:'64',model:'',uaFullVersion:'124.0.6367.207',wow64:false," +
        "fullVersionList:[{brand:'Chromium',version:'124.0.6367.207'},{brand:'Google Chrome',version:'124.0.6367.207'},{brand:'Not-A.Brand',version:'99.0.0.0'}]});},toJSON:function(){return {brands:brands,mobile:false,platform:'Linux'};}};" +
        "g('userAgentData',ua);g('platform','Linux x86_64');g('maxTouchPoints',0);g('vendor','Google Inc.');" +
        "try{delete window.ontouchstart;}catch(e){}" +
        "if(/skysports|sky\\.com/.test(location.host)){" +
        "try{localStorage.removeItem('timeToLiveEdgeInMs');}catch(e){}" +
        "var SHIFT=8000,RD=Date,now0=RD.now.bind(RD);function SD(){var a=arguments;if(!(this instanceof SD))return new RD(now0()-SHIFT).toString();if(a.length===0)return new RD(now0()-SHIFT);return new (Function.prototype.bind.apply(RD,[null].concat([].slice.call(a))))();}" +
        "SD.prototype=RD.prototype;SD.now=function(){return now0()-SHIFT;};SD.parse=RD.parse;SD.UTC=RD.UTC;try{Object.defineProperty(SD.prototype,'constructor',{value:SD,configurable:true,writable:true});}catch(e){}window.Date=SD;" +
        "var D=Document.prototype;try{Object.defineProperty(D,'hidden',{get:function(){return false;},configurable:true});Object.defineProperty(D,'visibilityState',{get:function(){return 'visible';},configurable:true});}catch(e){}" +
        "D.hasFocus=function(){return true;};var ae=EventTarget.prototype.addEventListener;EventTarget.prototype.addEventListener=function(t,f,o){if(t==='visibilitychange'||t==='webkitvisibilitychange'||(t==='blur'&&this===window)||t==='pagehide'||t==='freeze')return;return ae.call(this,t,f,o);};" +
        // Sky sends up to 12 Mbps; drop the top picture qualities from its stream list so the Chromecast's connection keeps up
        // picture quality you picked (QH = height, 0 = let Sky decide); also note which qualities Sky offers
        "var QH=0;function capMpd(t){try{if(typeof t!=='string'||t.indexOf('<MPD')<0)return t;var x=new DOMParser().parseFromString(t,'application/xml');if(x.getElementsByTagName('parsererror').length)return t;var n=0,hs={};" +
        "[].forEach.call(x.getElementsByTagName('AdaptationSet'),function(a){var reps=[].slice.call(a.getElementsByTagName('Representation'));var ah=+a.getAttribute('height')||0;var vid=/video/.test((a.getAttribute('mimeType')||'')+(a.getAttribute('contentType')||''))||reps.some(function(r){return /video/.test(r.getAttribute('mimeType')||'')||r.hasAttribute('height');});if(!vid||!reps.length)return;" +
        "function H(r){return +r.getAttribute('height')||ah;}reps.forEach(function(r){if(H(r))hs[H(r)]=1;});if(!QH||reps.length<2)return;" +
        "var ok=reps.filter(function(r){return H(r)&&H(r)<=QH;});var best=ok.length?Math.max.apply(null,ok.map(H)):Math.min.apply(null,reps.map(H));" +
        "reps.forEach(function(r){if(H(r)!==best){r.parentNode.removeChild(r);n++;}});});" +
        "window.__ftvQs=Object.keys(hs).sort(function(a,b){return a-b;}).join('/');return n?new XMLSerializer().serializeToString(x):t;}catch(e){return t;}}" +
        "var N=window.__ftvNet={ok:0,bad:0,codes:{},kb:0,ms:0,seg:0};function cnt(st,u,t0,b){if(st>=400||st===0){N.bad++;N.codes[st]=(N.codes[st]||0)+1;N.last=String(u).replace(/^https?:\\/\\//,'').replace(/\\?.*/,'').slice(-70);}else N.ok++;if(/\\.(m4s|mp4|m4v|ts|cmfv)|segment|chunk/i.test(u)&&b){N.seg++;N.kb+=b/1024;N.ms+=Date.now()-t0;}}" +
        "var F=window.fetch;window.fetch=function(i,o){var t0=Date.now(),U=String(i&&i.url||i);return F.apply(this,arguments).then(function(r){try{var cl=+r.headers.get('content-length')||0;cnt(r.status,U,t0,cl);}catch(e){}try{var u=r.url||'';var ct=r.headers.get('content-type')||'';if(!/\\.mpd|dash/i.test(u+ct))return r;return r.clone().text().then(function(t){var c=capMpd(t);if(c===t)return r;var nr=new Response(c,{status:r.status,statusText:r.statusText,headers:r.headers});try{Object.defineProperty(nr,'url',{value:u});}catch(e){}return nr;});}catch(e){return r;}});};" +
        "var XP=XMLHttpRequest.prototype,xo=XP.open,xs=XP.send;XP.open=function(m,u){this.__ftvU=String(u||'');return xo.apply(this,arguments);};" +
        "XP.send=function(){var x=this,t0=Date.now();x.addEventListener('loadend',function(){var b=0;try{b=x.response&&x.response.byteLength||0;}catch(e){}cnt(x.status,x.__ftvU||'',t0,b);});return xs.apply(this,arguments);};" +
        "['responseText','response'].forEach(function(k){var d=Object.getOwnPropertyDescriptor(XP,k);if(!d||!d.get)return;Object.defineProperty(XP,k,{configurable:true,get:function(){var v=d.get.call(this);try{if(this.readyState!==4||!/\\.mpd/i.test(this.__ftvU||''))return v;if(this.__ftvC&&this.__ftvC[0]===v)return this.__ftvC[1];var out=v;" +
        "if(typeof v==='string')out=capMpd(v);else if(v instanceof ArrayBuffer){var t=new TextDecoder().decode(v),c=capMpd(t);out=c===t?v:new TextEncoder().encode(c).buffer;}this.__ftvC=[v,out];return out;}catch(e){return v;}}});});" +
        "var IO=window.IntersectionObserver;if(IO){window.IntersectionObserver=function(cb,opt){var o=new IO(function(es,ob){cb(es.map(function(e){return {target:e.target,time:e.time,rootBounds:e.rootBounds,boundingClientRect:e.boundingClientRect,intersectionRect:e.boundingClientRect,isIntersecting:true,isVisible:true,intersectionRatio:1};}),ob);},opt);return o;};window.IntersectionObserver.prototype=IO.prototype;}}" +
        "}catch(e){}})();";
    private int quality() { return getSharedPreferences("player", MODE_PRIVATE).getInt("skyq", 0); }
    private String desktopJs() { return DESKTOP.replace("var QH=0;", "var QH=" + quality() + ";").replace("var SHIFT=8000,", "var SHIFT=" + (prefs().getBoolean("skyclock", false) ? 8000 : 0) + ","); }
    private Object startScript;   // the script handle, so a new quality can replace it
    private void looksLikeDesktop(WebSettings s) {
        try {
            if (androidx.webkit.WebViewFeature.isFeatureSupported(androidx.webkit.WebViewFeature.USER_AGENT_METADATA)) {
                java.util.List<androidx.webkit.UserAgentMetadata.BrandVersion> b = java.util.Arrays.asList(
                    new androidx.webkit.UserAgentMetadata.BrandVersion.Builder().setBrand("Chromium").setMajorVersion("124").setFullVersion("124.0.6367.207").build(),
                    new androidx.webkit.UserAgentMetadata.BrandVersion.Builder().setBrand("Google Chrome").setMajorVersion("124").setFullVersion("124.0.6367.207").build(),
                    new androidx.webkit.UserAgentMetadata.BrandVersion.Builder().setBrand("Not-A.Brand").setMajorVersion("99").setFullVersion("99.0.0.0").build());
                androidx.webkit.WebSettingsCompat.setUserAgentMetadata(s, new androidx.webkit.UserAgentMetadata.Builder()
                    .setBrandVersionList(b).setFullVersion("124.0.6367.207").setPlatform("Linux").setPlatformVersion("6.5.0")
                    .setArchitecture("x86").setModel("").setMobile(false).setBitness(64).setWow64(false).build());
            }
        } catch (Throwable ignored) { }
        try {
            if (androidx.webkit.WebViewFeature.isFeatureSupported(androidx.webkit.WebViewFeature.DOCUMENT_START_SCRIPT))
                startScript = androidx.webkit.WebViewCompat.addDocumentStartJavaScript(web, desktopJs(), java.util.Collections.singleton("*"));
        } catch (Throwable ignored) { }
    }
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
        cursor = new CursorView(this);
        root.addView(cursor, new FrameLayout.LayoutParams(-1, -1));
        zapBox = new android.widget.TextView(this);
        zapBox.setTextColor(0xFFFFFFFF); zapBox.setBackgroundColor(0xE6101830); zapBox.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 18);
        zapBox.setPadding(40, 24, 40, 28); zapBox.setVisibility(View.GONE);
        FrameLayout.LayoutParams zl = new FrameLayout.LayoutParams(-1, -2); zl.gravity = android.view.Gravity.BOTTOM;
        root.addView(zapBox, zl);
        stats = new android.widget.TextView(this);
        stats.setTextColor(0xFFFFFFFF); stats.setBackgroundColor(0x99000000); stats.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 12);
        stats.setPadding(12, 6, 12, 6); stats.setVisibility(View.GONE);
        root.addView(stats, new FrameLayout.LayoutParams(-2, -2));
        root.post(() -> { cursor.x = root.getWidth() / 2f; cursor.y = root.getHeight() / 2f; showCursor(); });
        setContentView(root);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUseWideViewPort(false);
        s.setLoadWithOverviewMode(false);
        web.setInitialScale(0);
        s.setUserAgentString("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36");
        looksLikeDesktop(s);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        web.setWebViewClient(new WebViewClient() {
            @Override public android.webkit.WebResourceResponse shouldInterceptRequest(WebView v, android.webkit.WebResourceRequest req) {
                String h = req.getUrl().getHost();
                // Sky: Free TV downloads the video pieces itself and retries any that stall, so Sky's player never waits on a hung download
                if (skyPage && "GET".equalsIgnoreCase(req.getMethod()) && prefs().getBoolean("skyNet", true)) {
                    String path = String.valueOf(req.getUrl().getPath()).toLowerCase();
                    if (path.matches(".*\\.(m4s|m4v|m4a|mp4|cmfv|cmfa|ts|aac)$") || path.matches(".*/(segment|chunk|fragment)[^/]*$") || path.matches(".*/(time|t|number|n)[-_=]?\\d{3,}[^/]*$")) {
                        android.webkit.WebResourceResponse wr = fetchPiece(req);
                        if (wr != null) return wr;
                    }
                }
                // adverts and promos (switch in the Sky Sports player menu): count them, and block them if asked
                if (h != null && adPage && h.matches(".*(fwmrm|freewheel|imasdk|dai\\.google|pubads|g\\.doubleclick|innovid|spotxchange|springserve|yospace|mediatailor|adsrvr|adform|tremorhub|smartclip|serving-sys|adsafeprotected|moatads|doubleverify|ias\\.|integralads|sky\\.com/ads|adsmart|vod-ads|ads\\.).*")) {
                    adHits++;
                    // a plain refusal (as in 2.23.3): answering "no adverts" made Sky's player start the wrong stream
                    if (skyPage ? prefs().getBoolean("skyNoAds", true) : prefs().getBoolean("webNoAds", false)) return new android.webkit.WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, new java.io.ByteArrayInputStream(new byte[0]));
                }
                if (h != null && skyPage && h.matches(".*(google-analytics|googletagmanager|doubleclick|googlesyndication|chartbeat|qualtrics|optimizely|demdex|omtrdc|adobedtm|scorecardresearch|hotjar|facebook|tiktok|bing|clarity|permutive|amazon-adsystem|criteo|taboola|outbrain|krxd|bluekai|onetrust-analytics|ipredictive|adnxs|rubiconproject|pubmatic|casalemedia|smartadserver|id5-sync|tapad|everesttech|go-mpulse|akstat)\\..*"))
                    return new android.webkit.WebResourceResponse("text/plain", "utf-8", new java.io.ByteArrayInputStream(new byte[0]));
                return null;
            }
            @Override public boolean onRenderProcessGone(WebView v, android.webkit.RenderProcessGoneDetail detail) {
                // the page crashed or Android reclaimed its memory: close just this player (back to the guide) rather than the whole app
                try { root.removeView(v); } catch (Throwable ignored) { }
                android.widget.Toast.makeText(WebPlayerActivity.this, "The player stopped – open the channel again", android.widget.Toast.LENGTH_LONG).show();
                finish();
                return true;
            }
            @Override public void onPageStarted(WebView v, String url, android.graphics.Bitmap icon) {
                fsTries = 0; skyPage = url != null && url.contains("skysports.com"); if (skyPage && !skySettled) skyGate(); adPage = url != null && (skyPage || autoSite(url) || url.contains("amazon.co.uk")); pageFull = false;
                if (!androidx.webkit.WebViewFeature.isFeatureSupported(androidx.webkit.WebViewFeature.DOCUMENT_START_SCRIPT)) v.evaluateJavascript(desktopJs(), null);
                // keep the page hidden while the player is set up; show other pages (sign-in, TV licence) straight away
                ui.removeCallbacks(reveal);
                if (find != null) { /* the step loop decides */ }
                else if (autoSite(url) && autoMode && getIntent().getStringExtra("title") != null && !(series() && !url.contains("search"))) { cover.setText("Loading " + getIntent().getStringExtra("title") + "…"); cover.setVisibility(View.VISIBLE); ui.postDelayed(reveal, 180000); }
                else if (getIntent().getBooleanExtra("sync", false)) { cover.setVisibility(View.VISIBLE); ui.postDelayed(reveal, 60000); }
                else if (isPlayer(url)) { cover.setVisibility(View.VISIBLE); ui.postDelayed(reveal, 15000); if (find == null) { tries = 0; ui.removeCallbacks(fill); ui.postDelayed(fill, 2500); } } else cover.setVisibility(View.GONE);
                if (signIn()) { ui.removeCallbacks(reveal); ui.removeCallbacks(fill); cover.setVisibility(View.GONE); }
            }
            @Override public void onPageFinished(WebView v, String url) {
                if (!isPlayer(url) && find == null && !getIntent().getBooleanExtra("sync", false) && !(autoSite(url) && autoMode && !(series() && !url.contains("search")))) cover.setVisibility(View.GONE);
                CookieManager.getInstance().flush();
                if (autoSite(url) && autoMode) { apTries = 0; ui.removeCallbacks(autoplay); ui.postDelayed(autoplay, 2000); }
                if (url != null && url.contains("virgintvgo.virginmedia.com")) { ownedTries = 0; ui.removeCallbacks(ownedSync); ui.postDelayed(ownedSync, 3000); }
                if (find != null) { ui.removeCallbacks(step); ui.postDelayed(step, 2000); return; }
                tries = 0; ui.removeCallbacks(fill); ui.postDelayed(fill, 1500); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(android.webkit.PermissionRequest req) {
                for (String r : req.getResources()) if (android.webkit.PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID.equals(r)) { req.grant(new String[]{r}); return; }
                req.deny();
            }
            @Override public android.graphics.Bitmap getDefaultVideoPoster() {
                android.graphics.Bitmap b = android.graphics.Bitmap.createBitmap(2, 2, android.graphics.Bitmap.Config.ARGB_8888);
                b.eraseColor(Color.BLACK);
                return b;
            }
            @Override public void onShowCustomView(View view, CustomViewCallback cb) {
                custom = view; root.addView(view, root.indexOfChild(cover), new FrameLayout.LayoutParams(-1, -1));
                waitForPicture(0);
            }
            @Override public void onHideCustomView() {
                if (custom != null) root.removeView(custom); custom = null;
            }
        });
        start = getIntent().getStringExtra("url");
        find = getIntent().getStringExtra("find");
        if (find != null) {
            android.content.SharedPreferences sp = getSharedPreferences("virgin", MODE_PRIVATE);
            for (String t : find.split("\\|")) {
                String path = sp.getString(norm(t), null);
                if (path != null) { start = "https://virgintvgo.virginmedia.com" + path; fromCache = true; break; }
            }
        }
        if (find != null) { cover.setVisibility(View.VISIBLE); ui.postDelayed(step, 1500); }
        web.loadUrl(start);
        web.requestFocus();
        ui.post(cursorWatch);
        ui.postDelayed(qualityWatch, 5000);
    }

    private final Runnable fill = new Runnable() {
        @Override public void run() {
            if (web == null || signIn()) return;   // sign-in pages are shown just as they are
            web.evaluateJavascript(FILL, r -> {
                boolean ok = r != null && r.contains("filled");
                if (ok && pageMode()) { if (!pageFull) { pageFull = true; ui.postDelayed(reveal, 400); } }
                else if (ok && custom == null && fsTries == 0) ui.postDelayed(WebPlayerActivity.this::goFull, 300);
                if (custom == null && tries++ < 20) ui.postDelayed(fill, ok ? 4000 : 800);
            });
        }
    };

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int k = e.getKeyCode();
        if (watching() && zapOn && (k == KeyEvent.KEYCODE_DPAD_CENTER || k == KeyEvent.KEYCODE_ENTER)) {
            if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) goZap();
            return true;
        }
        // ITVX / Prime programmes: ◀ ▶ (and ⏪ ⏩) move through the programme; ▲ opens the player menu
        if (watching() && onDemandSite() && (k == KeyEvent.KEYCODE_DPAD_LEFT || k == KeyEvent.KEYCODE_DPAD_RIGHT || k == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD || k == KeyEvent.KEYCODE_MEDIA_REWIND || k == KeyEvent.KEYCODE_DPAD_UP)) {
            if (e.getAction() == KeyEvent.ACTION_DOWN) {
                if (k == KeyEvent.KEYCODE_DPAD_UP) { if (e.getRepeatCount() == 0) adMenu(); }
                else {
                    int rep = Math.min(e.getRepeatCount(), 20);
                    int secs = k == KeyEvent.KEYCODE_DPAD_RIGHT ? 30 + rep * 15 : k == KeyEvent.KEYCODE_DPAD_LEFT ? -(10 + rep * 10) : k == KeyEvent.KEYCODE_MEDIA_FAST_FORWARD ? 60 : -60;
                    seekBy(secs);
                }
            }
            return true;
        }
        if (watching() && (k == KeyEvent.KEYCODE_DPAD_UP || k == KeyEvent.KEYCODE_DPAD_DOWN || k == KeyEvent.KEYCODE_CHANNEL_UP || k == KeyEvent.KEYCODE_CHANNEL_DOWN)) {
            if (e.getAction() == KeyEvent.ACTION_DOWN) moveZap(k == KeyEvent.KEYCODE_DPAD_UP || k == KeyEvent.KEYCODE_CHANNEL_UP ? -1 : 1);
            return true;
        }
        if (watching() && (k == KeyEvent.KEYCODE_DPAD_LEFT || k == KeyEvent.KEYCODE_DPAD_RIGHT)) {
            if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) {
                if (k == KeyEvent.KEYCODE_DPAD_LEFT) { if (onSky()) qualityMenu(); else adMenu(); }
                else { showStats = !showStats; stats.setVisibility(showStats ? View.VISIBLE : View.GONE); if (showStats) stats.bringToFront(); }
            }
            return true;
        }
        if (watching() && (k == KeyEvent.KEYCODE_DPAD_CENTER || k == KeyEvent.KEYCODE_ENTER || k == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
                || k == KeyEvent.KEYCODE_MEDIA_PAUSE || k == KeyEvent.KEYCODE_MEDIA_PLAY)) {
            if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) {
                if (k == KeyEvent.KEYCODE_MEDIA_PAUSE) { if (!userPaused) togglePause(); }
                else if (k == KeyEvent.KEYCODE_MEDIA_PLAY) { if (userPaused) togglePause(); }
                else togglePause();
            }
            return true;
        }
        if (pointerOn() && (k == KeyEvent.KEYCODE_DPAD_UP || k == KeyEvent.KEYCODE_DPAD_DOWN || k == KeyEvent.KEYCODE_DPAD_LEFT || k == KeyEvent.KEYCODE_DPAD_RIGHT
                || k == KeyEvent.KEYCODE_DPAD_CENTER || k == KeyEvent.KEYCODE_ENTER)) {
            if (e.getAction() != KeyEvent.ACTION_DOWN) return true;
            if (k == KeyEvent.KEYCODE_DPAD_CENTER || k == KeyEvent.KEYCODE_ENTER) { if (e.getRepeatCount() == 0) tap(cursor.x, cursor.y); return true; }
            float d = getResources().getDisplayMetrics().density, step = Math.min(42, 10 + e.getRepeatCount() * 4) * d;
            float w = root.getWidth(), h = root.getHeight();
            if (k == KeyEvent.KEYCODE_DPAD_LEFT) cursor.x = Math.max(0, cursor.x - step);
            if (k == KeyEvent.KEYCODE_DPAD_RIGHT) cursor.x = Math.min(w - 4, cursor.x + step);
            if (k == KeyEvent.KEYCODE_DPAD_UP) { if (cursor.y <= 8 * d) wheel(cursor.x, cursor.y + 20 * d, 1.5f); cursor.y = Math.max(0, cursor.y - step); }
            if (k == KeyEvent.KEYCODE_DPAD_DOWN) { if (cursor.y >= h - 30 * d) wheel(cursor.x, cursor.y - 20 * d, -1.5f); cursor.y = Math.min(h - 26 * d, cursor.y + step); }
            cursor.invalidate();
            return true;
        }
        if (e.getKeyCode() == KeyEvent.KEYCODE_BACK && e.getAction() == KeyEvent.ACTION_UP) {
            if (zapOn) { hideZap(); return true; }
            if (watching()) { finish(); return true; }
            if (find != null) { web.evaluateJavascript(DUMP, d -> { lastDump = d == null ? "" : d.replace("\\n", "\n").replace("\\\"", "\""); finish(); }); return true; }
            String u = web.getUrl();
            // during sign-in, Back steps back a page; on the player it returns to the guide
            if (web.canGoBack() && u != null && !u.contains("/iplayer/live/") && !u.contains("/iplayer/episode/")) { web.goBack(); return true; }
            finish();
            return true;
        }
        if (e.getKeyCode() == KeyEvent.KEYCODE_BACK) return true;
        return super.dispatchKeyEvent(e);
    }

    @Override protected void onStop() { super.onStop(); if (zapping) finish(); }
    @Override protected void onPause() { super.onPause(); ui.removeCallbacks(keepPlaying); ui.removeCallbacks(hush); if (web != null) web.onPause(); CookieManager.getInstance().flush(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); ui.removeCallbacks(keepPlaying); ui.postDelayed(keepPlaying, 8000); ui.removeCallbacks(hush); ui.post(hush); }
    @Override protected void onDestroy() { ui.removeCallbacks(cursorWatch); ui.removeCallbacks(fill); netPool.shutdownNow(); ui.removeCallbacks(step); ui.removeCallbacks(autoplay); ui.removeCallbacks(ownedSync); ui.removeCallbacks(spaFallback); ui.removeCallbacks(keepPlaying); ui.removeCallbacks(hush); ui.removeCallbacks(qualityWatch); if (web != null) { web.loadUrl("about:blank"); web.destroy(); web = null; } super.onDestroy(); }
}
