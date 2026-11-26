import { createHmac, timingSafeEqual } from "node:crypto";
import * as webPush from "web-push";
import type { PushSubscription } from "web-push";
import { logger } from "./logger.ts";
import { blockedPeerIdsFor, filterBlockedPushRecipients } from "./messenger-blocks.ts";
import { publishConversationUpdate, publishGroupUpdate } from "./messenger-events.ts";

type PushPool = {
  query: (text: string, values?: any[]) => Promise<{ rows: any[] }>;
};

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function toWebPushSubscription(row: PushSubscriptionRow): PushSubscription {
  return {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth,
    },
  };
}

type PushRecipientRow = {
  user_id: string;
  sender_name: string;
  push_show_preview: boolean;
  is_muted: boolean;
};

export type MessengerPushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  deliveryToken?: PushDeliveryToken;
};

export type PushDeliveryToken = {
  messageId: string;
  recipientId: string;
  exp: number;
  token: string;
};

type PushMessageKind =
  | "text"
  | "audio"
  | "media"
  | "location"
  | "live_location"
  | "image"
  | "video"
  | "file";

const pushSchemaCache = new WeakMap<object, { checkedAt: number; ready: boolean }>();
const recipientPushWindows = new Map<string, number>();
const PUSH_COOLDOWN_MS = 10_000;
const HIGH_URGENCY_PUSH_OPTIONS = { urgency: "high", TTL: 86_400 } as const;
const DELIVERY_TOKEN_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const deliveryRateWindows = new Map<string, { startedAt: number; count: number }>();

export function createPushDeliveryToken(
  messageId: string,
  recipientId: string,
  nowMs = Date.now(),
  key = process.env.VAPID_PRIVATE_KEY?.trim(),
): PushDeliveryToken | null {
  if (!key || !messageId || !recipientId) return null;
  const exp = Math.floor(nowMs / 1000) + DELIVERY_TOKEN_LIFETIME_SECONDS;
  const token = createHmac("sha256", key)
    .update(`${messageId}.${recipientId}.${exp}`)
    .digest("hex");
  return { messageId, recipientId, exp, token };
}

export function verifyPushDeliveryToken(
  input: unknown,
  key = process.env.VAPID_PRIVATE_KEY?.trim(),
  nowMs = Date.now(),
): input is PushDeliveryToken {
  if (!key || !input || typeof input !== "object") return false;
  const token = input as Partial<PushDeliveryToken>;
  if (
    typeof token.messageId !== "string" ||
    token.messageId.length < 1 ||
    token.messageId.length > 200 ||
    typeof token.recipientId !== "string" ||
    token.recipientId.length < 1 ||
    token.recipientId.length > 255 ||
    !Number.isSafeInteger(token.exp) ||
    (token.exp as number) <= Math.floor(nowMs / 1000) ||
    typeof token.token !== "string" ||
    !/^[a-f0-9]{64}$/i.test(token.token)
  ) return false;

  const expected = createHmac("sha256", key)
    .update(`${token.messageId}.${token.recipientId}.${token.exp}`)
    .digest();
  const supplied = Buffer.from(token.token, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function allowPushDeliveryFromIp(ip: string, nowMs = Date.now()): boolean {
  if (deliveryRateWindows.size >= 5_000) {
    for (const [key, value] of deliveryRateWindows) {
      if (nowMs - value.startedAt >= 60_000) deliveryRateWindows.delete(key);
    }
  }
  let current = deliveryRateWindows.get(ip);
  if (current && nowMs - current.startedAt >= 60_000) {
    deliveryRateWindows.delete(ip);
    current = undefined;
  }
  if (!current) {
    if (deliveryRateWindows.size >= 5_000) return false;
    deliveryRateWindows.set(ip, { startedAt: nowMs, count: 1 });
    return true;
  }
  if (current.count >= 60) return false;
  current.count += 1;
  return true;
}

export async function acknowledgePushDelivery(
  pool: PushPool,
  input: unknown,
  key = process.env.VAPID_PRIVATE_KEY?.trim(),
  nowMs = Date.now(),
): Promise<boolean> {
  if (!verifyPushDeliveryToken(input, key, nowMs)) return false;
  const token = input as PushDeliveryToken;
  const result = await pool.query(
    `UPDATE messenger_messages SET delivered_at = now()
     WHERE id = $1 AND delivered_at IS NULL AND sender_id <> $2
       AND conversation_id IN (
         SELECT id FROM messenger_conversations WHERE user_a = $2 OR user_b = $2
       )
     RETURNING conversation_id, sender_id`,
    [token.messageId, token.recipientId],
  );
  for (const row of result.rows) {
    await publishConversationUpdate(
      pool,
      String(row.conversation_id),
      { includeUserIds: [String(row.sender_id)] },
    );
  }
  return result.rows.length > 0;
}

export async function hasMessengerPushSchema(pool: PushPool): Promise<boolean> {
  const cached = pushSchemaCache.get(pool);
  if (cached && Date.now() - cached.checkedAt < 15_000) return cached.ready;

  try {
    const result = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM information_schema.tables
          WHERE table_schema = current_schema()
            AND table_name = 'messenger_push_subscriptions') AS table_count,
         (SELECT count(*)::int FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'messenger_profiles'
            AND column_name = 'push_show_preview') AS column_count`,
    );
    const ready =
      Number(result.rows[0]?.table_count) === 1 &&
      Number(result.rows[0]?.column_count) === 1;
    pushSchemaCache.set(pool, { checkedAt: Date.now(), ready });
    return ready;
  } catch {
    pushSchemaCache.set(pool, { checkedAt: Date.now(), ready: false });
    return false;
  }
}

export function configuredVapidPublicKey(): string | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;

  try {
    webPush.setVapidDetails(subject, publicKey, privateKey);
    return publicKey;
  } catch {
    return null;
  }
}

export function buildMessengerPushPayload(input: {
  senderName: string;
  messageType: PushMessageKind;
  messageBody: string;
  showPreview: boolean;
  conversationId: string;
  groupId?: string;
  deliveryToken?: PushDeliveryToken | null;
}): MessengerPushPayload {
  let body = "رسالة جديدة";
  if (input.messageType === "live_location") {
    body = "بدأ مشاركة موقعه المباشر";
  } else if (input.showPreview) {
    if (input.messageType === "audio") body = "🎤 رسالة صوتية";
    else if (input.messageType === "media") body = "📎 مرفق";
    else if (input.messageType === "location") body = "📍 موقع";
    else if (input.messageType === "image") body = "صورة";
    else if (input.messageType === "video") body = "فيديو";
    else if (input.messageType === "file") body = "ملف";
    else body = Array.from(input.messageBody).slice(0, 80).join("");
  }

  return {
    title: input.senderName,
    body,
    url: input.groupId
      ? `/oscar-messenger/groups/${encodeURIComponent(input.groupId)}`
      : `/oscar-messenger/chat/${encodeURIComponent(input.conversationId)}`,
    tag: input.groupId ?? input.conversationId,
    ...(input.deliveryToken ? { deliveryToken: input.deliveryToken } : {}),
  };
}

export function eligiblePushRecipients(
  rows: PushRecipientRow[],
  senderId: string,
): PushRecipientRow[] {
  return rows.filter((row) => row.user_id !== senderId && !row.is_muted);
}

function reserveRecipientPush(userId: string, conversationId: string, now = Date.now()): boolean {
  if (recipientPushWindows.size > 5_000) {
    for (const [key, sentAt] of recipientPushWindows) {
      if (now - sentAt >= PUSH_COOLDOWN_MS) recipientPushWindows.delete(key);
    }
  }

  const key = `${userId}:${conversationId}`;
  const lastSentAt = recipientPushWindows.get(key);
  if (lastSentAt !== undefined && now - lastSentAt < PUSH_COOLDOWN_MS) return false;
  recipientPushWindows.set(key, now);
  return true;
}

export async function deliverPushSubscriptions(
  pool: PushPool,
  subscriptions: PushSubscriptionRow[],
  payload: MessengerPushPayload,
  sendNotification: (
    subscription: PushSubscription,
    payload: string,
    options: typeof HIGH_URGENCY_PUSH_OPTIONS,
  ) => Promise<unknown> = (subscription, message, options) =>
    webPush.sendNotification(subscription, message, options),
): Promise<void> {
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await sendNotification(
          toWebPushSubscription(subscription),
          JSON.stringify(payload),
          HIGH_URGENCY_PUSH_OPTIONS,
        );
        await pool.query(
          `UPDATE messenger_push_subscriptions
           SET last_success_at = now() WHERE id = $1`,
          [subscription.id],
        );
      } catch (error) {
        const rawStatusCode =
          typeof error === "object" && error !== null && "statusCode" in error
            ? Number(error.statusCode)
            : null;
        const statusCode =
          rawStatusCode !== null && Number.isFinite(rawStatusCode)
            ? rawStatusCode
            : null;
        const errorName =
          typeof error === "object" &&
          error !== null &&
          "name" in error &&
          typeof error.name === "string"
            ? error.name
            : "UnknownError";
        logger.warn(
          { statusCode, errorName },
          "Messenger Web Push delivery failed",
        );
        if (statusCode === 404 || statusCode === 410) {
          await pool
            .query(
              `DELETE FROM messenger_push_subscriptions WHERE id = $1`,
              [subscription.id],
            )
            .catch(() => undefined);
        }
      }
    }),
  );
}

async function notifyRecipients(
  pool: PushPool,
  recipientQuery: string,
  recipientValues: unknown[],
  senderId: string,
  message: {
    conversationId: string;
    groupId?: string;
    messageType: PushMessageKind;
    body: string;
    messageId?: string;
  },
): Promise<void> {
  try {
    if (!configuredVapidPublicKey() || !(await hasMessengerPushSchema(pool))) return;

    const recipientResult = await pool.query(recipientQuery, recipientValues);
    let recipients = eligiblePushRecipients(recipientResult.rows, senderId);
    if (!message.groupId && recipients.length) {
      const blockedPeerIds = await blockedPeerIdsFor(
        pool,
        senderId,
        recipients.map((recipient) => recipient.user_id),
      );
      recipients = filterBlockedPushRecipients(recipients, blockedPeerIds);
    }
    if (!recipients.length) return;

    const subscriptionResult = await pool.query(
      `SELECT id, user_id, endpoint, p256dh, auth
       FROM messenger_push_subscriptions
       WHERE user_id = ANY($1::text[])`,
      [recipients.map((recipient) => recipient.user_id)],
    );
    const subscriptionsByUser = new Map<string, PushSubscriptionRow[]>();
    for (const subscription of subscriptionResult.rows as PushSubscriptionRow[]) {
      const list = subscriptionsByUser.get(subscription.user_id) ?? [];
      list.push(subscription);
      subscriptionsByUser.set(subscription.user_id, list);
    }

    await Promise.all(
      recipients.map(async (recipient) => {
        const subscriptions = subscriptionsByUser.get(recipient.user_id) ?? [];
        if (
          !subscriptions.length ||
          !reserveRecipientPush(recipient.user_id, message.conversationId)
        ) return;
        const payload = buildMessengerPushPayload({
          senderName: recipient.sender_name ?? "",
          messageType: message.messageType,
          messageBody: message.body,
          showPreview: Boolean(recipient.push_show_preview),
          conversationId: message.conversationId,
          groupId: message.groupId,
          deliveryToken: !message.groupId && message.messageId
            ? createPushDeliveryToken(message.messageId, recipient.user_id)
            : null,
        });
        await deliverPushSubscriptions(pool, subscriptions, payload);
      }),
    );
  } catch {
    // Push delivery must never affect message creation or log message content.
  }
}

export async function notifyConversationMessage(
  pool: PushPool,
  input: {
    conversationId: string;
    senderId: string;
    messageType: PushMessageKind;
    body: string;
    messageId?: string;
  },
): Promise<void> {
  await publishConversationUpdate(
    pool,
    input.conversationId,
    input.messageType === "live_location"
      ? { excludeUserIds: [input.senderId] }
      : { includeConversations: true },
  );
  await notifyRecipients(
    pool,
    `SELECT peer.user_id, sender.display_name AS sender_name,
            peer.push_show_preview, COALESCE(settings.is_muted, false) AS is_muted
     FROM messenger_conversations conversation
     JOIN messenger_profiles sender ON sender.user_id = $2
     JOIN messenger_profiles peer
       ON peer.user_id = CASE
         WHEN conversation.user_a = $2 THEN conversation.user_b
         ELSE conversation.user_a
       END
     LEFT JOIN messenger_conversation_settings settings
       ON settings.conversation_id = conversation.id AND settings.user_id = peer.user_id
     WHERE conversation.id = $1
       AND $2 IN (conversation.user_a, conversation.user_b)
       AND peer.user_id <> $2`,
    [input.conversationId, input.senderId],
    input.senderId,
    { ...input, conversationId: input.conversationId },
  );
}

export function buildMessengerCallPushPayload(input: {
  callerName: string;
  conversationId: string;
  callId: string;
}): MessengerPushPayload {
  return {
    title: "مكالمة صوتية",
    body: `مكالمة صوتية من ${input.callerName}`,
    url: `/oscar-messenger/chat/${encodeURIComponent(input.conversationId)}`,
    tag: input.callId,
  };
}

export async function notifyMessengerIncomingCall(
  pool: PushPool,
  input: {
    callerId: string;
    calleeId: string;
    callerName: string;
    conversationId: string;
    callId: string;
  },
): Promise<void> {
  try {
    if (!configuredVapidPublicKey() || !(await hasMessengerPushSchema(pool))) return;
    const blockedIds = await blockedPeerIdsFor(pool, input.callerId, [input.calleeId]);
    if (blockedIds.has(input.calleeId)) return;

    const result = await pool.query(
      `SELECT id, user_id, endpoint, p256dh, auth
       FROM messenger_push_subscriptions
       WHERE user_id = $1`,
      [input.calleeId],
    );
    if (!result.rows.length) return;
    await deliverPushSubscriptions(
      pool,
      result.rows as PushSubscriptionRow[],
      buildMessengerCallPushPayload(input),
    );
  } catch {
    // Call setup remains available when optional push delivery is unavailable.
  }
}

export async function notifyGroupMessage(
  pool: PushPool,
  input: {
    groupId: string;
    senderId: string;
    messageType?: PushMessageKind;
    body: string;
  },
): Promise<void> {
  await publishGroupUpdate(pool, input.groupId, { includeGroup: true });
  await notifyRecipients(
    pool,
    `SELECT profile.user_id, sender.display_name AS sender_name,
            profile.push_show_preview, COALESCE(settings.is_muted, false) AS is_muted
     FROM messenger_group_members member
     JOIN messenger_profiles sender ON sender.user_id = $2
     JOIN messenger_profiles profile ON profile.user_id = member.user_id
     LEFT JOIN messenger_group_settings settings
       ON settings.group_id = member.group_id AND settings.user_id = member.user_id
     WHERE member.group_id = $1 AND member.user_id <> $2`,
    [input.groupId, input.senderId],
    input.senderId,
    {
      conversationId: input.groupId,
      groupId: input.groupId,
      messageType: input.messageType ?? "text",
      body: input.body,
    },
  );
}
