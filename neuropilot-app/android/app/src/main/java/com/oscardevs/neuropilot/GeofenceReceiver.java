package com.oscardevs.neuropilot;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import com.google.android.gms.location.Geofence;
import com.google.android.gms.location.GeofencingEvent;

import java.util.List;

/**
 * Woken by the OS on arrival — including when the app has been closed for weeks.
 *
 * This runs on the main thread with a few seconds to live, so it does exactly
 * one thing: post the notification. No network, no database, no work that could
 * outlive the receiver and be killed halfway.
 */
public class GeofenceReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        GeofencingEvent event = GeofencingEvent.fromIntent(intent);
        if (event == null || event.hasError()) return;

        if (event.getGeofenceTransition() != Geofence.GEOFENCE_TRANSITION_ENTER) return;

        List<Geofence> fired = event.getTriggeringGeofences();
        if (fired == null || fired.isEmpty()) return;

        for (Geofence g : fired) {
            String placeId = g.getRequestId();
            // The place's NAME is stored alongside the fence, because the OS only
            // hands back the id — and "you have arrived at place-1755..." is not
            // a notification anybody can act on.
            String name = Store.placeName(context, placeId);
            Notifier.arrival(context, placeId, name);
        }
    }
}
