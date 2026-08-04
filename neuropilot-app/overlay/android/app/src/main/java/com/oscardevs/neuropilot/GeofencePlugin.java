package com.oscardevs.neuropilot;

import android.Manifest;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingClient;
import com.google.android.gms.location.GeofencingRequest;
import com.google.android.gms.location.LocationServices;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * The one thing the web app cannot do.
 *
 * A browser's watchPosition dies the moment the app is closed, which is why
 * NeuroPilot's location reminders only ever worked with the screen awake. The
 * platform's own GeofencingClient does not: it hands the fence to the OS, which
 * wakes a BroadcastReceiver on arrival even if the app was killed weeks ago.
 * That is the entire reason this native shell exists.
 *
 * Everything else — the timer, the ladder, the thought dump, the stats — stays
 * in the web app and is NOT duplicated here.
 */
@CapacitorPlugin(name = "Geofence")
public class GeofencePlugin extends Plugin {

    // The web app used 100m. Keeping it identical matters: a user who set up a
    // place on the website and then installs the app must not find that
    // "arrived" now means something different.
    private static final float DEFAULT_RADIUS_M = 100f;

    // Android silently caps geofences per app. Staying well under it and saying
    // so beats registering 200 and having the OS drop some without telling us.
    private static final int MAX_FENCES = 90;

    private GeofencingClient client;

    @Override
    public void load() {
        client = LocationServices.getGeofencingClient(getContext());
    }

    private PendingIntent pendingIntent() {
        Intent intent = new Intent(getContext(), GeofenceReceiver.class);
        // FLAG_MUTABLE is required: the OS writes the triggering-geofence extras
        // into this intent. IMMUTABLE would deliver an event with no idea which
        // place fired it.
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
        return PendingIntent.getBroadcast(getContext(), 0, intent, flags);
    }

    /** Foreground location. Background is a SEPARATE, later request — see below. */
    private boolean hasForeground() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasBackground() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true;
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_BACKGROUND_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject out = new JSObject();
        out.put("available", true);
        out.put("foreground", hasForeground());
        out.put("background", hasBackground());
        call.resolve(out);
    }

    /**
     * Register the places to watch. Replaces the whole set rather than adding to
     * it, which mirrors how the web app's setGeofenceTargets() already behaves —
     * one source of truth for "what am I waiting for", never a growing pile.
     *
     * @param call places: [{ id, latitude, longitude, radius? }]
     */
    @PluginMethod
    public void watch(PluginCall call) {
        if (!hasForeground()) { call.reject("no_location_permission"); return; }

        JSArray places = call.getArray("places");
        if (places == null) { call.reject("places_required"); return; }

        List<Geofence> fences = new ArrayList<>();
        List<String> ids = new ArrayList<>();
        try {
            for (int i = 0; i < places.length() && fences.size() < MAX_FENCES; i++) {
                JSONObject p = places.getJSONObject(i);
                String id = p.optString("id", null);
                if (id == null || id.isEmpty()) continue;
                double lat = p.getDouble("latitude");
                double lng = p.getDouble("longitude");
                float radius = (float) p.optDouble("radius", DEFAULT_RADIUS_M);

                fences.add(new Geofence.Builder()
                        .setRequestId(id)
                        .setCircularRegion(lat, lng, radius)
                        // Never expires: a reminder to buy milk at the shop is
                        // not something that should quietly stop working after
                        // a fortnight because a default said so.
                        .setExpirationDuration(Geofence.NEVER_EXPIRE)
                        .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER)
                        // GPS drift near a boundary fires ENTER repeatedly.
                        // Waiting 30s for the position to settle is the
                        // difference between one alert and six.
                        .setLoiteringDelay(30_000)
                        .setNotificationResponsiveness(0)
                        .build());
                ids.add(id);
            }
        } catch (Exception e) {
            call.reject("bad_places: " + e.getMessage());
            return;
        }

        // Clear first, always. Re-registering over a stale set is how a place
        // the user deleted keeps buzzing them for weeks.
        client.removeGeofences(pendingIntent());

        if (fences.isEmpty()) {
            Store.saveFences(getContext(), places);
            call.resolve(new JSObject().put("watching", 0));
            return;
        }

        GeofencingRequest request = new GeofencingRequest.Builder()
                // INITIAL_TRIGGER_ENTER: fire straight away if the user is
                // ALREADY inside the place when the fence is set. Without it,
                // adding "remind me at the office" while sitting in the office
                // does nothing until you leave and come back.
                .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
                .addGeofences(fences)
                .build();

        try {
            client.addGeofences(request, pendingIntent())
                    .addOnSuccessListener(unused -> {
                        // Persisted so BootReceiver can put them back: Android
                        // drops every geofence on reboot, silently.
                        Store.saveFences(getContext(), places);
                        JSObject out = new JSObject();
                        out.put("watching", ids.size());
                        out.put("dropped", places.length() - ids.size());
                        call.resolve(out);
                    })
                    .addOnFailureListener(e -> call.reject("register_failed: " + e.getMessage()));
        } catch (SecurityException e) {
            call.reject("no_location_permission");
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        client.removeGeofences(pendingIntent());
        Store.clearFences(getContext());
        call.resolve();
    }

    /**
     * Ask for background location.
     *
     * Deliberately a separate call the web app makes AFTER the user has seen a
     * location reminder work in the foreground. Android 11+ will not even show
     * the "Allow all the time" option if it is requested at the same time as
     * foreground, and asking on first launch — before the person knows what the
     * feature is — is how permission gets denied permanently.
     */
    @PluginMethod
    public void requestBackground(PluginCall call) {
        if (hasBackground()) { call.resolve(new JSObject().put("granted", true)); return; }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            requestPermissionForAlias("background", call, "backgroundResult");
        } else {
            call.resolve(new JSObject().put("granted", true));
        }
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void backgroundResult(PluginCall call) {
        call.resolve(new JSObject().put("granted", hasBackground()));
    }
}
