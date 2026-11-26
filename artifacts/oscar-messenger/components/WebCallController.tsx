import { useAuth } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import {
  acceptMessengerCall,
  createMessengerCall,
  endMessengerCall,
  getActiveMessengerCall,
  getMessengerCallConfig,
  getMessengerCallSignals,
  rejectMessengerCall,
  sendMessengerCallSignal,
} from "@workspace/api-client-react";
import type {
  MessengerCall,
  MessengerCallSignal,
  MessengerCallSignalInput,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { queryKeys } from "../lib/api";
import { colors } from "../lib/theme";
import { webMicrophoneErrorMessage } from "../lib/web-voice";

export type WebCallControllerHandle = {
  startCall: () => Promise<void>;
};

type Props = {
  conversationId: string;
  peerName: string;
  enabled: boolean;
  onError: (message: string) => void;
};

type FinishOptions = { notifyServer: boolean };

async function requestCallAudio(): Promise<MediaStream> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    throw new Error("المتصفح ده لا يدعم المكالمات الصوتية.");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
  } catch (error) {
    let permissionState = "unsupported";
    try {
      const permission = await navigator.permissions?.query({
        name: "microphone" as PermissionName,
      });
      if (permission) permissionState = permission.state;
    } catch {
      // The existing Arabic guidance handles browsers without Permissions API.
    }
    const name = error instanceof Error ? error.name : "UnknownError";
    const message = webMicrophoneErrorMessage(
      name,
      permissionState,
      navigator.userAgent,
    );
    throw new Error(message || "تعذر فتح الميكروفون للمكالمة.");
  }
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

function responseStatus(error: unknown): number {
  return error && typeof error === "object" && "status" in error
    ? Number((error as { status?: unknown }).status)
    : 0;
}

export const WebCallController = forwardRef<WebCallControllerHandle, Props>(
  function WebCallController({ conversationId, peerName, enabled, onError }, ref) {
    const { userId } = useAuth();
    const queryClient = useQueryClient();
    const [call, setCall] = useState<MessengerCall | null>(null);
    const [busy, setBusy] = useState(false);
    const [muted, setMuted] = useState(false);
    const [connectionReady, setConnectionReady] = useState(false);
    const [connectedAt, setConnectedAt] = useState<number | null>(null);
    const [durationSeconds, setDurationSeconds] = useState(0);
    const [callError, setCallError] = useState("");
    const callRef = useRef<MessengerCall | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
    const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
    const signalCursorRef = useRef(0);
    const connectionFailureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const endedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const ringTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const finishingCallIdRef = useRef("");
    const finishCallRef = useRef<(options: FinishOptions) => Promise<void>>(async () => undefined);
    const handleSignalRef = useRef<(signal: MessengerCallSignal) => Promise<void>>(
      async () => undefined,
    );

    const isWebCallSupported =
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      typeof RTCPeerConnection !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia;

    const activeCall = useQuery({
      queryKey: queryKeys.callActive,
      queryFn: () => getActiveMessengerCall(),
      enabled: enabled && isWebCallSupported,
      refetchInterval: enabled && isWebCallSupported ? 2_000 : false,
      refetchIntervalInBackground: false,
      staleTime: 0,
      retry: false,
    });

    const updateCall = useCallback((next: MessengerCall | null) => {
      callRef.current = next;
      setCall(next);
    }, []);

    const stopRingtone = useCallback(() => {
      if (ringTimerRef.current) clearInterval(ringTimerRef.current);
      ringTimerRef.current = null;
      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => undefined);
      }
      audioContextRef.current = null;
    }, []);

    const cleanupConnection = useCallback(() => {
      if (connectionFailureTimerRef.current) {
        clearTimeout(connectionFailureTimerRef.current);
      }
      connectionFailureTimerRef.current = null;
      const connection = peerConnectionRef.current;
      peerConnectionRef.current = null;
      if (connection) {
        connection.onicecandidate = null;
        connection.ontrack = null;
        connection.oniceconnectionstatechange = null;
        connection.close();
      }
      stopStream(streamRef.current);
      streamRef.current = null;
      setConnectionReady(false);
      pendingCandidatesRef.current = [];
      const audio = remoteAudioRef.current;
      if (audio) {
        audio.pause();
        audio.srcObject = null;
      }
      stopRingtone();
    }, [stopRingtone]);

    const finishCall = useCallback(async (options: FinishOptions) => {
      const current = callRef.current;
      if (!current || current.state === "ended") return;
      if (finishingCallIdRef.current === current.id) return;
      finishingCallIdRef.current = current.id;
      if (options.notifyServer) {
        void endMessengerCall(current.id).catch(() => undefined);
      }
      cleanupConnection();
      const ended: MessengerCall = {
        ...current,
        state: "ended",
        endedAt: new Date().toISOString(),
      };
      updateCall(ended);
      await queryClient.invalidateQueries({ queryKey: queryKeys.callActive });
      if (endedTimerRef.current) clearTimeout(endedTimerRef.current);
      endedTimerRef.current = setTimeout(() => {
        if (callRef.current?.id === current.id) updateCall(null);
        finishingCallIdRef.current = "";
      }, 2_000);
    }, [cleanupConnection, queryClient, updateCall]);
    finishCallRef.current = finishCall;

    const sendSignal = useCallback(
      async (callId: string, kind: MessengerCallSignalInput["kind"], payload: object) => {
        await sendMessengerCallSignal(callId, {
          kind,
          payload: payload as Record<string, unknown>,
        });
      },
      [],
    );

    const flushRemoteCandidates = useCallback(async () => {
      const connection = peerConnectionRef.current;
      if (!connection?.remoteDescription) return;
      const pending = pendingCandidatesRef.current.splice(0);
      for (const candidate of pending) {
        await connection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    }, []);

    const handleSignal = useCallback(async (signal: MessengerCallSignal) => {
      const current = callRef.current;
      const connection = peerConnectionRef.current;
      if (!current || !connection) return;
      if (signal.kind === "ice") {
        const candidate = signal.payload as RTCIceCandidateInit;
        if (connection.remoteDescription) {
          await connection.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          pendingCandidatesRef.current.push(candidate);
        }
        return;
      }

      if (signal.kind === "offer" && current.calleeId === userId) {
        if (connection.remoteDescription) return;
        await connection.setRemoteDescription(
          new RTCSessionDescription(
            signal.payload as unknown as RTCSessionDescriptionInit,
          ),
        );
        await flushRemoteCandidates();
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        await sendSignal(current.id, "answer", answer);
        return;
      }

      if (
        signal.kind === "answer" &&
        current.callerId === userId &&
        !connection.remoteDescription
      ) {
        await connection.setRemoteDescription(
          new RTCSessionDescription(
            signal.payload as unknown as RTCSessionDescriptionInit,
          ),
        );
        await flushRemoteCandidates();
      }
    }, [flushRemoteCandidates, sendSignal, userId]);
    handleSignalRef.current = handleSignal;

    const configurePeerConnection = useCallback(async (
      current: MessengerCall,
      localStream: MediaStream,
      caller: boolean,
    ) => {
      const config = await getMessengerCallConfig();
      const connection = new RTCPeerConnection({
        iceServers: config.iceServers as RTCIceServer[],
      });
      peerConnectionRef.current = connection;
      localStream.getTracks().forEach((track) => connection.addTrack(track, localStream));
      connection.ontrack = (event) => {
        const remoteAudio = remoteAudioRef.current;
        if (!remoteAudio) return;
        remoteAudio.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        void remoteAudio.play().catch(() => undefined);
      };
      connection.onicecandidate = (event) => {
        if (!event.candidate) return;
        void sendSignal(current.id, "ice", event.candidate.toJSON()).catch(() => {
          setCallError("تعذر إرسال بيانات الاتصال. تحقق من الشبكة.");
        });
      };
      connection.oniceconnectionstatechange = () => {
        if (
          connection.iceConnectionState === "connected" ||
          connection.iceConnectionState === "completed"
        ) {
          if (connectionFailureTimerRef.current) {
            clearTimeout(connectionFailureTimerRef.current);
          }
          connectionFailureTimerRef.current = null;
          setConnectedAt((previous) => previous ?? Date.now());
          return;
        }
        if (
          connection.iceConnectionState === "disconnected" ||
          connection.iceConnectionState === "failed"
        ) {
          if (!connectionFailureTimerRef.current) {
            connectionFailureTimerRef.current = setTimeout(() => {
              void finishCallRef.current({ notifyServer: true });
            }, 15_000);
          }
        }
      };

      if (caller) {
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        await sendSignal(current.id, "offer", offer);
      }
    }, [sendSignal]);

    const startCall = useCallback(async () => {
      if (!isWebCallSupported || !enabled || !conversationId || !peerName) return;
      if (callRef.current && callRef.current.state !== "ended") return;
      const confirmed = window.confirm(`هتتصل بـ${peerName} مكالمة صوتية؟`);
      if (!confirmed) return;
      setBusy(true);
      setCallError("");
      setConnectedAt(null);
      setDurationSeconds(0);
      try {
        const localStream = await requestCallAudio();
        streamRef.current = localStream;
        setMuted(false);
        const created = await createMessengerCall(conversationId);
        updateCall(created.call);
        signalCursorRef.current = 0;
        await configurePeerConnection(created.call, localStream, true);
        setConnectionReady(true);
        void activeCall.refetch();
      } catch (error) {
        cleanupConnection();
        const current = callRef.current;
        if (current && current.state !== "ended") {
          await endMessengerCall(current.id).catch(() => undefined);
          updateCall({
            ...current,
            state: "ended",
            endedAt: new Date().toISOString(),
          });
        }
        onError(error instanceof Error ? error.message : "تعذر بدء المكالمة.");
      } finally {
        setBusy(false);
      }
    }, [
      activeCall,
      cleanupConnection,
      configurePeerConnection,
      conversationId,
      enabled,
      isWebCallSupported,
      onError,
      peerName,
      updateCall,
    ]);

    useImperativeHandle(ref, () => ({ startCall }), [startCall]);

    const acceptCall = useCallback(async () => {
      const current = callRef.current;
      if (!current || current.calleeId !== userId) return;
      setBusy(true);
      setCallError("");
      try {
        const localStream = await requestCallAudio();
        streamRef.current = localStream;
        setMuted(false);
        const accepted = await acceptMessengerCall(current.id);
        updateCall(accepted.call);
        signalCursorRef.current = 0;
        await configurePeerConnection(accepted.call, localStream, false);
        setConnectionReady(true);
        void activeCall.refetch();
      } catch (error) {
        cleanupConnection();
        if (callRef.current?.state === "active") {
          await endMessengerCall(current.id).catch(() => undefined);
          updateCall({
            ...current,
            state: "ended",
            endedAt: new Date().toISOString(),
          });
        } else {
          await rejectMessengerCall(current.id).catch(() => undefined);
        }
        const message = error instanceof Error ? error.message : "تعذر الرد على المكالمة.";
        setCallError(message);
        onError(message);
      } finally {
        setBusy(false);
      }
    }, [
      activeCall,
      cleanupConnection,
      configurePeerConnection,
      onError,
      updateCall,
      userId,
    ]);

    const rejectCall = useCallback(async () => {
      const current = callRef.current;
      if (!current) return;
      setBusy(true);
      try {
        const rejected = await rejectMessengerCall(current.id);
        updateCall(rejected.call);
      } catch {
        await finishCall({ notifyServer: true });
      } finally {
        setBusy(false);
      }
    }, [finishCall, updateCall]);

    useEffect(() => {
      const remote = activeCall.data?.call;
      const local = callRef.current;
      if (
        remote &&
        remote.conversationId === conversationId &&
        remote.state !== "ended"
      ) {
        if (!local || local.id !== remote.id || local.state !== remote.state) {
          if (!local || local.id !== remote.id) {
            setConnectedAt(null);
            setDurationSeconds(0);
            setMuted(false);
              setCallError("");
          }
          updateCall(remote);
        }
        return;
      }
      if (
        activeCall.isFetched &&
        local &&
        local.conversationId === conversationId &&
        local.state !== "ended" &&
        activeCall.data?.call === null
      ) {
        void finishCallRef.current({ notifyServer: false });
      }
      const status = responseStatus(activeCall.error);
      if (
        activeCall.isError &&
        (status === 403 || status === 404) &&
        local &&
        local.conversationId === conversationId &&
        local.state !== "ended"
      ) {
        void finishCallRef.current({ notifyServer: false });
      }
    }, [
      activeCall.data,
      activeCall.error,
      activeCall.isError,
      activeCall.isFetched,
      conversationId,
      updateCall,
    ]);

    useEffect(() => {
      const current = call;
      if (
        !enabled ||
        !isWebCallSupported ||
        !connectionReady ||
        !current ||
        current.state === "ended" ||
        (current.state === "ringing" && current.calleeId === userId)
      ) return;

      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const poll = async () => {
        if (stopped) return;
        try {
          const result = await getMessengerCallSignals(current.id, {
            since: signalCursorRef.current,
          });
          if (stopped) return;
          if (result.call.state === "ended") {
            await finishCallRef.current({ notifyServer: false });
            return;
          }
          if (callRef.current?.state !== result.call.state) {
            updateCall(result.call);
          }
          for (const signal of result.signals) {
            if (stopped) return;
            await handleSignalRef.current(signal);
          }
          signalCursorRef.current = result.nextSince;
        } catch (error) {
          if (stopped) return;
          const status = responseStatus(error);
          if (status === 403 || status === 404) {
            await finishCallRef.current({ notifyServer: false });
            return;
          }
          // A failed signaling read is retried; the server's call timeout remains authoritative.
        }
        if (!stopped) timer = setTimeout(() => void poll(), 1_500);
      };
      void poll();
      return () => {
        stopped = true;
        if (timer) clearTimeout(timer);
      };
    }, [
      call?.id,
      call?.state,
      connectionReady,
      enabled,
      isWebCallSupported,
      updateCall,
      userId,
    ]);

    useEffect(() => {
      if (!call || call.state !== "ringing" || !enabled || !isWebCallSupported) {
        stopRingtone();
        return;
      }
      try {
        const context = new AudioContext();
        audioContextRef.current = context;
        void context.resume().catch(() => undefined);
        const beep = () => {
          if (context.state !== "running") return;
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.frequency.value = 520;
          gain.gain.value = 0.045;
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start();
          oscillator.stop(context.currentTime + 0.18);
          oscillator.onended = () => {
            oscillator.disconnect();
            gain.disconnect();
          };
        };
        beep();
        ringTimerRef.current = setInterval(beep, 1_300);
      } catch {
        // Browsers can block Web Audio until a user gesture.
      }
      return stopRingtone;
    }, [call?.id, call?.state, enabled, isWebCallSupported, stopRingtone]);

    useEffect(() => {
      if (!connectedAt || !call || call.state === "ended") return;
      const updateDuration = () =>
        setDurationSeconds(Math.max(0, Math.floor((Date.now() - connectedAt) / 1_000)));
      updateDuration();
      const timer = setInterval(updateDuration, 1_000);
      return () => clearInterval(timer);
    }, [call?.id, call?.state, connectedAt]);

    useEffect(() => {
      if (!call || call.state !== "ended") return;
      cleanupConnection();
      if (endedTimerRef.current) clearTimeout(endedTimerRef.current);
      endedTimerRef.current = setTimeout(() => {
        if (callRef.current?.id === call.id) updateCall(null);
        finishingCallIdRef.current = "";
      }, 2_000);
      return () => {
        if (endedTimerRef.current) clearTimeout(endedTimerRef.current);
      };
    }, [call?.id, call?.state, cleanupConnection, updateCall]);

    useEffect(() => {
      if (!call || call.state === "ended" || Platform.OS !== "web") return;
      const onPageHide = () => {
        const callId = call.id;
        void endMessengerCall(callId, { keepalive: true }).catch(() => undefined);
        cleanupConnection();
      };
      window.addEventListener("pagehide", onPageHide);
      return () => window.removeEventListener("pagehide", onPageHide);
    }, [call?.id, call?.state, cleanupConnection]);

    useEffect(() => {
      if (enabled || !callRef.current || callRef.current.state === "ended") return;
      void finishCallRef.current({ notifyServer: true });
    }, [enabled]);

    useEffect(() => () => {
      if (endedTimerRef.current) clearTimeout(endedTimerRef.current);
      if (connectionFailureTimerRef.current) clearTimeout(connectionFailureTimerRef.current);
      cleanupConnection();
    }, [cleanupConnection]);

    if (!isWebCallSupported) return null;
    const incoming = !!call && call.calleeId === userId && call.state === "ringing";
    const stateLabel =
      call?.state === "ended"
        ? "انتهت"
        : connectedAt
          ? "متصلة"
          : call?.state === "active"
            ? "جارى الاتصال"
            : "بيرن";
    const minutes = Math.floor(durationSeconds / 60).toString().padStart(2, "0");
    const seconds = (durationSeconds % 60).toString().padStart(2, "0");

    return (
      <>
        <audio
          ref={(element) => {
            remoteAudioRef.current = element;
          }}
          autoPlay
          playsInline
          style={{ display: "none" }}
        />
        <Modal
          visible={!!call}
          transparent
          animationType="fade"
          onRequestClose={() => void finishCall({ notifyServer: true })}
        >
          <View style={styles.backdrop}>
            <View style={styles.panel}>
              <View style={styles.avatar}>
                <Ionicons name="person-outline" size={34} color={colors.blue} />
              </View>
              <Text style={styles.name}>{peerName}</Text>
              <Text style={styles.status}>
                {stateLabel}{connectedAt ? ` · ${minutes}:${seconds}` : ""}
              </Text>
              {!!callError && <Text style={styles.error}>{callError}</Text>}
              {busy && <ActivityIndicator color={colors.blue} />}
              {incoming && call?.state === "ringing" ? (
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    testID="call-reject"
                    disabled={busy}
                    onPress={() => void rejectCall()}
                    style={[styles.actionButton, styles.rejectButton]}
                  >
                    <Ionicons name="call" size={23} color="#FFFFFF" />
                    <Text style={styles.actionText}>رفض</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    testID="call-accept"
                    disabled={busy}
                    onPress={() => void acceptCall()}
                    style={[styles.actionButton, styles.acceptButton]}
                  >
                    <Ionicons name="call" size={23} color="#FFFFFF" />
                    <Text style={styles.actionText}>رد</Text>
                  </Pressable>
                </View>
              ) : call?.state === "ended" ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => updateCall(null)}
                  style={styles.closeButton}
                >
                  <Text style={styles.closeText}>إغلاق</Text>
                </Pressable>
              ) : (
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    testID="call-mute"
                    disabled={busy}
                    onPress={() => {
                      const next = !muted;
                      setMuted(next);
                      streamRef.current?.getAudioTracks().forEach((track) => {
                        track.enabled = !next;
                      });
                    }}
                    style={[styles.actionButton, styles.secondaryButton]}
                  >
                    <Ionicons
                      name={muted ? "mic-off-outline" : "mic-outline"}
                      size={23}
                      color="#FFFFFF"
                    />
                    <Text style={styles.actionText}>{muted ? "إلغاء الكتم" : "كتم"}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    testID="call-end"
                    disabled={busy}
                    onPress={() => void finishCall({ notifyServer: true })}
                    style={[styles.actionButton, styles.rejectButton]}
                  >
                    <Ionicons name="call" size={23} color="#FFFFFF" />
                    <Text style={styles.actionText}>إنهاء</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        </Modal>
      </>
    );
  },
);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(2, 6, 23, 0.82)",
    padding: 20,
  },
  panel: {
    width: "100%",
    maxWidth: 380,
    minHeight: 330,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    borderRadius: 28,
    padding: 28,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: {
    width: 78,
    height: 78,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 39,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  name: { color: colors.text, fontSize: 22, fontWeight: "800", textAlign: "center" },
  status: { color: colors.muted, fontSize: 14, textAlign: "center" },
  error: { color: colors.red, fontSize: 12, lineHeight: 18, textAlign: "center" },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    marginTop: 20,
  },
  actionButton: {
    minWidth: 76,
    height: 76,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 38,
    paddingHorizontal: 12,
  },
  acceptButton: { backgroundColor: "#059669" },
  rejectButton: { backgroundColor: "#DC2626" },
  secondaryButton: { backgroundColor: "#475569" },
  actionText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  closeButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 24,
    borderRadius: 14,
    backgroundColor: colors.surfaceRaised,
    marginTop: 18,
  },
  closeText: { color: colors.text, fontWeight: "700" },
});
