BEGIN;
ALTER TABLE account_private.channels ADD COLUMN review_all boolean NOT NULL DEFAULT true;
ALTER TABLE account_private.channels ADD COLUMN link_id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE TABLE account_private.captures (
  id uuid PRIMARY KEY,
  incoming_id text UNIQUE NOT NULL REFERENCES account_private.incoming(id),
  account_id uuid NOT NULL,
  state text NOT NULL CHECK (state IN ('review','saved','discarded','undone')),
  transcript text NOT NULL,
  rows jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE account_private.captures ENABLE ROW LEVEL SECURITY;
CREATE INDEX captures_account ON account_private.captures(account_id,created_at);
COMMIT;
