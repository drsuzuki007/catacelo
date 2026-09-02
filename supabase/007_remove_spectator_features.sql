-- 観戦リンク機能の廃止: クライアント削除に加えて、API・RLS・保存データも撤去する。
drop policy if exists "read_spectated_moves" on catacelo.moves;
drop policy if exists "read_spectated_games" on catacelo.games;
drop policy if exists "read_own_spectatorships" on catacelo.game_spectators;
revoke all on function catacelo.join_spectator(text) from authenticated;
drop function if exists catacelo.join_spectator(text);
drop table if exists catacelo.game_spectators;
alter table catacelo.games drop constraint if exists games_spectator_code_key;
alter table catacelo.games drop column if exists spectator_code;
delete from catacelo.action_events where action = 'join_spectator';
alter table catacelo.action_events drop constraint if exists action_events_action_check;
alter table catacelo.action_events add constraint action_events_action_check check (action in ('create_room', 'join_room', 'random_match'));
