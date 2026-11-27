import { useAuth } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import {
  acceptMessengerCall,
  createMessengerCall,
  endMessengerCall,
  getActiveMessengerCall,
  getMessengerCallConfig,
  getMessengerCallSignals,
  reportMessengerCallOutcome,
  rejectMessengerCall,
  sendMessengerCallSignal,
} from "@workspace/api-client-react";
import type {
  MessengerCall,
  MessengerCallOutcomeInput,
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
import { usePwaUpdateActivity } from "../lib/pwa-update-activity";

export type WebCallControllerHandle = {
  startCall: (media?: CallMedia) => Promise<void>;
};

type Props = {
  conversationId: string;
  peerName: string;
  enabled: boolean;
  onError: (message: string) => void;
};

type FinishOptions = { notifyServer: boolean };
type CallMedia = "audio" | "video";
type AudioOutput = { deviceId: string; label: string };

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 640 },
  height: { ideal: 480 },
  frameRate: { ideal: 24, max: 30 },
};
const EARPIECE_LABEL = /earpiece|receiver|handset|phone|سماعة الهاتف|سماعة الأذن/i;

// Video calls ask for camera + mic. When the camera is refused or missing,
// the call still goes ahead as audio-only instead of failing.
async function requestCallMedia(
  media: CallMedia,
  facingMode: "user" | "environment" = "user",
): Promise<{ stream: MediaStream; cameraUnavailable: boolean }> {
  if (media === "video" && typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { ...VIDEO_CONSTRAINTS, facingMode },
      });
      return { stream, cameraUnavailable: false };
    } catch {
      return { stream: await requestCallAudio(), cameraUnavailable: true };
    }
  }
  return { stream: await requestCallAudio(), cameraUnavailable: false };
}

function supportsSinkSelection(): boolean {
  return (
    typeof HTMLMediaElement !== "undefined" &&
    "setSinkId" in HTMLMediaElement.prototype
  );
}

async function listAudioOutputs(): Promise<AudioOutput[]> {
  if (!supportsSinkSelection() || !navigator.mediaDevices?.enumerateDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((device) => device.kind === "audiooutput")
      .map((device) => ({ deviceId: device.deviceId, label: device.label || "مخرج صوت" }));
  } catch {
    return [];
  }
}

function setCallAudioSession(type: "play-and-record" | "auto"): void {
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = type;
  } catch {
    // Safari before 16.4 has no Audio Session API; routing stays with the browser.
  }
}

function monotonicNowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function safeCandidateType(value: unknown): MessengerCallOutcomeInput["localType"] {
  return value === "host" || value === "srflx" || value === "prflx" || value === "relay"
    ? value
    : "unknown";
}

async function selectedCandidateTypes(
  connection: RTCPeerConnection,
): Promise<Pick<MessengerCallOutcomeInput, "localType" | "remoteType">> {
  try {
    const stats = await connection.getStats();
    type CandidatePairStats = RTCStats & {
      selected?: boolean;
      nominated?: boolean;
      state?: string;
      localCandidateId?: string;
      remoteCandidateId?: string;
    };
    let selectedPair: CandidatePairStats | undefined;
    let transportPairId: string | undefined;
    for (const stat of stats.values()) {
      if (stat.type === "candidate-pair") {
        const pair = stat as CandidatePairStats;
        if (pair.selected === true) selectedPair = pair;
        else if (
          !selectedPair &&
          pair.nominated === true &&
          pair.state === "succeeded"
        ) selectedPair = pair;
      } else if (stat.type === "transport") {
        const transport = stat as RTCStats & { selectedCandidatePairId?: unknown };
        if (typeof transport.selectedCandidatePairId === "string") {
          transportPairId = transport.selectedCandidatePairId;
        }
      }
    }
    if (!selectedPair && transportPairId) {
      const stat = stats.get(transportPairId);
      if (stat?.type === "candidate-pair") {
        selectedPair = stat as CandidatePairStats;
      }
    }
    const localCandidate = selectedPair?.localCandidateId
      ? stats.get(selectedPair.localCandidateId)
      : undefined;
    const remoteCandidate = selectedPair?.remoteCandidateId
      ? stats.get(selectedPair.remoteCandidateId)
      : undefined;
    return {
      localType: safeCandidateType(
        localCandidate && "candidateType" in localCandidate
          ? localCandidate.candidateType
          : undefined,
      ),
      remoteType: safeCandidateType(
        remoteCandidate && "candidateType" in remoteCandidate
          ? remoteCandidate.candidateType
          : undefined,
      ),
    };
  } catch {
    return { localType: "unknown", remoteType: "unknown" };
  }
}

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

// The end request must reach the server even when the network is flaky, or the call
// stays "active" there and every redial gets 409. keepalive survives page unloads.
async function endCallOnServer(callId: string): Promise<void> {
  for (const delayMs of [0, 2_000, 5_000]) {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    try {
      await endMessengerCall(callId, { keepalive: true });
      return;
    } catch (error) {
      const status = responseStatus(error);
      if (status >= 400 && status < 500) return;
    }
  }
}

type ScreenWakeLock = {
  release: () => Promise<void>;
  addEventListener?: (type: "release", listener: () => void) => void;
  removeEventListener?: (type: "release", listener: () => void) => void;
};

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
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
    const localVideoRef = useRef<HTMLVideoElement | null>(null);
    const facingModeRef = useRef<"user" | "environment">("user");
    const [localHasVideo, setLocalHasVideo] = useState(false);
    const [remoteHasVideo, setRemoteHasVideo] = useState(false);
    const [cameraOff, setCameraOff] = useState(false);
    const [canSwitchCamera, setCanSwitchCamera] = useState(false);
    const [audioOutputs, setAudioOutputs] = useState<AudioOutput[]>([]);
    const [speakerOn, setSpeakerOn] = useState(false);
    const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
    const signalCursorRef = useRef(0);
    const connectionFailureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const endedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const ringTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const finishingCallIdRef = useRef("");
    const callAcceptedAtMsRef = useRef<number | null>(null);
    const callOutcomeReportedIdRef = useRef("");
    const callEverConnectedRef = useRef(false);
    const finishCallRef = useRef<(options: FinishOptions) => Promise<void>>(async () => undefined);
    const handleSignalRef = useRef<(signal: MessengerCallSignal) => Promise<void>>(
      async () => undefined,
    );

    const isWebCallSupported =
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      typeof RTCPeerConnection !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia;
    usePwaUpdateActivity(
      "web-call",
      isWebCallSupported && (busy || (!!call && call.state !== "ended")),
    );

    // `enabled` only gates starting or receiving a new call. A call that is already
    // ringing out or connected keeps running while the screen sleeps or the tab is hidden.
    const inCall = !!call && call.state !== "ended";
    const activeCall = useQuery({
      queryKey: queryKeys.callActive,
      queryFn: () => getActiveMessengerCall(),
      enabled: (enabled || inCall) && isWebCallSupported,
      refetchInterval: (enabled || inCall) && isWebCallSupported ? 2_000 : false,
      refetchIntervalInBackground: inCall,
      staleTime: 0,
      retry: false,
    });

    const updateCall = useCallback((next: MessengerCall | null) => {
      if (next && callRef.current?.id !== next.id) {
        callAcceptedAtMsRef.current = null;
        callOutcomeReportedIdRef.current = "";
        callEverConnectedRef.current = false;
      }
      callRef.current = next;
      setCall(next);
    }, []);

    const reportCallOutcome = useCallback(async (
      callId: string,
      outcome: MessengerCallOutcomeInput["outcome"],
      connection: RTCPeerConnection,
    ) => {
      if (callOutcomeReportedIdRef.current === callId) return;
      callOutcomeReportedIdRef.current = callId;
      const acceptedAt = callAcceptedAtMsRef.current;
      const setupMs = Math.min(
        120_000,
        Math.max(0, Math.round(monotonicNowMs() - (acceptedAt ?? monotonicNowMs()))),
      );
      const candidateTypes = await selectedCandidateTypes(connection);
      const input: MessengerCallOutcomeInput = {
        outcome,
        ...candidateTypes,
        setupMs,
      };
      await reportMessengerCallOutcome(callId, input, { keepalive: true })
        .catch(() => undefined);
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
      for (const video of [remoteVideoRef.current, localVideoRef.current]) {
        if (video) video.srcObject = null;
      }
      setLocalHasVideo(false);
      setRemoteHasVideo(false);
      setCameraOff(false);
      setCanSwitchCamera(false);
      setSpeakerOn(false);
      facingModeRef.current = "user";
      stopRingtone();
    }, [stopRingtone]);

    const attachLocalStream = useCallback((stream: MediaStream, cameraUnavailable: boolean) => {
      streamRef.current = stream;
      const hasVideo = stream.getVideoTracks().length > 0;
      setLocalHasVideo(hasVideo);
      setCameraOff(false);
      if (cameraUnavailable) setCallError("الكاميرا مش متاحة — المكالمة كملت صوت بس.");
      const localVideo = localVideoRef.current;
      if (localVideo && hasVideo) {
        localVideo.srcObject = stream;
        void localVideo.play().catch(() => undefined);
      }
      if (hasVideo && navigator.mediaDevices?.enumerateDevices) {
        void navigator.mediaDevices
          .enumerateDevices()
          .then((devices) =>
            setCanSwitchCamera(devices.filter((device) => device.kind === "videoinput").length > 1),
          )
          .catch(() => undefined);
      }
    }, []);

    const finishCall = useCallback(async (options: FinishOptions) => {
      const current = callRef.current;
      if (!current || current.state === "ended") return;
      if (finishingCallIdRef.current === current.id) return;
      finishingCallIdRef.current = current.id;
      if (options.notifyServer) {
        void endCallOnServer(current.id);
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
        if (callAcceptedAtMsRef.current === null) {
          callAcceptedAtMsRef.current = monotonicNowMs();
        }
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
      localStream.getTracks().forEach((track) => {
        const sender = connection.addTrack(track, localStream);
        if (track.kind === "video") {
          // Cap video at ~0.8 Mbps so calls stay usable on mobile data.
          try {
            const parameters = sender.getParameters();
            parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
            parameters.encodings[0].maxBitrate = 800_000;
            void sender.setParameters(parameters).catch(() => undefined);
          } catch {
            // Older browsers ignore bitrate limits.
          }
        }
      });
      connection.ontrack = (event) => {
        const remoteStream = event.streams[0] ?? new MediaStream([event.track]);
        // Audio always plays through the hidden <audio>; the <video> stays muted.
        const remoteAudio = remoteAudioRef.current;
        if (remoteAudio && remoteAudio.srcObject !== remoteStream) {
          remoteAudio.srcObject = remoteStream;
          void remoteAudio.play().catch(() => undefined);
        }
        if (event.track.kind === "video") {
          setRemoteHasVideo(true);
          const remoteVideo = remoteVideoRef.current;
          if (remoteVideo) {
            remoteVideo.srcObject = remoteStream;
            void remoteVideo.play().catch(() => undefined);
          }
        }
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
          callEverConnectedRef.current = true;
          setConnectedAt((previous) => previous ?? Date.now());
          void reportCallOutcome(current.id, "connected", connection);
          return;
        }
        if (
          connection.iceConnectionState === "disconnected" ||
          connection.iceConnectionState === "failed"
        ) {
          if (!connectionFailureTimerRef.current) {
            connectionFailureTimerRef.current = setTimeout(() => {
              if (!callEverConnectedRef.current) {
                void reportCallOutcome(current.id, "failed", connection);
              }
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
    }, [reportCallOutcome, sendSignal]);

    const startCall = useCallback(async (media: CallMedia = "audio") => {
      if (!isWebCallSupported || !enabled || !conversationId || !peerName) return;
      if (callRef.current && callRef.current.state !== "ended") return;
      const confirmed = window.confirm(
        `هتتصل بـ${peerName} ${media === "video" ? "مكالمة فيديو" : "مكالمة صوتية"}؟`,
      );
      if (!confirmed) return;
      setBusy(true);
      setCallError("");
      setConnectedAt(null);
      setDurationSeconds(0);
      callAcceptedAtMsRef.current = null;
      try {
        const { stream: localStream, cameraUnavailable } = await requestCallMedia(media);
        attachLocalStream(localStream, cameraUnavailable);
        setMuted(false);
        const created = await createMessengerCall(conversationId, {
          media: localStream.getVideoTracks().length ? "video" : "audio",
        });
        updateCall(created.call);
        signalCursorRef.current = 0;
        await configurePeerConnection(created.call, localStream, true);
        setConnectionReady(true);
        void activeCall.refetch();
      } catch (error) {
        cleanupConnection();
        const incomingCall =
          responseStatus(error) === 409 &&
          error &&
          typeof error === "object" &&
          "data" in error
            ? (error as { data?: { call?: MessengerCall } | null }).data?.call
            : undefined;
        if (
          incomingCall &&
          incomingCall.state === "ringing" &&
          incomingCall.calleeId === userId
        ) {
          // The other person is already calling: show the incoming call to answer.
          updateCall(incomingCall);
          void activeCall.refetch();
          setCallError("فيه مكالمة جاية — رد عليها.");
          return;
        }
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
      attachLocalStream,
      cleanupConnection,
      configurePeerConnection,
      conversationId,
      enabled,
      isWebCallSupported,
      onError,
      peerName,
      updateCall,
      userId,
    ]);

    useImperativeHandle(
      ref,
      () => ({ startCall: (media?: CallMedia) => startCall(media ?? "audio") }),
      [startCall],
    );

    const acceptCall = useCallback(async () => {
      const current = callRef.current;
      if (!current || current.calleeId !== userId) return;
      setBusy(true);
      setCallError("");
      callAcceptedAtMsRef.current = monotonicNowMs();
      try {
        const { stream: localStream, cameraUnavailable } = await requestCallMedia(
          current.media === "video" ? "video" : "audio",
        );
        attachLocalStream(localStream, cameraUnavailable);
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
      attachLocalStream,
      cleanupConnection,
      configurePeerConnection,
      onError,
      updateCall,
      userId,
    ]);

    const toggleCamera = useCallback(() => {
      const next = !cameraOff;
      streamRef.current?.getVideoTracks().forEach((track) => {
        track.enabled = !next;
      });
      setCameraOff(next);
    }, [cameraOff]);

    const switchCamera = useCallback(async () => {
      const connection = peerConnectionRef.current;
      const stream = streamRef.current;
      const oldTrack = stream?.getVideoTracks()[0];
      if (!connection || !stream || !oldTrack) return;
      const nextFacing = facingModeRef.current === "user" ? "environment" : "user";
      try {
        const replacement = await navigator.mediaDevices.getUserMedia({
          video: { ...VIDEO_CONSTRAINTS, facingMode: nextFacing },
          audio: false,
        });
        const newTrack = replacement.getVideoTracks()[0];
        if (!newTrack) return;
        newTrack.enabled = !cameraOff;
        const sender = connection.getSenders().find((item) => item.track?.kind === "video");
        await sender?.replaceTrack(newTrack);
        stream.removeTrack(oldTrack);
        oldTrack.stop();
        stream.addTrack(newTrack);
        facingModeRef.current = nextFacing;
        const localVideo = localVideoRef.current;
        if (localVideo) localVideo.srcObject = stream;
      } catch {
        setCallError("تعذر تبديل الكاميرا.");
      }
    }, [cameraOff]);

    // Audio routing (owner: calls always come out of the loudspeaker). The web has no
    // guaranteed earpiece API, so this is best effort: iOS Audio Session + setSinkId.
    const callIsLive = !!call && call.state !== "ended";
    const callMedia: CallMedia = call?.media === "video" ? "video" : "audio";
    useEffect(() => {
      if (!callIsLive || Platform.OS !== "web" || typeof navigator === "undefined") return;
      setCallAudioSession("play-and-record");
      return () => setCallAudioSession("auto");
    }, [callIsLive]);

    const applyAudioOutput = useCallback(async (speaker: boolean, outputs: AudioOutput[]) => {
      const audio = remoteAudioRef.current as (HTMLAudioElement & {
        setSinkId?: (deviceId: string) => Promise<void>;
      }) | null;
      if (!audio?.setSinkId || outputs.length < 2) return;
      const earpiece = outputs.find((output) => EARPIECE_LABEL.test(output.label));
      const loudspeaker =
        outputs.find((output) => /speaker|loud|مكبر|السماعة الخارجية/i.test(output.label)) ??
        outputs.find((output) => output.deviceId === "default") ??
        outputs[0];
      const target = speaker ? loudspeaker : earpiece ?? loudspeaker;
      try {
        await audio.setSinkId(target.deviceId);
      } catch {
        // Some browsers refuse a sink change mid-call; the current output stays.
      }
    }, []);

    useEffect(() => {
      if (!connectedAt) return;
      let cancelled = false;
      void listAudioOutputs().then((outputs) => {
        if (cancelled) return;
        setAudioOutputs(outputs);
        const speaker = callMedia === "video";
        setSpeakerOn(speaker);
        void applyAudioOutput(speaker, outputs);
      });
      return () => {
        cancelled = true;
      };
    }, [applyAudioOutput, callMedia, connectedAt]);

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
        if (
          remote.state === "active" &&
          callAcceptedAtMsRef.current === null
        ) {
          callAcceptedAtMsRef.current = monotonicNowMs();
        }
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
          if (
            result.call.state === "active" &&
            callAcceptedAtMsRef.current === null
          ) {
            callAcceptedAtMsRef.current = monotonicNowMs();
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

    // Keep the screen on during a call so the phone's auto-lock does not freeze the page.
    // Unsupported browsers just skip this; the call itself never depends on it.
    // Keep the device screen awake for every ringing/active call, including incoming calls.
    // Browsers release the lock when the document becomes hidden, so reacquire it on return.
    const callHoldsScreen = !!call && call.state !== "ended";
    useEffect(() => {
      if (!callHoldsScreen || Platform.OS !== "web" || typeof navigator === "undefined") return;
      const wakeLockApi = (navigator as Navigator & {
        wakeLock?: { request: (type: "screen") => Promise<ScreenWakeLock> };
      }).wakeLock;
      if (!wakeLockApi) return;
      let lock: ScreenWakeLock | null = null;
      let requesting = false;
      let stopped = false;
      const onRelease = () => {
        lock = null;
      };
      const acquire = async () => {
        if (stopped || requesting || lock || document.visibilityState !== "visible") return;
        requesting = true;
        try {
          const acquired = await wakeLockApi.request("screen");
          if (stopped || document.visibilityState !== "visible") {
            void acquired.release().catch(() => undefined);
          } else {
            lock = acquired;
            lock.addEventListener?.("release", onRelease);
          }
        } catch {
          // The browser may refuse (battery saver, unsupported PWA mode); the call continues.
        } finally {
          requesting = false;
        }
      };
      const onVisibility = () => {
        if (document.visibilityState === "visible") void acquire();
      };
      void acquire();
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        stopped = true;
        document.removeEventListener("visibilitychange", onVisibility);
        lock?.removeEventListener?.("release", onRelease);
        if (lock) void lock.release().catch(() => undefined);
        lock = null;
      };
    }, [callHoldsScreen, call?.id]);

    useEffect(() => () => {
      if (endedTimerRef.current) clearTimeout(endedTimerRef.current);
      if (connectionFailureTimerRef.current) clearTimeout(connectionFailureTimerRef.current);
      const current = callRef.current;
      if (current && current.state !== "ended") void endCallOnServer(current.id);
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
            <View style={[styles.panel, callMedia === "video" && styles.videoPanel]}>
              {callMedia === "video" && (
                <View
                  style={[
                    styles.videoStage,
                    !(remoteHasVideo || localHasVideo) && styles.videoStageHidden,
                  ]}
                >
                  <video
                    ref={(element) => {
                      remoteVideoRef.current = element;
                      const remoteStream = remoteAudioRef.current?.srcObject;
                      if (element && remoteStream && element.srcObject !== remoteStream) {
                        element.srcObject = remoteStream;
                        void element.play().catch(() => undefined);
                      }
                    }}
                    autoPlay
                    playsInline
                    muted
                    data-testid="call-remote-video"
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      backgroundColor: "#000",
                      display: remoteHasVideo ? "block" : "none",
                    }}
                  />
                  <video
                    ref={(element) => {
                      localVideoRef.current = element;
                      const localStream = streamRef.current;
                      if (
                        element &&
                        localStream?.getVideoTracks().length &&
                        element.srcObject !== localStream
                      ) {
                        element.srcObject = localStream;
                        void element.play().catch(() => undefined);
                      }
                    }}
                    autoPlay
                    playsInline
                    muted
                    data-testid="call-local-video"
                    style={{
                      position: "absolute",
                      top: 10,
                      right: 10,
                      width: 96,
                      height: 128,
                      objectFit: "cover",
                      borderRadius: 14,
                      backgroundColor: "#111",
                      transform: facingModeRef.current === "user" ? "scaleX(-1)" : "none",
                      display: localHasVideo && !cameraOff ? "block" : "none",
                    }}
                  />
                </View>
              )}
              {!(callMedia === "video" && remoteHasVideo) && (
                <View style={styles.avatar}>
                  <Ionicons name="person-outline" size={34} color={colors.blue} />
                </View>
              )}
              <Text style={styles.name}>{peerName}</Text>
              <Text style={styles.status}>
                {callMedia === "video" ? "مكالمة فيديو" : "مكالمة صوتية"} · {stateLabel}
                {connectedAt ? ` · ${minutes}:${seconds}` : ""}
              </Text>
              {!!connectedAt && audioOutputs.length > 0 && (
                <Text style={styles.diagnostic}>
                  مخارج الصوت المتاحة: {audioOutputs.length}
                </Text>
              )}
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
                  {localHasVideo && (
                    <Pressable
                      accessibilityRole="button"
                      testID="call-camera"
                      disabled={busy}
                      onPress={toggleCamera}
                      style={[styles.actionButton, styles.secondaryButton]}
                    >
                      <Ionicons
                        name={cameraOff ? "videocam-off-outline" : "videocam-outline"}
                        size={23}
                        color="#FFFFFF"
                      />
                      <Text style={styles.actionText}>{cameraOff ? "شغّل الكاميرا" : "الكاميرا"}</Text>
                    </Pressable>
                  )}
                  {localHasVideo && canSwitchCamera && (
                    <Pressable
                      accessibilityRole="button"
                      testID="call-switch-camera"
                      disabled={busy}
                      onPress={() => void switchCamera()}
                      style={[styles.actionButton, styles.secondaryButton]}
                    >
                      <Ionicons name="camera-reverse-outline" size={23} color="#FFFFFF" />
                      <Text style={styles.actionText}>تبديل</Text>
                    </Pressable>
                  )}
                  {audioOutputs.length > 1 && supportsSinkSelection() && (
                    <Pressable
                      accessibilityRole="button"
                      testID="call-speaker"
                      disabled={busy}
                      onPress={() => {
                        const next = !speakerOn;
                        setSpeakerOn(next);
                        void applyAudioOutput(next, audioOutputs);
                      }}
                      style={[styles.actionButton, styles.secondaryButton]}
                    >
                      <Ionicons
                        name={speakerOn ? "volume-high-outline" : "ear-outline"}
                        size={23}
                        color="#FFFFFF"
                      />
                      <Text style={styles.actionText}>{speakerOn ? "السماعة" : "الأذن"}</Text>
                    </Pressable>
                  )}
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
  diagnostic: { color: colors.muted, fontSize: 11, textAlign: "center" },
  videoPanel: { maxWidth: 460, padding: 16 },
  videoStage: {
    position: "relative",
    width: "100%",
    height: 360,
    overflow: "hidden",
    borderRadius: 20,
    backgroundColor: "#000",
  },
  videoStageHidden: { height: 0 },
  error: { color: colors.red, fontSize: 12, lineHeight: 18, textAlign: "center" },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
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
