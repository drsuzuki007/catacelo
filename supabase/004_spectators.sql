-- 観戦専用リンクと閲覧権限
alter table catacelo.games add column if not exists spectator_code text;
update catacelo.games
set spectator_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
where spectator_code is null;
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

create policy "read_own_spectatorships" on catacelo.game_spectators for select to authenticated
  using (spectator_id = auth.uid());

create policy "read_spectated_games" on catacelo.games for select to authenticated
  using (exists (select 1 from catacelo.game_spectators s where s.game_id = games.id and s.spectator_id = auth.uid()));

create policy "read_spectated_moves" on catacelo.moves for select to authenticated
  using (exists (select 1 from catacelo.game_spectators s where s.game_id = moves.game_id and s.spectator_id = auth.uid()));

create or replace function catacelo.join_spectator(p_spectator_code text)
returns catacelo.games language plpgsql security definer set search_path = catacelo, public as $$
declare v_game catacelo.games;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_spectator_code !~ '^[A-Z0-9]{6}$' then raise exception 'invalid_spectator_code'; end if;
  select * into v_game from catacelo.games where spectator_code = upper(p_spectator_code);
  if not found then raise exception 'spectator_link_not_found'; end if;
  insert into catacelo.game_spectators (game_id, spectator_id)
  values (v_game.id, auth.uid()) on conflict (game_id, spectator_id) do nothing;
  return v_game;
end;
$$;

revoke all on function catacelo.join_spectator(text) from public;
grant execute on function catacelo.join_spectator(text) to authenticated;
