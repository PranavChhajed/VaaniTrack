package app.vaanitrack.android;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Everything the tile remembers between taps.
 *
 * It lives in the app, not on the website, because the tile is native: it
 * cannot read Chrome's storage. That is also why it keeps its own small queue
 * of expenses (the inbox) and hands them to the website the next time the app
 * opens, rather than writing into the journal itself.
 */
final class WidgetStore {

    /** Where the tile is in a capture. Persisted, so a restart cannot strand it. */
    enum State { IDLE, WARMING, RECORDING, READING, SAVED, CHECK, FAILED }

    private static final String PREFS = "vaani_widget";

    /** An in-flight state older than this is a process that died; start over. */
    private static final long STUCK_MS = 100_000;
    /** How long a result stays on the tile before it goes back to idle. */
    static final long RESULT_MS = 9_000;
    /** The queue is capped so it can never grow without bound or outgrow an address. */
    private static final int MAX_ITEMS = 40;
    private static final long MAX_AGE_MS = 14L * 24 * 3600 * 1000;

    private final SharedPreferences prefs;

    WidgetStore(Context context) {
        prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    // ---- what the website told us at set-up ----------------------------------

    /** The phone's anonymous id, so the server files a widget capture with the rest. */
    String deviceId() { return prefs.getString("device", null); }
    /** "granted", "denied": the recordings question, answered in the app. */
    String consent() { return prefs.getString("consent", "denied"); }
    String payment() { return prefs.getString("payment", "UPI"); }
    boolean reviewAll() { return prefs.getBoolean("reviewAll", false); }
    boolean connected() { return deviceId() != null; }

    void connect(String device, String consent, String payment, boolean reviewAll) {
        prefs.edit()
                .putString("device", device)
                .putString("consent", consent)
                .putString("payment", payment)
                .putBoolean("reviewAll", reviewAll)
                .apply();
    }

    // ---- the tile's state -----------------------------------------------------

    State state() {
        State s = State.valueOf(prefs.getString("state", State.IDLE.name()));
        long age = System.currentTimeMillis() - prefs.getLong("stateAt", 0);
        boolean inFlight = s == State.WARMING || s == State.RECORDING || s == State.READING;
        if (inFlight && age > STUCK_MS) return State.IDLE;
        boolean result = s == State.SAVED || s == State.CHECK || s == State.FAILED;
        if (result && age > RESULT_MS + 3_000) return State.IDLE;
        return s;
    }

    /** How long the current state has been showing, in milliseconds. */
    long stateAge() {
        return System.currentTimeMillis() - prefs.getLong("stateAt", 0);
    }

    /** What the tile says under its headline: a heard phrase, an amount, a reason. */
    String line() { return prefs.getString("line", ""); }
    String amount() { return prefs.getString("amount", ""); }
    String what() { return prefs.getString("what", ""); }

    void setState(State s, String line) {
        prefs.edit()
                .putString("state", s.name())
                .putLong("stateAt", System.currentTimeMillis())
                .putString("line", line == null ? "" : line)
                .apply();
    }

    void setResult(State s, String amount, String what, String line) {
        prefs.edit()
                .putString("state", s.name())
                .putLong("stateAt", System.currentTimeMillis())
                .putString("amount", amount == null ? "" : amount)
                .putString("what", what == null ? "" : what)
                .putString("line", line == null ? "" : line)
                .apply();
    }

    /** The ids of what the last capture saved, for Undo. */
    void setLastSaved(JSONArray ids) { prefs.edit().putString("last", ids.toString()).apply(); }

    JSONArray lastSaved() {
        try {
            return new JSONArray(prefs.getString("last", "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    // ---- the inbox ------------------------------------------------------------

    /**
     * Queue one finished capture for the website.
     *
     * `kind` is "saved" (the gate was sure; goes straight into the journal) or
     * "review" (the app was unsure; opens as a review card, never saved here).
     */
    synchronized void enqueue(String kind, JSONObject transaction, String captureId,
                              String reason, boolean needsConfirmation) {
        JSONArray items = load();
        try {
            JSONObject item = new JSONObject();
            item.put("k", kind);
            item.put("t", transaction);
            item.put("at", System.currentTimeMillis());
            item.put("n", 0);
            if (captureId != null) item.put("cap", captureId);
            if (reason != null) item.put("reason", reason);
            if (needsConfirmation) item.put("needs", true);
            items.put(item);
        } catch (JSONException ignored) {
            return;
        }
        save(trim(items));
    }

    /** Take back the last "saved" item, if the website has not collected it yet. */
    synchronized boolean undoLast(String transactionId) {
        JSONArray items = load();
        JSONArray kept = new JSONArray();
        boolean removed = false;
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null) continue;
            JSONObject t = item.optJSONObject("t");
            boolean mine = t != null && transactionId.equals(t.optString("id"));
            if (mine && item.optInt("n", 0) == 0) { removed = true; continue; }
            kept.put(item);
        }
        save(kept);
        return removed;
    }

    /** How many are waiting to be collected (never handed over yet). */
    synchronized int waiting() {
        JSONArray items = load();
        int n = 0;
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item != null && item.optInt("n", 0) == 0) n++;
        }
        return n;
    }

    /**
     * Everything to give the website now, as a JSON array; marks each as
     * handed over.
     *
     * Nothing is dropped for having been handed over. The app has no way to
     * tell this side that the website took them (a first open might be offline,
     * or the page might die half way), so an item stays until it is old, and is
     * offered again on every open. The website skips any it already has, so
     * this costs only a few kilobytes on the address.
     */
    synchronized JSONArray handOver(int max) {
        JSONArray items = load();
        JSONArray out = new JSONArray();
        JSONArray kept = new JSONArray();
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null) continue;
            if (out.length() < max) {
                JSONObject copy = new JSONObject();
                try {
                    copy.put("k", item.optString("k"));
                    copy.put("t", item.opt("t"));
                    if (item.has("cap")) copy.put("cap", item.opt("cap"));
                    if (item.has("reason")) copy.put("reason", item.opt("reason"));
                    if (item.has("needs")) copy.put("needs", item.opt("needs"));
                    out.put(copy);
                    item.put("n", item.optInt("n", 0) + 1);
                } catch (JSONException ignored) {
                    continue;
                }
            }
            kept.put(item);
        }
        save(kept);
        return out;
    }

    private JSONArray trim(JSONArray items) {
        long now = System.currentTimeMillis();
        JSONArray kept = new JSONArray();
        int start = Math.max(0, items.length() - MAX_ITEMS);
        for (int i = start; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item != null && now - item.optLong("at", now) < MAX_AGE_MS) kept.put(item);
        }
        return kept;
    }

    private JSONArray load() {
        try {
            return new JSONArray(prefs.getString("inbox", "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    private void save(JSONArray items) {
        prefs.edit().putString("inbox", items.toString()).apply();
    }
}
