package tv.freetvguide.app;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.TypedValue;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Plays Pluto TV's free channels (and Pluto films) inside Free TV, so channels change instantly and open straight away.
 * Extras: "channels" = JSON [{id, name, num, ev:[[startSec, endSec, title], …]}], "index"; or "episode" + "title" for a film.
 */
public class PlayerActivity extends Activity {
    private ExoPlayer player;
    private DefaultHttpDataSource.Factory http;
    private PlayerView view;
    private TextView info1, info2, info3;
    private LinearLayout infoBox;
    private JSONArray chans = new JSONArray();
    private int idx = 0;
    private String episode, title;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService net = Executors.newSingleThreadExecutor();
    private static String stitcher, params, jwt;
    private static long bootAt = 0;
    private int retries = 0;
    private int typed = -1;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        view = new PlayerView(this);
        view.setUseController(false);
        root.addView(view, new FrameLayout.LayoutParams(-1, -1));

        infoBox = new LinearLayout(this);
        infoBox.setOrientation(LinearLayout.VERTICAL);
        infoBox.setBackgroundColor(0xDD070B16);
        int pad = dp(18);
        infoBox.setPadding(pad * 2, pad, pad * 2, pad);
        info1 = text(14, 0xFF2BE0A8, true);
        info2 = text(24, Color.WHITE, true);
        info3 = text(14, 0xFFC3CCE4, false);
        infoBox.addView(info1); infoBox.addView(info2); infoBox.addView(info3);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
        root.addView(infoBox, lp);
        setContentView(root);

        try {
            String c = getIntent().getStringExtra("channels");
            if (c != null) chans = new JSONArray(c);
        } catch (Exception ignored) { }
        idx = getIntent().getIntExtra("index", 0);
        episode = getIntent().getStringExtra("episode");
        title = getIntent().getStringExtra("title");

        http = new DefaultHttpDataSource.Factory().setAllowCrossProtocolRedirects(true).setConnectTimeoutMs(15000).setReadTimeoutMs(20000);
        player = new ExoPlayer.Builder(this).setMediaSourceFactory(new DefaultMediaSourceFactory(http)).build();
        view.setPlayer(player);
        player.addListener(new Player.Listener() {
            @Override public void onPlayerError(PlaybackException e) {
                // sessions expire: get a fresh one and try again
                if (retries++ < 1) { bootAt = 0; play(); }
                else { info3.setText("This channel won't play right now – try another (▲ ▼)"); showInfo(8000); }
            }
            @Override public void onPlaybackStateChanged(int s) { if (s == Player.STATE_READY) retries = 0; }
        });

        GestureDetector g = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override public boolean onSingleTapConfirmed(MotionEvent e) { showInfo(5000); return true; }
            @Override public boolean onFling(MotionEvent a, MotionEvent e2, float vx, float vy) {
                if (episode != null || a == null) return false;
                if (Math.abs(vy) > Math.abs(vx)) { zap(vy < 0 ? 1 : -1); return true; }
                return false;
            }
        });
        view.setOnTouchListener((v, e) -> { g.onTouchEvent(e); return true; });
        play();
    }

    private TextView text(int sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(t.getTypeface(), android.graphics.Typeface.BOLD);
        t.setSingleLine(false);
        return t;
    }
    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density); }

    /** Pluto's start-up call: gives the stream server, its settings and a session token (lasts a few hours). */
    private void boot() throws Exception { boot(this); }
    static synchronized void boot(android.content.Context ctx) throws Exception {
        if (jwt != null && System.currentTimeMillis() - bootAt < 3 * 3600 * 1000) return;
        String id = ctx.getSharedPreferences("pluto", MODE_PRIVATE).getString("id", null);
        if (id == null) { id = UUID.randomUUID().toString(); ctx.getSharedPreferences("pluto", MODE_PRIVATE).edit().putString("id", id).apply(); }
        String u = "https://boot.pluto.tv/v4/start?appName=web&appVersion=9.0.0&deviceVersion=120.0.0&deviceModel=web&deviceMake=chrome&deviceType=web&clientID=" + id +
                "&clientModelNumber=1.0.0&serverSideAds=false&drmCapabilities=widevine%3AL3&blockingMode=&notificationVersion=1&appLaunchCount=0&lastAppLaunchDate=";
        JSONObject j = new JSONObject(get(u));
        stitcher = j.getJSONObject("servers").getString("stitcher");
        params = j.getString("stitcherParams");
        jwt = j.getString("sessionToken");
        bootAt = System.currentTimeMillis();
    }
    /** The stream address for a channel entry (Pluto ones need the start-up call first). Blocking: call off the main thread. */
    static String streamUrl(android.content.Context ctx, JSONObject c) throws Exception {
        String direct = c.optString("url");
        if (!direct.isEmpty()) return direct;
        boot(ctx);
        return stitcher + "/v2/stitch/hls/channel/" + c.optString("id") + "/master.m3u8?" + params + "&jwt=" + jwt + "&masterJWTPassthrough=true";
    }
    static String userAgent(JSONObject c) {
        return c != null && !c.optString("ua").isEmpty() ? c.optString("ua") : "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";
    }

    /** Back: hand the channel to the guide, which keeps it playing in its small window. */
    @Override
    public void onBackPressed() {
        if (episode == null && chans.length() > 0) setResult(RESULT_OK, new android.content.Intent().putExtra("channels", chans.toString()).putExtra("index", idx));
        finish();
    }

    private static String get(String u) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
        c.setConnectTimeout(15000); c.setReadTimeout(20000);
        c.setRequestProperty("User-Agent", "Mozilla/5.0");
        try (InputStream in = c.getInputStream()) {
            ByteArrayOutputStream o = new ByteArrayOutputStream(); byte[] buf = new byte[16384]; int n;
            while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
            return new String(o.toByteArray(), StandardCharsets.UTF_8);
        } finally { c.disconnect(); }
    }

    private void play() {
        updateInfo();
        showInfo(5000);
        final JSONObject cur = episode != null ? null : chans.optJSONObject(idx);
        final String direct = cur == null ? "" : cur.optString("url");
        http.setUserAgent(cur != null && !cur.optString("ua").isEmpty() ? cur.optString("ua") : "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120.0 Safari/537.36");
        if (!direct.isEmpty()) {
            // Samsung TV Plus and Plex: a ready-made stream address
            player.setMediaItem(new MediaItem.Builder().setUri(Uri.parse(direct)).setMimeType(MimeTypes.APPLICATION_M3U8).build());
            player.prepare();
            player.setPlayWhenReady(true);
            return;
        }
        final String what = episode != null ? "episode/" + episode : "channel/" + cur.optString("id");
        net.execute(() -> {
            try {
                boot();
                String url = stitcher + "/v2/stitch/hls/" + what + "/master.m3u8?" + params + "&jwt=" + jwt + "&masterJWTPassthrough=true";
                ui.post(() -> {
                    player.setMediaItem(new MediaItem.Builder().setUri(Uri.parse(url)).setMimeType(MimeTypes.APPLICATION_M3U8).build());
                    player.prepare();
                    player.setPlayWhenReady(true);
                });
            } catch (Exception e) {
                ui.post(() -> { info3.setText("Couldn't reach Pluto TV – check the internet connection"); showInfo(8000); });
            }
        });
    }

    private void zap(int d) {
        if (episode != null || chans.length() == 0) return;
        idx = (idx + d + chans.length()) % chans.length();
        retries = 0;
        player.stop();
        play();
        getSharedPreferences("pluto", MODE_PRIVATE).edit().putString("last", chans.optJSONObject(idx).optString("id")).apply();
    }

    private void updateInfo() {
        if (episode != null) { info1.setText("PLUTO TV"); info2.setText(title == null ? "" : title); info3.setText("Back to return to Free TV"); return; }
        JSONObject c = chans.optJSONObject(idx);
        if (c == null) return;
        info1.setText((c.optInt("num") > 0 ? c.optInt("num") + "  " : "") + c.optString("name") + "  ·  " + c.optString("svc", "PLUTO TV") + "  ·  " + (idx + 1) + " of " + chans.length());
        long now = System.currentTimeMillis() / 1000;
        String nowT = "", nextT = "";
        JSONArray ev = c.optJSONArray("ev");
        if (ev != null) for (int i = 0; i < ev.length(); i++) {
            JSONArray e = ev.optJSONArray(i);
            if (e == null) continue;
            if (e.optLong(0) <= now && e.optLong(1) > now) nowT = e.optString(2);
            else if (e.optLong(0) > now && nextT.isEmpty()) nextT = clock(e.optLong(0)) + "  " + e.optString(2);
        }
        info2.setText(nowT.isEmpty() ? c.optString("name") : nowT);
        info3.setText((nextT.isEmpty() ? "" : "Next: " + nextT + "     ") + "▲ ▼ change channel · Back to the guide");
    }
    private static String clock(long s) {
        java.util.Calendar k = java.util.Calendar.getInstance(); k.setTimeInMillis(s * 1000);
        int h = k.get(java.util.Calendar.HOUR_OF_DAY), m = k.get(java.util.Calendar.MINUTE);
        return (h % 12 == 0 ? 12 : h % 12) + ":" + (m < 10 ? "0" : "") + m + (h < 12 ? "am" : "pm");
    }
    private final Runnable hide = () -> infoBox.setVisibility(View.GONE);
    private void showInfo(long ms) {
        infoBox.setVisibility(View.VISIBLE);
        ui.removeCallbacks(hide);
        ui.postDelayed(hide, ms);
    }

    @Override
    public boolean onKeyDown(int k, KeyEvent e) {
        switch (k) {
            case KeyEvent.KEYCODE_DPAD_UP: case KeyEvent.KEYCODE_CHANNEL_UP: case KeyEvent.KEYCODE_PAGE_UP: zap(1); return true;
            case KeyEvent.KEYCODE_DPAD_DOWN: case KeyEvent.KEYCODE_CHANNEL_DOWN: case KeyEvent.KEYCODE_PAGE_DOWN: zap(-1); return true;
            case KeyEvent.KEYCODE_DPAD_CENTER: case KeyEvent.KEYCODE_ENTER: case KeyEvent.KEYCODE_INFO:
            case KeyEvent.KEYCODE_DPAD_LEFT: case KeyEvent.KEYCODE_DPAD_RIGHT:
                updateInfo(); showInfo(6000); return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: case KeyEvent.KEYCODE_MEDIA_PAUSE: case KeyEvent.KEYCODE_MEDIA_PLAY:
                if (episode != null) player.setPlayWhenReady(!player.getPlayWhenReady()); return true;
        }
        return super.onKeyDown(k, e);
    }

    @Override protected void onStop() { super.onStop(); stopped = true; if (player != null) player.pause(); }
    private boolean stopped = false;
    @Override protected void onStart() {
        super.onStart();
        if (stopped && player != null) { if (episode == null) play(); else player.play(); }   // live: catch up to now
        stopped = false;
    }
    @Override protected void onDestroy() { super.onDestroy(); if (player != null) player.release(); net.shutdownNow(); }
}
