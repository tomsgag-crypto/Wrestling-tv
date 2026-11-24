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
    static final String URL_APK = BuildConfig.UPDATE_URL;

    interface Progress { void say(String s); }

    static final java.util.concurrent.atomic.AtomicBoolean busy = new java.util.concurrent.atomic.AtomicBoolean(false);

    static void run(Context ctx, Progress p) {
        if (!busy.compareAndSet(false, true)) { p.say("Already updating…"); return; }
        try { run2(ctx, p); } finally { busy.set(false); }
    }
    private static void run2(Context ctx, Progress p) {
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
            // download to a file first, so the install itself is quick
            java.io.File apk = new java.io.File(ctx.getCacheDir(), "FreeTV-update.apk");
            try (InputStream in = c.getInputStream(); OutputStream out = new java.io.FileOutputStream(apk)) {
                byte[] buf = new byte[65536]; int n; long got = 0; int said = -1;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n); got += n;
                    int pc = size > 0 ? (int) (got * 100 / size) : -1;
                    if (pc / 10 != said) { said = pc / 10; p.say(pc >= 0 ? "Downloading the update… " + pc + "%" : "Downloading the update…"); }
                }
            }
            c.disconnect();
            size = apk.length();
            PackageInstaller pi = ctx.getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams sp = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            sp.setAppPackageName(ctx.getPackageName());
            if (Build.VERSION.SDK_INT >= 31) sp.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
            int id = pi.createSession(sp);
            PackageInstaller.Session s = pi.openSession(id);
            try (InputStream in = new java.io.FileInputStream(apk); OutputStream out = s.openWrite("FreeTV.apk", 0, size)) {
                byte[] buf = new byte[65536]; int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                s.fsync(out);
            }
            apk.delete();
            // so Free TV reopens itself once the new version is in
            ctx.getSharedPreferences("update", Context.MODE_PRIVATE).edit().putLong("at", System.currentTimeMillis()).commit();
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
            PendingIntent done = PendingIntent.getBroadcast(ctx, id, new Intent(ctx, SelfUpdate.class), flags);
            p.say("Installing… Free TV will close for a moment and reopen");
            s.commit(done.getIntentSender());
            s.close();
        } catch (Exception e) {
            p.say("Update failed: " + e.getMessage());
        }
    }

    /** After an update Free TV started itself: open it again (or, if Android won't allow that, put up a notification to tap). */
    static void reopen(Context ctx) {
        android.content.SharedPreferences sp = ctx.getSharedPreferences("update", Context.MODE_PRIVATE);
        long at = sp.getLong("at", 0);
        sp.edit().remove("at").apply();
        if (at == 0 || System.currentTimeMillis() - at > 10 * 60000) return;
        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        try { ctx.startActivity(open); } catch (Exception ignored) { }
        try {
            ReminderReceiver.ensureChannel(ctx);
            int fl = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
            android.app.Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new android.app.Notification.Builder(ctx, "reminders") : new android.app.Notification.Builder(ctx);
            b.setSmallIcon(android.R.drawable.stat_sys_download_done).setContentTitle(ctx.getString(R.string.app_name) + " has updated").setContentText("Select to open it again")
             .setAutoCancel(true).setContentIntent(PendingIntent.getActivity(ctx, 9, open, fl)).setTimeoutAfter(5 * 60000);
            ((android.app.NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE)).notify(9, b.build());
        } catch (Exception ignored) { }
    }

    @Override
    public void onReceive(Context ctx, Intent i) {
        int st = i.getIntExtra(PackageInstaller.EXTRA_STATUS, -999);
        if (st == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent confirm = i.getParcelableExtra(Intent.EXTRA_INTENT);
            if (confirm != null) { confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); ctx.startActivity(confirm); }
        } else if (st == PackageInstaller.STATUS_SUCCESS) {
            reopen(ctx);   // in case the "app replaced" message doesn't arrive
        } else {
            ctx.getSharedPreferences("update", Context.MODE_PRIVATE).edit().remove("at").apply();
            if (st != PackageInstaller.STATUS_FAILURE_ABORTED)
                Toast.makeText(ctx, "Update didn't install: " + i.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE), Toast.LENGTH_LONG).show();
        }
    }
}
