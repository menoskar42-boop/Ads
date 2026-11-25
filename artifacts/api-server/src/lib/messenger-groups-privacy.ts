export function buildGroupMessagesReadQuery(
  groupId: string,
  userId: string,
  limit: number,
  beforeMessageId: string | null,
) {
  return {
    sql: `SELECT messages.id, messages.group_id, messages.sender_id,
                 profiles.display_name AS sender_name, messages.body, messages.created_at
          FROM (
            SELECT id, group_id, sender_id, body, created_at
            FROM messenger_group_messages
            WHERE group_id = $1
               AND ($4::text IS NULL OR EXISTS (
                 SELECT 1 FROM messenger_group_messages cursor
                 WHERE cursor.id = $4 AND cursor.group_id = $1
                   AND (messenger_group_messages.created_at < cursor.created_at
                        OR (messenger_group_messages.created_at = cursor.created_at
                            AND messenger_group_messages.id < cursor.id))
               ))
              AND EXISTS (
                SELECT 1 FROM messenger_group_members
                WHERE group_id = $1 AND user_id = $2
              )
             ORDER BY created_at DESC, id DESC
             LIMIT $3
          ) messages
          JOIN messenger_profiles profiles ON profiles.user_id = messages.sender_id
          ORDER BY messages.created_at, messages.id`,
    values: [groupId, userId, limit, beforeMessageId],
  };
}

export function buildVisibleStatusesReadQuery(userId: string) {
  return {
    sql: `SELECT s.id, s.author_id, author.display_name AS author_name,
                 s.body,
                 CASE WHEN s.author_id = $1 THEN s.audience_mode ELSE 'selected' END AS audience_mode,
                 s.created_at, s.expires_at, (s.author_id = $1) AS is_mine
          FROM messenger_status_updates s
          JOIN messenger_profiles author ON author.user_id = s.author_id
          WHERE s.expires_at > now()
            AND (s.author_id = $1 OR EXISTS (
              SELECT 1 FROM messenger_status_audience audience
              WHERE audience.status_id = s.id AND audience.user_id = $1
            ))
          ORDER BY s.created_at DESC, s.id
          LIMIT 100`,
    values: [userId],
  };
}
