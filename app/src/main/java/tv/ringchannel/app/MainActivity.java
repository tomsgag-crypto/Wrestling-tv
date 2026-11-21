package tv.ringchannel.app;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Ring Channel TV – a simple cable-box style player for the Slamvision channels.
 * It reads the channel schedule from the site's guide feed and plays each channel itself,
 * full screen at its original shape, joining whatever is on air right now.
 *
 *  Watching:  ▲ ▼ / CH+ CH−  change channel   ·  OK / Menu  open the guide   ·  Back twice  exit
 *  Guide:     ▲ ▼  choose a channel  ·  ◀ ▶  page up / down  ·  OK  watch it  ·  Back  close
 */
public class MainActivity extends Activity {

    private static final String BASE = "https://ring-channel-tv.emergent.host";
    private static final String GUIDE_URL = BASE + "/api/guide";
    private static final int BLUE = 0xFF1030C8, DARK = 0xFF0A1A7A, YELLOW = 0xFFFFD400, ROW = 0xFF1838E0;

    static class Prog { String title, episode, url; long start, end; }
    static class Chan { String id, callsign, name; int number; final List<Prog> slots = new ArrayList<>(); }

    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private SharedPreferences prefs;

    private List<Chan> chans = new ArrayList<>();
    private long clockOffset = 0;          // server clock minus this device's clock
    private int cur = -1;                  // index of the channel being watched
    private long lastBack = 0;
    private boolean loading = false;
    private int tuneSeq = 0;                                   // ignores answers for channels you've already left
    private final List<Prog> playlist = new ArrayList<>();     // what's queued in the player
    private Runnable pendingThen = null;     // what to do once the guide has loaded
    private long lastRefreshForTune = 0;

    private FrameLayout root;
    private PlayerView pv;
    private ExoPlayer player;
    private LinearLayout guide, guideTop, rowsBox, banner;
    private View videoSpace;
    private ScrollView scroll;
    private TextView infoChan, infoTitle, infoEp, infoTime, clock, status;
    private TextView bannerNum, bannerName, bannerNow;
    private final List<LinearLayout> rows = new ArrayList<>();

    // ------------------------------------------------------------------ setup

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        prefs = getSharedPreferences("ring", MODE_PRIVATE);
        buildUi();

        DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                .setAllowCrossProtocolRedirects(true)
                .setUserAgent("RingChannelTV/2.0 (Android)")
                .setConnectTimeoutMs(20000).setReadTimeoutMs(30000);
        player = new ExoPlayer.Builder(this)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(new DefaultDataSource.Factory(this, http)))
                .build();
        player.setVolume(1f);
        pv.setPlayer(player);
        player.addListener(new Player.Listener() {
            @Override public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_READY) hideStatus();
                if (state == Player.STATE_BUFFERING) showStatus("Tuning…");
                if (state == Player.STATE_ENDED && cur >= 0) tune(cur);   // ask the channel what's on next
            }
            @Override public void onMediaItemTransition(MediaItem item, int reason) {
                if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO) showBanner();
            }
            @Override public void onPlayerError(PlaybackException e) {
                showStatus("Signal lost – moving on…");
                if (player.hasNextMediaItem()) { player.seekToNextMediaItem(); player.prepare(); player.play(); }
                else if (cur >= 0) ui.postDelayed(() -> tune(cur), 3000);
            }
        });

        showStatus("Loading channels…");
        loadGuide(() -> {
            String last = prefs.getString("channel", null);
            int idx = 0;
            for (int i = 0; i < chans.size(); i++) if (chans.get(i).id.equals(last)) idx = i;
            tune(idx);
        });
        ui.postDelayed(periodic, 60_000);
    }

    /** Every minute: update the guide text; every 10 minutes: fetch a fresh schedule. */
    private int ticks = 0;
    private final Runnable periodic = new Runnable() {
        @Override public void run() {
            if (++ticks % 10 == 0) loadGuide(null);
            else updateRowTexts();
            clock.setText(time(now()));
            ui.postDelayed(this, 60_000);
        }
    };

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private TextView text(float sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setSingleLine(true);
        t.setEllipsize(TextUtils.TruncateAt.END);
        return t;
    }

    private void buildUi() {
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        // ----- guide (behind the picture; the picture shrinks into its top-right corner)
        guide = new LinearLayout(this);
        guide.setOrientation(LinearLayout.VERTICAL);
        guide.setBackgroundColor(DARK);
        guide.setVisibility(View.GONE);

        guideTop = new LinearLayout(this);
        guideTop.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout info = new LinearLayout(this);
        info.setOrientation(LinearLayout.VERTICAL);
        info.setPadding(dp(24), dp(18), dp(16), dp(8));
        TextView brand = text(22, YELLOW, true);
        brand.setText("SLAMVISION PREVUE GUIDE");
        clock = text(16, Color.WHITE, true);
        infoChan = text(18, 0xFF7FE0FF, true);
        infoTitle = text(24, Color.WHITE, true);
        infoTitle.setSingleLine(false);
        infoTitle.setMaxLines(2);
        infoEp = text(16, 0xFFDDE4FF, false);
        infoTime = text(16, YELLOW, false);
        info.addView(brand);
        info.addView(clock);
        View gap = new View(this);
        info.addView(gap, new LinearLayout.LayoutParams(1, dp(10)));
        info.addView(infoChan);
        info.addView(infoTitle);
        info.addView(infoEp);
        info.addView(infoTime);
        guideTop.addView(info, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f));
        videoSpace = new View(this);
        guideTop.addView(videoSpace, new LinearLayout.LayoutParams(dp(300), ViewGroup.LayoutParams.MATCH_PARENT));
        guide.addView(guideTop, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(200)));

        LinearLayout head = new LinearLayout(this);
        head.setBackgroundColor(BLUE);
        head.setPadding(dp(16), dp(6), dp(16), dp(6));
        head.addView(colText("CHANNEL", 0.22f));
        head.addView(colText("ON NOW", 0.42f));
        head.addView(colText("NEXT", 0.36f));
        guide.addView(head, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        rowsBox = new LinearLayout(this);
        rowsBox.setOrientation(LinearLayout.VERTICAL);
        rowsBox.setPadding(dp(8), dp(4), dp(8), dp(40));
        scroll.addView(rowsBox);
        guide.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        root.addView(guide, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // ----- the picture
        pv = new PlayerView(this);
        pv.setUseController(false);
        pv.setResizeMode(AspectRatioFrameLayout.RESIZE_MODE_FIT);     // keep the original shape
        pv.setShutterBackgroundColor(Color.BLACK);
        pv.setBackgroundColor(Color.BLACK);
        pv.setFocusable(false);
        pv.setOnClickListener(v -> { if (guide.getVisibility() == View.VISIBLE) closeGuide(); else openGuide(); });
        root.addView(pv, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // ----- channel banner (top-left, shown briefly when you change channel)
        banner = new LinearLayout(this);
        banner.setOrientation(LinearLayout.VERTICAL);
        banner.setPadding(dp(18), dp(12), dp(22), dp(14));
        GradientDrawable bb = new GradientDrawable();
        bb.setColor(0xE60A1A7A);
        bb.setCornerRadius(dp(10));
        bb.setStroke(dp(2), YELLOW);
        banner.setBackground(bb);
        bannerNum = text(28, YELLOW, true);
        bannerName = text(17, Color.WHITE, true);
        bannerNow = text(16, 0xFFDDE4FF, false);
        bannerNow.setSingleLine(false);
        bannerNow.setMaxLines(2);
        banner.addView(bannerNum);
        banner.addView(bannerName);
        banner.addView(bannerNow);
        banner.setVisibility(View.GONE);
        FrameLayout.LayoutParams blp = new FrameLayout.LayoutParams(dp(460), ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP | Gravity.START);
        blp.setMargins(dp(28), dp(24), 0, 0);
        root.addView(banner, blp);

        // ----- status line (centre)
        status = text(20, Color.WHITE, true);
        status.setPadding(dp(18), dp(10), dp(18), dp(10));
        GradientDrawable sb = new GradientDrawable();
        sb.setColor(0xCC000000);
        sb.setCornerRadius(dp(8));
        status.setBackground(sb);
        status.setVisibility(View.GONE);
        root.addView(status, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        setContentView(root);
    }

    private TextView colText(String s, float weight) {
        TextView t = text(14, YELLOW, true);
        t.setText(s);
        t.setLayoutParams(new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, weight));
        return t;
    }

    // ------------------------------------------------------------------ schedule

    private long now() { return System.currentTimeMillis() + clockOffset; }

    private static String get(String u) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(u).openConnection();
        c.setConnectTimeout(20000);
        c.setReadTimeout(30000);
        c.setRequestProperty("User-Agent", "RingChannelTV/2.0 (Android)");
        c.setRequestProperty("Accept", "application/json");
        try (InputStream in = c.getInputStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] b = new byte[32768];
            int n;
            while ((n = in.read(b)) > 0) out.write(b, 0, n);
            return out.toString("UTF-8");
        } finally {
            c.disconnect();
        }
    }

    /** "2026-11-13T17:48:06.695000Z" (or +00:00, or no zone = UTC) -> epoch ms */
    static long parseIso(String s) {
        if (s == null || s.length() < 19) return 0;
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
            f.setTimeZone(TimeZone.getTimeZone("UTC"));
            long t = f.parse(s.substring(0, 19)).getTime();
            int i = 19;
            if (i < s.length() && s.charAt(i) == '.') {
                int j = i + 1;
                while (j < s.length() && Character.isDigit(s.charAt(j))) j++;
                t += Integer.parseInt((s.substring(i + 1, j) + "000").substring(0, 3));
                i = j;
            }
            if (i + 2 < s.length() && (s.charAt(i) == '+' || s.charAt(i) == '-')) {
                int hh = Integer.parseInt(s.substring(i + 1, i + 3));
                int mm = s.length() >= i + 6 ? Integer.parseInt(s.substring(i + 4, i + 6)) : 0;
                long o = (hh * 60L + mm) * 60_000L;
                t += s.charAt(i) == '+' ? -o : o;
            }
            return t;
        } catch (Exception e) {
            return 0;
        }
    }

    private void loadGuide(Runnable then) {
        if (then != null) pendingThen = then;
        if (loading) return;
        loading = true;
        io.execute(() -> {
            try {
                JSONObject j = new JSONObject(get(GUIDE_URL));
                long server = parseIso(j.optString("server_time"));
                long off = server > 0 ? server - System.currentTimeMillis() : 0;
                JSONArray rowsJ = j.getJSONArray("rows");
                List<Chan> list = new ArrayList<>();
                for (int r = 0; r < rowsJ.length(); r++) {
                    JSONObject row = rowsJ.getJSONObject(r);
                    JSONObject ch = row.getJSONObject("channel");
                    Chan c = new Chan();
                    c.id = ch.optString("id");
                    c.number = ch.optInt("number", r + 1);
                    c.callsign = ch.optString("callsign", "");
                    c.name = ch.optString("name", c.callsign);
                    JSONArray slots = row.optJSONArray("slots");
                    if (slots != null) for (int k = 0; k < slots.length(); k++) {
                        JSONObject s = slots.getJSONObject(k);
                        JSONObject p = s.optJSONObject("program");
                        if (p == null) continue;
                        Prog g = new Prog();
                        g.url = p.optString("stream_url", "");
                        g.title = p.optString("title", p.optString("raw_title", ""));
                        g.episode = p.optString("episode", "");
                        g.start = parseIso(s.optString("start"));
                        g.end = parseIso(s.optString("end"));
                        if (g.end > g.start) c.slots.add(g);
                    }
                    Collections.sort(c.slots, (a, b) -> Long.compare(a.start, b.start));
                    if (!c.slots.isEmpty()) list.add(c);
                }
                Collections.sort(list, (a, b) -> Integer.compare(a.number, b.number));
                ui.post(() -> {
                    loading = false;
                    if (list.isEmpty()) { showStatus("No channels on air right now"); return; }
                    String keep = cur >= 0 && cur < chans.size() ? chans.get(cur).id : null;
                    chans = list;
                    clockOffset = off;
                    cur = -1;
                    if (keep != null) for (int i = 0; i < chans.size(); i++) if (chans.get(i).id.equals(keep)) cur = i;
                    buildRows();
                    Runnable r = pendingThen;
                    pendingThen = null;
                    if (r != null) r.run();
                });
            } catch (Exception e) {
                ui.post(() -> {
                    loading = false;
                    showStatus("Can't reach Ring Channel – retrying…");
                    ui.postDelayed(() -> loadGuide(null), 15_000);
                });
            }
        });
    }

    private void refreshAndRetune() {
        loadGuide(() -> tune(cur < 0 ? 0 : cur));
    }

    /** Index of the programme on air now (or the next one), or -1. */
    private int nowIndex(Chan c) {
        long t = now();
        for (int k = 0; k < c.slots.size(); k++) if (c.slots.get(k).end > t) return k;
        return -1;
    }

    // ------------------------------------------------------------------ watching

    private void tune(int idx) {
        if (chans.isEmpty()) return;
        int n = chans.size();
        idx = ((idx % n) + n) % n;
        cur = idx;
        final Chan c = chans.get(idx);
        prefs.edit().putString("channel", c.id).apply();
        final int seq = ++tuneSeq;
        showBanner();
        highlightCurrentRow();
        showStatus("Tuning…");
        io.execute(() -> {
            try {
                JSONObject j = new JSONObject(get(BASE + "/api/channels/" + java.net.URLEncoder.encode(c.id, "UTF-8") + "/now"));
                long server = parseIso(j.optString("server_time"));
                List<Prog> list = new ArrayList<>();
                Prog first = slotProg(j.optJSONObject("current"));
                if (first != null) list.add(first);
                JSONArray next = j.optJSONArray("up_next");
                if (next != null) for (int k = 0; k < next.length(); k++) {
                    Prog p = slotProg(next.optJSONObject(k));
                    if (p != null) list.add(p);
                }
                double off = j.optDouble("offset_seconds", Double.NaN);
                long offMs = !Double.isNaN(off) ? (long) (off * 1000)
                        : (first != null && server > 0 ? Math.max(0, server - first.start) : 0);
                final long serverOff = server > 0 ? server - System.currentTimeMillis() : clockOffset;
                ui.post(() -> {
                    if (seq != tuneSeq) return;                  // you've already flicked to another channel
                    clockOffset = serverOff;
                    if (list.isEmpty()) { showStatus("Nothing on this channel right now"); return; }
                    play(list, offMs);
                });
            } catch (Exception e) {
                ui.post(() -> {
                    if (seq != tuneSeq) return;
                    showStatus("Can't tune in – retrying…");
                    ui.postDelayed(() -> { if (seq == tuneSeq) tune(cur); }, 8000);
                });
            }
        });
    }

    /** {program:{stream_url,title,episode}, start, end} -> Prog (null if it has no video link) */
    private static Prog slotProg(JSONObject slot) {
        if (slot == null) return null;
        JSONObject p = slot.optJSONObject("program");
        if (p == null) return null;
        Prog g = new Prog();
        g.url = p.optString("stream_url", "");
        if (g.url.isEmpty()) return null;
        g.title = p.optString("title", p.optString("raw_title", ""));
        g.episode = p.optString("episode", "");
        g.start = parseIso(slot.optString("start"));
        g.end = parseIso(slot.optString("end"));
        return g;
    }

    private void play(List<Prog> list, long offsetMs) {
        playlist.clear();
        playlist.addAll(list);
        List<MediaItem> items = new ArrayList<>();
        for (int k = 0; k < list.size(); k++) {
            Prog p = list.get(k);
            items.add(new MediaItem.Builder()
                    .setUri(p.url)
                    .setMediaId("p" + k)
                    .setMediaMetadata(new MediaMetadata.Builder().setTitle(p.title).build())
                    .build());
        }
        player.setMediaItems(items, 0, Math.max(0, offsetMs));     // join it live, part-way through
        player.setVolume(1f);
        player.prepare();
        player.play();
        showBanner();
    }

    private Prog onNow(Chan c) {
        int i = nowIndex(c);
        return i >= 0 ? c.slots.get(i) : null;
    }

    private Prog playingNow() {
        MediaItem m = player.getCurrentMediaItem();
        if (m != null && m.mediaId.startsWith("p")) {
            try {
                int k = Integer.parseInt(m.mediaId.substring(1));
                if (k < playlist.size()) return playlist.get(k);
            } catch (Exception ignored) { }
        }
        if (cur < 0 || cur >= chans.size()) return null;
        return onNow(chans.get(cur));
    }

    private String time(long ms) {
        SimpleDateFormat f = new SimpleDateFormat("h:mm", Locale.UK);
        return f.format(new Date(ms));
    }

    private static String chLabel(Chan c) {
        return String.format(Locale.UK, "%02d", c.number) + "  " + c.callsign;
    }

    private final Runnable hideBanner = () -> banner.setVisibility(View.GONE);

    private void showBanner() {
        if (cur < 0 || guide.getVisibility() == View.VISIBLE) return;
        Chan c = chans.get(cur);
        Prog p = playingNow();
        bannerNum.setText("CH " + chLabel(c));
        bannerName.setText(c.name);
        bannerNow.setText(p == null ? "" : "NOW: " + p.title + (p.episode.isEmpty() ? "" : "  ·  " + p.episode)
                + "\n" + time(p.start) + " – " + time(p.end));
        banner.setVisibility(View.VISIBLE);
        ui.removeCallbacks(hideBanner);
        ui.postDelayed(hideBanner, 5000);
    }

    private final Runnable hideStatusR = () -> status.setVisibility(View.GONE);
    private void showStatus(String s) {
        status.setText(s);
        status.setVisibility(View.VISIBLE);
        ui.removeCallbacks(hideStatusR);
        ui.postDelayed(hideStatusR, 8000);
    }
    private void hideStatus() { status.setVisibility(View.GONE); }

    // ------------------------------------------------------------------ guide

    private void buildRows() {
        rowsBox.removeAllViews();
        rows.clear();
        for (int i = 0; i < chans.size(); i++) {
            final int idx = i;
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setPadding(dp(10), dp(8), dp(10), dp(8));
            row.setFocusable(true);
            row.setFocusableInTouchMode(false);
            row.setClickable(true);

            StateListDrawable bg = new StateListDrawable();
            GradientDrawable on = new GradientDrawable();
            on.setColor(ROW);
            on.setStroke(dp(3), YELLOW);
            on.setCornerRadius(dp(6));
            GradientDrawable off = new GradientDrawable();
            off.setColor(0x00000000);
            off.setStroke(1, 0x553355FF);
            bg.addState(new int[]{android.R.attr.state_focused}, on);
            bg.addState(new int[]{android.R.attr.state_pressed}, on);
            bg.addState(new int[]{}, off);
            row.setBackground(bg);

            LinearLayout chCol = new LinearLayout(this);
            chCol.setOrientation(LinearLayout.VERTICAL);
            TextView num = text(20, YELLOW, true);
            TextView call = text(13, 0xFF7FE0FF, true);
            chCol.addView(num);
            chCol.addView(call);
            row.addView(chCol, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 0.22f));

            LinearLayout nowCol = new LinearLayout(this);
            nowCol.setOrientation(LinearLayout.VERTICAL);
            TextView nowT = text(17, Color.WHITE, true);
            TextView nowS = text(13, 0xFFC8D2FF, false);
            nowCol.addView(nowT);
            nowCol.addView(nowS);
            row.addView(nowCol, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 0.42f));

            LinearLayout nextCol = new LinearLayout(this);
            nextCol.setOrientation(LinearLayout.VERTICAL);
            TextView nextT = text(16, 0xFFE6EBFF, false);
            TextView nextS = text(13, 0xFFC8D2FF, false);
            nextCol.addView(nextT);
            nextCol.addView(nextS);
            row.addView(nextCol, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 0.36f));

            row.setTag(new TextView[]{num, call, nowT, nowS, nextT, nextS});
            row.setOnClickListener(v -> { tune(idx); closeGuide(); });
            row.setOnFocusChangeListener((v, has) -> { if (has) showInfo(idx); });
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.setMargins(0, dp(2), 0, dp(2));
            rowsBox.addView(row, lp);
            rows.add(row);
        }
        updateRowTexts();
    }

    private void updateRowTexts() {
        long t = now();
        for (int i = 0; i < rows.size() && i < chans.size(); i++) {
            Chan c = chans.get(i);
            TextView[] tv = (TextView[]) rows.get(i).getTag();
            tv[0].setText(String.format(Locale.UK, "%02d", c.number) + (i == cur ? "  ▶" : ""));
            tv[1].setText(c.callsign);
            int k = nowIndex(c);
            if (k >= 0) {
                Prog p = c.slots.get(k);
                tv[2].setText(p.title);
                long left = Math.max(0, (p.end - t) / 60000);
                tv[3].setText((p.episode.isEmpty() ? "" : p.episode + "  ·  ") + left + " min left");
                if (k + 1 < c.slots.size()) {
                    Prog q = c.slots.get(k + 1);
                    tv[4].setText(q.title);
                    tv[5].setText(time(q.start));
                } else { tv[4].setText(""); tv[5].setText(""); }
            } else {
                tv[2].setText("Off air");
                tv[3].setText("");
                tv[4].setText("");
                tv[5].setText("");
            }
        }
    }

    private void showInfo(int idx) {
        if (idx < 0 || idx >= chans.size()) return;
        Chan c = chans.get(idx);
        Prog p = onNow(c);
        infoChan.setText("CH " + chLabel(c) + "  ·  " + c.name);
        infoTitle.setText(p == null ? "Off air" : p.title);
        infoEp.setText(p == null ? "" : p.episode);
        infoTime.setText(p == null ? "" : time(p.start) + " – " + time(p.end) + (idx == cur ? "   ▶ watching" : "   OK to watch"));
    }

    private void highlightCurrentRow() {
        updateRowTexts();
    }

    private void openGuide() {
        if (chans.isEmpty()) return;
        int w = root.getWidth(), h = root.getHeight();
        int vw = Math.round(w * 0.40f), vh = Math.round(vw * 9f / 16f), m = dp(16);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(vw, vh, Gravity.TOP | Gravity.END);
        lp.setMargins(0, m, m, 0);
        pv.setLayoutParams(lp);                                 // the picture shrinks into the corner
        guideTop.getLayoutParams().height = vh + 2 * m;
        videoSpace.getLayoutParams().width = vw + 2 * m;
        guideTop.requestLayout();
        banner.setVisibility(View.GONE);
        clock.setText(time(now()));
        updateRowTexts();
        guide.setVisibility(View.VISIBLE);
        int focus = cur >= 0 && cur < rows.size() ? cur : 0;
        if (!rows.isEmpty()) {
            LinearLayout r = rows.get(focus);
            r.requestFocus();
            showInfo(focus);
            scroll.post(() -> scroll.smoothScrollTo(0, Math.max(0, r.getTop() - dp(60))));
        }
    }

    private void closeGuide() {
        guide.setVisibility(View.GONE);
        pv.setLayoutParams(new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.requestFocus();
        showBanner();
    }

    private void jumpRows(int by) {
        View f = getCurrentFocus();
        int i = rows.indexOf(f);
        if (i < 0) i = Math.max(0, cur);
        int j = Math.max(0, Math.min(rows.size() - 1, i + by));
        rows.get(j).requestFocus();
    }

    // ------------------------------------------------------------------ remote

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (e.getAction() != KeyEvent.ACTION_DOWN) return super.dispatchKeyEvent(e);
        int k = e.getKeyCode();
        boolean guideOpen = guide.getVisibility() == View.VISIBLE;

        if (guideOpen) {
            switch (k) {
                case KeyEvent.KEYCODE_BACK:
                case KeyEvent.KEYCODE_MENU:
                case KeyEvent.KEYCODE_GUIDE:
                case KeyEvent.KEYCODE_INFO:
                case KeyEvent.KEYCODE_PROG_BLUE:
                    closeGuide(); return true;
                case KeyEvent.KEYCODE_DPAD_LEFT:
                case KeyEvent.KEYCODE_CHANNEL_UP:
                case KeyEvent.KEYCODE_PAGE_UP:
                    jumpRows(-8); return true;
                case KeyEvent.KEYCODE_DPAD_RIGHT:
                case KeyEvent.KEYCODE_CHANNEL_DOWN:
                case KeyEvent.KEYCODE_PAGE_DOWN:
                    jumpRows(8); return true;
            }
            if (getCurrentFocus() == null || rows.indexOf(getCurrentFocus()) < 0) jumpRows(0);
            return super.dispatchKeyEvent(e);                   // ▲ ▼ and OK handled by the rows
        }

        switch (k) {
            case KeyEvent.KEYCODE_DPAD_UP:
            case KeyEvent.KEYCODE_CHANNEL_UP:
                tune(cur + 1); return true;
            case KeyEvent.KEYCODE_DPAD_DOWN:
            case KeyEvent.KEYCODE_CHANNEL_DOWN:
                tune(cur - 1); return true;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
            case KeyEvent.KEYCODE_NUMPAD_ENTER:
            case KeyEvent.KEYCODE_MENU:
            case KeyEvent.KEYCODE_GUIDE:
            case KeyEvent.KEYCODE_PROG_BLUE:
                openGuide(); return true;
            case KeyEvent.KEYCODE_DPAD_LEFT:
            case KeyEvent.KEYCODE_DPAD_RIGHT:
            case KeyEvent.KEYCODE_INFO:
                showBanner(); return true;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_PLAY:
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
                if (player.isPlaying()) player.pause(); else tune(cur);   // resume = rejoin live
                return true;
            case KeyEvent.KEYCODE_BACK: {
                long t = System.currentTimeMillis();
                if (t - lastBack < 2000) finish();
                else { lastBack = t; Toast.makeText(this, "Press Back again to exit", Toast.LENGTH_SHORT).show(); }
                return true;
            }
        }
        return super.dispatchKeyEvent(e);
    }

    // ------------------------------------------------------------------ lifecycle

    private boolean paused = false;

    @Override
    protected void onPause() {
        super.onPause();
        paused = true;
        if (player != null) player.pause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (paused && cur >= 0) tune(cur);        // coming back: rejoin the channel live
        paused = false;
    }

    @Override
    protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        io.shutdownNow();
        if (player != null) player.release();
        super.onDestroy();
    }
}
