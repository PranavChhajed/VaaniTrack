package app.vaanitrack.android;

import android.Manifest;
import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Connects the tile to the person's VaaniTrack.
 *
 * The website knows three things the tile needs and cannot read for itself:
 * the phone's anonymous id, whether recordings may be kept, and the default
 * payment method. The You screen's "Connect the widget" button opens
 * `vaanitrack://setup?...` with them, which lands here. This screen has no
 * face of its own: it stores them, asks for the microphone once, says what
 * happened, and gets out of the way so the person is back where they were.
 */
public class SetupActivity extends Activity {

    private static final Pattern UUID = Pattern.compile(
            "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    private static final int ASK = 1;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Uri data = getIntent() == null ? null : getIntent().getData();
        String device = data == null ? null : data.getQueryParameter("d");
        String consent = data == null ? null : data.getQueryParameter("c");
        String payment = data == null ? null : data.getQueryParameter("p");
        boolean review = data != null && "1".equals(data.getQueryParameter("r"));

        if (device == null || !UUID.matcher(device).matches()) {
            Toast.makeText(this, R.string.setup_bad, Toast.LENGTH_LONG).show();
            finish();
            return;
        }
        if (!"granted".equals(consent) && !"denied".equals(consent)) {
            Toast.makeText(this, R.string.setup_consent, Toast.LENGTH_LONG).show();
            finish();
            return;
        }
        if (payment == null || payment.length() > 24) payment = "UPI";
        new WidgetStore(this).connect(device, consent, payment, review);

        List<String> need = new ArrayList<>();
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            need.add(Manifest.permission.RECORD_AUDIO);
        }
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            need.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (need.isEmpty()) {
            done();
        } else {
            requestPermissions(need.toArray(new String[0]), ASK);
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        done();
    }

    private void done() {
        boolean mic = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        int said = mic ? R.string.setup_ok : R.string.setup_no_mic;
        if (mic && !placed() && !offerToPlace()) said = R.string.setup_add;
        Toast.makeText(this, said, Toast.LENGTH_LONG).show();
        RecordWidgetProvider.refresh(this);
        finish();
    }

    /** Whether a tile is already on a home screen. */
    private boolean placed() {
        int[] ids = AppWidgetManager.getInstance(this)
                .getAppWidgetIds(new ComponentName(this, RecordWidgetProvider.class));
        return ids != null && ids.length > 0;
    }

    /**
     * Has Android offer to put the tile on the home screen, so nobody has to
     * find the widget list. False where the launcher cannot do that (before
     * Android 8, and some makes), and the person is told the long way instead.
     */
    private boolean offerToPlace() {
        if (Build.VERSION.SDK_INT < 26) return false;
        try {
            AppWidgetManager manager = AppWidgetManager.getInstance(this);
            if (!manager.isRequestPinAppWidgetSupported()) return false;
            return manager.requestPinAppWidget(
                    new ComponentName(this, RecordWidgetProvider.class), null, null);
        } catch (RuntimeException e) {
            return false;
        }
    }

    /** Safety net: if the activity is relaunched with a new link, handle it too. */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        recreate();
    }
}
