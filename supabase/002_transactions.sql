-- Phase C — transaction mirroring + audio retention
--
-- localStorage stays the fast local cache; this is the durable copy. Scoped to
-- an anonymous device_id, with no accounts and no cross-device sync, because
-- the brief warns against turning this into an authentication project.

create table if not exists transactions (
  id          uuid primary key,          -- the app's own Transaction.id
  device_id   uuid not null,
  -- Which utterance produced this. Null for rows created before observability,
  -- or edited into existence by hand.
  capture_id  uuid references captures(id) on delete set null,

  -- The whole Transaction as the app holds it, provenance included.
  data        jsonb not null,

  -- Denormalised for querying without unpacking jsonb every time.
  amount      numeric,
  txn_date    date,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Soft delete. A deleted transaction is a signal about where trust broke,
  -- so the row survives the user removing it from their journal.
  deleted_at  timestamptz
);

create index if not exists transactions_device_idx  on transactions (device_id, txn_date desc);
create index if not exists transactions_capture_idx on transactions (capture_id);
create index if not exists transactions_live_idx    on transactions (device_id) where deleted_at is null;

alter table transactions enable row level security;

-- Consent and retention live on the capture, since consent is given per device
-- but enforced per recording.
alter table captures add column if not exists audio_consent    boolean;
alter table captures add column if not exists audio_expires_at timestamptz;

create index if not exists captures_audio_expiry_idx
  on captures (audio_expires_at) where audio_stored = true;
