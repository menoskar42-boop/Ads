import * as webPush from "web-push";
import type { PushSubscription } from "web-push";

type PushPool = {
  query: (text: string, values?: any[]) => Promise<{ rows: any[] }>;
};

type PushSubscriptionRow = PushSubscription & {
  id: string;
  user_id: string;
};

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
};

type PushMessageKind = "text" | "audio" | "media" | "location";

const pushSchemaCache = new WeakMap<object, { checkedAt: number; ready: boolean }>();
const recipientPushWindows = new Map<string, number>();
const PUSH_COOLDOWN_MS = 10_000;

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
}): MessengerPushPayload {
  let body = "رسالة جديدة";
  if (input.showPreview) {
    if (input.messageType === "audio") body = "🎤 رسالة صوتية";
    else if (input.messageType === "media") body = "📎 مرفق";
    else if (input.messageType === "location") body = "📍 موقع";
    else body = Array.from(input.messageBody).slice(0, 80).join("");
  }

  return {
    title: input.senderName,
    body,
    url: input.groupId
      ? `/oscar-messenger/groups/${encodeURIComponent(input.groupId)}`
      : `/oscar-messenger/chat/${encodeURIComponent(input.conversationId)}`,
    tag: input.groupId ?? input.conversationId,
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
  ) => Promise<unknown> = (subscription, message) =>
    webPush.sendNotification(subscription, message),
): Promise<void> {
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await sendNotification(subscription, JSON.stringify(payload));
        await pool.query(
          `UPDATE messenger_push_subscriptions
           SET last_success_at = now() WHERE id = $1`,
          [subscription.id],
        );
      } catch (error) {
        const statusCode =
          typeof error === "object" && error !== null && "statusCode" in error
            ? Number(error.statusCode)
            : 0;
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
  },
): Promise<void> {
  try {
    if (!configuredVapidPublicKey() || !(await hasMessengerPushSchema(pool))) return;

    const recipientResult = await pool.query(recipientQuery, recipientValues);
    const recipients = eligiblePushRecipients(recipientResult.rows, senderId);
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
        });
        await deliverPushSubscriptions(pool, subscriptions, payload);
      }),
    );
  } catch {
    // Push delivery must never affect message creation or log message content.
  }
}

export function notifyConversationMessage(
  pool: PushPool,
  input: {
    conversationId: string;
    senderId: string;
    messageType: PushMessageKind;
    body: string;
  },
): Promise<void> {
  return notifyRecipients(
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
    input,
  );
}

export function notifyGroupMessage(
  pool: PushPool,
  input: {
    groupId: string;
    senderId: string;
    body: string;
  },
): Promise<void> {
  return notifyRecipients(
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
      messageType: "text",
      body: input.body,
    },
  );
}
