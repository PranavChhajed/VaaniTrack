package app.vaanitrack.android;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.util.DisplayMetrics;

import androidx.core.content.res.ResourcesCompat;

/**
 * The amount, drawn in Garamond.
 *
 * docs/DESIGN.md makes money a serif at tabular width, "load-bearing": an
 * amount is what the person came to check, and it is the one thing that must
 * never read as ordinary text. A home-screen widget cannot use a custom font
 * in a text view (the launcher draws it in the system font, which is what the
 * first version quietly did), but it can show a picture. So the amount is
 * drawn here with the app's own EB Garamond and handed over as an image.
 *
 * The words around it stay in the system font, and the tile's content
 * description carries the amount as text for a screen reader.
 */
final class AmountImage {

    private AmountImage() { }

    /** Height of the picture, in dp: about one line of 34sp type. */
    private static final float HEIGHT_DP = 42f;
    private static final float TEXT_DP = 34f;

    static Bitmap draw(Context context, String text) {
        DisplayMetrics dm = context.getResources().getDisplayMetrics();
        Typeface garamond = ResourcesCompat.getFont(context, R.font.eb_garamond);

        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.SUBPIXEL_TEXT_FLAG);
        paint.setTypeface(garamond == null ? Typeface.SERIF : garamond);
        paint.setColor(context.getColor(R.color.ink));
        paint.setTextSize(TEXT_DP * dm.density);
        // Tabular, lining figures, as the web's .money class: a column of
        // amounts stacks the way it would in an account book.
        paint.setFontFeatureSettings("tnum, lnum");
        paint.setTextAlign(Paint.Align.CENTER);

        Rect bounds = new Rect();
        paint.getTextBounds(text, 0, text.length(), bounds);
        int width = Math.max(1, bounds.width() + (int) (6 * dm.density));
        int height = Math.round(HEIGHT_DP * dm.density);

        // Kept small: a widget's pictures travel in a size-limited parcel.
        Bitmap bitmap = Bitmap.createBitmap(Math.min(width, (int) (240 * dm.density)), height,
                Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Paint.FontMetrics fm = paint.getFontMetrics();
        float baseline = (height - (fm.descent - fm.ascent)) / 2f - fm.ascent;
        canvas.drawText(text, bitmap.getWidth() / 2f, baseline, paint);
        return bitmap;
    }
}
