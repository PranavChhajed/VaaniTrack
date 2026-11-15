-- Apply to an isolated beta database first. Does not alter anonymous diagnostics.
BEGIN;
CREATE SCHEMA IF NOT EXISTS account_private;
REVOKE ALL ON SCHEMA account_private FROM PUBLIC;

CREATE TABLE account_private.journal (
  account_id uuid NOT NULL,
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 200),
  revision bigint NOT NULL CHECK (revision > 0),
  data jsonb,
  deleted boolean NOT NULL DEFAULT false,
  channel text NOT NULL CHECK (channel IN ('app','whatsapp','import')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id,id),
  CHECK (deleted OR data IS NOT NULL)
);
CREATE TABLE account_private.operations (
  account_id uuid NOT NULL,
  id uuid NOT NULL,
  request_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id,id)
);
CREATE TABLE account_private.link_tokens (
  token_hash text PRIMARY KEY,
  account_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  sender text,
  consumed_at timestamptz
);
CREATE TABLE account_private.channels (
  account_id uuid PRIMARY KEY,
  sender text UNIQUE NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE account_private.incoming (
  id text PRIMARY KEY,
  sender text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE account_private.jobs (
  id text PRIMARY KEY REFERENCES account_private.incoming(id),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','working','done','failed')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  lease_token uuid,
  error_code text
);
CREATE INDEX jobs_available ON account_private.jobs(available_at) WHERE state IN ('pending','working');
CREATE TABLE account_private.outbox (
  id uuid PRIMARY KEY,
  incoming_id text NOT NULL REFERENCES account_private.incoming(id),
  sender text NOT NULL,
  payload jsonb NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','sent','unknown','failed')),
  provider_id text UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (incoming_id)
);
-- No browser role has access; authenticated API checks account ownership and
-- uses transaction-local identity. FORCE RLS also protects non-superuser owners.
ALTER TABLE account_private.journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_private.journal FORCE ROW LEVEL SECURITY;
CREATE POLICY account_owns_journal ON account_private.journal
  USING (account_id::text = current_setting('vaani.account_id',true))
  WITH CHECK (account_id::text = current_setting('vaani.account_id',true));
ALTER TABLE account_private.operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_private.operations FORCE ROW LEVEL SECURITY;
CREATE POLICY account_owns_operations ON account_private.operations
  USING (account_id::text = current_setting('vaani.account_id',true))
  WITH CHECK (account_id::text = current_setting('vaani.account_id',true));
ALTER TABLE account_private.link_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_private.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_private.incoming ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_private.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_private.outbox ENABLE ROW LEVEL SECURITY;
COMMIT;
