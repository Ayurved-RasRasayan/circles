package com.circlesync.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.net.ConnectivityManager;
import android.net.Network;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
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
    private static final long MAX_BACKOFF_MS = 60000L;
    private static final long BASE_BACKOFF_MS = 5000L;

    private FusedLocationProviderClient fusedClient;
    private LocationCallback locationCallback;
    private OkHttpClient okHttpClient;
    private WebSocket webSocket;

    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private PowerManager.WakeLock wakeLock;

    private final Handler handler = new Handler(Looper.getMainLooper());

    private String wsUrl;
    private String userId;
    private String username;
    private String displayName;
    private String avatarColor;
    private long refreshMs = 10000;

    private long lastSentAt = 0;
    private volatile boolean wsConnected = false;
    private int reconnectAttempt = 0;
    private boolean destroyed = false;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        okHttpClient = new OkHttpClient.Builder()
                .pingInterval(20, TimeUnit.SECONDS)
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(0, TimeUnit.MILLISECONDS)
                .retryOnConnectionFailure(true)
                .build();
        fusedClient = LocationServices.getFusedLocationProviderClient(this);
        registerNetworkCallback();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String w = intent.getStringExtra("ws_url");
            if (w != null) wsUrl = w;
            String u = intent.getStringExtra("user_id");
            if (u != null) userId = u;
            String un = intent.getStringExtra("username");
            if (un != null) username = un;
            String dn = intent.getStringExtra("display_name");
            if (dn != null) displayName = dn;
            String ac = intent.getStringExtra("avatar_color");
            if (ac != null) avatarColor = ac;
            long r = intent.getLongExtra("refresh_ms", 10000L);
            if (r > 0) refreshMs = r;
        }

        isRunning = true;
        startForeground(NOTIFICATION_ID, buildNotification("Connecting..."));

        if (webSocket == null || !wsConnected) {
            connectWebSocket();
        }
        startLocationUpdates();

        return START_STICKY;
    }

    // ============================================================
    // Notification
    // ============================================================
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Location Sharing",
                    NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("CircleSync location sharing");
            channel.setShowBadge(false);
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
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .build();
    }

    private void updateNotification(String status) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(NOTIFICATION_ID, buildNotification(status));
    }

    // ============================================================
    // Network callback  reconnect immediately when internet returns
    // ============================================================
    private void registerNetworkCallback() {
        try {
            connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (connectivityManager == null) return;
            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    Log.i(TAG, "Network available");
                    if (!wsConnected && !destroyed) {
                        reconnectAttempt = 0;
                        handler.post(() -> connectWebSocket());
                    }
                }
                @Override
                public void onLost(Network network) {
                    Log.w(TAG, "Network lost");
                    wsConnected = false;
                    updateNotification("Waiting for network...");
                }
            };
            connectivityManager.registerDefaultNetworkCallback(networkCallback);
        } catch (Exception e) {
            Log.e(TAG, "Network callback registration failed", e);
        }
    }

    // ============================================================
    // WebSocket connection
    // ============================================================
    private void connectWebSocket() {
        if (destroyed) return;
        if (wsConnected) return;
        if (wsUrl == null || userId == null) {
            Log.e(TAG, "Cannot connect: missing ws_url or userId");
            return;
        }

        try {
            String url = wsUrl + "&userId=" + enc(userId) + "&username=" + enc(username)
                    + "&displayName=" + enc(displayName) + "&avatarColor=" + enc(avatarColor);
            Log.i(TAG, "Connecting to: " + url);

            Request request = new Request.Builder().url(url).build();
            webSocket = okHttpClient.newWebSocket(request, new WebSocketListener() {
                @Override
                public void onOpen(WebSocket ws, Response response) {
                    Log.i(TAG, "WebSocket connected");
                    wsConnected = true;
                    reconnectAttempt = 0;
                    releaseWakeLock();
                    updateNotification("Sharing your location");
                }

                @Override
                public void onFailure(WebSocket ws, Throwable t, @Nullable Response response) {
                    Log.e(TAG, "WebSocket failure: " + t.getMessage());
                    wsConnected = false;
                    webSocket = null;
                    if (destroyed) return;
                    long delay = nextBackoff();
                    updateNotification("Reconnecting in " + (delay / 1000) + "s...");
                    acquireWakeLock(delay + 10000);
                    handler.postDelayed(() -> connectWebSocket(), delay);
                }

                @Override
                public void onClosed(WebSocket ws, int code, String reason) {
                    Log.i(TAG, "WebSocket closed: " + code + " " + reason);
                    wsConnected = false;
                    webSocket = null;
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "connectWebSocket error", e);
        }
    }

    private long nextBackoff() {
        long delay = BASE_BACKOFF_MS * (1L << Math.min(reconnectAttempt, 4));
        if (delay > MAX_BACKOFF_MS) delay = MAX_BACKOFF_MS;
        reconnectAttempt++;
        return delay;
    }

    private String enc(String s) {
        try { return java.net.URLEncoder.encode(s == null ? "" : s, "UTF-8"); }
        catch (Exception e) { return ""; }
    }

    // ============================================================
    // Wake lock  keep CPU awake during reconnect attempts
    // ============================================================
    private void acquireWakeLock(long timeoutMs) {
        try {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm == null) return;
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "CircleSync::Reconnect");
                wakeLock.setReferenceCounted(false);
            }
            if (!wakeLock.isHeld()) wakeLock.acquire(timeoutMs);
        } catch (Exception e) {
            Log.e(TAG, "WakeLock acquire failed", e);
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception e) {
            Log.e(TAG, "WakeLock release failed", e);
        }
    }

    // ============================================================
    // Location updates
    // ============================================================
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
            fusedClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper());
        } catch (SecurityException e) {
            Log.e(TAG, "Location permission missing", e);
        }
    }

    private void sendLocation(Location loc) {
        if (webSocket == null || !wsConnected) {
            Log.d(TAG, "Skip send: not connected");
            return;
        }
        try {
            JSONObject msg = new JSONObject();
            msg.put("type", "location-update");
            msg.put("lat", loc.getLatitude());
            msg.put("lng", loc.getLongitude());
            msg.put("accuracy", loc.hasAccuracy() ? loc.getAccuracy() : JSONObject.NULL);
            msg.put("heading", loc.hasBearing() ? loc.getBearing() : JSONObject.NULL);
            msg.put("speed", loc.hasSpeed() ? loc.getSpeed() : JSONObject.NULL);
            boolean sent = webSocket.send(msg.toString());
            Log.i(TAG, "Sent location (" + sent + "): " + loc.getLatitude() + "," + loc.getLongitude());
        } catch (Exception e) {
            Log.e(TAG, "sendLocation error", e);
        }
    }

    // ============================================================
    // Restart on task removal  user swiped the app away
    // ============================================================
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        Log.i(TAG, "onTaskRemoved  scheduling service restart");
        try {
            Intent restartService = new Intent(getApplicationContext(), LocationService.class);
            restartService.setPackage(getPackageName());
            restartService.putExtra("ws_url", wsUrl);
            restartService.putExtra("user_id", userId);
            restartService.putExtra("username", username);
            restartService.putExtra("display_name", displayName);
            restartService.putExtra("avatar_color", avatarColor);
            restartService.putExtra("refresh_ms", refreshMs);

            PendingIntent pi = PendingIntent.getService(
                    this, 1, restartService,
                    PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE);

            AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
            if (am != null) {
                am.set(AlarmManager.ELAPSED_REALTIME,
                        SystemClock.elapsedRealtime() + 2000, pi);
            }
        } catch (Exception e) {
            Log.e(TAG, "onTaskRemoved error", e);
        }
        super.onTaskRemoved(rootIntent);
    }

    // ============================================================
    // Lifecycle
    // ============================================================
    @Override
    public void onDestroy() {
        destroyed = true;
        isRunning = false;
        releaseWakeLock();

        if (connectivityManager != null && networkCallback != null) {
            try { connectivityManager.unregisterNetworkCallback(networkCallback); }
            catch (Exception ignored) {}
        }

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