package app.vaanitrack.android;

import android.Manifest;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.PowerManager;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Log;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;

/**
 * The home-screen tile: one control, the record button.
 *
 * Tapping it records an expense right there. It never opens the app for that:
 * `RecordService` listens, sends the take to the server and reports back, and
 * this class only draws where that has got to. The tile moves through the
 * website's own record-button states (docs/DESIGN.md section 7):
 *
 *   idle        mint        "Say what you spent"
 *   warming     ember 80%   "Getting the mic ready..."
 *   recording   ember       "Tap to finish", bars moving
 *   reading     mint        "Reading it back...", what was heard underneath
 *   saved       forest      the amount in Garamond, "Logged", and Undo
 *   check       paper       "Check this": opens the app's review card
 *   failed      paper, red  says what went wrong; a tap tries again
 *
 * The one place it does open the app is when it is not set up yet, or when the
 * app was unsure: an unsure result is shown to the person, never saved.
 */
public class RecordWidgetProvider extends AppWidgetProvider {

    static final String ACTION_UNDO = "app.vaanitrack.android.UNDO";
    static final String ACTION_NOOP = "app.vaanitrack.android.NOOP";
    static final String ACTION_CHECK = "app.vaanitrack.android.CHECK";

    /** A flip interval so long that the picture stays on its first frame. */
    private static final int STILL = Integer.MAX_VALUE / 2;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            render(context, manager, id);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (ACTION_UNDO.equals(intent.getAction())) {
            undo(context);
            return;
        }
        if (ACTION_NOOP.equals(intent.getAction())) return;
        if (ACTION_CHECK.equals(intent.getAction())) {
            refresh(context);
            return;
        }
        super.onReceive(context, intent);
    }

    /** Redraw every placed tile from the stored state. */
    static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, RecordWidgetProvider.class));
        for (int id : ids) {
            render(context, manager, id);
        }
    }

    /**
     * Ask for a redraw a little later, whatever happens to this process.
     *
     * If Android kills the app mid-take, nothing is left to tell the tile, and
     * it would go on saying "Tap to finish". An alarm survives that: when it
     * fires, `render` sees there is no listening service and draws idle.
     */
    static void checkLater(Context context, long delayMs) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        Intent check = new Intent(context, RecordWidgetProvider.class).setAction(ACTION_CHECK);
        PendingIntent pending = PendingIntent.getBroadcast(
                context, 6, check, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        alarms.setAndAllowWhileIdle(
                AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + delayMs, pending);
    }

    private static void undo(Context context) {
        WidgetStore store = new WidgetStore(context);
        JSONArray ids = store.lastSaved();
        for (int i = 0; i < ids.length(); i++) {
            store.undoLast(ids.optString(i));
        }
        store.setLastSaved(new JSONArray());
        store.setState(WidgetStore.State.IDLE, "");
        refresh(context);
    }

    private static void render(Context context, AppWidgetManager manager, int appWidgetId) {
        WidgetStore store = new WidgetStore(context);
        boolean mic = context.checkSelfPermission(Manifest.permission.RECORD_AUDIO)
                == PackageManager.PERMISSION_GRANTED;
        boolean ready = store.connected() && mic;
        WidgetStore.State state = store.state();
        // "Listening" or "reading" with no service alive is a process that was
        // killed. Believe the facts, not the leftover.
        boolean inFlight = state == WidgetStore.State.WARMING
                || state == WidgetStore.State.RECORDING || state == WidgetStore.State.READING;
        if (inFlight && !RecordService.alive) {
            state = WidgetStore.State.IDLE;
            store.setState(WidgetStore.State.IDLE, "");
        }

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_tile);

        int picture = R.id.mic_idle;
        String title = context.getString(R.string.widget_title);
        String sub = context.getString(R.string.widget_hint);
        String amount = "";
        PendingIntent tap;

        if (!ready) {
            // Not set up: the tap goes to where it is set up.
            title = "Connect VaaniTrack";
            sub = store.connected() ? "Allow the microphone to start" : "Tap to set up the widget";
            tap = openApp(context, R.string.vaani_you_url);
        } else {
            switch (state) {
                case WARMING:
                    picture = R.id.mic_warm;
                    title = "Getting the mic ready…";
                    sub = "One moment";
                    tap = noop(context);
                    break;
                case RECORDING:
                    picture = R.id.flip_rec;
                    title = "Tap to finish";
                    sub = "Listening";
                    tap = toggle(context);
                    break;
                case READING:
                    picture = R.id.flip_read;
                    title = "Reading it back…";
                    sub = store.line().isEmpty() ? "" : "“" + store.line() + "”";
                    tap = noop(context);
                    break;
                case SAVED:
                    picture = R.id.mic_saved;
                    amount = store.amount();
                    title = store.what().isEmpty() ? "Logged" : store.what();
                    sub = store.line().isEmpty() ? "Logged ✓" : "Logged ✓ · " + store.line();
                    tap = toggle(context);
                    break;
                case CHECK:
                    picture = R.id.mic_check;
                    amount = store.amount();
                    title = "Check this";
                    sub = store.line();
                    tap = openApp(context, R.string.vaani_open_url);
                    break;
                case FAILED:
                    picture = R.id.mic_fail;
                    title = "Tap to try again";
                    sub = store.line();
                    tap = toggle(context);
                    break;
                default:
                    int waiting = store.waiting();
                    if (waiting > 0) {
                        sub = waiting + " waiting for the app";
                    }
                    tap = toggle(context);
            }
        }

        for (int id : new int[] {R.id.mic_idle, R.id.mic_warm, R.id.flip_rec, R.id.flip_read,
                R.id.mic_saved, R.id.mic_check, R.id.mic_fail}) {
            views.setViewVisibility(id, id == picture ? View.VISIBLE : View.GONE);
        }

        views.setTextViewText(R.id.title, title);
        views.setTextViewText(R.id.sub, sub);
        views.setViewVisibility(R.id.sub, sub.isEmpty() ? View.GONE : View.VISIBLE);
        // Money is Garamond (docs/DESIGN.md), which a text view cannot show here.
        if (!amount.isEmpty()) {
            views.setImageViewBitmap(R.id.amount, AmountImage.draw(context, amount));
        }
        views.setViewVisibility(R.id.amount, amount.isEmpty() ? View.GONE : View.VISIBLE);

        boolean undoable = ready && state == WidgetStore.State.SAVED;
        views.setViewVisibility(R.id.undo, undoable ? View.VISIBLE : View.GONE);
        if (undoable) {
            Intent undo = new Intent(context, RecordWidgetProvider.class).setAction(ACTION_UNDO);
            views.setOnClickPendingIntent(R.id.undo, PendingIntent.getBroadcast(
                    context, 5, undo, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }

        views.setOnClickPendingIntent(android.R.id.background, tap);
        views.setContentDescription(android.R.id.background,
                (amount.isEmpty() ? "" : amount + ". ") + title + (sub.isEmpty() ? "" : ". " + sub));

        // A phone with animations turned off, or saving battery, gets a still
        // picture. The home screen redraws it on its next refresh.
        if (!animationsWanted(context)) {
            for (int flipper : new int[] {R.id.flip_rec, R.id.flip_read}) {
                views.setInt(flipper, "setFlipInterval", STILL);
                views.setDisplayedChild(flipper, 0);
            }
        }

        // A result is only for a few seconds. Whoever drew it (the service, a
        // permission change, the launcher) also books the redraw that ends it, so
        // it cannot outlive its time because a timer somewhere was lost.
        boolean result = state == WidgetStore.State.SAVED || state == WidgetStore.State.CHECK
                || state == WidgetStore.State.FAILED;
        if (result) {
            checkLater(context, Math.max(1_500, WidgetStore.RESULT_MS + 3_000 - store.stateAge() + 500));
        }

        // One line per redraw, so the tile's state can be followed (and tested)
        // without reading pixels: `adb logcat -s VaaniWidget`.
        Log.i("VaaniWidget", "ready=" + ready + " state=" + state + " title=" + title
                + " sub=" + sub + " amount=" + amount + " waiting=" + store.waiting()
                + " undo=" + undoable);

        manager.updateAppWidget(appWidgetId, views);
    }

    private static boolean animationsWanted(Context context) {
        float scale = Settings.Global.getFloat(
                context.getContentResolver(), Settings.Global.ANIMATOR_DURATION_SCALE, 1f);
        PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        return scale > 0f && (power == null || !power.isPowerSaveMode());
    }

    // ---- the taps ------------------------------------------------------------------

    private static PendingIntent toggle(Context context) {
        Intent intent = new Intent(context, RecordService.class).setAction(RecordService.ACTION_TOGGLE);
        return RecordService.serviceIntent(context, 1, intent);
    }

    private static PendingIntent noop(Context context) {
        Intent intent = new Intent(context, RecordWidgetProvider.class).setAction(ACTION_NOOP);
        return PendingIntent.getBroadcast(
                context, 2, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Opens the website, at one of its addresses (the launcher adds anything waiting). */
    private static PendingIntent openApp(Context context, int addressRes) {
        Uri address = Uri.parse(context.getString(addressRes));
        Intent open = new Intent(Intent.ACTION_VIEW, address, context, AppLauncher.class);
        return PendingIntent.getActivity(
                context, 3, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
