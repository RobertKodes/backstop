-- BACKSTOP indexer schema. All amounts are raw base units (numeric).
-- Idempotency: event-derived rows are keyed by (signature, event_index);
-- state rows carry `updated_slot` and are only overwritten by newer slots.

create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now());

create table if not exists cursors (
  source text primary key,
  slot bigint not null,
  signature text,
  updated_at timestamptz not null default now()
);

create table if not exists raw_events (
  signature text not null,
  event_index int not null,
  slot bigint not null,
  block_time timestamptz,
  program text not null,
  name text not null,
  data jsonb not null,
  primary key (signature, event_index)
);
create index if not exists raw_events_slot on raw_events (slot);
create index if not exists raw_events_name on raw_events (name, slot);

create table if not exists markets (
  mint text primary key,
  quote_mint text,
  parent text,
  governance text,
  supply numeric,
  created_at timestamptz,
  updated_slot bigint not null default 0
);

create table if not exists offers (
  offer text primary key,
  mint text not null,
  id bigint not null,
  seller text not null,
  amount numeric not null,
  lots int not null,
  lot_size numeric not null,
  lot_cost numeric not null,
  twap numeric not null,
  fill_price numeric not null,
  discount_bps int not null,
  momentum_bps bigint not null,
  seller_lot_tenure numeric not null,
  message text,
  created_at timestamptz not null,
  expires_at timestamptz not null,
  status text not null default 'open',
  total_capacity numeric not null default 0,
  rand_slot bigint,
  closed_early boolean,
  shield_lots int,
  bidder_lots int,
  random_offset numeric,
  seed text,
  proceeds numeric,
  fee numeric,
  seller_net numeric,
  remainder_tokens numeric,
  remainder_proceeds numeric,
  ticket_amount numeric,
  settled_at timestamptz,
  closed_at timestamptz,
  updated_slot bigint not null default 0
);
create index if not exists offers_mint_status on offers (mint, status, expires_at);
create index if not exists offers_seller on offers (seller);

create table if not exists bids (
  bid text primary key,
  offer text not null,
  mint text not null,
  bidder text not null,
  kind smallint not null,
  amount numeric not null,
  capacity numeric not null,
  prefix numeric not null,
  created_at timestamptz not null,
  signature text not null
);
create index if not exists bids_offer on bids (offer);
create index if not exists bids_bidder on bids (bidder);

create table if not exists fills (
  bid text primary key,
  offer text not null,
  mint text not null,
  bidder text not null,
  kind smallint not null,
  lots numeric not null,
  tokens numeric not null,
  cost numeric not null,
  refund numeric not null,
  tenure_credited numeric not null,
  ts timestamptz not null,
  signature text not null
);
create index if not exists fills_bidder on fills (mint, bidder);

create table if not exists chests (
  mint text not null,
  owner text not null,
  balance numeric not null default 0,
  lock_until timestamptz,
  updated_at timestamptz,
  updated_slot bigint not null default 0,
  primary key (mint, owner)
);

create table if not exists chest_events (
  signature text not null,
  event_index int not null,
  mint text not null,
  owner text not null,
  kind smallint not null,
  assets numeric not null,
  shares_delta numeric not null,
  penalty numeric not null,
  balance_after numeric not null,
  lock_until timestamptz,
  ts timestamptz not null,
  primary key (signature, event_index)
);
create index if not exists chest_events_owner on chest_events (mint, owner, ts);

create table if not exists grants (
  mint text not null,
  owner text not null,
  enabled boolean not null,
  max_per_offer numeric not null,
  max_per_day numeric not null,
  min_discount_bps int not null,
  reserve_floor numeric not null,
  updated_slot bigint not null default 0,
  primary key (mint, owner)
);

create table if not exists holders (
  mint text not null,
  wallet text not null,
  registered_at timestamptz,
  last_reset timestamptz,
  balance numeric,
  updated_slot bigint not null default 0,
  primary key (mint, wallet)
);

create table if not exists tenure_snapshots (
  mint text not null,
  wallet text not null,
  ts timestamptz not null,
  balance numeric not null,
  tenure numeric not null,
  multiplier_bps int not null,
  primary key (mint, wallet, ts)
);
create index if not exists tenure_snapshots_latest on tenure_snapshots (mint, ts desc);

create table if not exists tenure_credits (
  signature text not null,
  event_index int not null,
  mint text not null,
  wallet text not null,
  credited numeric not null,
  ts timestamptz not null,
  primary key (signature, event_index)
);

create table if not exists prices (
  signature text not null,
  event_index int not null,
  mint text not null,
  ts timestamptz not null,
  side smallint not null,
  trader text not null,
  base_amount numeric not null,
  quote_amount numeric not null,
  fee numeric not null,
  base_reserve numeric not null,
  quote_reserve numeric not null,
  price numeric not null,
  primary key (signature, event_index)
);
create index if not exists prices_mint_ts on prices (mint, ts);

create table if not exists fee_distributions (
  signature text not null,
  event_index int not null,
  mint text not null,
  amount numeric not null,
  to_chests numeric not null,
  to_shield numeric not null,
  to_treasury numeric not null,
  to_parent numeric not null,
  ts timestamptz not null,
  primary key (signature, event_index)
);

create table if not exists fee_swaps (
  signature text not null,
  event_index int not null,
  mint text not null,
  kind smallint not null,
  amount_in numeric not null,
  amount_out numeric not null,
  oracle_min_out numeric not null,
  ts timestamptz not null,
  primary key (signature, event_index)
);

create table if not exists treasury (
  signature text not null,
  event_index int not null,
  mint text not null,
  ts timestamptz not null,
  treasury_lamports numeric not null,
  circulating numeric not null,
  floor_price numeric not null,
  primary key (signature, event_index)
);
create index if not exists treasury_mint_ts on treasury (mint, ts);

create table if not exists redemptions (
  signature text not null,
  event_index int not null,
  mint text not null,
  wallet text not null,
  tokens numeric not null,
  gross_lamports numeric not null,
  fee_lamports numeric not null,
  net_lamports numeric not null,
  treasury_lamports_after numeric not null,
  circulating_before numeric not null,
  ts timestamptz not null,
  primary key (signature, event_index)
);

create table if not exists shield_events (
  signature text not null,
  event_index int not null,
  mint text not null,
  kind text not null,
  offer text,
  lots numeric,
  quote numeric,
  tokens numeric,
  total_deposits_after numeric,
  ts timestamptz not null,
  primary key (signature, event_index)
);

create table if not exists shield_positions (
  mint text not null,
  owner text not null,
  id int not null,
  principal numeric not null,
  multiplier_bps int not null,
  lock_end timestamptz not null,
  claimed_tokens numeric not null default 0,
  claimed_rewards numeric not null default 0,
  status text not null,
  updated_slot bigint not null default 0,
  primary key (mint, owner, id)
);

create table if not exists tickets (
  mint text not null,
  seller text not null,
  offer_id bigint not null,
  amount numeric not null,
  remaining numeric not null,
  expires_at timestamptz not null,
  updated_slot bigint not null default 0,
  primary key (mint, seller, offer_id)
);

create table if not exists yield_events (
  signature text not null,
  event_index int not null,
  mint text not null,
  kind smallint not null,
  amount numeric not null,
  adapter_value numeric not null,
  idle_assets numeric not null,
  ts timestamptz not null,
  primary key (signature, event_index)
);

create table if not exists param_changes (
  signature text not null,
  event_index int not null,
  mint text not null,
  param text not null,
  old_value numeric,
  new_value numeric,
  by text not null,
  agent boolean not null,
  ts timestamptz,
  primary key (signature, event_index)
);

create table if not exists governance_actions (
  signature text not null,
  event_index int not null,
  mint text not null,
  kind text not null,
  action_id bigint,
  payload jsonb,
  ts timestamptz,
  primary key (signature, event_index)
);

create table if not exists child_tokens (
  mint text primary key,
  parent text not null,
  creator text not null,
  name text not null,
  symbol text not null,
  uri text,
  supply numeric not null,
  creator_bps int not null,
  liquidity numeric not null,
  vesting_end timestamptz,
  status text not null,
  created_at timestamptz not null,
  updated_slot bigint not null default 0
);

-- Written by the keeper (audit log) and the agent service.
create table if not exists keeper_runs (
  id bigserial primary key,
  job text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  ok boolean,
  signature text,
  pre_state_hash text,
  post_state_hash text,
  detail jsonb,
  error text
);
create index if not exists keeper_runs_job on keeper_runs (job, started_at desc);

create table if not exists agent_posts (
  id bigserial primary key,
  mint text not null,
  created_at timestamptz not null default now(),
  kind text not null,
  body text not null,
  snapshot jsonb not null,
  proposals jsonb not null default '[]',
  actions jsonb not null default '[]',
  posted_to_x boolean not null default false,
  x_post_id text
);
create index if not exists agent_posts_mint on agent_posts (mint, created_at desc);
