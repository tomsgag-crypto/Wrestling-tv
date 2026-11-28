package tv.freetvguide.app;

import android.content.Context;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

/** A tiny web page on the home network (for 10 minutes) showing what the helper recorded, so it can be copied on a phone. */
class LayoutServer {
    private static ServerSocket server;
    private static long until;

    private static Context ctx0;
    static synchronized String start(Context ctx) {
        ctx0 = ctx.getApplicationContext();
        until = System.currentTimeMillis() + 10 * 60000L;
        String ip = ip();
        if (ip == null) return "";
        if (server == null || server.isClosed()) {
            try { server = new ServerSocket(8765); } catch (Exception e) { return ""; }
            Thread t = new Thread(LayoutServer::loop, "layouts");
            t.setDaemon(true);
            t.start();
        }
        return "http://" + ip + ":8765";
    }
    private static void loop() {
        try {
            server.setSoTimeout(5000);
            while (System.currentTimeMillis() < until) {
                Socket s;
                try { s = server.accept(); } catch (java.net.SocketTimeoutException e) { continue; }
                try {
                    BufferedReader in = new BufferedReader(new InputStreamReader(s.getInputStream()));
                    in.readLine();
                    String esc = ("=== Helper error recorder\n" + Diag.text(ctx0) + "\n\n" + HelperService.report() + "\n\n=== Web page (Virgin TV Go etc)\n" + WebPlayerActivity.lastDump).replace("&", "&amp;").replace("<", "&lt;");
                    String html = "<!DOCTYPE html><html><head><meta name=viewport content='width=device-width'><title>Free TV layouts</title></head><body style='font-family:sans-serif'>" +
                            "<p><button onclick=\"var t=document.getElementById('t');t.focus();t.select();t.setSelectionRange(0,t.value.length);document.execCommand('copy');this.textContent='Copied - now paste it to Claude'\" style='font-size:20px;padding:10px'>Copy all</button></p>" +
                            "<textarea id=t readonly style='width:100%;height:80vh;font-size:11px'>" + esc + "</textarea></body></html>";
                    byte[] body = html.getBytes(StandardCharsets.UTF_8);
                    OutputStream o = s.getOutputStream();
                    o.write(("HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: " + body.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                    o.write(body);
                    o.flush();
                } catch (Exception ignored) { }
                try { s.close(); } catch (Exception ignored) { }
            }
        } catch (Exception ignored) { }
        try { server.close(); } catch (Exception ignored) { }
    }
    private static String ip() {
        try {
            for (NetworkInterface n : Collections.list(NetworkInterface.getNetworkInterfaces()))
                for (InetAddress a : Collections.list(n.getInetAddresses()))
                    if (!a.isLoopbackAddress() && a instanceof Inet4Address) return a.getHostAddress();
        } catch (Exception ignored) { }
        return null;
    }
}
