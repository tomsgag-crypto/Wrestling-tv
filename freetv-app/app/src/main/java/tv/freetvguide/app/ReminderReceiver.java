package tv.freetvguide.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;

/** Programme reminders: shows the notification when one is due, and books them all again after the device restarts. */
public class ReminderReceiver extends BroadcastReceiver {

    static final String CHANNEL = "reminders";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String action = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(action) || "android.intent.action.MY_PACKAGE_REPLACED".equals(action)) {
            rescheduleAll(ctx);
            if (!Intent.ACTION_BOOT_COMPLETED.equals(action)) SelfUpdate.reopen(ctx);
            return;
        }
        String id = intent.getStringExtra("id");
        String title = intent.getStringExtra("title");
        String text = intent.getStringExtra("text");
        show(ctx, id, title, text);
        MainActivity.reminderFired(id, title, text);
    }

    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm.getNotificationChannel(CHANNEL) == null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL, "Programme reminders", NotificationManager.IMPORTANCE_HIGH);
                ch.setDescription("Reminders for programmes you've asked to be told about");
                nm.createNotificationChannel(ch);
            }
        }
    }

    static void show(Context ctx, String id, String title, String text) {
        ensureChannel(ctx);
        Intent open = new Intent(ctx, MainActivity.class).putExtra("reminder", id)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getActivity(ctx, id.hashCode(), open, flags);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(ctx, CHANNEL) : new Notification.Builder(ctx);
        b.setSmallIcon(android.R.drawable.ic_lock_idle_alarm).setContentTitle(title).setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text)).setAutoCancel(true).setContentIntent(pi);
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        if (Build.VERSION.SDK_INT >= 21) b.setCategory(Notification.CATEGORY_REMINDER);
        try {
            ((NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE)).notify(id.hashCode(), b.build());
        } catch (SecurityException ignored) { }
    }

    private static PendingIntent alarmIntent(Context ctx, String id, String title, String text) {
        Intent i = new Intent(ctx, ReminderReceiver.class).setAction("tv.freetvguide.REMIND." + id)
                .putExtra("id", id).putExtra("title", title).putExtra("text", text);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getBroadcast(ctx, id.hashCode(), i, flags);
    }

    static void schedule(Context ctx, String id, long at, String title, String text) {
        if (at <= System.currentTimeMillis()) return;
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = alarmIntent(ctx, id, title, text);
        try {
            if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) am.setWindow(AlarmManager.RTC_WAKEUP, at, 60_000, pi);
            else if (Build.VERSION.SDK_INT >= 23) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else am.setExact(AlarmManager.RTC_WAKEUP, at, pi);
        } catch (SecurityException e) {
            am.set(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    static void cancel(Context ctx, String id) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        am.cancel(alarmIntent(ctx, id, "", ""));
    }

    /** reminders.json is written by the app: [{id, at, title, text}] */
    static void rescheduleAll(Context ctx) {
        File f = new File(ctx.getFilesDir(), "reminders.json");
        if (!f.exists()) return;
        try (FileInputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            JSONArray a = new JSONArray(out.toString("UTF-8"));
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i);
                schedule(ctx, o.getString("id"), o.getLong("at"), o.optString("title"), o.optString("text"));
            }
        } catch (Exception ignored) { }
    }
}
