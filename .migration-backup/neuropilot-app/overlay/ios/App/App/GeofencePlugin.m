#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Capacitor finds Swift plugins through this Objective-C macro block. Without
// it the plugin compiles, ships, and is simply not there at runtime.
CAP_PLUGIN(GeofencePlugin, "Geofence",
    CAP_PLUGIN_METHOD(status, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(watch, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(clear, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(requestBackground, CAPPluginReturnPromise);
)
