package app.vaanitrack.android;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
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
 * Both look the same on every phone because the layouts, not the launcher,
 * decide how they are drawn. The microphone's movement is a ViewFlipper cycling
 * through pre-drawn frames (tools/make_widget_frames.py).
 */
public class RecordWidgetProvider extends AppWidgetProvider {

    /** Width, in dp, from which the full tile has room for its three buttons. */
    private static final int FULL_FROM_DP = 270;

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
        int widthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        boolean full = widthDp >= FULL_FROM_DP;

        RemoteViews views = new RemoteViews(
                context.getPackageName(),
                full ? R.layout.widget_wide : R.layout.widget_small);

        // The tile as a whole records.
        views.setOnClickPendingIntent(R.id.widget_root, open(context, 1, R.string.vaani_record_url));

        if (full) {
            views.setOnClickPendingIntent(R.id.chip_type, open(context, 2, R.string.vaani_type_url));
            views.setOnClickPendingIntent(R.id.chip_journal, open(context, 3, R.string.vaani_journal_url));
            views.setOnClickPendingIntent(R.id.chip_insights, open(context, 4, R.string.vaani_insights_url));
        }

        manager.updateAppWidget(appWidgetId, views);
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
