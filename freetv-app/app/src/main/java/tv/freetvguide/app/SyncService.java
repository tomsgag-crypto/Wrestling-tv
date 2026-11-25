package tv.freetvguide.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.security.SecureRandom;

/**
 * On the TV: listens on the home Wi-Fi so Free TV on your phone can link to it and swap favourites, reminders and lists.
 * Starts with the TV (and whenever Free TV opens), so reminders sent from the phone are set even when Free TV is closed.
 */
public class SyncService extends Service {
    private ServerSocket server;
    private NsdManager.RegistrationListener reg;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private static String pairCode = null;
    private static long pairUntil = 0;

    static boolean isTv(Context c) {
        PackageManager pm = c.getPackageManager();
        return pm.hasSystemFeature(PackageManager.FEATURE_LEANBACK) || pm.hasSystemFeature("android.software.leanback_only");
    }

    static void start(Context c) {
        if (!isTv(c) || !"full".equals(BuildConfig.FLAVOR)) return;   // the Sky Sports app doesn't link to phones
        try {
            Intent i = new Intent(c, SyncService.class);
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
        } catch (Exception ignored) { }
    }

    @Override public IBinder onBind(Intent i) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                NotificationManager nm = getSystemService(NotificationManager.class);
                nm.createNotificationChannel(new NotificationChannel("link", "Phone link", NotificationManager.IMPORTANCE_MIN));
                Notification n = new Notification.Builder(this, "link").setSmallIcon(android.R.drawable.stat_notify_sync)
                    .setContentTitle(getString(R.string.app_name)).setContentText("Ready for your phone").build();
                if (Build.VERSION.SDK_INT >= 29) startForeground(42, n, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
                else startForeground(42, n);
            }
        } catch (Exception ignored) { }
        if (server == null) new Thread(this::serve, "phone-link").start();
        return START_STICKY;
    }

    private void serve() {
        try {
            server = new ServerSocket(SyncStore.PORT);
        } catch (Exception e) {
            try { server = new ServerSocket(0); } catch (Exception e2) { return; }
        }
        advertise(server.getLocalPort());
        while (server != null && !server.isClosed()) {
            try {
                final Socket s = server.accept();
                new Thread(() -> handle(s)).start();
            } catch (Exception e) { if (server == null || server.isClosed()) break; }
        }
    }

    private void advertise(int port) {
        try {
            NsdServiceInfo si = new NsdServiceInfo();
            String name = android.provider.Settings.Global.getString(getContentResolver(), "device_name");
            si.setServiceName("Free TV on " + (name == null || name.isEmpty() ? Build.MODEL : name));
            si.setServiceType(SyncStore.TYPE);
            si.setPort(port);
            reg = new NsdManager.RegistrationListener() {
                @Override public void onRegistrationFailed(NsdServiceInfo s, int e) { }
                @Override public void onUnregistrationFailed(NsdServiceInfo s, int e) { }
                @Override public void onServiceRegistered(NsdServiceInfo s) { }
                @Override public void onServiceUnregistered(NsdServiceInfo s) { }
            };
            ((NsdManager) getSystemService(Context.NSD_SERVICE)).registerService(si, NsdManager.PROTOCOL_DNS_SD, reg);
        } catch (Exception ignored) { }
    }

    private void handle(Socket s) {
        try {
            s.setSoTimeout(10000);
            BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream(), "UTF-8"));
            String first = in.readLine();
            if (first == null) { s.close(); return; }
            String[] parts = first.split(" ");
            String path = parts.length > 1 ? parts[1] : "/";
            int len = 0; String line;
            while ((line = in.readLine()) != null && !line.isEmpty()) {
                if (line.toLowerCase().startsWith("content-length:")) len = Integer.parseInt(line.substring(15).trim());
            }
            char[] buf = new char[Math.min(len, 4_000_000)];
            int got = 0;
            while (got < buf.length) { int n = in.read(buf, got, buf.length - got); if (n < 0) break; got += n; }
            String body = new String(buf, 0, got);
            int code = 200; String out;
            try {
                JSONObject req = body.isEmpty() ? new JSONObject() : new JSONObject(body);
                if (path.startsWith("/hello")) out = new JSONObject().put("app", "freetv").put("name", Build.MODEL).toString();
                else if (path.startsWith("/pairstart")) out = startPairing();
                else if (path.startsWith("/pair")) {
                    if (pairCode != null && System.currentTimeMillis() < pairUntil && pairCode.equals(req.optString("code"))) {
                        String token = Long.toHexString(new SecureRandom().nextLong()) + Long.toHexString(new SecureRandom().nextLong());
                        String tokens = SyncStore.prefs(this).getString("tokens", "");
                        SyncStore.prefs(this).edit().putString("tokens", tokens + token + ",").apply();
                        pairCode = null;
                        toast("Your phone is linked to " + getString(R.string.app_name));
                        out = new JSONObject().put("token", token).toString();
                    } else { code = 403; out = "{\"error\":\"wrong code\"}"; }
                }
                else if (path.startsWith("/sync")) {
                    String token = req.optString("token");
                    if (token.isEmpty() || !SyncStore.prefs(this).getString("tokens", "").contains(token + ",")) { code = 403; out = "{\"error\":\"not linked\"}"; }
                    else {
                        JSONObject recs = req.optJSONObject("records");
                        if (recs != null && SyncStore.merge(this, recs)) {
                            MainActivity m = MainActivity.current;
                            if (m != null) m.jsFromAnywhere("window.app && app.syncApply && app.syncApply()");
                        }
                        out = new JSONObject().put("records", SyncStore.records(this)).toString();
                    }
                }
                else { code = 404; out = "{}"; }
            } catch (Exception e) { code = 400; out = "{\"error\":\"bad request\"}"; }
            byte[] b = out.getBytes("UTF-8");
            OutputStream o = s.getOutputStream();
            o.write(("HTTP/1.1 " + code + " OK\r\nContent-Type: application/json\r\nContent-Length: " + b.length + "\r\nConnection: close\r\n\r\n").getBytes("UTF-8"));
            o.write(b); o.flush();
            s.close();
        } catch (Exception e) { try { s.close(); } catch (Exception ignored) { } }
    }

    /** Show a 4-digit code on the TV for 3 minutes; the phone must type it to link. */
    private String startPairing() throws Exception {
        pairCode = String.format(java.util.Locale.UK, "%04d", new SecureRandom().nextInt(10000));
        pairUntil = System.currentTimeMillis() + 180000;
        final String c = pairCode;
        MainActivity m = MainActivity.current;
        if (m != null) m.jsFromAnywhere("window.app && app.showPairCode && app.showPairCode('" + c + "')");
        for (int i = 0; i < 4; i++) ui.postDelayed(() -> { if (c.equals(pairCode)) toast("Phone link code: " + c); }, i * 3600L);
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                NotificationManager nm = getSystemService(NotificationManager.class);
                nm.createNotificationChannel(new NotificationChannel("pair", "Phone link code", NotificationManager.IMPORTANCE_HIGH));
                nm.notify(43, new Notification.Builder(this, "pair").setSmallIcon(android.R.drawable.stat_notify_sync)
                    .setContentTitle("Phone link code: " + c).setContentText("Type this on your phone to link it").setTimeoutAfter(180000).build());
            }
        } catch (Exception ignored) { }
        return new JSONObject().put("shown", true).toString();
    }

    private void toast(String t) { ui.post(() -> Toast.makeText(getApplicationContext(), t, Toast.LENGTH_LONG).show()); }

    @Override public void onDestroy() {
        try { if (reg != null) ((NsdManager) getSystemService(Context.NSD_SERVICE)).unregisterService(reg); } catch (Exception ignored) { }
        try { if (server != null) server.close(); } catch (Exception ignored) { }
        server = null;
        super.onDestroy();
    }
}
