package app.vaanitrack.android;

import android.net.Uri;
import android.util.Base64;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

import org.json.JSONArray;

import java.nio.charset.StandardCharsets;

/**
 * Opens the website, and brings the widget's expenses with it.
 *
 * The tile saves into a small queue of its own because it cannot reach the
 * journal, which lives in Chrome's storage for the site. Every time the app is
 * opened, whatever is waiting in that queue rides along on the address
 * (`?inbox=`), and the website puts it in the journal and takes the parameter
 * off again. See src/lib/widgetInbox.ts for the other half.
 */
public class AppLauncher extends LauncherActivity {

    /** The whole queue (it holds at most this many), well inside any address limit. */
    private static final int MAX_PER_OPEN = 40;

    @Override
    protected Uri getLaunchingUrl() {
        Uri base = super.getLaunchingUrl();
        JSONArray items = new WidgetStore(this).handOver(MAX_PER_OPEN);
        if (items.length() == 0 || base == null) return base;
        String packed = Base64.encodeToString(
                items.toString().getBytes(StandardCharsets.UTF_8),
                Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
        return base.buildUpon().appendQueryParameter("inbox", packed).build();
    }
}
