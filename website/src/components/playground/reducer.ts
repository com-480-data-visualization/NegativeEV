// Reducer + session constants for the trading playground.

import type { Action, GameState } from './types'

// Hard cap on the number of markets a single session can replay (matches
// the slider's upper bound). The actual cap is min(this, events.length).
export const SESSION_MAX = 50
export const STARTING_BALANCE = 100

// Fisher-Yates: returns a freshly shuffled COPY so the original array
// (and any external reference to it) stays untouched. Used by
// `start_session` to randomise the play order every run.
export function shuffled<T>(arr: readonly T[]): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export const INITIAL: GameState = {
  events: [], gameIdx: 0, tick: 0,
  balance: STARTING_BALANCE, upQty: 0, downQty: 0,
  nTrades: 0,
  phase: 'loading', resolution: null,
  // Default session: 20 markets, full insight. Same defaults the setup card
  // lands on, so a user who clicks Start without touching the controls gets
  // the pedagogical version.
  maxMarkets: 20, mode: 'full',
}

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {

    case 'init':
      // Loaded events arrive: drop the user on the setup screen. We don't
      // auto-start; the user picks the count and difficulty mode first.
      return { ...state, events: action.events, phase: 'config' }

    case 'tick': {
      if (state.phase !== 'playing') return state
      const next = state.tick + 1
      if (next > 299) {
        // Market over - resolve outcome from actual price movement.
        const ev = state.events[state.gameIdx]
        const firstPrice = ev.seconds[0]?.btc_price ?? 0
        const lastPrice  = ev.seconds[ev.seconds.length - 1]?.btc_price ?? 0
        const winUp = lastPrice > firstPrice
        const payout = winUp ? state.upQty : state.downQty
        return {
          ...state,
          balance: state.balance + payout,
          upQty: 0,
          downQty: 0,
          phase: 'resolved',
          resolution: {
            winner: winUp ? 'UP' : 'DOWN',
            winTokens: winUp ? state.upQty : state.downQty,
            loseTokens: winUp ? state.downQty : state.upQty,
            payout,
          },
        }
      }
      return { ...state, tick: next }
    }

    case 'buy': {
      if (state.phase !== 'playing') return state
      const cost = action.qty * action.price
      if (cost <= 0 || cost > state.balance) return state
      return {
        ...state,
        balance: state.balance - cost,
        upQty:   action.dir === 'up'   ? state.upQty   + action.qty : state.upQty,
        downQty: action.dir === 'down' ? state.downQty + action.qty : state.downQty,
        nTrades: state.nTrades + 1,
      }
    }

    case 'sell': {
      if (state.phase !== 'playing') return state
      const held = action.dir === 'up' ? state.upQty : state.downQty
      if (action.qty <= 0 || action.qty > held) return state
      return {
        ...state,
        balance: state.balance + action.qty * action.price,
        upQty:   action.dir === 'up'   ? state.upQty   - action.qty : state.upQty,
        downQty: action.dir === 'down' ? state.downQty - action.qty : state.downQty,
        nTrades: state.nTrades + 1,
      }
    }

    case 'next_market': {
      // End of the bounded session: stop instead of looping back to idx 0.
      // The summary overlay reads balance / nTrades / maxMarkets / mode
      // from this same state, so we don't reset anything here.
      const nextIdx = state.gameIdx + 1
      if (nextIdx >= state.maxMarkets || nextIdx >= state.events.length) {
        return { ...state, phase: 'finished', resolution: null }
      }
      return {
        ...state,
        gameIdx: nextIdx,
        tick: 0,
        phase: 'playing',
        resolution: null,
      }
    }

    case 'start_session':
      // Wipes prior session state (balance / qty / trades) so each run
      // starts clean, and pins the chosen difficulty for the duration.
      // The events pool is reshuffled here so two consecutive sessions
      // never replay the same markets in the same order - keeps the
      // experience fresh on Play again / Restart.
      return {
        ...state,
        events: shuffled(state.events),
        gameIdx: 0,
        tick: 0,
        balance: STARTING_BALANCE,
        upQty: 0,
        downQty: 0,
        nTrades: 0,
        resolution: null,
        phase: 'playing',
        maxMarkets: action.maxMarkets,
        mode: action.mode,
      }

    case 'restart_to_config':
      // Same wipe as start_session but lands on the config screen instead
      // of playing. We keep `maxMarkets` and `mode` so the setup card
      // remembers the user's last choice without forcing them to re-pick.
      return {
        ...state,
        gameIdx: 0,
        tick: 0,
        balance: STARTING_BALANCE,
        upQty: 0,
        downQty: 0,
        nTrades: 0,
        resolution: null,
        phase: 'config',
      }

    default:
      return state
  }
}
