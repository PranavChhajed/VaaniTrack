-- VaaniTrack — persistence + observability schema (Phase C1)
--
-- The point of these tables is not storage. It is being able to answer, for a
-- single wrong expense: WHERE in the pipeline did this go wrong?
--
--   audio -> ASR -> transcript -> extraction -> confidence gate -> user action
--
-- Storing only the final transaction tells you what happened, never where it
-- broke. Each stage below is recorded separately so the stages can be blamed
-- independently.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- captures: one row per utterance (spoken or typed)
-- ---------------------------------------------------------------------------
create table if not exists captures (
  id            uuid primary key default gen_random_uuid(),
  device_id     uuid        not null,
  created_at    timestamptz not null default now(),
  source        text        not null check (source in ('voice','manual')),

  -- Audio. All null for typed captures, which skip stages 1 entirely.
  -- audio_stored stays false unless the user consented to retention, so the
  -- metrics below can exist for every capture while the recording does not.
  audio_mime    text,
  audio_bytes   integer,
  audio_ms      integer,
  audio_stored  boolean     not null default false,
  audio_path    text,

  -- Stage 1 — ASR.
  asr_model      text,
  transcript     text,
  asr_verdict    text check (asr_verdict in (
                   'accepted',
                   'rejected_too_small',
                   'rejected_no_speech',
                   'rejected_denylist',
                   'rejected_no_amount',
                   'skipped_typed',
                   'error')),
  asr_reason     text,
  -- Whisper's mean avg_logprob. NEGATIVE by nature: a good capture scores
  -- about -0.27, the gate's threshold is -0.9. Not a 0-1 probability.
  avg_logprob    real,
  no_speech_prob real,

  -- Stage 2 — extraction.
  extract_model text,
  extract_raw   jsonb,
  extract_error text,
  extract_ms    integer,

  app_version   text
);

create index if not exists captures_device_time_idx on captures (device_id, created_at desc);
create index if not exists captures_time_idx        on captures (created_at desc);
create index if not exists captures_verdict_idx     on captures (asr_verdict);

-- ---------------------------------------------------------------------------
-- capture_transactions: one capture -> N transactions
--
-- Extraction rule 5 splits a multi-expense utterance into separate entries
-- ("250 lunch and 80 chai" is two transactions), so this cannot be a column
-- on captures.
-- ---------------------------------------------------------------------------
create table if not exists capture_transactions (
  id             uuid primary key default gen_random_uuid(),
  capture_id     uuid    not null references captures(id) on delete cascade,
  idx            integer not null,
  -- The app's own Transaction.id, so a row in the journal can be traced back
  -- to the utterance that produced it.
  transaction_id uuid,

  -- The full ExtractedTransaction, provenance included.
  extracted      jsonb   not null,

  gate_outcome   text    not null check (gate_outcome in ('auto_saved','review')),
  -- WHICH gate conditions failed, not a score. The gate is four independent
  -- checks (heardWell, needsConfirmation, amount present, amount said), and
  -- "why did this go to review" is unanswerable without knowing which one.
  gate_failed    text[]  not null default '{}',

  created_at     timestamptz not null default now(),
  unique (capture_id, idx)
);

create index if not exists capture_tx_capture_idx on capture_transactions (capture_id);
create index if not exists capture_tx_txid_idx    on capture_transactions (transaction_id);
create index if not exists capture_tx_outcome_idx on capture_transactions (gate_outcome);

-- ---------------------------------------------------------------------------
-- capture_events: what the user did afterwards
--
-- Undo, edit and delete all destroy evidence in the app's own storage. These
-- rows are written BEFORE that happens, and before_state keeps the model's
-- original output so a correction can be compared against what was proposed.
-- ---------------------------------------------------------------------------
create table if not exists capture_events (
  id             uuid primary key default gen_random_uuid(),
  capture_id     uuid references captures(id) on delete set null,
  transaction_id uuid,
  device_id      uuid        not null,
  at             timestamptz not null default now(),
  action         text        not null check (action in (
                   'auto_saved',
                   'review_saved',
                   'review_discarded',
                   'undone',
                   'edited',
                   'deleted')),
  before_state   jsonb,
  after_state    jsonb,
  changed_fields text[]
);

create index if not exists capture_events_capture_idx on capture_events (capture_id);
create index if not exists capture_events_txid_idx    on capture_events (transaction_id);
create index if not exists capture_events_time_idx    on capture_events (at desc);
create index if not exists capture_events_action_idx  on capture_events (action);

-- ---------------------------------------------------------------------------
-- RLS on, no policies: deny-by-default for the publishable key.
--
-- Every write here happens server-side with the secret key, which bypasses
-- RLS. So if the publishable key ever reaches client code by accident, none
-- of this is readable. One privileged path, everything else closed.
-- ---------------------------------------------------------------------------
alter table captures             enable row level security;
alter table capture_transactions enable row level security;
alter table capture_events       enable row level security;
