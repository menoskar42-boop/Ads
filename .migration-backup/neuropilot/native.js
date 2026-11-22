/**
 * Native bridge — the one seam between the web app and the phone app.
 *
 * NeuroPilot runs from ONE source. The Android and iOS builds load these exact
 * files in a WebView; there is no second copy of the timer, the ladder, the
 * thought dump or the stats. This file is the only place that knows the
 * difference, and everything it exposes degrades to the web behaviour when
 * there is no native shell underneath.
 *
 * What the native side actually adds is a single capability the browser does
 * not have: a geofence that survives the app being closed. Everything else the
 * app does already worked on the website and still does.
 */
(function (global) {
  "use strict";

  function plugin() {
    var cap = global.Capacitor;
    if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return null;
    var p = cap.Plugins && cap.Plugins.Geofence;
    return p || null;
  }

  var Native = {
    /** True only inside the phone app. The website answers false, always. */
    available: function () { return plugin() !== null; },

    platform: function () {
      var cap = global.Capacitor;
      return cap && cap.getPlatform ? cap.getPlatform() : "web";
    },

    /**
     * Permission state, so the UI can say what is actually true rather than
     * guessing. Background false on a native build means location reminders
     * still only work with the app open — the user needs to be told that
     * plainly, not left to discover it by missing something.
     */
    status: function () {
      var p = plugin();
      if (!p) return Promise.resolve({ available: false, foreground: false, background: false });
      return p.status().catch(function () {
        return { available: false, foreground: false, background: false };
      });
    },

    /**
     * Hand the whole set of watched places to the OS. Replaces, never appends —
     * the same contract the web watcher already has, so callers do not have to
     * remember which one they are talking to.
     *
     * @param places [{ id, name, latitude, longitude, radius? }]
     */
    watch: function (places) {
      var p = plugin();
      if (!p) return Promise.resolve(null);
      return p.watch({ places: places || [] }).catch(function (e) {
        // Never throw into the caller: a failed registration must not take the
        // timer down with it. The status check is how the UI finds out.
        try { console.warn("[native] watch failed", e && e.message); } catch (err) {}
        return null;
      });
    },

    clear: function () {
      var p = plugin();
      if (!p) return Promise.resolve(null);
      return p.clear().catch(function () { return null; });
    },

    /**
     * Ask for "allow all the time".
     *
     * Called only after the user has saved a place and seen a reminder work,
     * never on first launch. Android 11+ will not even offer the option if it is
     * requested alongside foreground location, and a permission prompt shown
     * before the person knows what the feature is gets denied — permanently.
     */
    requestBackground: function () {
      var p = plugin();
      if (!p) return Promise.resolve({ granted: false });
      return p.requestBackground().catch(function () { return { granted: false }; });
    },
  };

  global.NeuroPilotNative = Native;
})(window);
