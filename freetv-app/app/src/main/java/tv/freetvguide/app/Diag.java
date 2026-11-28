package tv.freetvguide.app;

import android.content.Context;
import android.content.SharedPreferences;

/** Error recorder: keeps the helper's start/stop events and any crash, so the reason it switches off can be seen. */
final class Diag {
    private static boolean installed = false;
    private static Context app;

    static synchronized void install(Context c) {
        app = c.getApplicationContext();
        if (installed) return;
        installed = true;
        final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            try {
                java.io.StringWriter sw = new java.io.StringWriter();
                e.printStackTrace(new java.io.PrintWriter(sw));
                String s = sw.toString(); if (s.length() > 3000) s = s.substring(0, 3000);
                add("CRASH in " + t.getName() + ": " + s);
            } catch (Throwable ignored) { }
            if (prev != null) prev.uncaughtException(t, e);
        });
    }

    static synchronized void add(String what) {
        try {
            if (app == null) return;
            SharedPreferences p = app.getSharedPreferences("diag", Context.MODE_PRIVATE);
            String old = p.getString("log", "");
            String line = new java.text.SimpleDateFormat("dd MMM HH:mm:ss", java.util.Locale.UK).format(new java.util.Date()) + "  " + what;
            String all = line + "\n" + old;
            if (all.length() > 12000) all = all.substring(0, 12000);
            p.edit().putString("log", all).commit();   // commit: a crash may follow straight away
        } catch (Throwable ignored) { }
    }

    /** What the TV says about the helper, then the recorded events (newest first). */
    static String text(Context c) {
        StringBuilder b = new StringBuilder();
        try {
            b.append("Free TV ").append(c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName)
             .append(" · Android ").append(android.os.Build.VERSION.RELEASE).append(" · ").append(android.os.Build.MODEL).append("\n");
        } catch (Throwable ignored) { }
        try {
            String on = android.provider.Settings.Secure.getString(c.getContentResolver(), "enabled_accessibility_services");
            b.append("Helper switched on in settings: ").append(on != null && on.contains(c.getPackageName()) ? "yes" : "no")
             .append(" · running now: ").append(HelperService.isOn() ? "yes" : "no").append("\n");
        } catch (Throwable ignored) { }
        try {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.content.pm.InstallSourceInfo s = c.getPackageManager().getInstallSourceInfo(c.getPackageName());
                b.append("Installed by: ").append(s.getInstallingPackageName()).append(" (started by ").append(s.getInitiatingPackageName()).append(")\n");
            }
        } catch (Throwable ignored) { }
        try {
            if (android.os.Build.VERSION.SDK_INT >= 29) {
                android.app.AppOpsManager ao = (android.app.AppOpsManager) c.getSystemService(Context.APP_OPS_SERVICE);
                int m = ao.unsafeCheckOpNoThrow("android:access_restricted_settings", android.os.Process.myUid(), c.getPackageName());
                b.append("Android's block on downloaded apps: ").append(m == android.app.AppOpsManager.MODE_ALLOWED ? "not blocked" : "BLOCKED (mode " + m + ")").append("\n");
            }
        } catch (Throwable t) { b.append("Block check: n/a\n"); }
        String log = c.getSharedPreferences("diag", Context.MODE_PRIVATE).getString("log", "");
        b.append("\nEvents (newest first):\n").append(log.isEmpty() ? "(none yet – the helper has never started)" : log);
        return b.toString();
    }
    static void clear(Context c) { c.getSharedPreferences("diag", Context.MODE_PRIVATE).edit().clear().apply(); }
}
