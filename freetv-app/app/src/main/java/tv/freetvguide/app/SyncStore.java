package tv.freetvguide.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.nsd.NsdManager;
import android.net.nsd.NsdServiceInfo;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Iterator;

/**
 * Phone ⇄ TV link over home Wi-Fi.
 *
 * Favourites, reminders and lists are kept as "records": key → {t: when changed (ms), del: removed?, v: the thing}.
 * Both sides keep the newest version of each record, so changes made on either device win in time order.
 *
 * Keys: fav:<channel id> · rem:<reminder id> (v = the reminder) · list:<list name> · li:<list name>\u0001<item key> (v = the item)
 */
class SyncStore {
    static final String TYPE = "_freetv._tcp.";
    static final int PORT = 8766;

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("sync", Context.MODE_PRIVATE); }

    static synchronized JSONObject records(Context c) {
        try { return new JSONObject(prefs(c).getString("records", "{}")); } catch (Exception e) { return new JSONObject(); }
    }

    /** Keep the newer of each record; returns true if anything changed here. Reminders that arrive are set (or cancelled) straight away. */
    static synchronized boolean merge(Context c, JSONObject incoming) {
        JSONObject mine = records(c);
        boolean changed = false;
        Iterator<String> it = incoming.keys();
        while (it.hasNext()) {
            String k = it.next();
            JSONObject in = incoming.optJSONObject(k);
            if (in == null) continue;
            JSONObject cur = mine.optJSONObject(k);
            if (cur != null && cur.optLong("t") >= in.optLong("t")) continue;
            try { mine.put(k, in); } catch (Exception ignored) { }
            changed = true;
            if (k.startsWith("rem:")) {
                String id = k.substring(4);
                JSONObject r = in.optJSONObject("v");
                if (in.optBoolean("del") || r == null) ReminderReceiver.cancel(c, id);
                else ReminderReceiver.schedule(c, id, r.optLong("at"), r.optString("title"), r.optString("text"));
            }
        }
        if (changed) {
            // forget long-gone removals and past reminders so the store stays small
            long old = System.currentTimeMillis() - 30L * 86400000;
            JSONObject tidy = new JSONObject();
            Iterator<String> ks = mine.keys();
            while (ks.hasNext()) {
                String k = ks.next();
                JSONObject r = mine.optJSONObject(k);
                if (r == null) continue;
                if (r.optBoolean("del") && r.optLong("t") < old) continue;
                JSONObject v = r.optJSONObject("v");
                if (k.startsWith("rem:") && v != null && v.optJSONObject("item") != null && v.optJSONObject("item").optDouble("e", 1e12) * 1000 < System.currentTimeMillis() - 86400000) continue;
                try { tidy.put(k, r); } catch (Exception ignored) { }
            }
            prefs(c).edit().putString("records", tidy.toString()).putLong("changedAt", System.currentTimeMillis()).apply();
        }
        return changed;
    }

    // ------------------------------------------------------------------ the phone side: talk to the TV

    static String http(String url, String body) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(url).openConnection();
        h.setConnectTimeout(4000); h.setReadTimeout(8000);
        if (body != null) {
            h.setDoOutput(true); h.setRequestMethod("POST");
            h.setRequestProperty("Content-Type", "application/json");
            byte[] b = body.getBytes("UTF-8");
            try (OutputStream o = h.getOutputStream()) { o.write(b); }
        }
        try (InputStream in = h.getResponseCode() < 400 ? h.getInputStream() : h.getErrorStream()) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192]; int n;
            while (in != null && (n = in.read(buf)) > 0) out.write(buf, 0, n);
            if (h.getResponseCode() >= 400) throw new Exception("TV said " + h.getResponseCode() + ": " + out.toString("UTF-8"));
            return out.toString("UTF-8");
        }
    }

    /** Look for TVs running Free TV on this Wi-Fi (a few seconds). Returns [{name, host, port}]. */
    static JSONArray find(Context c, long waitMs) {
        final JSONArray out = new JSONArray();
        final NsdManager nsd = (NsdManager) c.getSystemService(Context.NSD_SERVICE);
        final Object lock = new Object();
        NsdManager.DiscoveryListener dl = new NsdManager.DiscoveryListener() {
            @Override public void onStartDiscoveryFailed(String t, int e) { }
            @Override public void onStopDiscoveryFailed(String t, int e) { }
            @Override public void onDiscoveryStarted(String t) { }
            @Override public void onDiscoveryStopped(String t) { }
            @Override public void onServiceLost(NsdServiceInfo s) { }
            @Override public void onServiceFound(NsdServiceInfo s) {
                try {
                    nsd.resolveService(s, new NsdManager.ResolveListener() {
                        @Override public void onResolveFailed(NsdServiceInfo i, int e) { }
                        @Override public void onServiceResolved(NsdServiceInfo i) {
                            synchronized (lock) {
                                try {
                                    String host = i.getHost().getHostAddress();
                                    for (int k = 0; k < out.length(); k++) if (host.equals(out.getJSONObject(k).optString("host"))) return;
                                    out.put(new JSONObject().put("name", i.getServiceName()).put("host", host).put("port", i.getPort()));
                                } catch (Exception ignored) { }
                            }
                        }
                    });
                } catch (Exception ignored) { }
            }
        };
        try {
            nsd.discoverServices(TYPE, NsdManager.PROTOCOL_DNS_SD, dl);
            Thread.sleep(waitMs);
            nsd.stopServiceDiscovery(dl);
        } catch (Exception ignored) { }
        synchronized (lock) { return out; }
    }

    static boolean paired(Context c) { return !prefs(c).getString("token", "").isEmpty(); }

    /** Send our records to the TV and take back its newer ones. Finds the TV again if its address has changed. */
    static synchronized String syncWithTv(Context c) {
        SharedPreferences p = prefs(c);
        String token = p.getString("token", "");
        if (token.isEmpty()) return "not linked";
        String host = p.getString("host", ""), name = p.getString("tvName", "");
        int port = p.getInt("port", PORT);
        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                String res = http("http://" + host + ":" + port + "/sync", new JSONObject().put("token", token).put("records", records(c)).toString());
                JSONObject j = new JSONObject(res);
                merge(c, j.optJSONObject("records") == null ? new JSONObject() : j.optJSONObject("records"));
                p.edit().putLong("lastSync", System.currentTimeMillis()).apply();
                return "ok";
            } catch (Exception e) {
                if (String.valueOf(e.getMessage()).contains("TV said 403")) return "unlinked";
                if (attempt == 1) return "TV not found";
                // the TV may have a new address: look for it by name
                JSONArray tvs = find(c, 3500);
                boolean found = false;
                for (int i = 0; i < tvs.length(); i++) {
                    JSONObject t = tvs.optJSONObject(i);
                    if (t != null && (name.isEmpty() || name.equals(t.optString("name")))) {
                        host = t.optString("host"); port = t.optInt("port", PORT); found = true;
                        p.edit().putString("host", host).putInt("port", port).apply();
                        break;
                    }
                }
                if (!found) return "TV not found";
            }
        }
        return "TV not found";
    }
}
