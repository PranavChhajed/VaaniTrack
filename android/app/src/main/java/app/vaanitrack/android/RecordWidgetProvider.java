package app.vaanitrack.android;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

/**
 * The "Say what you spent" tile.
 *
 * A widget cannot listen: Android does not let one hold the microphone. What
 * it can do is open the app on the address that starts listening, which is
 * what this does. The recording itself, and everything after it, is the
 * website's ordinary capture screen, so the tile cannot drift from the app.
 */
public class RecordWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_record);
            views.setOnClickPendingIntent(R.id.widget_root, recordIntent(context));
            manager.updateAppWidget(id, views);
        }
    }

    /** Opens the website's capture screen already listening. */
    static PendingIntent recordIntent(Context context) {
        Uri address = Uri.parse(context.getString(R.string.vaani_record_url));
        Intent open = new Intent(Intent.ACTION_VIEW, address, context, LauncherActivity.class);
        return PendingIntent.getActivity(
                context,
                0,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
