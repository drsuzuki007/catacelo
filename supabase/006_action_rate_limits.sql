-- 匿名ユーザー別の対局操作レート制限。
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
  select count(*) into v_count from catacelo.action_events
    where player_id = auth.uid() and action = p_action and created_at >= now() - p_window;
  if v_count >= p_limit then raise exception 'rate_limited'; end if;
  insert into catacelo.action_events (player_id, action) values (auth.uid(), p_action);
end;
$$;

-- 直接の書込み経路を閉じ、全ての対局開始を検証可能なRPCへ集約する。
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
    exception when unique_violation then
      -- ルームコード衝突時だけ新しいコードを発行する。
    end;
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
    exception when unique_violation then
      -- ルームコード衝突時だけ新しいコードを発行する。
    end;
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
