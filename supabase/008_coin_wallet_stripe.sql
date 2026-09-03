-- =============================================================================
-- Catacelo コインウォレット（Stripe 課金対応）
--   - 前払式支払手段としてのコインをサーバー側で管理する。
--   - 有効期限は購入から 150 日（利用規約・特商法表示と一致させること）。
--   - 「ロット」単位で残高を持ち、期限の近いロットから消費する（FIFO）。
--   - 付与は Stripe Webhook からのみ（service_role 経由）。
--     クライアントは残高照会と消費のみ可能。
-- 適用方法: Supabase SQL Editor でこのファイル全体を一度だけ実行する。
-- =============================================================================

create schema if not exists catacelo;
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- コインロット: 1回の購入／付与 = 1レコード
-- -----------------------------------------------------------------------------
create table if not exists catacelo.coin_lots (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  source            text not null check (source in ('purchase', 'bonus', 'adjustment')),
  coins_total       integer not null check (coins_total > 0),
  coins_remaining   integer not null check (coins_remaining >= 0),
  amount_jpy        integer,                      -- 実際に決済された金額（購入以外は null）
  stripe_session_id text unique,                  -- 冪等性キー。同じセッションで二重付与しない
  expires_at        timestamptz not null,
  created_at        timestamptz not null default now(),
  constraint coin_lots_remaining_le_total check (coins_remaining <= coins_total)
);

create index if not exists coin_lots_user_active_idx
  on catacelo.coin_lots (user_id, expires_at)
  where coins_remaining > 0;

-- -----------------------------------------------------------------------------
-- 消費・付与の監査ログ
-- -----------------------------------------------------------------------------
create table if not exists catacelo.coin_ledger (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  delta       integer not null,                   -- 付与は正、消費は負
  reason      text   not null,                    -- 'purchase' / 'bonus' / 'comeback_move' / 'hint' など
  lot_id      uuid,
  created_at  timestamptz not null default now()
);

create index if not exists coin_ledger_user_created_idx
  on catacelo.coin_ledger (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Stripe 決済セッションの記録（Webhook 到達前の突合・調査用）
-- -----------------------------------------------------------------------------
create table if not exists catacelo.stripe_checkouts (
  session_id  text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  status      text not null default 'created' check (status in ('created', 'paid', 'failed', 'expired')),
  amount_jpy  integer,
  coins       integer,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- RLS: 本人の記録のみ読み取り可。書き込みは全て RPC / service_role 経由。
-- -----------------------------------------------------------------------------
alter table catacelo.coin_lots        enable row level security;
alter table catacelo.coin_ledger      enable row level security;
alter table catacelo.stripe_checkouts enable row level security;

drop policy if exists "read_own_coin_lots" on catacelo.coin_lots;
create policy "read_own_coin_lots" on catacelo.coin_lots
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "read_own_coin_ledger" on catacelo.coin_ledger;
create policy "read_own_coin_ledger" on catacelo.coin_ledger
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "read_own_checkouts" on catacelo.stripe_checkouts;
create policy "read_own_checkouts" on catacelo.stripe_checkouts
  for select to authenticated using (user_id = auth.uid());

grant usage on schema catacelo to anon, authenticated;
grant select on catacelo.coin_lots, catacelo.coin_ledger, catacelo.stripe_checkouts to authenticated;

-- =============================================================================
-- RPC
-- =============================================================================

-- 残高照会（期限切れロットは除外）
create or replace function catacelo.get_coin_balance()
returns integer
language sql
security definer
set search_path = catacelo, public
as $$
  select coalesce(sum(coins_remaining), 0)::integer
  from catacelo.coin_lots
  where user_id = auth.uid()
    and coins_remaining > 0
    and expires_at > now();
$$;

-- 残高の内訳（期限が近い順。UI で「◯月◯日に◯コイン失効」を出すため）
create or replace function catacelo.get_coin_lots()
returns table (coins_remaining integer, expires_at timestamptz)
language sql
security definer
set search_path = catacelo, public
as $$
  select l.coins_remaining, l.expires_at
  from catacelo.coin_lots l
  where l.user_id = auth.uid()
    and l.coins_remaining > 0
    and l.expires_at > now()
  order by l.expires_at asc;
$$;

-- コイン消費。期限の近いロットから引く。残高不足なら例外。
create or replace function catacelo.spend_coins(p_amount integer, p_reason text)
returns integer
language plpgsql
security definer
set search_path = catacelo, public
as $$
declare
  v_user      uuid := auth.uid();
  v_balance   integer;
  v_remaining integer := p_amount;
  v_take      integer;
  v_lot       record;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid amount' using errcode = '22023';
  end if;
  if p_reason is null or p_reason not in ('comeback_move', 'hint') then
    raise exception 'invalid reason' using errcode = '22023';
  end if;

  -- 対象ロットを行ロックして同時消費を防ぐ
  select coalesce(sum(coins_remaining), 0)::integer into v_balance
  from catacelo.coin_lots
  where user_id = v_user and coins_remaining > 0 and expires_at > now()
  for update;

  if v_balance < p_amount then
    raise exception 'insufficient coins: balance=% required=%', v_balance, p_amount
      using errcode = 'P0001';
  end if;

  for v_lot in
    select id, coins_remaining
    from catacelo.coin_lots
    where user_id = v_user and coins_remaining > 0 and expires_at > now()
    order by expires_at asc, created_at asc
  loop
    exit when v_remaining <= 0;
    v_take := least(v_lot.coins_remaining, v_remaining);

    update catacelo.coin_lots
      set coins_remaining = coins_remaining - v_take
      where id = v_lot.id;

    insert into catacelo.coin_ledger (user_id, delta, reason, lot_id)
      values (v_user, -v_take, p_reason, v_lot.id);

    v_remaining := v_remaining - v_take;
  end loop;

  return v_balance - p_amount;
end;
$$;

-- 初回スターターボーナス（1ユーザー1回だけ）
create or replace function catacelo.grant_starter_bonus(p_coins integer default 5)
returns integer
language plpgsql
security definer
set search_path = catacelo, public
as $$
declare
  v_user uuid := auth.uid();
  v_lot  uuid;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if exists (select 1 from catacelo.coin_lots where user_id = v_user and source = 'bonus') then
    return catacelo.get_coin_balance();
  end if;

  insert into catacelo.coin_lots (user_id, source, coins_total, coins_remaining, expires_at)
    values (v_user, 'bonus', p_coins, p_coins, now() + interval '150 days')
    returning id into v_lot;

  insert into catacelo.coin_ledger (user_id, delta, reason, lot_id)
    values (v_user, p_coins, 'bonus', v_lot);

  return catacelo.get_coin_balance();
end;
$$;

-- =============================================================================
-- service_role 専用: Stripe Webhook からの付与（冪等）
--   同じ stripe_session_id では二重に付与されない。
-- =============================================================================
create or replace function catacelo.credit_purchase(
  p_user_id           uuid,
  p_stripe_session_id text,
  p_coins             integer,
  p_amount_jpy        integer
)
returns integer
language plpgsql
security definer
set search_path = catacelo, public
as $$
declare
  v_lot uuid;
begin
  if p_user_id is null or p_stripe_session_id is null or p_coins is null or p_coins <= 0 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;

  insert into catacelo.coin_lots
    (user_id, source, coins_total, coins_remaining, amount_jpy, stripe_session_id, expires_at)
  values
    (p_user_id, 'purchase', p_coins, p_coins, p_amount_jpy, p_stripe_session_id, now() + interval '150 days')
  on conflict (stripe_session_id) do nothing
  returning id into v_lot;

  if v_lot is not null then
    insert into catacelo.coin_ledger (user_id, delta, reason, lot_id)
      values (p_user_id, p_coins, 'purchase', v_lot);
  end if;

  update catacelo.stripe_checkouts
    set status = 'paid', amount_jpy = p_amount_jpy, coins = p_coins, updated_at = now()
    where session_id = p_stripe_session_id;

  return (
    select coalesce(sum(coins_remaining), 0)::integer
    from catacelo.coin_lots
    where user_id = p_user_id and coins_remaining > 0 and expires_at > now()
  );
end;
$$;

revoke all on function catacelo.credit_purchase(uuid, text, integer, integer) from public, anon, authenticated;

grant execute on function catacelo.get_coin_balance()                     to authenticated;
grant execute on function catacelo.get_coin_lots()                        to authenticated;
grant execute on function catacelo.spend_coins(integer, text)             to authenticated;
grant execute on function catacelo.grant_starter_bonus(integer)           to authenticated;
grant execute on function catacelo.credit_purchase(uuid, text, integer, integer) to service_role;
