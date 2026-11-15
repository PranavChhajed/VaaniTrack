package app.vaanitrack.android;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

/** Quick Settings starts a visible recorder, never a background microphone. */
public class CaptureTileService extends TileService {
    @Override public void onStartListening() {
        Tile tile = getQsTile();
        if (tile != null) {
            tile.setLabel("Record expense");
            tile.setState(Tile.STATE_INACTIVE);
            if (Build.VERSION.SDK_INT >= 29) tile.setSubtitle("VaaniTrack");
            tile.updateTile();
        }
    }
    // PendingIntent overload exists only on API 34+. The legacy overload is
    // required below 34 and is never called on versions that prohibit it.
    @android.annotation.SuppressLint("StartActivityAndCollapseDeprecated")
    @Override public void onClick() {
        super.onClick();
        Intent intent = new Intent(this, QuickCaptureActivity.class)
                .setAction(QuickCaptureActivity.ACTION_CAPTURE)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(PendingIntent.getActivity(this, 84, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        } else {
            startActivityAndCollapse(intent);
        }
    }
}
