package com.oscardevs.neuropilot;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registered before super.onCreate so the bridge knows about it when the
        // WebView's JS starts running — a plugin registered after is invisible
        // to any code that ran on load.
        registerPlugin(GeofencePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
