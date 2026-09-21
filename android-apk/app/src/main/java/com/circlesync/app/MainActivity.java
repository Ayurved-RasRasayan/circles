package com.circlesync.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.Arrays;

public class MainActivity extends Activity {

    private static final String PREFS_NAME = "circlesync_prefs";
    private static final String KEY_SERVER_URL = "server_url";
    private static final int LOCATION_PERMISSION_REQUEST = 1001;

    private WebView webView;
    private View configView;
    private EditText urlInput;
    private Button connectButton;
    private Button resetButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUi();
        setupWebView();

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        String savedUrl = prefs.getString(KEY_SERVER_URL, "");
        if (savedUrl.isEmpty()) {
            showConfig();
        } else {
            loadApp(savedUrl);
        }
    }

    private void buildUi() {
        // Root FrameLayout
        android.widget.FrameLayout root = new android.widget.FrameLayout(this);
        setContentView(root);

        // WebView (hidden initially)
        webView = new WebView(this);
        webView.setVisibility(View.GONE);
        root.addView(webView, new android.widget.FrameLayout.LayoutParams(
                android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
                android.widget.FrameLayout.LayoutParams.MATCH_PARENT));

        // Config view (ScrollView with vertical LinearLayout)
        ScrollView scrollView = new ScrollView(this);
        scrollView.setBackgroundColor(0xFF059669);
        configView = scrollView;
        scrollView.setVisibility(View.VISIBLE);

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(dp(48), dp(96), dp(48), dp(48));
        layout.setGravity(android.view.Gravity.CENTER_HORIZONTAL);
        scrollView.addView(layout, new ScrollView.LayoutParams(
                ScrollView.LayoutParams.MATCH_PARENT,
                ScrollView.LayoutParams.WRAP_CONTENT));

        // Logo circle (white circle with globe emoji)
        LinearLayout logoBox = new LinearLayout(this);
        logoBox.setOrientation(LinearLayout.VERTICAL);
        logoBox.setGravity(android.view.Gravity.CENTER);
        LinearLayout.LayoutParams logoLp = new LinearLayout.LayoutParams(dp(96), dp(96));
        logoLp.bottomMargin = dp(32);
        // Use a background drawable
        android.graphics.drawable.GradientDrawable logoBg = new android.graphics.drawable.GradientDrawable();
        logoBg.setShape(android.graphics.drawable.GradientDrawable.OVAL);
        logoBg.setColor(0xFFFFFFFF);
        logoBox.setBackground(logoBg);
        TextView logoText = new TextView(this);
        logoText.setText("🌍");
        logoText.setTextSize(42);
        logoBox.addView(logoText);
        layout.addView(logoBox, logoLp);

        // Title
        TextView title = new TextView(this);
        title.setText("CircleSync");
        title.setTextColor(0xFFFFFFFF);
        title.setTextSize(28);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        layout.addView(title);

        // Subtitle
        TextView subtitle = new TextView(this);
        subtitle.setText("See your circle of friends on a live map");
        subtitle.setTextColor(0xCCFFFFFF);
        subtitle.setTextSize(14);
        LinearLayout.LayoutParams subLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        subLp.topMargin = dp(8);
        subLp.bottomMargin = dp(48);
        layout.addView(subtitle, subLp);

        // URL input
        urlInput = new EditText(this);
        urlInput.setHint("https://your-circlesync-url.com");
        urlInput.setTextColor(0xFF1F2937);
        urlInput.setHintTextColor(0xFF9CA3AF);
        urlInput.setPadding(dp(20), dp(16), dp(20), dp(16));
        urlInput.setInputType(android.text.InputType.TYPE_TEXT_VARIATION_URI);
        android.graphics.drawable.GradientDrawable inputBg = new android.graphics.drawable.GradientDrawable();
        inputBg.setCornerRadius(dp(12));
        inputBg.setColor(0xFFFFFFFF);
        urlInput.setBackground(inputBg);
        layout.addView(urlInput, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(56)));

        // Connect button
        connectButton = new Button(this);
        connectButton.setText("Connect");
        connectButton.setTextColor(0xFFFFFFFF);
        connectButton.setAllCaps(false);
        connectButton.setPadding(dp(20), dp(16), dp(20), dp(16));
        connectButton.setTextSize(16);
        android.graphics.drawable.GradientDrawable btnBg = new android.graphics.drawable.GradientDrawable();
        btnBg.setCornerRadius(dp(12));
        btnBg.setColor(0xFF065F46);
        connectButton.setBackground(btnBg);
        LinearLayout.LayoutParams btnLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, dp(56));
        btnLp.topMargin = dp(16);
        layout.addView(connectButton, btnLp);

        connectButton.setOnClickListener(v -> {
            String url = urlInput.getText().toString().trim();
            if (url.isEmpty()) {
                Toast.makeText(this, "Please enter a server URL", Toast.LENGTH_SHORT).show();
                return;
            }
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                url = "https://" + url;
            }
            if (url.endsWith("/")) url = url.substring(0, url.length() - 1);
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            prefs.edit().putString(KEY_SERVER_URL, url).apply();
            loadApp(url);
        });

        // Help text
        TextView help = new TextView(this);
        help.setText("Enter the CircleSync server URL provided by your friend, or your own deployment.\n\nOnce connected, sign in or create an account, then join a circle using its 6-character invite code.");
        help.setTextColor(0xCCFFFFFF);
        help.setTextSize(13);
        help.setLineSpacing(dp(2), 1f);
        LinearLayout.LayoutParams helpLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        helpLp.topMargin = dp(32);
        layout.addView(help, helpLp);

        // Reset button (hidden by default)
        resetButton = new Button(this);
        resetButton.setText("Change server");
        resetButton.setTextColor(0xFFFFFFFF);
        resetButton.setAllCaps(false);
        resetButton.setVisibility(View.GONE);
        resetButton.setBackgroundColor(0x00000000);
        LinearLayout.LayoutParams resetLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
        resetLp.topMargin = dp(32);
        layout.addView(resetButton, resetLp);
        resetButton.setOnClickListener(v -> {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            prefs.edit().remove(KEY_SERVER_URL).apply();
            showConfig();
        });

        root.addView(scrollView, new android.widget.FrameLayout.LayoutParams(
                android.widget.FrameLayout.LayoutParams.MATCH_PARENT,
                android.widget.FrameLayout.LayoutParams.MATCH_PARENT));
    }

    private int dp(int v) {
        float d = getResources().getDisplayMetrics().density;
        return (int) (v * d + 0.5f);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setSupportMultipleWindows(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (hasLocationPermission()) {
                    callback.invoke(origin, true, false);
                } else {
                    requestLocationPermission();
                    callback.invoke(origin, false, false);
                }
            }

            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> request.grant(request.getResources()));
            }
        });
    }

    private void showConfig() {
        webView.setVisibility(View.GONE);
        resetButton.setVisibility(View.GONE);
        configView.setVisibility(View.VISIBLE);
    }

    private void loadApp(String url) {
        configView.setVisibility(View.GONE);
        resetButton.setVisibility(View.VISIBLE);
        webView.setVisibility(View.VISIBLE);
        webView.loadUrl(url);

        if (!hasLocationPermission()) {
            requestLocationPermission();
        }
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestLocationPermission() {
        requestPermissions(new String[]{
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        }, LOCATION_PERMISSION_REQUEST);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_PERMISSION_REQUEST) {
            boolean granted = false;
            for (int r : grantResults) {
                if (r == PackageManager.PERMISSION_GRANTED) {
                    granted = true;
                    break;
                }
            }
            if (!granted) {
                Toast.makeText(this, "Location permission is needed to share your location with your circle", Toast.LENGTH_LONG).show();
            }
            if (webView.getVisibility() == View.VISIBLE && webView.getUrl() != null) {
                webView.reload();
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.getVisibility() == View.VISIBLE && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
