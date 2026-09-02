-- Catacelo リモート対人戦: 完全セットアップSQL
-- 実行前に Supabase Dashboard → Settings → API → Exposed schemas へ
-- 「catacelo」を追加してください。Authentication では Anonymous Sign-Ins を有効にします。

create schema if not exists catacelo;
create extension if not exists pgcrypto;

grant usage on schema catacelo to anon, authenticated;

create table if not exists catacelo.games (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique check (room_code ~ '^[A-Z0-9]{6}$'),
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished', 'aborted')),
  host_player_id uuid not null references auth.users(id) on delete restrict,
  guest_player_id uuid references auth.users(id) on delete restrict,
  host_nickname text not null check (char_length(host_nickname) between 1 and 20),
  guest_nickname text check (guest_nickname is null or char_length(guest_nickname) between 1 and 20),
  board_state text not null check (board_state ~ '^[012]{64}$'),
  current_turn smallint not null default 1 check (current_turn in (1, 2)),
  move_count integer not null default 0 check (move_count >= 0),
  pass_streak smallint not null default 0 check (pass_streak between 0 and 2),
  winner smallint check (winner is null or winner in (0, 1, 2)),
  rematch_game_id uuid references catacelo.games(id) on delete set null,
  last_move_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint games_player_pair_check check (host_player_id is distinct from guest_player_id),
  constraint games_status_pair_check check (
    (status = 'waiting' and guest_player_id is null and guest_nickname is null)
    or (status in ('playing', 'finished', 'aborted') and guest_player_id is not null and guest_nickname is not null)
  )
);

create table if not exists catacelo.moves (
  id bigint generated always as identity primary key,
  game_id uuid not null references catacelo.games(id) on delete cascade,
  move_number integer not null check (move_number > 0),
  player_color smallint not null check (player_color in (1, 2)),
  move_type text not null check (move_type in ('place', 'move', 'pass', 'resign')),
  from_pos smallint check (from_pos is null or from_pos between 0 and 63),
  to_pos smallint check (to_pos is null or to_pos between 0 and 63),
  board_after text not null check (board_after ~ '^[012]{64}$'),
  created_at timestamptz not null default now(),
  unique (game_id, move_number),
  constraint moves_shape_check check (
    (move_type = 'place' and from_pos is null and to_pos is not null)
    or (move_type = 'move' and from_pos is not null and to_pos is not null and from_pos <> to_pos)
    or (move_type in ('pass', 'resign') and from_pos is null and to_pos is null)
  )
);

create index if not exists catacelo_games_waiting_created_idx on catacelo.games (created_at) where status = 'waiting';
create index if not exists catacelo_moves_game_number_idx on catacelo.moves (game_id, move_number);

alter table catacelo.games enable row level security;
alter table catacelo.moves enable row level security;

-- 認証済み匿名ユーザーは自分が作成した待機局だけを直接作成できる。
create policy "create_own_waiting_game" on catacelo.games for insert to authenticated
  with check (auth.uid() = host_player_id and guest_player_id is null and status = 'waiting');
create policy "read_participating_games" on catacelo.games for select to authenticated
  using (auth.uid() = host_player_id or auth.uid() = guest_player_id);
create policy "read_participating_moves" on catacelo.moves for select to authenticated
  using (exists (select 1 from catacelo.games g where g.id = game_id and (auth.uid() = g.host_player_id or auth.uid() = g.guest_player_id)));

-- テーブル権限はAPI利用に必要な範囲だけ付与し、状態変更は下記security definer RPCに限定する。
grant select, insert, update on catacelo.games to authenticated;
grant select, insert, update on catacelo.moves to authenticated;
grant usage, select on sequence catacelo.moves_id_seq to authenticated;

alter table catacelo.games replica identity full;
alter table catacelo.moves replica identity full;
alter publication supabase_realtime add table catacelo.games, catacelo.moves;

create or replace function catacelo.join_room(p_room_code text, p_nickname text)
returns catacelo.games language plpgsql security definer set search_path = catacelo, public as $$
declare v_game catacelo.games;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_room_code !~ '^[A-Z0-9]{6}$' then raise exception 'invalid_room_code'; end if;
  if char_length(trim(p_nickname)) not between 1 and 20 then raise exception 'invalid_nickname'; end if;
  select * into v_game from catacelo.games where room_code = upper(p_room_code) for update;
  if not found or v_game.status <> 'waiting' or v_game.guest_player_id is not null then raise exception 'room_unavailable'; end if;
  if v_game.host_player_id = auth.uid() then raise exception 'host_cannot_join'; end if;
  update catacelo.games set guest_player_id = auth.uid(), guest_nickname = trim(p_nickname), status = 'playing' where id = v_game.id returning * into v_game;
  return v_game;
end;
$$;

create or replace function catacelo.find_or_create_random_game(p_nickname text)
returns catacelo.games language plpgsql security definer set search_path = catacelo, public as $$
declare v_game catacelo.games; v_code text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(trim(p_nickname)) not between 1 and 20 then raise exception 'invalid_nickname'; end if;
  select * into v_game from catacelo.games where status = 'waiting' and guest_player_id is null and host_player_id <> auth.uid() order by created_at asc for update skip locked limit 1;
  if found then
    update catacelo.games set guest_player_id = auth.uid(), guest_nickname = trim(p_nickname), status = 'playing' where id = v_game.id returning * into v_game;
    return v_game;
  end if;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    begin
      insert into catacelo.games (room_code, status, host_player_id, host_nickname, board_state, current_turn, move_count, pass_streak)
      values (v_code, 'waiting', auth.uid(), trim(p_nickname), '0000000000000000000000000002100000012000000000000000000000000000', 1, 0, 0)
      returning * into v_game;
      return v_game;
    exception when unique_violation then
      -- ルームコード衝突時のみ生成をやり直す。
    end;
  end loop;
end;
$$;

create or replace function catacelo.submit_move(
  p_game_id uuid, p_expected_move_number integer, p_move_type text,
  p_from_pos smallint, p_to_pos smallint, p_board_after text
)
returns catacelo.games language plpgsql security definer set search_path = catacelo, public as $$
declare
  v_game catacelo.games; v_color smallint; v_next_turn smallint; v_pass_streak smallint;
  v_finished boolean := false; v_winner smallint := null; v_black integer; v_white integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_move_type not in ('place', 'move', 'pass', 'resign') then raise exception 'invalid_move_type'; end if;
  if p_board_after !~ '^[012]{64}$' then raise exception 'invalid_board_state'; end if;
  select * into v_game from catacelo.games where id = p_game_id for update;
  if not found then raise exception 'game_not_found'; end if;
  if v_game.status <> 'playing' then raise exception 'game_not_playing'; end if;
  v_color := case when auth.uid() = v_game.host_player_id then 1 when auth.uid() = v_game.guest_player_id then 2 else null end;
  if v_color is null then raise exception 'not_a_player'; end if;
  if p_expected_move_number <> v_game.move_count + 1 then raise exception 'invalid_move_number'; end if;
  if p_move_type <> 'resign' and v_game.current_turn <> v_color then raise exception 'not_your_turn'; end if;
  if p_move_type = 'place' and (p_from_pos is not null or p_to_pos is null) then raise exception 'invalid_place_shape'; end if;
  if p_move_type = 'move' and (p_from_pos is null or p_to_pos is null or p_from_pos = p_to_pos) then raise exception 'invalid_move_shape'; end if;
  if p_move_type in ('pass', 'resign') and (p_from_pos is not null or p_to_pos is not null) then raise exception 'invalid_pass_shape'; end if;
  v_pass_streak := case when p_move_type = 'pass' then v_game.pass_streak + 1 else 0 end;
  v_next_turn := case when v_color = 1 then 2 else 1 end;
  if p_move_type = 'resign' then
    v_finished := true; v_winner := v_next_turn;
  elsif v_pass_streak >= 2 or position('0' in p_board_after) = 0 then
    v_finished := true;
    v_black := length(p_board_after) - length(replace(p_board_after, '1', ''));
    v_white := length(p_board_after) - length(replace(p_board_after, '2', ''));
    v_winner := case when v_black = v_white then 0 when v_black > v_white then 1 else 2 end;
  end if;
  insert into catacelo.moves (game_id, move_number, player_color, move_type, from_pos, to_pos, board_after)
  values (p_game_id, p_expected_move_number, v_color, p_move_type, p_from_pos, p_to_pos, p_board_after);
  update catacelo.games set board_state = p_board_after, current_turn = v_next_turn, move_count = p_expected_move_number,
    pass_streak = v_pass_streak, status = case when v_finished then 'finished' else 'playing' end, winner = v_winner, last_move_at = now()
  where id = p_game_id returning * into v_game;
  return v_game;
end;
$$;

create or replace function catacelo.claim_timeout_win(p_game_id uuid)
returns catacelo.games language plpgsql security definer set search_path = catacelo, public as $$
declare v_game catacelo.games; v_color smallint;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_game from catacelo.games where id = p_game_id for update;
  if not found or v_game.status <> 'playing' then raise exception 'game_not_playing'; end if;
  v_color := case when auth.uid() = v_game.host_player_id then 1 when auth.uid() = v_game.guest_player_id then 2 else null end;
  if v_color is null then raise exception 'not_a_player'; end if;
  if v_game.current_turn = v_color then raise exception 'your_turn_is_active'; end if;
  if now() - v_game.last_move_at < interval '5 minutes' then raise exception 'timeout_not_reached'; end if;
  update catacelo.games set status = 'finished', winner = v_color, last_move_at = now() where id = p_game_id returning * into v_game;
  return v_game;
end;
$$;

create or replace function catacelo.create_rematch(p_game_id uuid)
returns catacelo.games language plpgsql security definer set search_path = catacelo, public as $$
declare v_source catacelo.games; v_created catacelo.games; v_code text;
begin
  select * into v_source from catacelo.games where id = p_game_id for update;
  if not found then raise exception 'game_not_found'; end if;
  if auth.uid() is null or auth.uid() not in (v_source.host_player_id, v_source.guest_player_id) then raise exception 'not_a_player'; end if;
  if v_source.status not in ('finished', 'aborted') then raise exception 'game_not_finished'; end if;
  if v_source.rematch_game_id is not null then select * into v_created from catacelo.games where id = v_source.rematch_game_id; return v_created; end if;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    begin
      insert into catacelo.games (room_code, status, host_player_id, guest_player_id, host_nickname, guest_nickname, board_state, current_turn, move_count, pass_streak)
      values (v_code, 'playing', v_source.host_player_id, v_source.guest_player_id, v_source.host_nickname, v_source.guest_nickname, '0000000000000000000000000002100000012000000000000000000000000000', 1, 0, 0)
      returning * into v_created;
      exit;
    exception when unique_violation then
      -- ルームコード衝突時のみ生成をやり直す。
    end;
  end loop;
  update catacelo.games set rematch_game_id = v_created.id where id = v_source.id;
  return v_created;
end;
$$;

revoke all on function catacelo.join_room(text, text) from public;
revoke all on function catacelo.find_or_create_random_game(text) from public;
revoke all on function catacelo.submit_move(uuid, integer, text, smallint, smallint, text) from public;
revoke all on function catacelo.claim_timeout_win(uuid) from public;
revoke all on function catacelo.create_rematch(uuid) from public;
grant execute on function catacelo.join_room(text, text) to authenticated;
grant execute on function catacelo.find_or_create_random_game(text) to authenticated;
grant execute on function catacelo.submit_move(uuid, integer, text, smallint, smallint, text) to authenticated;
grant execute on function catacelo.claim_timeout_win(uuid) to authenticated;
grant execute on function catacelo.create_rematch(uuid) to authenticated;

-- 観戦専用リンクと閲覧権限
alter table catacelo.games add column if not exists spectator_code text;
update catacelo.games set spectator_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)) where spectator_code is null;
alter table catacelo.games alter column spectator_code set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
alter table catacelo.games alter column spectator_code set not null;
alter table catacelo.games add constraint games_spectator_code_key unique (spectator_code);

create table if not exists catacelo.game_spectators (
  game_id uuid not null references catacelo.games(id) on delete cascade,
  spectator_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (game_id, spectator_id)
);
alter table catacelo.game_spectators enable row level security;
grant select on table catacelo.game_spectators to authenticated;
create policy "read_own_spectatorships" on catacelo.game_spectators for select to authenticated using (spectator_id = auth.uid());
create policy "read_spectated_games" on catacelo.games for select to authenticated using (exists (select 1 from catacelo.game_spectators s where s.game_id = games.id and s.spectator_id = auth.uid()));
create policy "read_spectated_moves" on catacelo.moves for select to authenticated using (exists (select 1 from catacelo.game_spectators s where s.game_id = moves.game_id and s.spectator_id = auth.uid()));

create or replace function catacelo.join_spectator(p_spectator_code text)
returns catacelo.games language plpgsql security definer set search_path = catacelo, public as $$
declare v_game catacelo.games;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_spectator_code !~ '^[A-Z0-9]{6}$' then raise exception 'invalid_spectator_code'; end if;
  select * into v_game from catacelo.games where spectator_code = upper(p_spectator_code);
  if not found then raise exception 'spectator_link_not_found'; end if;
  insert into catacelo.game_spectators (game_id, spectator_id) values (v_game.id, auth.uid()) on conflict (game_id, spectator_id) do nothing;
  return v_game;
end;
$$;
revoke all on function catacelo.join_spectator(text) from public;
grant execute on function catacelo.join_spectator(text) to authenticated;

-- Turnstileを使わない匿名利用の補助保護: ユーザー別の対局操作レート制限
create table if not exists catacelo.action_events (
  id bigint generated always as identity primary key,
  player_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('create_room', 'join_room', 'random_match', 'join_spectator')),
  created_at timestamptz not null default now()
);
create index if not exists action_events_player_action_created_idx on catacelo.action_events (player_id, action, created_at desc);
alter table catacelo.action_events enable row level security;

create or replace function catacelo.enforce_action_rate_limit(p_action text, p_limit integer, p_window interval)
returns void language plpgsql security definer set search_path = catacelo, public as $$
declare v_count integer;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select count(*) into v_count from catacelo.action_events where player_id = auth.uid() and action = p_action and created_at >= now() - p_window;
  if v_count >= p_limit then raise exception 'rate_limited'; end if;
  insert into catacelo.action_events (player_id, action) values (auth.uid(), p_action);
end;
$$;

drop policy if exists "create_own_waiting_game" on catacelo.games;
revoke insert, update on catacelo.games from authenticated;
revoke insert, update on catacelo.moves from authenticated;

create or replace function catacelo.create_room(p_nickname text)
returns catacelo.games language plpgsql security definer set search_path = catacelo, public as $$
declare v_game catacelo.games; v_code text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(trim(p_nickname)) not between 1 and 20 then raise exception 'invalid_nickname'; end if;
  perform catacelo.enforce_action_rate_limit('create_room', 6, interval '10 minutes');
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    begin
      insert into catacelo.games (room_code, status, host_player_id, host_nickname, board_state, current_turn, move_count, pass_streak)
      values (v_code, 'waiting', auth.uid(), trim(p_nickname), '0000000000000000000000000002100000012000000000000000000000000000', 1, 0, 0)
      returning * into v_game;
      return v_game;
    exception when unique_violation then end;
  end loop;
end;
$$;

create or replace function catacelo.join_room(p_room_code text, p_nickname text)
returns catacelo.games language plpgsql security definer set search_path = catacelo, public as $$
declare v_game catacelo.games;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_room_code !~ '^[A-Z0-9]{6}$' then raise exception 'invalid_room_code'; end if;
  if char_length(trim(p_nickname)) not between 1 and 20 then raise exception 'invalid_nickname'; end if;
  perform catacelo.enforce_action_rate_limit('join_room', 12, interval '10 minutes');
  select * into v_game from catacelo.games where room_code = upper(p_room_code) for update;
  if not found or v_game.status <> 'waiting' or v_game.guest_player_id is not null then raise exception 'room_unavailable'; end if;
  if v_game.host_player_id = auth.uid() then raise exception 'host_cannot_join'; end if;
  update catacelo.games set guest_player_id = auth.uid(), guest_nickname = trim(p_nickname), status = 'playing' where id = v_game.id returning * into v_game;
  return v_game;
end;
$$;

create or replace function catacelo.find_or_create_random_game(p_nickname text)
returns catacelo.games language plpgsql security definer set search_path = catacelo, public as $$
declare v_game catacelo.games; v_code text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(trim(p_nickname)) not between 1 and 20 then raise exception 'invalid_nickname'; end if;
  perform catacelo.enforce_action_rate_limit('random_match', 6, interval '10 minutes');
  select * into v_game from catacelo.games where status = 'waiting' and guest_player_id is null and host_player_id <> auth.uid() order by created_at asc for update skip locked limit 1;
  if found then
    update catacelo.games set guest_player_id = auth.uid(), guest_nickname = trim(p_nickname), status = 'playing' where id = v_game.id returning * into v_game;
    return v_game;
  end if;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    begin
      insert into catacelo.games (room_code, status, host_player_id, host_nickname, board_state, current_turn, move_count, pass_streak)
      values (v_code, 'waiting', auth.uid(), trim(p_nickname), '0000000000000000000000000002100000012000000000000000000000000000', 1, 0, 0)
      returning * into v_game;
      return v_game;
    exception when unique_violation then end;
  end loop;
end;
$$;

create or replace function catacelo.join_spectator(p_spectator_code text)
returns catacelo.games language plpgsql security definer set search_path = catacelo, public as $$
declare v_game catacelo.games;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_spectator_code !~ '^[A-Z0-9]{6}$' then raise exception 'invalid_spectator_code'; end if;
  perform catacelo.enforce_action_rate_limit('join_spectator', 20, interval '10 minutes');
  select * into v_game from catacelo.games where spectator_code = upper(p_spectator_code);
  if not found then raise exception 'spectator_link_not_found'; end if;
  insert into catacelo.game_spectators (game_id, spectator_id) values (v_game.id, auth.uid()) on conflict (game_id, spectator_id) do nothing;
  return v_game;
end;
$$;
revoke all on function catacelo.create_room(text) from public;
revoke all on function catacelo.enforce_action_rate_limit(text, integer, interval) from public;
grant execute on function catacelo.create_room(text) to authenticated;
grant execute on function catacelo.join_room(text, text) to authenticated;
grant execute on function catacelo.find_or_create_random_game(text) to authenticated;
grant execute on function catacelo.join_spectator(text) to authenticated;
