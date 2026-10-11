package app.vaanitrack.android;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.text.NumberFormat;
import java.util.Locale;

/**
 * Listens for one expense, from the home-screen tile, without opening the app.
 *
 * A widget cannot hold the microphone, so the tap starts this foreground
 * service instead. It follows the website's record button state for state:
 * "Getting the mic ready" until sound is actually arriving, "Tap to finish"
 * only after that (docs/DESIGN.md section 7), then the same upload, the same
 * confidence gate, and the same rule that an unsure result is shown to the
 * person and never saved on a guess.
 *
 * Android shows its own microphone indicator and this service's notification
 * while it runs. Neither can be hidden, and neither should be.
 */
public class RecordService extends Service {

    static final String ACTION_TOGGLE = "app.vaanitrack.android.TOGGLE";

    private static final String CHANNEL = "listening";
    private static final int NOTIFICATION = 7;
    /** How long to wait for sound before saying the mic is ready anyway. */
    private static final long WARM_LIMIT_MS = 1_400;
    /** A take longer than this is finished for the person. */
    private static final long MAX_MS = 45_000;
    private static final long MIN_MS = 900;
    /** Below this a take is silence (about -44 dBFS). */
    private static final int SOUND = 200;

    /**
     * True while this process has a listening service alive. A tile that says
     * "Tap to finish" while this is false is a leftover from a process that
     * was killed, and must not be believed (see RecordWidgetProvider.render).
     */
    static volatile boolean alive;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private WidgetStore store;
    private MediaRecorder recorder;
    private File file;
    private long startedAt;
    private long soundAt;
    private double peakDb = -200;
    private double sumDb;
    private int samples;
    private boolean active;

    @Override
    public void onCreate() {
        super.onCreate();
        alive = true;
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        store = new WidgetStore(this);

        // A microphone service cannot start without the microphone permission:
        // Android throws, and the app would crash. A tile can be a little behind
        // (the person may have switched the permission off since it was drawn),
        // so look first and say what is wrong instead.
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED
                || !store.connected()) {
            store.setResult(WidgetStore.State.FAILED, "", "", "Set up the widget first. Tap to open VaaniTrack.");
            RecordWidgetProvider.refresh(this);
            stopSelf();
            return START_NOT_STICKY;
        }
        // Required within seconds of startForegroundService, whatever happens next.
        try {
            startForeground();
        } catch (RuntimeException e) {
            store.setResult(WidgetStore.State.FAILED, "", "", "Android wouldn’t let the microphone start. Try again.");
            RecordWidgetProvider.refresh(this);
            stopSelf();
            return START_NOT_STICKY;
        }

        WidgetStore.State state = store.state();
        if (active) {
            // A second tap while listening finishes the take; while the mic is
            // still warming up or the reply is being read, it does nothing.
            if (state == WidgetStore.State.RECORDING) finishTake();
        } else if (state == WidgetStore.State.READING) {
            leave();
        } else {
            beginTake();
        }
        return START_NOT_STICKY;
    }

    // ---- listening ---------------------------------------------------------------

    private void beginTake() {
        // A new take while the last result is still showing: that result's
        // clean-up must not run in the middle of this one.
        handler.removeCallbacks(putBack);
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED
                || !store.connected()) {
            fail("Set up the widget first. Tap to open VaaniTrack.");
            return;
        }
        try {
            file = File.createTempFile("take", ".m4a", getCacheDir());
            recorder = Build.VERSION.SDK_INT >= 31 ? new MediaRecorder(this) : new MediaRecorder();
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioChannels(1);
            recorder.setAudioSamplingRate(16_000);
            recorder.setAudioEncodingBitRate(48_000);
            recorder.setOutputFile(file.getAbsolutePath());
            recorder.prepare();
            recorder.start();
        } catch (Exception e) {
            release();
            deleteFile();
            fail("The microphone isn’t available right now. Try again.");
            return;
        }
        active = true;
        startedAt = System.currentTimeMillis();
        soundAt = 0;
        peakDb = -200;
        sumDb = 0;
        samples = 0;
        store.setState(WidgetStore.State.WARMING, "");
        RecordWidgetProvider.refresh(this);
        RecordWidgetProvider.checkLater(this, 25_000);
        handler.postDelayed(poll, 70);
        handler.postDelayed(autoStop, MAX_MS);
    }

    /** Watches the level: decides when the mic is really carrying sound. */
    private final Runnable poll = new Runnable() {
        @Override
        public void run() {
            if (!active || recorder == null) return;
            int amp;
            try {
                amp = recorder.getMaxAmplitude();
            } catch (RuntimeException e) {
                amp = 0;
            }
            long now = System.currentTimeMillis();
            if (soundAt == 0 && (amp >= SOUND || now - startedAt >= WARM_LIMIT_MS)) {
                soundAt = now;
                store.setState(WidgetStore.State.RECORDING, "");
                RecordWidgetProvider.refresh(RecordService.this);
            }
            if (soundAt != 0 && amp > 0) {
                double db = 20 * Math.log10(amp / 32767.0);
                peakDb = Math.max(peakDb, db);
                sumDb += db;
                samples++;
            }
            handler.postDelayed(this, 70);
        }
    };

    private final Runnable autoStop = this::finishTake;

    private void finishTake() {
        if (!active) return;
        active = false;
        handler.removeCallbacks(poll);
        handler.removeCallbacks(autoStop);
        final long ms = System.currentTimeMillis() - startedAt;
        final long warmup = soundAt == 0 ? ms : soundAt - startedAt;
        boolean stopped = true;
        try {
            recorder.stop();
        } catch (RuntimeException e) {
            stopped = false; // stopped too soon to hold anything
        }
        release();

        if (!stopped || ms < MIN_MS) {
            deleteFile();
            fail("That was too short. Tap, then say it.");
            return;
        }

        store.setState(WidgetStore.State.READING, "");
        RecordWidgetProvider.refresh(this);
        RecordWidgetProvider.checkLater(this, 25_000);
        final File take = file;
        final double peak = peakDb;
        final double mean = samples > 0 ? sumDb / samples : -200;
        new Thread(() -> {
            CaptureClient.Result result = new CaptureClient(this).send(
                    store, take, ms, peak, mean, warmup, words -> {
                        // What was heard, on the tile, while the rest is read.
                        store.setState(WidgetStore.State.READING, words);
                        RecordWidgetProvider.refresh(this);
                    });
            take.delete();
            handler.post(() -> settle(result));
        }, "vaani-upload").start();
    }

    // ---- the result ----------------------------------------------------------------

    private void settle(CaptureClient.Result result) {
        if (!result.ok) {
            fail(result.message);
            return;
        }
        boolean heardWell = CaptureClient.heardWell(result.confidence);
        boolean reviewAll = store.reviewAll();
        JSONArray savedIds = new JSONArray();
        int saved = 0;
        int checks = 0;
        String amount = "";
        String what = "";
        String checkAmount = "";
        try {
            for (int i = 0; i < result.rows.length(); i++) {
                JSONObject row = result.rows.getJSONObject(i);
                JSONObject t = CaptureClient.toTransaction(row, result.heard);
                String shown = money(row);
                String label = labelOf(row);
                if (CaptureClient.sure(row, heardWell, reviewAll)) {
                    store.enqueue("saved", t, result.captureId, null, false);
                    savedIds.put(t.getString("id"));
                    if (saved == 0) { amount = shown; what = label; }
                    saved++;
                } else {
                    // Held back for no reason but the person's own "let me check
                    // everything": no warning, and the card opens as a reading view.
                    boolean onlyByChoice = reviewAll && heardWell
                            && !row.optBoolean("needsConfirmation", false)
                            && !row.isNull("amount")
                            && "said".equals(row.optString("amountProvenance"));
                    String reason = null;
                    if (!onlyByChoice) {
                        reason = !row.isNull("confirmationReason")
                                ? row.optString("confirmationReason")
                                : row.isNull("amount") ? "Didn’t catch the amount. What was it?"
                                : !heardWell ? "That wasn’t heard cleanly. Check the amount."
                                : "Check the amount before this is saved.";
                    }
                    store.enqueue("review", t, result.captureId, reason, !onlyByChoice);
                    if (checks == 0) {
                        checkAmount = shown;
                        if (saved == 0) what = label;
                    }
                    checks++;
                }
            }
        } catch (JSONException e) {
            fail("Couldn’t read that back. Tap to try again.");
            return;
        }

        if (saved > 0) {
            store.setLastSaved(savedIds);
            StringBuilder line = new StringBuilder();
            if (saved > 1) line.append("+").append(saved - 1).append(" more");
            if (checks > 0) {
                if (line.length() > 0) line.append(" · ");
                line.append(checks).append(" to check");
            }
            store.setResult(WidgetStore.State.SAVED, amount, what, line.toString());
        } else {
            store.setResult(WidgetStore.State.CHECK, checkAmount, what,
                    checks > 1 ? checks + " to check" : "Tap to check it");
        }
        finishSoon();
    }

    private void fail(String message) {
        store.setResult(WidgetStore.State.FAILED, "", "", message);
        finishSoon();
    }

    /**
     * Show the result for a few seconds, then put the tile back.
     *
     * The service stays in the foreground while it does. A process with nothing
     * running is frozen by Android within seconds, and a frozen process cannot
     * put the tile back, which left "Logged" on it long after. The notification
     * says what happened meanwhile, and goes with the service.
     */
    private void finishSoon() {
        active = false;
        notice(store.state() == WidgetStore.State.FAILED ? "Couldn’t log that" : "VaaniTrack",
                store.state() == WidgetStore.State.SAVED ? "Logged " + store.amount()
                        : store.state() == WidgetStore.State.CHECK ? "Check this one in the app"
                        : store.line());
        RecordWidgetProvider.refresh(this);
        RecordWidgetProvider.checkLater(this, WidgetStore.RESULT_MS + 4_000);
        handler.postDelayed(putBack, WidgetStore.RESULT_MS);
    }

    /** The end of showing a result: idle tile, notification gone, service done. */
    private final Runnable putBack = () -> {
        store.setState(WidgetStore.State.IDLE, "");
        RecordWidgetProvider.refresh(this);
        stopForeground(true);
        stopSelf();
    };

    private void leave() {
        stopForeground(true);
        stopSelf();
    }

    private static String money(JSONObject row) {
        if (row.isNull("amount")) return "₹?";
        NumberFormat f = NumberFormat.getNumberInstance(new Locale("en", "IN"));
        f.setMaximumFractionDigits(2);
        f.setMinimumFractionDigits(0);
        return "₹" + f.format(row.optDouble("amount"));
    }

    private static String labelOf(JSONObject row) {
        String d = row.isNull("description") ? "" : row.optString("description", "");
        if (d.isEmpty() && !row.isNull("payee")) d = row.optString("payee", "");
        if (d.isEmpty()) return "";
        return Character.toUpperCase(d.charAt(0)) + d.substring(1);
    }

    // ---- housekeeping ----------------------------------------------------------------

    private void release() {
        if (recorder != null) {
            try { recorder.release(); } catch (RuntimeException ignored) { }
            recorder = null;
        }
    }

    private void deleteFile() {
        if (file != null) file.delete();
    }

    @Override
    public void onDestroy() {
        alive = false;
        handler.removeCallbacksAndMessages(null);
        release();
        if (active) {
            active = false;
            deleteFile();
            if (store != null) store.setState(WidgetStore.State.IDLE, "");
            RecordWidgetProvider.refresh(this);
        }
        super.onDestroy();
    }

    private void startForeground() {
        Notification n = build(getString(R.string.notice_title), getString(R.string.notice_text));
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        } else {
            startForeground(NOTIFICATION, n);
        }
    }

    /** Change what the service's notification says. */
    private void notice(String title, String text) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        try {
            nm.notify(NOTIFICATION, build(title, text));
        } catch (RuntimeException ignored) {
            // A notification is a courtesy; the tile is the answer.
        }
    }

    private Notification build(String title, String text) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL, getString(R.string.notice_channel), NotificationManager.IMPORTANCE_LOW);
            nm.createNotificationChannel(channel);
        }
        Intent toggle = new Intent(this, RecordService.class).setAction(ACTION_TOGGLE);
        PendingIntent finish = PendingIntent.getForegroundService(
                this, 9, toggle, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_waveform)
                .setContentTitle(title)
                .setContentText(text)
                .setOngoing(true)
                .setContentIntent(finish);
        return b.build();
    }
}
