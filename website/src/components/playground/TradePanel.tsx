// One side (UP or DOWN) of the trading panel: qty input + presets +
// buy / sell / sell-all buttons + cost preview + transient feedback line.

import { useState } from 'react'
import { fmt } from './format'

interface Props {
  dir: 'up' | 'down'
  price: number
  balance: number
  held: number
  disabled: boolean
  onBuy: (qty: number) => void
  onSell: (qty: number) => void
}

const FLASH_MS = 2000

export default function TradePanel({ dir, price, balance, held, disabled, onBuy, onSell }: Props) {
  const [qty, setQty] = useState('')
  const [msg, setMsg] = useState('')

  const parsed = parseFloat(qty)
  const valid  = Number.isFinite(parsed) && parsed > 0
  const cost   = valid ? parsed * price : 0
  const canBuy = valid && cost <= balance
  const canSell = valid && parsed <= held
  const maxBuy = price > 0 ? Math.floor(balance / price) : 0

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), FLASH_MS) }

  const handleBuy = () => {
    if (!canBuy) { flash(cost > balance ? 'Not enough balance' : 'Enter a valid quantity'); return }
    onBuy(parsed); setQty(''); flash(`Bought ${fmt(parsed, 1)} ${dir.toUpperCase()} @ $${fmt(price, 4)}`)
  }
  const handleSell = () => {
    if (!canSell) { flash(parsed > held ? `You only hold ${fmt(held, 2)} tokens` : 'Enter a valid quantity'); return }
    onSell(parsed); setQty(''); flash(`Sold ${fmt(parsed, 1)} ${dir.toUpperCase()} @ $${fmt(price, 4)}`)
  }
  const handleSellAll = () => {
    if (held <= 0) { flash('No tokens held'); return }
    onSell(held); setQty(''); flash(`Sold all ${fmt(held, 2)} ${dir.toUpperCase()} @ $${fmt(price, 4)}`)
  }

  const isUp    = dir === 'up'
  const accent  = isUp ? 'text-green-400' : 'text-red-400'
  const bg      = isUp ? 'bg-green-400/10 border-green-400/30' : 'bg-red-400/10 border-red-400/30'
  const btnBuy  = isUp ? 'bg-green-600 hover:bg-green-500' : 'bg-red-600 hover:bg-red-500'
  const btnSell = 'bg-slate-600 hover:bg-slate-500'

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${bg}`}>
      <div className="flex items-center justify-between">
        <span className={`font-semibold text-sm ${accent}`}>{isUp ? '↑ UP' : '↓ DOWN'} token</span>
        <span className="text-xs text-muted">Price: <span className="text-white font-mono">${fmt(price, 4)}</span></span>
      </div>

      {/* Quantity input + quick presets */}
      <div className="flex gap-2">
        <input
          type="number" min="0" step="1" placeholder="Qty"
          value={qty} onChange={e => setQty(e.target.value)}
          disabled={disabled}
          className="flex-1 min-w-0 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-white placeholder-muted focus:outline-none focus:border-accent disabled:opacity-40"
        />
        {[10, 100].map(n => (
          <button key={n} onClick={() => setQty(String(n))} disabled={disabled}
            className="px-2 py-1 rounded-lg border border-border bg-surface text-xs text-muted hover:text-white hover:border-accent transition-colors disabled:opacity-30 shrink-0">
            {n}
          </button>
        ))}
        <button
          onClick={() => setQty(String(maxBuy))}
          disabled={disabled || maxBuy <= 0}
          title={`Max tokens you can buy at $${fmt(price, 4)}: ${maxBuy}`}
          className="px-2 py-1 rounded-lg border border-border bg-surface text-xs text-muted hover:text-white hover:border-accent transition-colors disabled:opacity-30 shrink-0"
        >
          max
        </button>
      </div>

      {valid && (
        <div className="text-xs text-muted">
          Cost: <span className="text-white">${fmt(cost, 2)}</span>
          {' · '}Payout: <span className={accent}>${fmt(parsed, 2)}</span>
          <span className="text-muted/70"> if {isUp ? '↑ UP' : '↓ DOWN'} wins</span>
        </div>
      )}

      {/* Buy / Sell / Sell All */}
      <div className="flex gap-2">
        <button onClick={handleBuy} disabled={disabled || !canBuy}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold text-white transition-colors disabled:opacity-30 ${btnBuy}`}>
          Buy
        </button>
        <button onClick={handleSell} disabled={disabled || !canSell}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold text-white transition-colors disabled:opacity-30 ${btnSell}`}>
          Sell
        </button>
        <button onClick={handleSellAll} disabled={disabled || held <= 0}
          className="rounded-lg px-3 py-2 text-xs font-semibold text-white bg-slate-700 hover:bg-slate-600 transition-colors disabled:opacity-30 shrink-0">
          All
        </button>
      </div>
      {msg && <p className="text-xs text-center text-muted animate-pulse">{msg}</p>}
    </div>
  )
}
