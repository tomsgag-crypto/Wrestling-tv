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
    private boolean pointerOn() { return cursor != null && custom == null && cover.getVisibility() != View.VISIBLE; }
    private void showCursor() { if (cursor != null) { cursor.setVisibility(pointerOn() ? View.VISIBLE : View.GONE); cursor.bringToFront(); cursor.invalidate(); } }
    private boolean userPaused = false;
    private final Runnable keepPlaying = new Runnable() { @Override public void run() {
        if (web == null) return;
        if (!userPaused && find == null) web.evaluateJavascript("(function(){function deep(r,d){if(!r||d>8)return null;var v=r.querySelector&&r.querySelector('video');if(v)return v;var a=r.querySelectorAll?r.querySelectorAll('*'):[];" +
            "for(var i=0;i<a.length;i++){if(a[i].shadowRoot){var f=deep(a[i].shadowRoot,d+1);if(f)return f;}}return null;}var v=deep(document,0);if(!v)return '';" +
            // watch the picture: restart it the moment the site pauses it, and note buffering, so we can tell which is happening
            "if(!v.__ftvW){v.__ftvW=1;window.__ftvLog=window.__ftvLog||[];v.addEventListener('pause',function(){if(window.__ftvUserPaused||v.ended)return;window.__ftvLog.push('paused');setTimeout(function(){if(v.paused&&!window.__ftvUserPaused)v.play();},150);});" +
            "v.addEventListener('waiting',function(){window.__ftvLog.push('buffering');});v.addEventListener('stalled',function(){window.__ftvLog.push('buffering');});}" +
            "if(v.paused&&!v.ended&&v.currentTime>1){v.play();window.__ftvLog=(window.__ftvLog||[]);window.__ftvLog.push('paused');}" +
            "var L=(window.__ftvLog||[]).join(',');window.__ftvLog=[];return L;})()", r -> {
                if (r == null) return;
                if (r.contains("capped")) { android.widget.Toast.makeText(WebPlayerActivity.this, "Smoother picture on (top quality skipped)", android.widget.Toast.LENGTH_SHORT).show(); }
                if (r.contains("paused")) note("Sky paused it – restarting");
                else if (r.contains("buffering")) note("Buffering…");
            });
        ui.postDelayed(this, 1000);
    } };
    private long lastNote = 0;
    private void note(String m) {
        long t = android.os.SystemClock.uptimeMillis();
        if (t - lastNote < 4000 || custom == null) return;
        lastNote = t;
        android.widget.Toast.makeText(this, m, android.widget.Toast.LENGTH_SHORT).show();
    }
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
    private final Runnable reveal = () -> { if (cover != null) cover.setVisibility(View.GONE); };
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
    private static final String FILL = "(function(){try{if(!/bbc\\.co\\.uk\\/iplayer\\/(live|episode)|skysports\\.com\\/watch/.test(location.href))return 'not player';var sky=/skysports/.test(location.host);function deep(root,depth){if(!root||depth>8)return null;var v=root.querySelector&&root.querySelector('video');if(v)return v; var all=root.querySelectorAll?root.querySelectorAll('*'):[];for(var i=0;i<all.length;i++){if(all[i].shadowRoot){var f=deep(all[i].shadowRoot,depth+1);if(f)return f;}}return null;}var v=deep(document,0);var t=null;if(v){t=v;while(t.getRootNode&&t.getRootNode()!==document){t=t.getRootNode().host;} var host=t;var p=t;while(p&&p.parentElement&&p.parentElement!==document.body){var r=p.parentElement.getBoundingClientRect(),q=t.getBoundingClientRect();if(r.width>q.width*1.15||r.height>q.height*1.3)break;p=p.parentElement;}t=p;}else if(sky){var pb=[].slice.call(document.querySelectorAll('button,[role=button],[class*=play],[class*=Play]')).filter(function(e){var r=e.getBoundingClientRect();return r.width>24&&r.width<260&&r.top>0&&/play/i.test((e.getAttribute('aria-label')||'')+' '+(typeof e.className==='string'?e.className:''))&&!/playlist|player-/i.test(e.className);})[0];if(pb&&(window.__ftvPb=(window.__ftvPb||0)+1)%6===1)pb.click();return 'waiting';}else{t=[].slice.call(document.querySelectorAll('iframe')).filter(function(x){return x.getBoundingClientRect().width>300;})[0]||null;}if(!t)return 'waiting';var W=window.innerWidth,H=window.innerHeight;var st=document.getElementById('ftv-fill');if(!st){st=document.createElement('style');st.id='ftv-fill';document.head.appendChild(st);}st.textContent='html,body{overflow:hidden!important;background:#000!important}'+ '.ftv-hide{visibility:hidden!important}.ftv-anc{transform:none!important;filter:none!important;contain:none!important;overflow:visible!important;z-index:auto!important;visibility:visible!important}'+ '.ftv-full{width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;margin:0!important;transform:none!important}.ftv-big{position:fixed!important;left:0!important;top:0!important;width:'+W+'px!important;height:'+H+'px!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;border:0!important;z-index:2147483647!important;background:#000!important;visibility:visible!important;transform:none!important}';t.classList.add('ftv-big');if(v){var c=v,n=0;while(c&&c!==t&&n++<60){if(c.style){['width','height'].forEach(function(k){c.style.setProperty(k,'100%','important');});c.style.setProperty('max-width','none','important');c.style.setProperty('max-height','none','important');c.style.setProperty('transform','none','important');c.style.setProperty('padding','0','important');c.style.setProperty('margin','0','important');try{var cs=getComputedStyle(c);if(cs.position==='absolute'||cs.position==='fixed'){c.style.setProperty('top','0','important');c.style.setProperty('left','0','important');c.style.setProperty('bottom','auto','important');c.style.setProperty('right','auto','important');}}catch(e){}}c=c.parentElement||(c.getRootNode&&c.getRootNode().host)||null;}v.style.setProperty('object-fit','contain','important');}var a=t.parentElement;while(a&&a!==document.documentElement){a.classList.add('ftv-anc');[].forEach.call(a.children,function(c){if(c!==t&&!c.contains(t)&&!c.classList.contains('ftv-anc'))c.classList.add('ftv-hide');});a=a.parentElement;}window.scrollTo(0,0);if(v){v.style.objectFit='contain';if(v.paused&&!window.__ftvUserPaused&&!window.__ftvStarted){try{v.play();}catch(e){}}if(!v.paused)window.__ftvStarted=1;}return 'filled';}catch(e){return 'err '+e;}})()";

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
        "if(/skysports|sky\\.com/.test(location.host)){var D=Document.prototype;try{Object.defineProperty(D,'hidden',{get:function(){return false;},configurable:true});Object.defineProperty(D,'visibilityState',{get:function(){return 'visible';},configurable:true});}catch(e){}" +
        "D.hasFocus=function(){return true;};var ae=EventTarget.prototype.addEventListener;EventTarget.prototype.addEventListener=function(t,f,o){if(t==='visibilitychange'||t==='webkitvisibilitychange'||(t==='blur'&&this===window)||t==='pagehide'||t==='freeze')return;return ae.call(this,t,f,o);};" +
        // Sky sends up to 12 Mbps; drop the top picture qualities from its stream list so the Chromecast's connection keeps up
        "var CAP=6000000;function capMpd(t){try{if(typeof t!=='string'||t.indexOf('<MPD')<0)return t;var x=new DOMParser().parseFromString(t,'application/xml');if(x.getElementsByTagName('parsererror').length)return t;var n=0;" +
        "[].forEach.call(x.getElementsByTagName('AdaptationSet'),function(a){var reps=[].slice.call(a.getElementsByTagName('Representation'));var vid=/video/.test((a.getAttribute('mimeType')||'')+(a.getAttribute('contentType')||''))||reps.some(function(r){return /video/.test(r.getAttribute('mimeType')||'')||r.hasAttribute('height');});if(!vid||reps.length<2)return;" +
        "var keep=reps.filter(function(r){return +r.getAttribute('bandwidth')<=CAP;});if(!keep.length)keep=[reps.sort(function(p,q){return p.getAttribute('bandwidth')-q.getAttribute('bandwidth');})[0]];reps.forEach(function(r){if(keep.indexOf(r)<0){r.parentNode.removeChild(r);n++;}});});" +
        "if(n){window.__ftvLog=window.__ftvLog||[];if(!window.__ftvCapped){window.__ftvCapped=1;window.__ftvLog.push('capped');}}return n?new XMLSerializer().serializeToString(x):t;}catch(e){return t;}}" +
        "var F=window.fetch;window.fetch=function(i,o){return F.apply(this,arguments).then(function(r){try{var u=r.url||'';var ct=r.headers.get('content-type')||'';if(!/\\.mpd|dash/i.test(u+ct))return r;return r.clone().text().then(function(t){var c=capMpd(t);if(c===t)return r;var nr=new Response(c,{status:r.status,statusText:r.statusText,headers:r.headers});try{Object.defineProperty(nr,'url',{value:u});}catch(e){}return nr;});}catch(e){return r;}});};" +
        "var XP=XMLHttpRequest.prototype,xo=XP.open;XP.open=function(m,u){this.__ftvU=String(u||'');return xo.apply(this,arguments);};" +
        "['responseText','response'].forEach(function(k){var d=Object.getOwnPropertyDescriptor(XP,k);if(!d||!d.get)return;Object.defineProperty(XP,k,{configurable:true,get:function(){var v=d.get.call(this);try{if(this.readyState!==4||!/\\.mpd/i.test(this.__ftvU||''))return v;if(this.__ftvC&&this.__ftvC[0]===v)return this.__ftvC[1];var out=v;" +
        "if(typeof v==='string')out=capMpd(v);else if(v instanceof ArrayBuffer){var t=new TextDecoder().decode(v),c=capMpd(t);out=c===t?v:new TextEncoder().encode(c).buffer;}this.__ftvC=[v,out];return out;}catch(e){return v;}}});});" +
        "var IO=window.IntersectionObserver;if(IO){window.IntersectionObserver=function(cb,opt){var o=new IO(function(es,ob){cb(es.map(function(e){return {target:e.target,time:e.time,rootBounds:e.rootBounds,boundingClientRect:e.boundingClientRect,intersectionRect:e.boundingClientRect,isIntersecting:true,isVisible:true,intersectionRatio:1};}),ob);},opt);return o;};window.IntersectionObserver.prototype=IO.prototype;}}" +
        "}catch(e){}})();";
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
                androidx.webkit.WebViewCompat.addDocumentStartJavaScript(web, DESKTOP, java.util.Collections.singleton("*"));
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
            @Override public void onPageStarted(WebView v, String url, android.graphics.Bitmap icon) {
                fsTries = 0;
                if (!androidx.webkit.WebViewFeature.isFeatureSupported(androidx.webkit.WebViewFeature.DOCUMENT_START_SCRIPT)) v.evaluateJavascript(DESKTOP, null);
                // keep the page hidden while the player is set up; show other pages (sign-in, TV licence) straight away
                ui.removeCallbacks(reveal);
                if (find != null) { /* the step loop decides */ }
                else if (isPlayer(url)) { cover.setVisibility(View.VISIBLE); ui.postDelayed(reveal, 15000); } else cover.setVisibility(View.GONE);
            }
            @Override public void onPageFinished(WebView v, String url) {
                if (!isPlayer(url) && find == null) cover.setVisibility(View.GONE);
                CookieManager.getInstance().flush();
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
    }

    private final Runnable fill = new Runnable() {
        @Override public void run() {
            if (web == null) return;
            web.evaluateJavascript(FILL, r -> {
                boolean ok = r != null && r.contains("filled");
                if (ok && custom == null && fsTries == 0) ui.postDelayed(WebPlayerActivity.this::goFull, 300);
                if (custom == null && tries++ < 20) ui.postDelayed(fill, ok ? 4000 : 800);
            });
        }
    };

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int k = e.getKeyCode();
        if (custom != null && (k == KeyEvent.KEYCODE_DPAD_CENTER || k == KeyEvent.KEYCODE_ENTER || k == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE
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
            if (custom != null) { finish(); return true; }
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

    @Override protected void onPause() { super.onPause(); ui.removeCallbacks(keepPlaying); if (web != null) web.onPause(); CookieManager.getInstance().flush(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); ui.removeCallbacks(keepPlaying); ui.postDelayed(keepPlaying, 8000); }
    @Override protected void onDestroy() { ui.removeCallbacks(cursorWatch); ui.removeCallbacks(fill); ui.removeCallbacks(step); ui.removeCallbacks(keepPlaying); if (web != null) { web.loadUrl("about:blank"); web.destroy(); web = null; } super.onDestroy(); }
}
