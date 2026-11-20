package tv.wrestlingarchive.app;

import android.app.Activity;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.widget.Toast;

import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;

/** Full-screen video player driven by the TV remote. Remembers where you stopped. */
public class PlayerActivity extends Activity {

    private ExoPlayer player;
    private PlayerView view;
    private String[] urls;
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        setContentView(R.layout.player);
        view = findViewById(R.id.player_view);
        prefs = getSharedPreferences("positions", MODE_PRIVATE);

        urls = getIntent().getStringArrayExtra("urls");
        String[] titles = getIntent().getStringArrayExtra("titles");
        int index = getIntent().getIntExtra("index", 0);
        if (urls == null || urls.length == 0) { finish(); return; }

        player = new ExoPlayer.Builder(this)
                .setSeekBackIncrementMs(10_000)
                .setSeekForwardIncrementMs(30_000)
                .build();
        view.setPlayer(player);
        view.setShowNextButton(urls.length > 1);
        view.setShowPreviousButton(urls.length > 1);

        for (int i = 0; i < urls.length; i++) {
            player.addMediaItem(new MediaItem.Builder()
                    .setUri(urls[i])
                    .setMediaMetadata(new MediaMetadata.Builder()
                            .setTitle(titles != null && i < titles.length ? titles[i] : "")
                            .build())
                    .build());
        }

        long resume = prefs.getLong(urls[index], 0);
        player.seekTo(index, resume > 30_000 ? resume : 0);
        if (resume > 30_000) Toast.makeText(this, "Resuming where you left off", Toast.LENGTH_SHORT).show();

        player.addListener(new Player.Listener() {
            @Override
            public void onPlayerError(PlaybackException error) {
                Toast.makeText(PlayerActivity.this,
                        "This video can't be played on this TV", Toast.LENGTH_LONG).show();
                if (player.hasNextMediaItem()) {
                    player.seekToNextMediaItem();
                    player.prepare();
                    player.play();
                }
            }

            @Override
            public void onPlaybackStateChanged(int state) {
                if (state == Player.STATE_ENDED) {
                    clearPosition();
                    finish();
                }
            }

            @Override
            public void onMediaItemTransition(MediaItem item, int reason) {
                if (reason == Player.MEDIA_ITEM_TRANSITION_REASON_AUTO) {
                    int prev = player.getCurrentMediaItemIndex() - 1;
                    if (prev >= 0) prefs.edit().remove(urls[prev]).apply();
                }
            }
        });

        player.prepare();
        player.play();
    }

    private void savePosition() {
        if (player == null) return;
        int i = player.getCurrentMediaItemIndex();
        long pos = player.getCurrentPosition();
        long dur = player.getDuration();
        if (i < 0 || i >= urls.length) return;
        if (dur > 0 && pos > dur - 60_000) prefs.edit().remove(urls[i]).apply();
        else prefs.edit().putLong(urls[i], pos).apply();
    }

    private void clearPosition() {
        int i = player.getCurrentMediaItemIndex();
        if (i >= 0 && i < urls.length) prefs.edit().remove(urls[i]).apply();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (player != null && e.getAction() == KeyEvent.ACTION_DOWN && !view.isControllerFullyVisible()) {
            switch (e.getKeyCode()) {
                case KeyEvent.KEYCODE_DPAD_LEFT:
                    player.seekBack(); view.showController(); return true;
                case KeyEvent.KEYCODE_DPAD_RIGHT:
                    player.seekForward(); view.showController(); return true;
                case KeyEvent.KEYCODE_DPAD_CENTER:
                case KeyEvent.KEYCODE_ENTER:
                    if (player.isPlaying()) player.pause(); else player.play();
                    view.showController(); return true;
            }
        }
        if (view != null && view.dispatchKeyEvent(e)) return true;
        return super.dispatchKeyEvent(e);
    }

    @Override
    protected void onPause() {
        savePosition();
        if (player != null) player.pause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (player != null) { player.release(); player = null; }
        super.onDestroy();
    }
}
