package tv.freetvguide.app;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;
import android.os.Build;
import android.widget.Toast;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Downloads the newest Free TV and installs it with Android's package installer (the way app stores do).
 * Besides updating without Downloader, this stops Android treating Free TV as a "downloaded file" app,
 * which is what blocks the helper from being switched on.
 */
public class SelfUpdate extends BroadcastReceiver {
    static final String URL_APK = "https://github.com/tomsgag-crypto/Wrestling-tv/releases/download/free-tv/FreeTV.apk";

    interface Progress { void say(String s); }

    static void run(Context ctx, Progress p) {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(URL_APK).openConnection();
            c.setInstanceFollowRedirects(true);
            c.setConnectTimeout(20000); c.setReadTimeout(60000);
            // GitHub sends release files from another address: follow by hand if needed
            int code = c.getResponseCode();
            for (int i = 0; i < 5 && code / 100 == 3; i++) {
                String loc = c.getHeaderField("Location"); c.disconnect();
                c = (HttpURLConnection) new URL(loc).openConnection();
                c.setConnectTimeout(20000); c.setReadTimeout(60000);
                code = c.getResponseCode();
            }
            if (code != 200) { p.say("Download failed (HTTP " + code + ")"); return; }
            long size = c.getContentLengthLong();
            PackageInstaller pi = ctx.getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams sp = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            sp.setAppPackageName(ctx.getPackageName());
            if (Build.VERSION.SDK_INT >= 31) sp.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
            int id = pi.createSession(sp);
            PackageInstaller.Session s = pi.openSession(id);
            try (InputStream in = c.getInputStream(); OutputStream out = s.openWrite("FreeTV.apk", 0, size > 0 ? size : -1)) {
                byte[] buf = new byte[65536]; int n; long got = 0, lastSaid = 0;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n); got += n;
                    if (size > 0 && got - lastSaid > size / 5) { lastSaid = got; p.say("Downloading… " + (got * 100 / size) + "%"); }
                }
                s.fsync(out);
            }
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            PendingIntent done = PendingIntent.getBroadcast(ctx, id, new Intent(ctx, SelfUpdate.class), flags);
            p.say("Installing… Free TV will close and update");
            s.commit(done.getIntentSender());
            s.close();
        } catch (Exception e) {
            p.say("Update failed: " + e.getMessage());
        }
    }

    @Override
    public void onReceive(Context ctx, Intent i) {
        int st = i.getIntExtra(PackageInstaller.EXTRA_STATUS, -999);
        if (st == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = i.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) { confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); ctx.startActivity(confirm); }
        } else if (st != PackageInstaller.STATUS_SUCCESS) {
            Toast.makeText(ctx, "Update didn't install: " + i.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE), Toast.LENGTH_LONG).show();
        }
    }
}
