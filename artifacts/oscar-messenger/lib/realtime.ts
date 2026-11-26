import { useAuth } from "@clerk/expo";
import { getMessengerEvents } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";
import { queryKeys } from "./api";
import {
  getGetMessengerGroupQueryKey,
  getListMessengerGroupsQueryKey,
} from "@workspace/api-client-react";

const MAX_HEALTHY_GAP_MS = 40_000;
const MIN_LONG_POLL_MS = 15_000;
const ERROR_BACKOFF_MS = [2_000, 4_000, 8_000, 30_000] as const;

let realtimeHealthy = false;
const listeners = new Set<() => void>();

function publishHealth(next: boolean): void {
  if (realtimeHealthy === next) return;
  realtimeHealthy = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMessengerRealtimeHealthy(): boolean {
  return useSyncExternalStore(subscribe, () => realtimeHealthy, () => false);
}

export function useMessengerRealtime(): void {
  const { isLoaded, isSignedIn } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      publishHealth(false);
      return;
    }

    let active = false;
    let disposed = false;
    let cursor = 0;
    let failures = 0;
    let lastHealthyAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let healthTimer: ReturnType<typeof setInterval> | undefined;
    let controller: AbortController | undefined;

    const isVisible = () =>
      AppState.currentState === "active" &&
      (Platform.OS !== "web" ||
        typeof document === "undefined" ||
        document.visibilityState !== "hidden");

    const invalidate = async (event: {
      type: "conversation" | "conversations" | "group" | "groups";
      conversationId?: string;
      groupId?: string;
    }) => {
      if (event.type === "conversation" && event.conversationId) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: queryKeys.messages(event.conversationId),
          }),
          queryClient.invalidateQueries({ queryKey: queryKeys.conversations }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.liveLocations(event.conversationId),
          }),
        ]);
      } else if (event.type === "conversations") {
        await queryClient.invalidateQueries({ queryKey: queryKeys.conversations });
      } else if (event.type === "group" && event.groupId) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: queryKeys.groupMessages(event.groupId),
          }),
          queryClient.invalidateQueries({
            queryKey: getGetMessengerGroupQueryKey(event.groupId),
          }),
          queryClient.invalidateQueries({
            queryKey: getListMessengerGroupsQueryKey(),
          }),
          queryClient.invalidateQueries({ queryKey: queryKeys.groups }),
        ]);
      } else if (event.type === "groups") {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: getListMessengerGroupsQueryKey(),
          }),
          queryClient.invalidateQueries({ queryKey: queryKeys.groups }),
        ]);
      }
    };

    const schedule = (delayMs: number) => {
      if (disposed || !active) return;
      timer = setTimeout(() => void poll(), delayMs);
    };

    const poll = async () => {
      if (disposed || !active) return;
      const startedAt = Date.now();
      const requestController = new AbortController();
      controller = requestController;
      try {
        const result = await getMessengerEvents(
          { since: cursor },
          { signal: requestController.signal, cache: "no-store" },
        );
        if (disposed || !active) return;
        cursor = result.seq;
        failures = 0;
        const longPollSucceeded =
          result.reset || result.events.length > 0 ||
          Date.now() - startedAt >= MIN_LONG_POLL_MS;
        if (longPollSucceeded) {
          lastHealthyAt = Date.now();
          publishHealth(true);
        }
        if (result.reset) {
          await queryClient.invalidateQueries();
        } else {
          for (const event of result.events) await invalidate(event);
        }
        schedule(longPollSucceeded ? 0 : 2_000);
      } catch {
        if (disposed || !active || requestController.signal.aborted) return;
        const delay = ERROR_BACKOFF_MS[Math.min(failures, ERROR_BACKOFF_MS.length - 1)];
        failures += 1;
        if (Date.now() - lastHealthyAt > MAX_HEALTHY_GAP_MS) publishHealth(false);
        schedule(delay);
      } finally {
        if (controller === requestController) controller = undefined;
      }
    };

    const updateVisibility = () => {
      const nextActive = isVisible();
      if (nextActive === active) return;
      active = nextActive;
      if (!active) {
        if (timer) clearTimeout(timer);
        timer = undefined;
        controller?.abort();
        publishHealth(false);
      } else {
        void poll();
      }
    };

    active = isVisible();
    if (active) void poll();
    healthTimer = setInterval(() => {
      if (active && lastHealthyAt && Date.now() - lastHealthyAt > MAX_HEALTHY_GAP_MS) {
        publishHealth(false);
      }
    }, 2_000);
    const appSubscription = AppState.addEventListener("change", updateVisibility);
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.addEventListener("visibilitychange", updateVisibility);
    }

    return () => {
      disposed = true;
      active = false;
      if (timer) clearTimeout(timer);
      if (healthTimer) clearInterval(healthTimer);
      controller?.abort();
      appSubscription.remove();
      if (Platform.OS === "web" && typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", updateVisibility);
      }
      publishHealth(false);
    };
  }, [isLoaded, isSignedIn, queryClient]);
}
