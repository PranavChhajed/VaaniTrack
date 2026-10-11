package app.vaanitrack.android;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.UUID;

/**
 * The widget's side of a capture: send the recording to the same route the
 * website uses, and decide what to do with the answer by the same rules.
 *
 * Nothing here is new behaviour. The server does the listening and the
 * reading; the confidence gate below is `gateFailures` from src/lib/report.ts
 * and the transaction shape is `toTransaction` from src/lib/types.ts, written
 * out again because this side cannot import them. If either changes there, it
 * changes here.
 */
final class CaptureClient {

    /** What a capture came to. */
    static final class Result {
        /** True when the server heard and read something. */
        boolean ok;
        /** For a failure: what to show, in the app's own words. */
        String message = "";
        /** Words that were heard, even when they could not be used. */
        String heard = "";
        double confidence;
        String captureId;
        JSONArray rows = new JSONArray();
    }

    interface HeardListener {
        void onHeard(String words);
    }

    private final String api;

    CaptureClient(Context context) {
        api = context.getString(R.string.vaani_api_url);
    }

    /**
     * Wakes the server while the person is still speaking: a function that has been
     * idle starts cold on its next request, which is time spent waiting after they
     * stop talking. A tiny request at the start of a take has it ready. Fire and
     * forget; nothing waits on it and nothing depends on it.
     */
    void warm() {
        new Thread(() -> {
            HttpURLConnection http = null;
            try {
                http = (HttpURLConnection) new URL(api + "/api/transcribe").openConnection();
                http.setRequestMethod("OPTIONS");
                http.setConnectTimeout(4_000);
                http.setReadTimeout(4_000);
                http.getResponseCode();
            } catch (Exception ignored) {
                // A warm-up that fails costs nothing but the warm-up.
            } finally {
                if (http != null) http.disconnect();
            }
        }, "vaani-warm").start();
    }

    Result send(WidgetStore store, File audio, long audioMs, double peakDb, double meanDb,
                long warmupMs, HeardListener listener) {
        Result result = new Result();
        String boundary = "----vaani" + UUID.randomUUID().toString().replace("-", "");
        HttpURLConnection http = null;
        try {
            http = (HttpURLConnection) new URL(api + "/api/transcribe").openConnection();
            http.setRequestMethod("POST");
            http.setConnectTimeout(10_000);
            http.setReadTimeout(45_000);
            http.setDoOutput(true);
            http.setChunkedStreamingMode(16 * 1024);
            http.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);

            try (DataOutputStream out = new DataOutputStream(http.getOutputStream())) {
                field(out, boundary, "deviceId", store.deviceId());
                field(out, boundary, "audioConsent", store.consent());
                field(out, boundary, "audioMs", String.valueOf(audioMs));
                if (peakDb <= 0 && peakDb > -200) field(out, boundary, "peakDb", String.format(Locale.US, "%.2f", peakDb));
                if (meanDb <= 0 && meanDb > -200) field(out, boundary, "meanDb", String.format(Locale.US, "%.2f", meanDb));
                field(out, boundary, "warmupMs", String.valueOf(warmupMs));
                field(out, boundary, "today", new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date()));
                field(out, boundary, "defaultPayment", store.payment());

                out.writeBytes("--" + boundary + "\r\n");
                out.writeBytes("Content-Disposition: form-data; name=\"audio\"; filename=\"capture\"\r\n");
                out.writeBytes("Content-Type: audio/mp4\r\n\r\n");
                try (InputStream in = new FileInputStream(audio)) {
                    byte[] buffer = new byte[8192];
                    int n;
                    while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
                }
                out.writeBytes("\r\n--" + boundary + "--\r\n");
            }

            int status = http.getResponseCode();
            InputStream body = status >= 400 ? http.getErrorStream() : http.getInputStream();
            String type = http.getContentType() == null ? "" : http.getContentType();

            JSONObject last = null;
            if (body != null && type.contains("ndjson")) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(body, StandardCharsets.UTF_8));
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.trim().isEmpty()) continue;
                    last = new JSONObject(line);
                    // The first line is what was heard, which comes back well before
                    // the rest: show it while the reading is still going on.
                    if (last.has("heard") && listener != null) listener.onHeard(last.optString("heard"));
                }
            } else if (body != null) {
                last = new JSONObject(readAll(body));
            }

            if (last == null) {
                result.message = "The server sent nothing back. Try again.";
                return result;
            }
            if (status != 200) {
                result.message = last.optString("error", "Could not read that. Try again.");
                result.heard = last.isNull("heard") ? "" : last.optString("heard", "");
                return result;
            }

            result.heard = last.optString("text", "");
            result.confidence = last.optDouble("confidence", 0);
            result.captureId = last.isNull("captureId") ? null : last.optString("captureId", null);
            if (last.has("extractError")) {
                result.message = last.optString("extractError");
                return result;
            }
            JSONArray rows = last.optJSONArray("transactions");
            if (result.heard.trim().isEmpty() || rows == null || rows.length() == 0) {
                result.message = result.heard.trim().isEmpty()
                        ? "Didn’t catch anything there. Try again, a bit closer."
                        : "No amount in “" + result.heard.trim() + "”. Say the number too.";
                return result;
            }
            result.rows = rows;
            result.ok = true;
            return result;
        } catch (IOException e) {
            result.message = "Couldn’t reach the server. Check your connection and tap to try again.";
            return result;
        } catch (JSONException e) {
            result.message = "The server answered with something unreadable. Try again.";
            return result;
        } finally {
            if (http != null) http.disconnect();
        }
    }

    private static void field(DataOutputStream out, String boundary, String name, String value) throws IOException {
        if (value == null) return;
        out.writeBytes("--" + boundary + "\r\n");
        out.writeBytes("Content-Disposition: form-data; name=\"" + name + "\"\r\n\r\n");
        out.write(value.getBytes(StandardCharsets.UTF_8));
        out.writeBytes("\r\n");
    }

    private static String readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int n;
        while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
        return out.toString("UTF-8");
    }

    // ---- the gate, as in src/lib/report.ts `gateFailures` ----------------------

    /** True when this row may be saved without being looked at. */
    static boolean sure(JSONObject row, boolean heardWell, boolean reviewAll) {
        if (!heardWell) return false;
        if (row.optBoolean("needsConfirmation", false)) return false;
        if (row.isNull("amount")) return false;
        if (!"said".equals(row.optString("amountProvenance"))) return false;
        return !reviewAll;
    }

    /** The confidence threshold from useCapture.ts: a mean log-probability above -0.9. */
    static boolean heardWell(double confidence) {
        return confidence > -0.9;
    }

    // ---- the transaction, as in src/lib/types.ts `toTransaction` ---------------

    static JSONObject toTransaction(JSONObject row, String transcript) throws JSONException {
        JSONObject t = new JSONObject();
        t.put("id", UUID.randomUUID().toString());
        t.put("amount", field(row, "amount"));
        t.put("description", field(row, "description"));
        t.put("category", field(row, "category"));
        t.put("payee", field(row, "payee"));
        t.put("paymentMethod", field(row, "paymentMethod"));
        t.put("date", field(row, "date"));
        t.put("time", field(row, "time"));
        SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        iso.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
        t.put("createdAt", iso.format(new Date()));
        t.put("source", "voice");
        t.put("transcript", transcript);
        return t;
    }

    private static JSONObject field(JSONObject row, String name) throws JSONException {
        JSONObject f = new JSONObject();
        Object value = row.isNull(name) ? null : row.opt(name);
        if (value == null || "".equals(value)) {
            f.put("value", JSONObject.NULL);
            f.put("provenance", "unknown");
        } else {
            f.put("value", value);
            f.put("provenance", row.optString(name + "Provenance", "unknown"));
        }
        return f;
    }
}
