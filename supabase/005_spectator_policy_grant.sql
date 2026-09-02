-- 観戦RLSのEXISTS参照に必要な最小権限。
-- RLSにより、各ユーザーは自分の観戦登録だけを読み取れる。
grant select on table catacelo.game_spectators to authenticated;
