/**
 * Design: 「盤上の工房」— 対局データは盤面の明快さを損なわない最小の語彙で扱う。
 */

export type Color = 1 | 2;
export type GameStatus = "waiting" | "playing" | "finished" | "aborted";
export type MoveKind = "place" | "move" | "pass" | "resign";
export type PlayMode = "place" | "move";

export interface GameRecord {
  id: string;
  room_code: string;
  status: GameStatus;
  host_player_id: string;
  guest_player_id: string | null;
  host_nickname: string;
  guest_nickname: string | null;
  board_state: string;
  current_turn: Color;
  move_count: number;
  pass_streak: number;
  winner: 0 | Color | null;
  rematch_game_id: string | null;
  last_move_at: string;
  created_at: string;
}

export interface MoveRecord {
  id: number;
  game_id: string;
  move_number: number;
  player_color: Color;
  move_type: MoveKind;
  from_pos: number | null;
  to_pos: number | null;
  board_after: string;
  created_at: string;
}

export interface PresencePlayer {
  playerId: string;
  nickname: string;
  color: Color | null;
  onlineAt: string;
}
