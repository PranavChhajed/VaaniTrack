package app.vaanitrack.android;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

/**
 * The home-screen tile.
 *
 * A widget cannot listen: Android does not let one hold the microphone, and it
 * cannot run animation code either; the home screen draws it from a
 * description. What it can do is open the app on the address that starts
 * listening, which is what the big tap does. Everything after that is the
 * website's ordinary capture screen, so the tile cannot drift from the app.
 *
 * It comes in two sizes, picked from the room it has been given:
 *
 *   compact   about 2 x 2: the animated microphone, one tap target
 *   full      stretched wider: the microphone, a headline, and three small
 *             buttons for typing an expense, the journal and insights
 *
 * Both follow the system: its corner radius on Android 12 and up, a still
 * microphone when animations are off or battery saver is on, and a shorter
 * layout when text is large. Both look the same on every phone because the layouts, not the launcher,
 * decide how they are drawn. The microphone's movement is a ViewFlipper cycling
 * through pre-drawn frames (tools/make_widget_frames.py).
 */
public class RecordWidgetProvider extends AppWidgetProvider {

    /** Width, in dp, from which the full tile has room for its three buttons. */
    private static final int FULL_FROM_DP = 270;

    /** Below this height, in dp, the full tile drops its second line of text. */
    private static final int ROOMY_FROM_DP = 125;

    /** A flip interval so long that the microphone stays on its first frame. */
    private static final int STILL = Integer.MAX_VALUE / 2;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            render(context, manager, id);
        }
    }

    /** Called as the tile is stretched or shrunk: draw whichever layout now fits. */
    @Override
    public void onAppWidgetOptionsChanged(
            Context context, AppWidgetManager manager, int appWidgetId, Bundle newOptions) {
        render(context, manager, appWidgetId);
    }

    private static void render(Context context, AppWidgetManager manager, int appWidgetId) {
        Bundle options = manager.getAppWidgetOptions(appWidgetId);
        // The launcher reports the tile's size in both orientations: the narrow
        // width and tall height belong to portrait, the wide width and short
        // height to landscape. Use the pair for the way the phone is held.
        boolean landscape = context.getResources().getConfiguration().orientation
                == Configuration.ORIENTATION_LANDSCAPE;
        int widthDp = options.getInt(landscape
                ? AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH
                : AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        int heightDp = options.getInt(landscape
                ? AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT
                : AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        boolean full = widthDp >= FULL_FROM_DP;

        RemoteViews views = new RemoteViews(
                context.getPackageName(),
                full ? R.layout.widget_wide : R.layout.widget_small);

        // The tile as a whole records.
        views.setOnClickPendingIntent(android.R.id.background, open(context, 1, R.string.vaani_record_url));

        if (full) {
            views.setOnClickPendingIntent(R.id.chip_type, open(context, 2, R.string.vaani_type_url));
            views.setOnClickPendingIntent(R.id.chip_journal, open(context, 3, R.string.vaani_journal_url));
            views.setOnClickPendingIntent(R.id.chip_insights, open(context, 4, R.string.vaani_insights_url));
        }

        // Large text on a short tile would clip the buttons: keep the headline and
        // the buttons, drop the second line.
        boolean cramped = heightDp > 0 && heightDp < ROOMY_FROM_DP;
        float fontScale = context.getResources().getConfiguration().fontScale;
        if (full && (cramped || fontScale > 1.15f)) {
            views.setViewVisibility(R.id.hint, View.GONE);
        }
        // The buttons are a fixed height, so their words stop growing with the
        // system text size a little early (about 130%) rather than clip.
        if (full && fontScale > 1.15f) {
            views.setTextViewTextSize(R.id.title, TypedValue.COMPLEX_UNIT_DIP, 17 * 1.15f);
            for (int label : new int[] {R.id.label_type, R.id.label_journal, R.id.label_insights}) {
                views.setTextViewTextSize(label, TypedValue.COMPLEX_UNIT_DIP, 12 * 1.1f);
            }
        }

        // A phone that has animations turned off or is saving battery gets a
        // still microphone. The home screen redraws it on its next refresh.
        if (!animationsWanted(context)) {
            views.setInt(R.id.wave, "setFlipInterval", STILL);
            views.setDisplayedChild(R.id.wave, 0);
        }

        manager.updateAppWidget(appWidgetId, views);
    }

    private static boolean animationsWanted(Context context) {
        float scale = Settings.Global.getFloat(
                context.getContentResolver(), Settings.Global.ANIMATOR_DURATION_SCALE, 1f);
        PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        return scale > 0f && (power == null || !power.isPowerSaveMode());
    }

    /** Opens the website at one of its addresses. Each target has its own
     *  request code, or Android would hand the same PendingIntent to all four. */
    static PendingIntent open(Context context, int requestCode, int addressRes) {
        Uri address = Uri.parse(context.getString(addressRes));
        Intent open = new Intent(Intent.ACTION_VIEW, address, context, LauncherActivity.class);
        return PendingIntent.getActivity(
                context,
                requestCode,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
