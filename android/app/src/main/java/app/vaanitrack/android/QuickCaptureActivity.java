package app.vaanitrack.android;

import android.Manifest;
import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Private, deliberately content-free while locked. No amounts or transcripts. */
public class QuickCaptureActivity extends Activity {
    static final String ACTION_CAPTURE = "app.vaanitrack.android.QUICK_CAPTURE";
    private final Handler handler = new Handler(Looper.getMainLooper());
    private TextView status;
    private Button record;
    private Button cancel;
    private CheckBox lockedCapture;
    private boolean requested, resumed, readyHaptic, everStarted;
    private WidgetStore store;
    private String lastLogged = "";

    private boolean locked() { return getSystemService(KeyguardManager.class).isKeyguardLocked(); }
    private boolean permitted() { return checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED; }
    private boolean lockOptIn() { return getSharedPreferences("quick_capture", MODE_PRIVATE).getBoolean("allowLocked", false); }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        store = new WidgetStore(this);
        WidgetStore.State previous = store.state();
        if (!RecordService.alive && (previous == WidgetStore.State.WARMING || previous == WidgetStore.State.RECORDING || previous == WidgetStore.State.READING)) {
            store.setState(WidgetStore.State.IDLE, "");
            RecordWidgetProvider.refresh(this);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        if (Build.VERSION.SDK_INT >= 27 && lockOptIn() && permitted()) setShowWhenLocked(true);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        int pad = (int)(24 * getResources().getDisplayMetrics().density);
        root.setPadding(pad, pad * 2, pad, pad);
        root.setBackgroundColor(Color.rgb(248, 247, 242));
        TextView title = new TextView(this);
        title.setText("VaaniTrack · Record expense"); title.setTextSize(24); title.setTextColor(Color.BLACK);
        root.addView(title);
        status = new TextView(this); status.setTextSize(20); status.setTextColor(Color.BLACK);
        status.setPadding(0, pad, 0, pad); status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        root.addView(status);
        record = new Button(this); record.setText("Start recording");
        record.setOnClickListener(v -> {
            WidgetStore.State current = store.state();
            if (current == WidgetStore.State.RECORDING) send(RecordService.ACTION_STOP);
            else if (current != WidgetStore.State.WARMING && current != WidgetStore.State.READING) startCapture();
        });
        root.addView(record);
        cancel = new Button(this); cancel.setText("Close");
        cancel.setOnClickListener(v -> { cancelRecording(); finish(); }); root.addView(cancel);
        lockedCapture = new CheckBox(this);
        lockedCapture.setText("Allow quick capture while locked (no journal shown)");
        lockedCapture.setChecked(lockOptIn());
        lockedCapture.setOnCheckedChangeListener((button, checked) -> {
            if (!locked()) {
                getSharedPreferences("quick_capture", MODE_PRIVATE).edit().putBoolean("allowLocked", checked).apply();
                if (Build.VERSION.SDK_INT >= 27) setShowWhenLocked(checked && permitted());
            }
        });
        root.addView(lockedCapture);
        setContentView(root);
        // A recreation never begins a new take. It may display an already active one.
        requested = state != null || !ACTION_CAPTURE.equals(getIntent().getAction());
    }

    @Override protected void onResume() {
        super.onResume(); resumed = true; handler.post(render);
        if (!requested) { requested = true; record.post(this::startCapture); }
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent); setIntent(intent);
        WidgetStore.State state = store.state();
        if (ACTION_CAPTURE.equals(intent.getAction()) && state != WidgetStore.State.WARMING
                && state != WidgetStore.State.RECORDING && state != WidgetStore.State.READING) {
            requested = false;
            if (resumed) { requested = true; record.post(this::startCapture); }
        }
    }
    @Override protected void onPause() {
        resumed = false; handler.removeCallbacks(render); super.onPause();
    }
    @Override protected void onSaveInstanceState(Bundle out) { out.putBoolean("opened", true); super.onSaveInstanceState(out); }
    @Override public void onRequestPermissionsResult(int request, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(request, permissions, results);
        if (request == 85) status.setText(permitted() ? "Microphone allowed. Tap Start when ready." : "Microphone not allowed. You can type an expense in VaaniTrack.");
    }
    @Override protected void onDestroy() { handler.removeCallbacksAndMessages(null); super.onDestroy(); }
    @Override public void onBackPressed() { cancelRecording(); super.onBackPressed(); }

    private void startCapture() {
        if (!resumed) return;
        if (locked() && !lockOptIn()) {
            status.setText("Unlock to record");
            if (Build.VERSION.SDK_INT >= 26) getSystemService(KeyguardManager.class).requestDismissKeyguard(this,
                    new KeyguardManager.KeyguardDismissCallback() {
                        @Override public void onDismissSucceeded() { if (resumed) startCapture(); }
                    });
            return;
        }
        if (!store.connected()) { status.setText("Open VaaniTrack → You → Connect the widget first."); return; }
        if (!permitted()) {
            if (locked()) { status.setText("Unlock and allow microphone access first."); return; }
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 85);
            // A permission result never starts recording; the person taps Start again.
            return;
        }
        everStarted = true; readyHaptic = false;
        send(RecordService.ACTION_START);
    }

    private void send(String action) {
        try {
            Intent intent = new Intent(this, RecordService.class).setAction(action);
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(intent); else startService(intent);
        } catch (RuntimeException error) {
            everStarted = false;
            status.setText("Android blocked the microphone. Unlock and try again.");
        }
    }
    private void cancelRecording() {
        WidgetStore.State state = store.state();
        if (RecordService.alive && (state == WidgetStore.State.WARMING || state == WidgetStore.State.RECORDING)) send(RecordService.ACTION_CANCEL);
    }
    private final Runnable render = new Runnable() {
        @Override public void run() {
            if (!resumed) return;
            WidgetStore.State current = store.state();
            lockedCapture.setVisibility(locked() ? View.GONE : View.VISIBLE);
            lockedCapture.setEnabled(permitted());
            boolean listening = RecordService.alive && (current == WidgetStore.State.WARMING || current == WidgetStore.State.RECORDING);
            String diagnostic = current.name() + ":" + RecordService.alive;
            if (!diagnostic.equals(lastLogged)) {
                android.util.Log.d("VaaniQuickCapture", diagnostic);
                lastLogged = diagnostic;
            }
            cancel.setText(listening ? "Cancel and close" : "Close");
            record.setEnabled(current != WidgetStore.State.WARMING && current != WidgetStore.State.READING);
            record.setText(current == WidgetStore.State.RECORDING && listening ? "Stop recording" : "Start recording");
            if (listening) {
                status.setText(current == WidgetStore.State.WARMING ? "Getting the microphone ready…" : "Listening · " + store.stateAge()/1000 + "s");
                if (current == WidgetStore.State.RECORDING && !readyHaptic) {
                    readyHaptic = true; record.performHapticFeedback(Build.VERSION.SDK_INT >= 30 ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.VIRTUAL_KEY);
                }
            } else if (everStarted) {
                if (current == WidgetStore.State.READING) status.setText("Processing. You can close this screen.");
                else if (current == WidgetStore.State.SAVED || current == WidgetStore.State.CHECK) status.setText("Captured. Open VaaniTrack after unlocking to check it.");
                else if (current == WidgetStore.State.FAILED) status.setText("Couldn't capture that. Unlock and try again.");
                else status.setText("Ready when you are");
            } else if (status.getText().length() == 0) status.setText("Ready when you are");
            handler.postDelayed(this, 250);
        }
    };
}
