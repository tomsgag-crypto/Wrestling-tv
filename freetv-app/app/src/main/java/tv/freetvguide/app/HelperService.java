package tv.freetvguide.app;

import android.accessibilityservice.AccessibilityService;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Free TV helper: after Free TV opens BBC iPlayer or U for something, this works the app for you –
 * picks your profile, then finds the channel (or searches for the programme) and selects it.
 * It only acts for about 45 seconds after Free TV opens an app, and only in that app.
 * It can also record what those apps' screens contain ("layouts"), so the steps can be tuned.
 */
public class HelperService extends AccessibilityService {
    static HelperService running;

    // the job Free TV gave us
    private static String jobPkg, jobMode, jobProfile;
    private static String[] jobTargets;
    private static long jobUntil = 0;
    private static int step = 0;
    private static final List<String> done = new ArrayList<>();

    // layout recording
    static long recordUntil = 0;
    static final LinkedHashMap<String, String> layouts = new LinkedHashMap<>();
    static final List<String> log = new ArrayList<>();

    private final Handler ui = new Handler(Looper.getMainLooper());
    private long lastTick = 0;
    private final Runnable tickR = this::tick;

    static boolean isOn() { return running != null; }

    /** mode "live": targets are channel names; mode "find": targets[0] is a programme title. */
    static void setJob(String pkg, String mode, String targets, String profile) {
        jobPkg = pkg; jobMode = mode; jobTargets = targets.split("\\|"); jobProfile = profile == null ? "" : profile.trim();
        jobUntil = System.currentTimeMillis() + 45000; step = 0; done.clear();
        note("job " + mode + " " + targets + " in " + pkg);
        if (running != null) running.ui.postDelayed(running.tickR, 1500);
    }
    static void note(String s) { synchronized (log) { log.add(System.currentTimeMillis() % 1000000 + " " + s); if (log.size() > 300) log.remove(0); } }

    @Override protected void onServiceConnected() { try { running = this; note("helper on"); } catch (Throwable ignored) { } }
    @Override public boolean onUnbind(android.content.Intent i) { running = null; return super.onUnbind(i); }
    @Override public void onInterrupt() { }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent e) {
        try { onEvent(e); } catch (Throwable t) { note("error " + t); }
    }
    private void onEvent(AccessibilityEvent e) {
        CharSequence pkg = e.getPackageName();
        if (pkg == null || pkg.toString().equals(getPackageName())) return;
        if (System.currentTimeMillis() < recordUntil) record();
        if (jobPkg != null && System.currentTimeMillis() < jobUntil && jobPkg.contentEquals(pkg)) {
            ui.removeCallbacks(tickR);
            ui.postDelayed(tickR, 700);
        }
    }

    // ---------------------------------------------------------------- recording
    private void record() {
        AccessibilityNodeInfo r = getRootInActiveWindow();
        if (r == null) return;
        StringBuilder b = new StringBuilder();
        dump(r, 0, b);
        String key = b.toString().replaceAll("\\[[^\\]]*\\]", "");
        synchronized (layouts) {
            if (!layouts.containsKey(key)) {
                layouts.put(key, "=== " + r.getPackageName() + " @" + (System.currentTimeMillis() % 1000000) + "\n" + b);
                while (layouts.size() > 40) layouts.remove(layouts.keySet().iterator().next());
            }
        }
    }
    private void dump(AccessibilityNodeInfo n, int depth, StringBuilder b) {
        if (n == null || depth > 40 || b.length() > 60000) return;
        CharSequence t = n.getText(), d = n.getContentDescription();
        String cls = n.getClassName() == null ? "" : n.getClassName().toString().replaceAll(".*\\.", "");
        Rect r = new Rect(); n.getBoundsInScreen(r);
        String flags = (n.isClickable() ? "C" : "") + (n.isFocusable() ? "F" : "") + (n.isFocused() ? "*" : "") + (n.isEditable() ? "E" : "") + (n.isScrollable() ? "S" : "") + (n.isVisibleToUser() ? "" : "h");
        if (t != null || d != null || n.isClickable() || n.isEditable() || n.getViewIdResourceName() != null)
            for (int i = 0; i < Math.min(depth, 20); i++) b.append("  ");
            b.append(cls).append(' ').append(flags)
             .append(t != null ? " t=\"" + t + "\"" : "").append(d != null ? " d=\"" + d + "\"" : "")
             .append(n.getViewIdResourceName() != null ? " id=" + n.getViewIdResourceName().replaceAll(".*/", "") : "")
             .append(" [").append(r.left).append(',').append(r.top).append(' ').append(r.width()).append('x').append(r.height()).append("]\n");
        for (int i = 0; i < n.getChildCount(); i++) dump(n.getChild(i), depth + 1, b);
    }
    static String report() {
        StringBuilder b = new StringBuilder("Free TV helper layouts\n");
        synchronized (log) { for (String s : log) b.append(s).append('\n'); }
        synchronized (layouts) { for (String s : layouts.values()) b.append('\n').append(s); }
        return b.toString();
    }

    // ---------------------------------------------------------------- doing the job
    private static String norm(CharSequence s) { return s == null ? "" : s.toString().toLowerCase(Locale.UK).replace('&', ' ').replaceAll("[^a-z0-9 ]", " ").replaceAll("\\s+", " ").trim(); }
    private static String label(AccessibilityNodeInfo n) {
        CharSequence t = n.getText(); if (t != null && t.length() > 0) return t.toString();
        CharSequence d = n.getContentDescription(); return d == null ? "" : d.toString();
    }
    private void all(AccessibilityNodeInfo n, List<AccessibilityNodeInfo> out, int depth) {
        if (n == null || depth > 45) return;
        if (n.isVisibleToUser()) out.add(n);
        for (int i = 0; i < n.getChildCount(); i++) all(n.getChild(i), out, depth + 1);
    }
    /** Click a node, or the nearest parent that can be clicked; focus it first, like the remote would. */
    private boolean press(AccessibilityNodeInfo n, String why) {
        AccessibilityNodeInfo x = n;
        for (int i = 0; x != null && i < 6; i++, x = x.getParent()) {
            if (x.isClickable() || x.isFocusable()) {
                x.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
                boolean ok = x.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                note("press " + why + " '" + label(n) + "' -> " + ok);
                if (ok) return true;
            }
        }
        boolean ok = n.performAction(AccessibilityNodeInfo.ACTION_CLICK);
        note("press(self) " + why + " '" + label(n) + "' -> " + ok);
        return ok;
    }
    private AccessibilityNodeInfo find(List<AccessibilityNodeInfo> ns, String[] words, boolean exact, int maxExtra) {
        AccessibilityNodeInfo best = null; int bestLen = 9999;
        for (AccessibilityNodeInfo n : ns) {
            if (n.isEditable()) continue;
            String l = norm(label(n));
            if (l.isEmpty()) continue;
            for (String w : words) {
                String nw = norm(w);
                if (nw.isEmpty()) continue;
                boolean hit = exact ? l.equals(nw) : (l.startsWith(nw) || l.contains(" " + nw)) && l.length() <= nw.length() + maxExtra;
                if (hit && l.length() < bestLen) { best = n; bestLen = l.length(); }
            }
        }
        return best;
    }

    private void tick() {
        try { tick2(); } catch (Throwable t) { note("error " + t); jobPkg = null; }
    }
    private void tick2() {
        if (jobPkg == null || System.currentTimeMillis() > jobUntil) { if (jobPkg != null) note("job timed out"); jobPkg = null; return; }
        if (System.currentTimeMillis() - lastTick < 500) { ui.postDelayed(tickR, 600); return; }
        lastTick = System.currentTimeMillis();
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null || root.getPackageName() == null || !jobPkg.contentEquals(root.getPackageName())) { ui.postDelayed(tickR, 800); return; }
        List<AccessibilityNodeInfo> ns = new ArrayList<>();
        all(root, ns, 0);

        // 1. the profile picker
        if (!done.contains("profile")) {
            AccessibilityNodeInfo who = find(ns, new String[]{"who's watching", "who is watching", "choose a profile", "select a profile", "switch profile"}, false, 30);
            if (who != null) {
                AccessibilityNodeInfo p = jobProfile.isEmpty() ? null : find(ns, new String[]{jobProfile}, false, 25);
                if (p != null && press(p, "profile")) { done.add("profile"); again(1800); return; }
                note("profile screen, but no profile '" + jobProfile + "' found");
                again(1200); return;
            }
        }

        if ("live".equals(jobMode)) {
            // 2. the channel itself, if it's on screen
            AccessibilityNodeInfo ch = find(ns, jobTargets, true, 0);
            if (ch == null) ch = find(ns, jobTargets, false, 22);
            if (ch != null && !done.contains("ch")) { if (press(ch, "channel")) { done.add("ch"); finishSoon(); return; } }
            // 3. otherwise go to the app's live / channels section
            for (String nav : new String[]{"Channels", "Live", "Live TV", "Watch Live", "TV Guide", "Live & Guide"}) {
                if (done.contains("nav:" + nav)) continue;
                AccessibilityNodeInfo n = find(ns, new String[]{nav}, true, 0);
                if (n != null) { done.add("nav:" + nav); press(n, "nav"); again(2000); return; }
            }
            if (++step > 8 && !done.contains("search")) { jobMode = "find"; note("channel not found: searching instead"); }
            again(1200); return;
        }

        // find: open search, type the title, choose the result
        String title = jobTargets[0];
        AccessibilityNodeInfo edit = null;
        for (AccessibilityNodeInfo n : ns) if (n.isEditable()) { edit = n; break; }
        if (!done.contains("typed")) {
            if (edit != null) {
                Bundle a = new Bundle();
                a.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, title);
                edit.performAction(AccessibilityNodeInfo.ACTION_FOCUS);
                boolean ok = edit.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, a);
                note("typed into box -> " + ok);
                done.add("typed"); again(2500); return;
            }
            // an on-screen keyboard made of letter buttons
            if (find(ns, new String[]{"a"}, true, 0) != null && find(ns, new String[]{"b"}, true, 0) != null && find(ns, new String[]{"z"}, true, 0) != null) {
                done.add("typed");
                typeKeys(title.toLowerCase(Locale.UK).replaceAll("[^a-z0-9 ]", ""), 0);
                return;
            }
            if (!done.contains("search")) {
                AccessibilityNodeInfo s = find(ns, new String[]{"Search"}, true, 0);
                if (s == null) s = find(ns, new String[]{"search"}, false, 12);
                if (s != null) { done.add("search"); press(s, "search"); again(1800); return; }
            }
            again(1200); return;
        }
        // choose the result
        AccessibilityNodeInfo res = find(ns, new String[]{title}, true, 0);
        if (res == null) res = find(ns, new String[]{title}, false, 40);
        if (res != null && !done.contains("result")) { done.add("result"); press(res, "result"); finishSoon(); return; }
        again(1200);
    }
    private void typeKeys(final String s, final int i) {
        if (i >= s.length()) { note("typed on keyboard"); again(2500); return; }
        AccessibilityNodeInfo root = getRootInActiveWindow();
        List<AccessibilityNodeInfo> ns = new ArrayList<>();
        all(root, ns, 0);
        char c = s.charAt(i);
        String[] names = c == ' ' ? new String[]{"space", "Space", "SPACE", "␣"} : new String[]{String.valueOf(c)};
        AccessibilityNodeInfo k = find(ns, names, true, 0);
        if (k != null) press(k, "key");
        else note("no key for '" + c + "'");
        ui.postDelayed(() -> typeKeys(s, i + 1), 260);
    }
    private void again(long ms) { ui.removeCallbacks(tickR); ui.postDelayed(tickR, ms); }
    private void finishSoon() { note("done"); ui.postDelayed(() -> jobPkg = null, 3000); }
}
