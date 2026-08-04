# Capacitor bridges plugins by reflection, so R8 must not rename or strip them.
# Without these the release APK installs fine and the geofence silently does
# nothing — the debug build works and the shipped one does not, which is the
# worst kind of bug to find out about from a user.
-keep class com.oscardevs.neuropilot.** { *; }
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * { @com.getcapacitor.PluginMethod <methods>; }
-keep class com.google.android.gms.location.** { *; }
