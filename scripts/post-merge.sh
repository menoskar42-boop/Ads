#!/bin/bash
set -e
pnpm install --frozen-lockfile
# ⛔ مفيش `pnpm --filter db push` هنا: القاعدة دى هى قاعدة OscarDevs الحية، وتعديلات جداول الماسنجر بتتعمل بملفات
# lib/db/migrations/*.sql (ALTER/CREATE IF NOT EXISTS) بموافقة المالك — مش أوتوماتيك بعد كل merge.
