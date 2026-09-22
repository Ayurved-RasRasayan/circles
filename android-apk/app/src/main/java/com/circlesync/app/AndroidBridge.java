package com.circlesync.app;

import android.content.Context;
import android.content.Intent;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

public class AndroidBridge {
    private final Context ctx;

    public AndroidBridge(Context ctx) {
        this.ctx = ctx;
    }

    @JavascriptInterface
    public void startSharing(String wsUrl, String userId, String username,
                             String displayName, String avatarColor, int refreshMs) {
        Intent intent = new Intent(ctx, LocationService.class);
        intent.putExtra("ws_url", wsUrl);
        intent.putExtra("user_id", userId);
        intent.putExtra("username", username);
        intent.putExtra("display_name", displayName);
        intent.putExtra("avatar_color", avatarColor);
        intent.putExtra("refresh_ms", (long) refreshMs);

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            ctx.startForegroundService(intent);
        } else {
            ctx.startService(intent);
        }
    }

    @JavascriptInterface
    public void stopSharing() {
        Intent intent = new Intent(ctx, LocationService.class);
        ctx.stopService(intent);
    }

    @JavascriptInterface
    public boolean isServiceRunning() {
        return LocationService.isRunning;
    }

    @JavascriptInterface
    public void showToast(String message) {
        Toast.makeText(ctx, message, Toast.LENGTH_SHORT).show();
    }
}