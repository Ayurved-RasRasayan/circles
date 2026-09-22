package com.circlesync.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

public class LocationService extends Service {

    public static boolean isRunning = false;

    private static final String TAG = "CircleSyncService";
    private static final String CHANNEL_ID = "circlesync_location";
    private static final int NOTIFICATION_ID = 1001;

    private FusedLocationProviderClient fusedClient;
    private LocationCallback locationCallback;
    private OkHttpClient okHttpClient;
    private WebSocket webSocket;

    private String wsUrl;
    private String userId;
    private String username;
    private String displayName;
    private String avatarColor;
    private long refreshMs = 10000;

    private long lastSentAt = 0;
    private boolean wsConnected = false;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        okHttpClient = new OkHttpClient.Builder()
                .pingInterval(30, TimeUnit.SECONDS)
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .build();
        fusedClient = LocationServices.getFusedLocationProviderClient(this);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            wsUrl = intent.getStringExtra("ws_url");
            userId = intent.getStringExtra("user_id");
            username = intent.getStringExtra("username");
            displayName = intent.getStringExtra("display_name");
            avatarColor = intent.getStringExtra("avatar_color");
            refreshMs = intent.getLongExtra("refresh_ms", 10000L);
        }

        isRunning = true;
        startForeground(NOTIFICATION_ID, buildNotification("Connecting..."));

        if (webSocket == null || !wsConnected) {
            connectWebSocket();
        }
        startLocationUpdates();

        return START_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Location Sharing",
                    NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("CircleSync location sharing");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification(String status) {
        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, intent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("CircleSync")
                .setContentText(status)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentIntent(pi)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    private void updateNotification(String status) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(NOTIFICATION_ID, buildNotification(status));
    }

    private void connectWebSocket() {
        try {
            String url = wsUrl + "&userId=" + enc(userId) + "&username=" + enc(username)
                    + "&displayName=" + enc(displayName) + "&avatarColor=" + enc(avatarColor);
            Request request = new Request.Builder().url(url).build();

            webSocket = okHttpClient.newWebSocket(request, new WebSocketListener() {
                @Override
                public void onOpen(WebSocket ws, Response response) {
                    wsConnected = true;
                    Log.i(TAG, "WebSocket connected");
                    updateNotification("Sharing your location");
                }

                @Override
                public void onFailure(WebSocket ws, Throwable t, @Nullable Response response) {
                    wsConnected = false;
                    Log.e(TAG, "WebSocket failure: " + t.getMessage());
                    updateNotification("Reconnecting...");
                    new android.os.Handler(getMainLooper()).postDelayed(() -> {
                        if (webSocket == null || !wsConnected) connectWebSocket();
                    }, 5000);
                }

                @Override
                public void onClosed(WebSocket ws, int code, String reason) {
                    wsConnected = false;
                    Log.i(TAG, "WebSocket closed: " + reason);
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "connectWebSocket error", e);
        }
    }

    private String enc(String s) {
        try { return java.net.URLEncoder.encode(s == null ? "" : s, "UTF-8"); }
        catch (Exception e) { return ""; }
    }

    private void startLocationUpdates() {
        LocationRequest request = new LocationRequest.Builder(
                Priority.PRIORITY_BALANCED_POWER_ACCURACY, 5000L)
                .setMinUpdateIntervalMillis(2000L)
                .setMaxUpdateDelayMillis(10000L)
                .build();

        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                Location loc = result.getLastLocation();
                if (loc == null) return;

                long now = System.currentTimeMillis();
                if (now - lastSentAt < refreshMs) return;
                lastSentAt = now;

                sendLocation(loc);
            }
        };

        try {
            fusedClient.requestLocationUpdates(request, locationCallback, getMainLooper());
        } catch (SecurityException e) {
            Log.e(TAG, "Location permission missing", e);
        }
    }

    private void sendLocation(Location loc) {
        if (webSocket == null || !wsConnected) return;
        try {
            JSONObject msg = new JSONObject();
            msg.put("type", "location-update");
            msg.put("lat", loc.getLatitude());
            msg.put("lng", loc.getLongitude());
            msg.put("accuracy", loc.hasAccuracy() ? loc.getAccuracy() : JSONObject.NULL);
            msg.put("heading", loc.hasBearing() ? loc.getBearing() : JSONObject.NULL);
            msg.put("speed", loc.hasSpeed() ? loc.getSpeed() : JSONObject.NULL);
            webSocket.send(msg.toString());
            Log.i(TAG, "Sent location: " + loc.getLatitude() + "," + loc.getLongitude());
        } catch (Exception e) {
            Log.e(TAG, "sendLocation error", e);
        }
    }

    @Override
    public void onDestroy() {
        isRunning = false;
        if (fusedClient != null && locationCallback != null) {
            fusedClient.removeLocationUpdates(locationCallback);
        }
        if (webSocket != null) {
            try {
                webSocket.send("{\"type\":\"stop-sharing\"}");
                webSocket.close(1000, "Service stopped");
            } catch (Exception ignored) {}
            webSocket = null;
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}