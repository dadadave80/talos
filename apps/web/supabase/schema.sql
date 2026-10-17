-- Talos state. The chain is the truth: /evidence is rebuilt from diamond events; these rows hold what the chain
-- cannot (transcripts' hashes, toll settlement ids, labels, rate limits). Server-only (service key); RLS on, no
-- policies, so the anon key reads nothing.

create table if not exists attempts (
  id text primary key,                    -- a-000123
  ts timestamptz not null default now(),
  wallet text not null,                   -- lowercased
  wallet_label text not null check (wallet_label in ('external', 'team', 'synthetic')),
  account_kind text not null check (account_kind in ('embedded', 'eoa')),
  tier_requested text,
  toll_kind text not null check (toll_kind in ('facilitator', 'free')),
  toll_payment_id text,
  toll_status text check (toll_status in ('completed', 'pending', 'settle_failed')),
  toll_tx text,
  verdict text check (verdict in ('PAY', 'QUEUE', 'REFUSE')),
  reason text,
  reason_hash text,
  decision_hash text unique,
  commit_tx text,
  pay_tx text,
  queue_id bigint,
  model text,
  prompt_version text
);
create index if not exists attempts_wallet_ts on attempts (wallet, ts desc);

-- One row per operator-cycle action: merged PR -> payment, x402 bill -> receipt, sweep, escalation outcome.
create table if not exists ops (
  id bigint generated always as identity primary key,
  ts timestamptz not null default now(),
  kind text not null,                     -- contributor | vendor | sweep | escalation | cycle
  ref text,                               -- PR url, Exa settlement id, queue id
  decision_hash text,
  tx text,
  detail jsonb not null default '{}'
);
-- The cycle is idempotent: one row per PR ever paid or queued.
create unique index if not exists ops_contributor_ref on ops (ref) where kind = 'contributor';

-- Per-wallet daily counters (free attempts, messages). bump_counter is one atomic statement.
create table if not exists counters (
  wallet text not null,
  day date not null,
  kind text not null,                     -- free | msg
  n int not null default 0,
  primary key (wallet, day, kind)
);

create or replace function bump_counter(p_wallet text, p_kind text) returns int
language sql as $$
  insert into counters (wallet, day, kind, n) values (lower(p_wallet), current_date, p_kind, 1)
  on conflict (wallet, day, kind) do update set n = counters.n + 1
  returning n;
$$;

-- EIP-191 free-tier nonces: the primary key is the replay check.
create table if not exists nonces (
  wallet text not null,
  nonce text not null,
  used_at timestamptz not null default now(),
  primary key (wallet, nonce)
);

-- Per-wallet message spacing (1 per 20 s). Returns true and stamps the wallet only if the gap has passed.
create table if not exists last_message (
  wallet text primary key,
  at timestamptz not null
);

create or replace function take_slot(p_wallet text, p_gap_seconds int) returns boolean
language sql as $$
  with up as (
    insert into last_message (wallet, at) values (lower(p_wallet), now())
    on conflict (wallet) do update set at = now()
      where last_message.at <= now() - make_interval(secs => p_gap_seconds)
    returning 1
  )
  select exists (select 1 from up);
$$;

-- Hot commit-key nonce. One row; the update serialises concurrent senders. On any nonce error the sender calls
-- sync_hot_nonce with the chain's pending nonce and retries.
create table if not exists hot_nonce (
  address text primary key,
  next bigint not null
);

create or replace function take_hot_nonce(p_address text) returns bigint
language sql as $$
  update hot_nonce set next = next + 1 where address = lower(p_address) returning next - 1;
$$;

create or replace function sync_hot_nonce(p_address text, p_next bigint) returns void
language sql as $$
  insert into hot_nonce (address, next) values (lower(p_address), p_next)
  on conflict (address) do update set next = excluded.next; -- the chain's pending nonce is authoritative
$$;

alter table attempts enable row level security;
alter table ops enable row level security;
alter table counters enable row level security;
alter table nonces enable row level security;
alter table last_message enable row level security;
alter table hot_nonce enable row level security;

-- Diamond events, mirrored from the chain by lib/ledger/events.ts (Arc caps eth_getLogs below 10k blocks, so the
-- mirror is incremental). Rebuildable at any time by truncating and resetting the cursor to the deploy block.
create table if not exists chain_events (
  tx_hash text not null,
  log_index int not null,
  block bigint not null,
  name text not null,
  args jsonb not null,
  primary key (tx_hash, log_index)
);
create index if not exists chain_events_name on chain_events (name, block);

create table if not exists sync_cursor (
  vault text primary key,
  next_block bigint not null
);

alter table chain_events enable row level security;
alter table sync_cursor enable row level security;
