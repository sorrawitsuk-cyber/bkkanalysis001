# Legacy Supabase migrations

Files in this directory predate the linked Supabase CLI migration history.
They are retained for audit and to document the legacy dashboard schema, but
must not be applied automatically.

The canonical linked-project migrations live in `supabase/migrations/` and use
the timestamp versions recorded by Supabase. Before reusing a legacy migration,
compare it with the remote schema and create a new timestamped, idempotent
migration for the required delta.
