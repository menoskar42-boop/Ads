# Ads database backups

The Ads database is backed up outside PostgreSQL as a PostgreSQL custom-format
dump. The application never includes the password in the `pg_dump` command
line; it passes it through `PGPASSWORD` to the child process.

## Scheduled backups

When `ADS_DATABASE_URL` is configured, the main Ads process checks every 15
minutes and creates one verified dump per Cairo calendar day after
`ADS_BACKUP_HOUR` (default `03:00`).

Backups are written to `ADS_BACKUP_DIR` (default `backups/ads`) and the newest
`ADS_BACKUP_RETENTION` dumps are kept (default `7`). Each dump has a JSON
manifest with its byte count, SHA-256 digest, archive-entry count, date, and
`pg_dump` version. Set `ADS_BACKUP_DIR` to a persistent mounted directory or
separate backup volume in the deployment; do not point it at `public/` or a
database data directory.

Supabase URLs using the transaction pooler are automatically changed to the
Session Pooler port for `pg_dump`. The project includes PostgreSQL 17 tooling,
which is required for the PostgreSQL 17 Supabase server.

## Manual checks

```sh
npm run ads:backup:list
npm run ads:backup:verify -- backups/ads/ads-2026-09-17.dump
npm run ads:backup:restore-help
```

`verify` checks that the file is non-empty, its SHA-256 matches the manifest,
and PostgreSQL can read the custom archive table of contents. It does not
change the database.

## Restore

Restore is deliberately supervised because it replaces live data. Stop the
application, take a fresh backup of the current target, verify the chosen
archive, and then follow the commands printed by:

```sh
npm run ads:backup:restore-help
```

Use PostgreSQL 17 `pg_restore`, the Supabase Session Pooler, `--schema=public`,
and `--no-owner --no-acl`. Start the application only after the restore
finishes, then verify the home page and the public table count.