package tv.freetvguide.app;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.view.View;

/** A mouse-style pointer drawn over a web page, moved with the remote's arrows. */
class CursorView extends View {
    float x, y;
    private final Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG), edge = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path arrow = new Path();
    private final float u;

    CursorView(Context c) {
        super(c);
        u = c.getResources().getDisplayMetrics().density;
        fill.setColor(Color.WHITE);
        edge.setColor(Color.BLACK); edge.setStyle(Paint.Style.STROKE); edge.setStrokeWidth(2 * u); edge.setStrokeJoin(Paint.Join.ROUND);
        // classic arrow pointer, tip at (0,0)
        arrow.moveTo(0, 0); arrow.lineTo(0, 22 * u); arrow.lineTo(6 * u, 16.5f * u); arrow.lineTo(10 * u, 25 * u);
        arrow.lineTo(13.5f * u, 23.5f * u); arrow.lineTo(9.5f * u, 15 * u); arrow.lineTo(17 * u, 15 * u); arrow.close();
    }
    @Override protected void onDraw(Canvas c) {
        c.save(); c.translate(x, y); c.drawPath(arrow, fill); c.drawPath(arrow, edge); c.restore();
    }
}
