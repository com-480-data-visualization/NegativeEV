// Shared types for the trading playground.

import type { PlaygroundMode } from '../PlaygroundSetup'

export interface SecondData {
  time_remaining: number
  second: number
  btc_price: number
  btc_pct_change: number
  yes_price: number   // UP token price  (0–1)
  no_price: number    // DOWN token price (0–1)
}

export interface EventData {
  index: number
  event_timestamp: number
  slug: string
  winner: string
  winner_binary: number   // 1 = UP wins, 0 = DOWN wins
  seconds: SecondData[]   // sorted by second, length = 300
}

export interface Resolution {
  winner: 'UP' | 'DOWN'
  winTokens: number
  loseTokens: number
  payout: number
}

// Session lifecycle:
//   loading  - waiting for the JSON to come back
//   config   - events loaded, user has not started a session yet (or just
//              clicked Restart / Play again). Setup overlay is on top.
//   playing  - active round, tick timer is running
//   resolved - round just ended, 3.5 s win/lose overlay before auto-advance
//   finished - the last round of the session has resolved. Summary overlay
//              is on top, content behind it is blurred.
export type GamePhase = 'loading' | 'config' | 'playing' | 'resolved' | 'finished'

export interface GameState {
  events: EventData[]
  gameIdx: number
  tick: number          // 0–299 (current second index)
  balance: number
  upQty: number
  downQty: number
  nTrades: number       // cumulative buy + sell count over the current session
  phase: GamePhase
  resolution: Resolution | null
  // Session parameters chosen on the setup screen.
  maxMarkets: number             // 5–SESSION_MAX (capped by events.length)
  mode: PlaygroundMode           // blind / no-verdict / full
}

export type Action =
  | { type: 'init'; events: EventData[] }
  | { type: 'tick' }
  | { type: 'buy'; dir: 'up' | 'down'; qty: number; price: number }
  | { type: 'sell'; dir: 'up' | 'down'; qty: number; price: number }
  | { type: 'next_market' }
  | { type: 'start_session'; maxMarkets: number; mode: PlaygroundMode }
  | { type: 'restart_to_config' }
