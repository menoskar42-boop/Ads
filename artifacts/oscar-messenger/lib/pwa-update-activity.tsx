import {
  AppState,
  Platform,
  type AppStateStatus,
} from "react-native";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type PwaUpdateActivityContextValue = {
  busy: boolean;
  setActivity: (key: string, active: boolean) => void;
};

const PwaUpdateActivityContext =
  createContext<PwaUpdateActivityContextValue | null>(null);
const RELOAD_MARKER = "oscar-messenger-pwa-reload";
const SERVICE_WORKER_PATH = "/oscar-messenger/sw.js";
const SERVICE_WORKER_SCOPE = "/oscar-messenger/";

export function PwaUpdateActivityProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [activities, setActivities] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const setActivity = useCallback((key: string, active: boolean) => {
    setActivities((current) => {
      if (current.has(key) === active) return current;
      const next = new Set(current);
      if (active) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const value = useMemo(
    () => ({ busy: activities.size > 0, setActivity }),
    [activities, setActivity],
  );

  return (
    <PwaUpdateActivityContext.Provider value={value}>
      {children}
    </PwaUpdateActivityContext.Provider>
  );
}

export function usePwaUpdateActivity(name: string, active: boolean) {
  const context = useContext(PwaUpdateActivityContext);
  const setActivity = context?.setActivity;
  const instanceId = useId();

  useEffect(() => {
    if (!setActivity) return;
    const key = `${name}:${instanceId}`;
    setActivity(key, active);
    return () => setActivity(key, false);
  }, [active, instanceId, name, setActivity]);
}

export function PwaUpdateCoordinator() {
  const context = useContext(PwaUpdateActivityContext);
  const busy = context?.busy ?? false;
  const busyRef = useRef(busy);
  const tryReloadRef = useRef<() => void>(() => {});
  busyRef.current = busy;

  useEffect(() => {
    tryReloadRef.current();
  }, [busy]);

  useEffect(() => {
    if (
      Platform.OS !== "web" ||
      typeof window === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    let disposed = false;
    let updateInFlight = false;
    let lastUpdateCheckAt = 0;
    let pendingReload = false;
    const hadControllerAtStart = Boolean(navigator.serviceWorker.controller);
    const attachedRegistrations = new WeakSet<ServiceWorkerRegistration>();
    const tryReload = () => {
      if (disposed || !pendingReload || busyRef.current) return;
      try {
        if (sessionStorage.getItem(RELOAD_MARKER) === "1") return;
        sessionStorage.setItem(RELOAD_MARKER, "1");
      } catch {
        return;
      }
      window.location.reload();
    };
    tryReloadRef.current = tryReload;

    const clearReloadMarkerWhenStable = (
      currentRegistration: ServiceWorkerRegistration,
    ) => {
      try {
        if (sessionStorage.getItem(RELOAD_MARKER) !== "1") return;
        if (currentRegistration.waiting) return;
        window.setTimeout(() => {
          if (disposed || currentRegistration.waiting) return;
          try {
            sessionStorage.removeItem(RELOAD_MARKER);
          } catch {
            // The session marker is optional when storage is unavailable.
          }
        }, 5_000);
      } catch {
        // The session marker is optional when storage is unavailable.
      }
    };

    const attachRegistration = (
      currentRegistration: ServiceWorkerRegistration,
    ) => {
      if (attachedRegistrations.has(currentRegistration)) return;
      attachedRegistrations.add(currentRegistration);
      currentRegistration.addEventListener("updatefound", () => {
        const installing = currentRegistration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (
            installing.state === "installed" &&
            navigator.serviceWorker.controller &&
            hadControllerAtStart
          ) {
            pendingReload = true;
            tryReload();
          }
        });
      });
      if (currentRegistration.waiting && hadControllerAtStart) {
        pendingReload = true;
        tryReload();
      }
      clearReloadMarkerWhenStable(currentRegistration);
    };

    const requestUpdate = async () => {
      if (
        disposed ||
        updateInFlight ||
        document.visibilityState !== "visible" ||
        (AppState.currentState !== null && AppState.currentState !== "active")
      ) {
        return;
      }
      const now = Date.now();
      if (now - lastUpdateCheckAt < 10_000) return;
      lastUpdateCheckAt = now;
      updateInFlight = true;
      try {
        const currentRegistration =
          (await navigator.serviceWorker.getRegistration(SERVICE_WORKER_SCOPE)) ??
          (await navigator.serviceWorker.register(SERVICE_WORKER_PATH, {
            scope: SERVICE_WORKER_SCOPE,
          }));
        attachRegistration(currentRegistration);
        await currentRegistration.update();
        if (currentRegistration.waiting && hadControllerAtStart) {
          pendingReload = true;
          tryReload();
        }
      } catch {
        // An update check must not interrupt the app when offline.
      } finally {
        updateInFlight = false;
      }
    };

    const onControllerChange = () => {
      if (!hadControllerAtStart) return;
      pendingReload = true;
      tryReload();
    };
    const onAppStateChange = (state: AppStateStatus) => {
      if (state === "active" && document.visibilityState === "visible") {
        void requestUpdate();
      }
    };
    const onVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        (AppState.currentState === null || AppState.currentState === "active")
      ) {
        void requestUpdate();
      }
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );
    const appStateSubscription = AppState.addEventListener(
      "change",
      onAppStateChange,
    );
    document.addEventListener("visibilitychange", onVisibilityChange);
    void requestUpdate();

    return () => {
      disposed = true;
      tryReloadRef.current = () => {};
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      appStateSubscription.remove();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
