package com.oscardevs.neuropilot;

import android.Manifest;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * The fences, written down.
 *
 * They live in SharedPreferences rather than being read back out of the OS,
 * because the OS does not offer a "what am I currently watching" query — and
 * after a reboot there is nothing to read anyway. This file is the only record.
 */
final class Store {
    private static final String PREFS = "neuropilot_geofences";
    private static final String KEY = "places";

    private Store() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void saveFences(Context c, JSArray places) {
        prefs(c).edit().putString(KEY, places == null ? "[]" : places.toString()).apply();
    }

    static void clearFences(Context c) {
        prefs(c).edit().remove(KEY).apply();
    }

    private static JSONArray read(Context c) {
        try { return new JSONArray(prefs(c).getString(KEY, "[]")); }
        catch (Exception e) { return new JSONArray(); }
    }

    /** The human name for a place id, or a neutral fallback — never the raw id. */
    static String placeName(Context c, String id) {
        JSONArray arr = read(c);
        for (int i = 0; i < arr.length(); i++) {
            JSONObject p = arr.optJSONObject(i);
            if (p != null && id.equals(p.optString("id"))) {
                String n = p.optString("name", "");
                if (!n.isEmpty()) return n;
            }
        }
        return "";
    }

    /** Put the fences back after a reboot or an app update. */
    static void reregister(Context c) {
        boolean fine = ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        boolean bg = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
                || ContextCompat.checkSelfPermission(c, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        // Re-registering without background permission would register fences
        // that can only ever fire while the app is open — the exact behaviour
        // this whole module exists to replace. Better to do nothing and let the
        // app ask again next time it is opened.
        if (!fine || !bg) return;

        JSONArray arr = read(c);
        if (arr.length() == 0) return;

        List<Geofence> fences = new ArrayList<>();
        for (int i = 0; i < arr.length(); i++) {
            JSONObject p = arr.optJSONObject(i);
            if (p == null) continue;
            String id = p.optString("id", "");
            if (id.isEmpty()) continue;
            fences.add(new Geofence.Builder()
                    .setRequestId(id)
                    .setCircularRegion(p.optDouble("latitude"), p.optDouble("longitude"),
                            (float) p.optDouble("radius", 100))
                    .setExpirationDuration(Geofence.NEVER_EXPIRE)
                    .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER)
                    .setLoiteringDelay(30_000)
                    .build());
        }
        if (fences.isEmpty()) return;

        Intent intent = new Intent(c, GeofenceReceiver.class);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
        PendingIntent pi = PendingIntent.getBroadcast(c, 0, intent, flags);

        try {
            LocationServices.getGeofencingClient(c).addGeofences(
                    new GeofencingRequest.Builder()
                            .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
                            .addGeofences(fences).build(), pi);
        } catch (SecurityException ignored) { /* permission revoked mid-flight */ }
    }
}
