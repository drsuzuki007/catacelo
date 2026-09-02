/**
 * Design: 「盤上の工房」— UIから独立した盤面規則。既存版の完成済みロジックを対戦用に移植する。
 */
import type { Color, MoveKind } from "./types";

export const SIZE = 8;
export const EMPTY = 0;
export const BLACK: Color = 1;
export const WHITE: Color = 2;
export const DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
] as const;

export type Board = number[];
export interface GameMove {
  type: Extract<MoveKind, "place" | "move">;
  from?: number;
  to: number;
  flips: number[];
}

export function opp(color: Color): Color {
  return color === BLACK ? WHITE : BLACK;
}

export function idx(row: number, col: number): number {
  return row * SIZE + col;
}

export function createInitialBoard(): Board {
  const board = Array<number>(64).fill(EMPTY);
  board[idx(3, 3)] = WHITE;
  board[idx(4, 4)] = WHITE;
  board[idx(3, 4)] = BLACK;
  board[idx(4, 3)] = BLACK;
  return board;
}

export function boardToString(board: Board): string {
  return board.join("");
}

export function boardFromString(value: string): Board {
  if (!/^[012]{64}$/.test(value)) return createInitialBoard();
  return value.split("").map(Number);
}

/** 既存版の flipsAt をそのまま移植し、空マスに対する反転対象を返す。 */
export function flipsAt(board: Board, pos: number, color: Color): number[] | null {
  if (board[pos] !== EMPTY) return null;
  const row0 = pos >> 3;
  const col0 = pos & 7;
  let flips: number[] | null = null;

  for (const [dr, dc] of DIRS) {
    let row = row0 + dr;
    let col = col0 + dc;
    let line: number[] | null = null;
    while (row >= 0 && row < SIZE && col >= 0 && col < SIZE) {
      const position = idx(row, col);
      const value = board[position];
      if (value === EMPTY) {
        line = null;
        break;
      }
      if (value === color) break;
      (line ??= []).push(position);
      row += dr;
      col += dc;
    }
    if (line && row >= 0 && row < SIZE && col >= 0 && col < SIZE && board[idx(row, col)] === color) {
      (flips ??= []).push(...line);
    }
  }
  return flips;
}

export function genPlacements(board: Board, color: Color, out: GameMove[]): void {
  for (let pos = 0; pos < 64; pos += 1) {
    if (board[pos] !== EMPTY) continue;
    const flips = flipsAt(board, pos, color);
    if (flips) out.push({ type: "place", to: pos, flips });
  }
}

export function genMoveMoves(board: Board, color: Color, out: GameMove[]): void {
  const working = board.slice();
  for (let from = 0; from < 64; from += 1) {
    if (working[from] !== color) continue;
    working[from] = EMPTY;
    for (let to = 0; to < 64; to += 1) {
      if (to === from || working[to] !== EMPTY) continue;
      const flips = flipsAt(working, to, color);
      if (flips) out.push({ type: "move", from, to, flips });
    }
    working[from] = color;
  }
}

export function genAllMoves(board: Board, color: Color): GameMove[] {
  const moves: GameMove[] = [];
  genPlacements(board, color, moves);
  genMoveMoves(board, color, moves);
  return moves;
}

export function applyMove(board: Board, move: GameMove, color: Color): Board {
  const next = board.slice();
  if (move.type === "move" && move.from !== undefined) next[move.from] = EMPTY;
  next[move.to] = color;
  move.flips.forEach((position) => { next[position] = color; });
  return next;
}

export function countDiscs(board: Board): [number, number, number] {
  let black = 0;
  let white = 0;
  let empty = 0;
  board.forEach((value) => {
    if (value === BLACK) black += 1;
    else if (value === WHITE) white += 1;
    else empty += 1;
  });
  return [black, white, empty];
}

export function getWinner(board: Board): 0 | Color {
  const [black, white] = countDiscs(board);
  if (black === white) return 0;
  return black > white ? BLACK : WHITE;
}

export function isTerminal(board: Board, passStreak: number): boolean {
  const [, , empty] = countDiscs(board);
  return empty === 0 || passStreak >= 2 || (genAllMoves(board, BLACK).length === 0 && genAllMoves(board, WHITE).length === 0);
}

export function posName(pos: number): string {
  return `${String.fromCharCode(97 + (pos & 7))}${(pos >> 3) + 1}`;
}
