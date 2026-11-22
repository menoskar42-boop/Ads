import Foundation
import Capacitor
import CoreLocation
import UserNotifications

/**
 * The iOS half of the one capability the web app cannot provide.
 *
 * CoreLocation's region monitoring is handled by the system, not the app: iOS
 * relaunches the app in the background on a region crossing even if it was
 * force-quit days earlier. That is what a browser's watchPosition can never do,
 * and it is the only reason this file exists.
 *
 * iOS allows 20 monitored regions per app, total, across the whole system.
 * That is a hard platform limit, not a choice — so the plugin reports what it
 * dropped rather than silently watching the first twenty.
 */
@objc(GeofencePlugin)
public class GeofencePlugin: CAPPlugin, CLLocationManagerDelegate {

    private let manager = CLLocationManager()
    private let maxRegions = 20
    private var pendingPermissionCall: CAPPluginCall?

    // Names kept alongside the regions: iOS hands back only the identifier on a
    // crossing, and "you arrived at place-1755..." helps nobody.
    private var names: [String: String] {
        get { UserDefaults.standard.dictionary(forKey: "np_place_names") as? [String: String] ?? [:] }
        set { UserDefaults.standard.set(newValue, forKey: "np_place_names") }
    }

    public override func load() {
        manager.delegate = self
        // Lets the app be relaunched into the background on a crossing after it
        // has been terminated. Without it the feature works until the user
        // swipes the app away, then quietly stops.
        manager.allowsBackgroundLocationUpdates = false
    }

    @objc func status(_ call: CAPPluginCall) {
        let auth = manager.authorizationStatus
        call.resolve([
            "available": CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self),
            "foreground": auth == .authorizedWhenInUse || auth == .authorizedAlways,
            // Only .authorizedAlways survives the app being closed. WhenInUse
            // looks like success and behaves like the website.
            "background": auth == .authorizedAlways
        ])
    }

    @objc func watch(_ call: CAPPluginCall) {
        guard CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) else {
            call.reject("monitoring_unavailable"); return
        }
        guard let places = call.getArray("places") as? [[String: Any]] else {
            call.reject("places_required"); return
        }

        // Replace, never append — the same contract the web watcher has.
        for region in manager.monitoredRegions { manager.stopMonitoring(for: region) }

        var map: [String: String] = [:]
        var watched = 0
        for place in places {
            if watched >= maxRegions { break }
            guard let id = place["id"] as? String,
                  let lat = place["latitude"] as? Double,
                  let lng = place["longitude"] as? Double else { continue }
            let radius = (place["radius"] as? Double) ?? 100
            let region = CLCircularRegion(
                center: CLLocationCoordinate2D(latitude: lat, longitude: lng),
                // A radius under the device's own accuracy floor never fires.
                radius: min(max(radius, manager.maximumRegionMonitoringDistance > 0 ? 100 : radius),
                            manager.maximumRegionMonitoringDistance),
                identifier: id)
            region.notifyOnEntry = true
            region.notifyOnExit = false
            manager.startMonitoring(for: region)
            map[id] = (place["name"] as? String) ?? ""
            watched += 1
        }
        names = map

        call.resolve([
            "watching": watched,
            // Said out loud. Twenty is a platform limit and a user with thirty
            // places deserves to know ten are not being watched.
            "dropped": max(0, places.count - watched)
        ])
    }

    @objc func clear(_ call: CAPPluginCall) {
        for region in manager.monitoredRegions { manager.stopMonitoring(for: region) }
        names = [:]
        call.resolve()
    }

    @objc func requestBackground(_ call: CAPPluginCall) {
        if manager.authorizationStatus == .authorizedAlways {
            call.resolve(["granted": true]); return
        }
        pendingPermissionCall = call
        // iOS shows this as an upgrade prompt only AFTER WhenInUse is granted
        // and the app has actually used location. Asking on first launch gets
        // the quiet "Keep Only While Using" and no second chance.
        manager.requestAlwaysAuthorization()
    }

    public func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        guard let call = pendingPermissionCall else { return }
        if status != .notDetermined {
            call.resolve(["granted": status == .authorizedAlways])
            pendingPermissionCall = nil
        }
    }

    public func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        let name = names[region.identifier] ?? ""
        let content = UNMutableNotificationContent()
        content.title = "وصلت 📍"
        content.body = name.isEmpty ? "وصلت مكان حاططله مهمة." : "وصلت \(name) — فيه حاجة مستنياك هنا."
        // A silent arrival alert has failed at its only job: the person it is
        // for is not checking their notification tray.
        content.sound = .default
        content.userInfo = ["placeId": region.identifier]

        UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: region.identifier, content: content, trigger: nil))
    }
}
