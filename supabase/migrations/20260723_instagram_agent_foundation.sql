-- Instagram agent foundation
-- Additive and idempotent. Safe to apply to an existing Character Studio database.

CREATE TABLE IF NOT EXISTS public.chs_ig_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','processed','ignored','failed')),
  attempts integer NOT NULL DEFAULT 0,
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.chs_ig_contacts (
  ig_scoped_user_id text PRIMARY KEY,
  username text,
  language text,
  stopped boolean NOT NULL DEFAULT false,
  fanvue_mentioned_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chs_ig_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_message_id text UNIQUE,
  contact_id text REFERENCES public.chs_ig_contacts(ig_scoped_user_id) ON DELETE SET NULL,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  source_type text NOT NULL CHECK (source_type IN ('dm','comment','comment_reply','private_reply')),
  text_content text,
  media_id text,
  comment_id text,
  parent_comment_id text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chs_ig_agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_event_id uuid REFERENCES public.chs_ig_webhook_events(id) ON DELETE SET NULL,
  contact_id text REFERENCES public.chs_ig_contacts(ig_scoped_user_id) ON DELETE SET NULL,
  intent text,
  risk_level text,
  should_reply boolean NOT NULL DEFAULT false,
  should_mention_fanvue boolean NOT NULL DEFAULT false,
  generated_reply text,
  sent boolean NOT NULL DEFAULT false,
  dry_run boolean NOT NULL DEFAULT true,
  model text,
  api_response jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chs_ig_webhook_events_status_received_idx
  ON public.chs_ig_webhook_events(status, received_at DESC);
CREATE INDEX IF NOT EXISTS chs_ig_messages_contact_created_idx
  ON public.chs_ig_messages(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chs_ig_messages_comment_idx
  ON public.chs_ig_messages(comment_id) WHERE comment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS chs_ig_agent_runs_event_idx
  ON public.chs_ig_agent_runs(webhook_event_id);
CREATE INDEX IF NOT EXISTS chs_ig_agent_runs_contact_created_idx
  ON public.chs_ig_agent_runs(contact_id, created_at DESC);
