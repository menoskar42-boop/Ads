package com.oscardevs.neuropilot;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;

/**
 * The arrival alert.
 *
 * An ADHD reminder that arrives silently in the tray has failed: the person it
 * is for is, by definition, not checking their notifications. So the channel is
 * IMPORTANCE_HIGH with sound and vibration, and the notification is
 * CATEGORY_ALARM so Do Not Disturb's alarm exemption can let it through.
 */
final class Notifier {
    private static final String CHANNEL = "neuropilot_arrival";

    private Notifier() {}

    private static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;

        NotificationChannel ch = new NotificationChannel(
                CHANNEL,
                c.getString(R.string.channel_arrival),
                NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription(c.getString(R.string.channel_arrival_desc));
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[]{0, 400, 200, 400});
        ch.setSound(
                Uri.parse("android.resource://" + c.getPackageName() + "/" + R.raw.chime),
                new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
        // Once created, a channel's importance belongs to the user — Android
        // will not let the app raise it later, and should not.
        nm.createNotificationChannel(ch);
    }

    static void arrival(Context c, String placeId, String placeName) {
        ensureChannel(c);

        // Opening straight to the place's reminder, not the home screen: the
        // point of arriving is the task waiting here.
        Intent open = new Intent(c, MainActivity.class);
        open.putExtra("placeId", placeId);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pi = PendingIntent.getActivity(c, placeId.hashCode(), open, flags);

        String title = c.getString(R.string.arrival_title);
        String body = placeName == null || placeName.isEmpty()
                ? c.getString(R.string.arrival_body_generic)
                : c.getString(R.string.arrival_body, placeName);

        Notification n = new NotificationCompat.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_neuropilot)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setContentIntent(pi)
                .setAutoCancel(true)
                // Heads-up even on a locked screen: the reminder is worthless
                // if it waits politely until the phone is unlocked.
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .build();

        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(placeId.hashCode(), n);
    }
}
