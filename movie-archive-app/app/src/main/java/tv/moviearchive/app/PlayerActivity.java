package tv.moviearchive.app;

import android.app.UiModeManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.cast.CastPlayer;
import androidx.media3.cast.SessionAvailabilityListener;
import androidx.media3.common.C;
import androidx.media3.common.ForwardingPlayer;
import androidx.media3.common.Tracks;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;
import androidx.mediarouter.app.MediaRouteButton;

import com.google.android.gms.cast.framework.CastButtonFactory;
import com.google.android.gms.cast.framework.CastContext;
import com.google.android.gms.cast.framework.CastSession;

import java.util.ArrayList;
import java.util.List;

/**
 * Full-screen video player driven by the TV remote or touch.
 * - Remembers where you stopped.
 * - Next / previous video: ▼ / ▲ (when the controls are hidden), Channel + / −, or ⏭ / ⏮.
 *   After an item's last video it moves on to the next show in the list.
 * - Phones can cast to a Chromecast / Google TV with the cast button (top right).
 */
public class PlayerActivity extends AppCompatActivity {

    private ExoPlayer exo;
    private CastPlayer castPlayer;
    private Player active;
    private PlayerView view;
    private TextView castLabel;
    private String[] urls, keys;
    private final java.util.Set<Integer> reported = new java.util.HashSet<>();
    private final List<MediaItem> items = new ArrayList<>();
    private SharedPreferences prefs;
    private boolean leaving = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(R.layout.player);
        view = findViewById(R.id.player_view);
        castLabel = findViewById(R.id.cast_label);
        prefs = getSharedPreferences("positions", MODE_PRIVATE);

        urls = getIntent().getStringArrayExtra("urls");
        keys = getIntent().getStringArrayExtra("keys");
        String[] titles = getIntent().getStringArrayExtra("titles");
        int index = getIntent().getIntExtra("index", 0);
        if (urls == null || urls.length == 0) { finish(); return; }

        for (int i = 0; i < urls.length; i++) {
            items.add(new MediaItem.Builder()
                    .setUri(urls[i])
                    .setMimeType(mimeFor(urls[i]))
                    .setMediaMetadata(new MediaMetadata.Builder()
                            .setTitle(titles != null && i < titles.length ? titles[i] : "")
                            .build())
                    .build());
        }

        exo = new ExoPlayer.Builder(this)
                .setSeekBackIncrementMs(10_000)
                .setSeekForwardIncrementMs(30_000)
                .build();
        exo.addListener(listener);

        // Casting (phones with Google Play services)
        try {
            CastContext cc = CastContext.getSharedInstance(this);
            castPlayer = new CastPlayer(cc);
            castPlayer.addListener(listener);
            castPlayer.setSessionAvailabilityListener(new SessionAvailabilityListener() {
                @Override public void onCastSessionAvailable() { switchTo(castPlayer); }
                @Override public void onCastSessionUnavailable() { switchTo(exo); }
            });
            if (!isTv()) {
                MediaRouteButton b = findViewById(R.id.cast_button);
                CastButtonFactory.setUpMediaRouteButton(getApplicationContext(), b);
                b.setVisibility(View.VISIBLE);
            }
        } catch (Throwable t) {
            castPlayer = null;
        }

        view.setShowNextButton(true);
        view.setShowPreviousButton(true);

        long resume = prefs.getLong(urls[index], 0);
        long start = resume > 30_000 ? resume : 0;
        if (start > 0) toast("Resuming where you left off");
        boolean casting = castPlayer != null && castPlayer.isCastSessionAvailable();
        use(casting ? castPlayer : exo, index, start);
    }

    private static String mimeFor(String url) {
        String u = url.toLowerCase();
        if (u.endsWith(".webm")) return MimeTypes.VIDEO_WEBM;
        if (u.endsWith(".mkv")) return MimeTypes.VIDEO_MATROSKA;
        if (u.endsWith(".mpg") || u.endsWith(".mpeg")) return MimeTypes.VIDEO_MPEG;
        return MimeTypes.VIDEO_MP4;
    }

    private boolean isTv() {
        UiModeManager m = (UiModeManager) getSystemService(UI_MODE_SERVICE);
        return (m != null && m.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION)
                || !getPackageManager().hasSystemFeature(PackageManager.FEATURE_TOUCHSCREEN);
    }

    /** Start the playlist on the given player (this screen or a cast device). */
    private void use(Player target, int index, long position) {
        Player old = active;
        active = target;
        if (old != null && old != target) old.stop();
        target.setMediaItems(items, index, position);
        target.setPlayWhenReady(true);
        target.prepare();
        view.setPlayer(new NavPlayer(target));
        boolean cast = target == castPlayer;
        view.setControllerShowTimeoutMs(cast ? 0 : 4000);
        if (cast) view.showController();
        castLabel.setVisibility(cast ? View.VISIBLE : View.GONE);
        if (cast) castLabel.setText("Playing on " + castDeviceName());
    }

    private void switchTo(Player target) {
        if (target == null || target == active) return;
        int i = active != null ? Math.max(0, active.getCurrentMediaItemIndex()) : 0;
        long pos = active != null ? Math.max(0, active.getCurrentPosition()) : 0;
        use(target, i, pos);
    }

    private String castDeviceName() {
        try {
            CastSession s = CastContext.getSharedInstance(this).getSessionManager().getCurrentCastSession();
            if (s != null && s.getCastDevice() != null) return s.getCastDevice().getFriendlyName();
        } catch (Throwable ignored) { }
        return "your TV";
    }

    // ---------- next / previous ----------

    private void goNext() {
        if (active.hasNextMediaItem()) { active.seekToNextMediaItem(); toast("Next video"); }
        else leaveFor(+1);
    }

    private void goPrevious() {
        if (active.getCurrentPosition() > 5_000) { active.seekTo(0); return; }
        if (active.hasPreviousMediaItem()) { active.seekToPreviousMediaItem(); toast("Previous video"); }
        else leaveFor(-1);
    }

    /** Ask the list screen to play the next / previous show. */
    private void leaveFor(int dir) {
        if (leaving) return;
        leaving = true;
        savePosition();
        setResult(RESULT_OK, new Intent().putExtra("dir", dir));
        finish();
    }

    private void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_SHORT).show(); }

    /** Keeps the on-screen ⏮ ⏭ buttons available and sends them to our next/previous logic. */
    private class NavPlayer extends ForwardingPlayer {
        NavPlayer(Player p) { super(p); }

        @Override public boolean isCommandAvailable(int c) {
            if (c == COMMAND_SEEK_TO_NEXT || c == COMMAND_SEEK_TO_NEXT_MEDIA_ITEM
                    || c == COMMAND_SEEK_TO_PREVIOUS || c == COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM) return true;
            return super.isCommandAvailable(c);
        }

        @Override public Commands getAvailableCommands() {
            return super.getAvailableCommands().buildUpon()
                    .addAll(COMMAND_SEEK_TO_NEXT, COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
                            COMMAND_SEEK_TO_PREVIOUS, COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
                    .build();
        }

        @Override public void seekToNext() { goNext(); }
        @Override public void seekToNextMediaItem() { goNext(); }
        @Override public void seekToPrevious() { goPrevious(); }
        @Override public void seekToPreviousMediaItem() { goPrevious(); }
    }

    private final Player.Listener listener = new Player.Listener() {
        @Override
        public void onPlayerError(PlaybackException error) {
            markBroken();
            toast("This episode won't play – skipping it (it'll be hidden from now on)");
            goNext();
        }

        /** Sound but no picture: the video is in a format this TV can't show. */
        @Override
        public void onTracksChanged(Tracks tracks) {
            if (active != exo) return;
            boolean hasVideo = false, videoOk = false;
            for (Tracks.Group g : tracks.getGroups()) {
                if (g.getType() != C.TRACK_TYPE_VIDEO) continue;
                hasVideo = true;
                if (g.isSupported()) videoOk = true;
            }
            if (hasVideo && !videoOk && markBroken()) {
                toast("This episode has no picture on this TV – skipping it");
                goNext();
            }
        }

        @Override
        public void onPlaybackStateChanged(int state) {
            if (state == Player.STATE_ENDED && active != null && active == exo) {
                clearPosition();
                finish();
            }
        }

        @Override
        public void onMediaItemTransition(MediaItem item, int reason) {
            if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO && active != null) {
                int prev = active.getCurrentMediaItemIndex() - 1;
                if (prev >= 0 && prev < urls.length) prefs.edit().remove(urls[prev]).apply();
            }
        }
    };

    /** Remember the episode that just failed so the list hides it. */
    private boolean markBroken() {
        if (active == null) return false;
        int i = active.getCurrentMediaItemIndex();
        if (i < 0 || i >= urls.length || !reported.add(i)) return false;
        String k = keys != null && i < keys.length && keys[i] != null ? keys[i] : urls[i];
        SharedPreferences b = getSharedPreferences("broken", MODE_PRIVATE);
        java.util.Set<String> set = new java.util.HashSet<>(b.getStringSet("keys", new java.util.HashSet<>()));
        set.add(k);
        set.add(urls[i]);
        b.edit().putStringSet("keys", set).apply();
        return true;
    }

    private void savePosition() {
        if (active == null) return;
        int i = active.getCurrentMediaItemIndex();
        long pos = active.getCurrentPosition();
        long dur = active.getDuration();
        if (i < 0 || i >= urls.length) return;
        if (dur > 0 && pos > dur - 60_000) prefs.edit().remove(urls[i]).apply();
        else prefs.edit().putLong(urls[i], pos).apply();
    }

    private void clearPosition() {
        int i = active.getCurrentMediaItemIndex();
        if (i >= 0 && i < urls.length) prefs.edit().remove(urls[i]).apply();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (active != null && e.getAction() == KeyEvent.ACTION_DOWN) {
            switch (e.getKeyCode()) {
                case KeyEvent.KEYCODE_MEDIA_NEXT:
                case KeyEvent.KEYCODE_CHANNEL_UP:
                    goNext(); return true;
                case KeyEvent.KEYCODE_MEDIA_PREVIOUS:
                case KeyEvent.KEYCODE_CHANNEL_DOWN:
                    goPrevious(); return true;
            }
            if (!view.isControllerFullyVisible()) {
                switch (e.getKeyCode()) {
                    case KeyEvent.KEYCODE_DPAD_DOWN:
                        goNext(); return true;
                    case KeyEvent.KEYCODE_DPAD_UP:
                        goPrevious(); return true;
                    case KeyEvent.KEYCODE_DPAD_LEFT:
                        active.seekBack(); view.showController(); return true;
                    case KeyEvent.KEYCODE_DPAD_RIGHT:
                        active.seekForward(); view.showController(); return true;
                    case KeyEvent.KEYCODE_DPAD_CENTER:
                    case KeyEvent.KEYCODE_ENTER:
                        if (active.isPlaying()) active.pause(); else active.play();
                        view.showController(); return true;
                }
            }
        }
        if (view != null && view.dispatchKeyEvent(e)) return true;
        return super.dispatchKeyEvent(e);
    }

    @Override
    protected void onPause() {
        savePosition();
        if (active == exo && exo != null) exo.pause();   // a cast keeps playing on the TV
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (castPlayer != null) {
            castPlayer.setSessionAvailabilityListener(null);
            castPlayer.removeListener(listener);
            castPlayer.release();      // stops listening; the cast itself carries on on the TV
        }
        if (exo != null) { exo.release(); exo = null; }
        super.onDestroy();
    }
}
