-- Oscar Messaging: enforce unique normalized display names and phone lookup hashes.
-- Read-only preflight: list duplicate display-name keys before applying this migration.
-- SELECT normalized_key, count(*) AS duplicate_count, array_agg(user_id) AS users
-- FROM (
--   SELECT user_id, lower(btrim(regexp_replace(
--     translate(
--       translate(
--         regexp_replace(normalize(display_name, NFKC),
--           '[' || chr(8203) || '-' || chr(8207) || chr(8234) || '-' || chr(8238) ||
--           chr(8294) || '-' || chr(8297) || chr(65279) || ']', '', 'g'),
--         U&'\0640\064B\064C\064D\064E\064F\0650\0651\0652\0653\0654\0655\0656\0657\0658\0659\065A\065B\065C\065D\065E\065F\0670', ''),
--       U&'\0623\0625\0622\0671\0649\0629\0624\0626',
--       U&'\0627\0627\0627\0627\064A\0647\0648\064A'),
--     '[[:space:]]+', ' ', 'g'))) AS normalized_key
--   FROM messenger_profiles
-- ) AS normalized_names
-- GROUP BY normalized_key
-- HAVING count(*) > 1;
--
-- Read-only preflight: list duplicate non-null phone lookup hashes.
-- SELECT phone_lookup_hash, count(*) AS duplicate_count, array_agg(user_id) AS users
-- FROM messenger_profiles
-- WHERE phone_lookup_hash IS NOT NULL
-- GROUP BY phone_lookup_hash
-- HAVING count(*) > 1;
-- Apply only after reviewing both query results; do not apply automatically.

ALTER TABLE messenger_profiles
  ADD COLUMN IF NOT EXISTS display_name_key text;

UPDATE messenger_profiles
SET display_name_key = lower(btrim(regexp_replace(
  translate(
    translate(
      regexp_replace(normalize(display_name, NFKC),
        '[' || chr(8203) || '-' || chr(8207) || chr(8234) || '-' || chr(8238) ||
        chr(8294) || '-' || chr(8297) || chr(65279) || ']', '', 'g'),
      U&'\0640\064B\064C\064D\064E\064F\0650\0651\0652\0653\0654\0655\0656\0657\0658\0659\065A\065B\065C\065D\065E\065F\0670', ''),
    U&'\0623\0625\0622\0671\0649\0629\0624\0626',
    U&'\0627\0627\0627\0627\064A\0647\0648\064A'),
  '[[:space:]]+', ' ', 'g')))
WHERE display_name_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS messenger_profiles_display_name_key_uniq
  ON messenger_profiles (display_name_key)
  WHERE display_name_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS messenger_profiles_phone_lookup_hash_uniq
  ON messenger_profiles (phone_lookup_hash)
  WHERE phone_lookup_hash IS NOT NULL;
