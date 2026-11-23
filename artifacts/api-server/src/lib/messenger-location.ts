const LOCATION_FUTURE_TOLERANCE_MS = 2 * 60 * 1000;
const LOCATION_MAX_AGE_MS = 15 * 60 * 1000;

export type MessengerLocationInput = {
  lat: number;
  lng: number;
  accuracyM: number | null;
  capturedAt: Date;
  clientMessageId: string;
};

export type ParsedMessengerLocation =
  | { valid: true; value: MessengerLocationInput }
  | { valid: false };

export function parseMessengerLocationInput(
  body: unknown,
  nowMs = Date.now(),
): ParsedMessengerLocation {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { valid: false };
  }

  const input = body as Record<string, unknown>;
  const { lat, lng, accuracyM, capturedAt, clientMessageId } = input;
  if (
    typeof lat !== "number" ||
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    typeof lng !== "number" ||
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180 ||
    (accuracyM !== null &&
      (typeof accuracyM !== "number" ||
        !Number.isInteger(accuracyM) ||
        accuracyM < 0 ||
        accuracyM > 100_000)) ||
    typeof capturedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      capturedAt,
    ) ||
    typeof clientMessageId !== "string" ||
    clientMessageId.length < 8 ||
    clientMessageId.length > 80 ||
    !/^[A-Za-z0-9_-]+$/.test(clientMessageId)
  ) {
    return { valid: false };
  }

  const capturedAtMs = Date.parse(capturedAt);
  const capturedDate = new Date(`${capturedAt.slice(0, 10)}T00:00:00.000Z`);
  if (
    !Number.isFinite(capturedAtMs) ||
    !Number.isFinite(capturedDate.getTime()) ||
    capturedDate.toISOString().slice(0, 10) !== capturedAt.slice(0, 10) ||
    capturedAtMs > nowMs + LOCATION_FUTURE_TOLERANCE_MS ||
    nowMs - capturedAtMs > LOCATION_MAX_AGE_MS
  ) {
    return { valid: false };
  }

  return {
    valid: true,
    value: {
      lat,
      lng,
      accuracyM: accuracyM as number | null,
      capturedAt: new Date(capturedAtMs),
      clientMessageId,
    },
  };
}

export function canForwardMessageType(messageType: unknown): boolean {
  return messageType !== "location";
}
