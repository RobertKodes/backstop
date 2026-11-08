-- AI treasury agent: run log and governance proposals.

alter table agent_posts add column if not exists run_id bigint;
alter table agent_posts add column if not exists model text;

create table if not exists agent_runs (
  id bigserial primary key,
  mint text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  ok boolean,
  dry_run boolean not null default true,
  requested_model text,
  served_model text,
  request_id text,
  prompt_version text,
  input_tokens int,
  output_tokens int,
  cache_read_tokens int,
  -- "refusal" | "max_tokens" | "unparsed" | "api" | "chain" | "store" | null
  error_code text,
  error text,
  post_id bigint
);
create index if not exists agent_runs_mint on agent_runs (mint, started_at desc);

-- Proposals the agent may not execute itself (not agent-tunable or outside
-- the on-chain bounds). Reviewed by governance; never applied automatically.
create table if not exists agent_proposals (
  id bigserial primary key,
  mint text not null,
  run_id bigint,
  post_id bigint,
  created_at timestamptz not null default now(),
  param text not null,
  current_value numeric,
  proposed_value numeric not null,
  bound_min numeric,
  bound_max numeric,
  tunable boolean not null,
  reason text not null,
  rationale text not null,
  -- open | accepted | rejected | superseded
  status text not null default 'open',
  resolved_at timestamptz,
  resolved_by text
);
create index if not exists agent_proposals_open on agent_proposals (mint, status, created_at desc);
