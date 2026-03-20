"""
Build a consolidated CSV from the raw per-market data in data/raw/tradeData_datapack/tradeData/.

Each subdirectory btc5min_<ts> contains:
  - market.json    : Polymarket metadata + resolution
  - btc_prices.jsonl : second-by-second BTC/USD prices (Chainlink)
  - trades.jsonl   : individual trades on the market

Output: data/processed/btc_5m_full.csv  (one row per market)
"""

import json
import os
import sys
import csv
import numpy as np
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw" / "tradeData_datapack" / "tradeData"
OUT_PATH = ROOT / "data" / "processed" / "btc_5m_full.csv"

FIELDNAMES = [
    "slug",
    "event_timestamp",
    "event_datetime",
    "date",
    "hour",
    "minute",
    "day_of_week",
    # Resolution
    "winner",
    "winner_binary",
    # Market metadata
    "volume",
    "last_trade_price",
    "best_bid",
    "best_ask",
    "spread",
    "closed",
    # BTC price features
    "btc_open",
    "btc_close",
    "btc_high",
    "btc_low",
    "btc_return",
    "btc_volatility",
    "btc_range",
    # Trade features
    "n_trades",
    "n_unique_traders",
    "total_trade_size",
    "avg_trade_price",
    "up_buy_pct",
]


def load_jsonl(path: Path) -> list[dict]:
    rows = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def parse_market(market: dict) -> dict:
    """Extract resolution and metadata from market.json."""
    outcomes_raw = market.get("outcomes", "[]")
    prices_raw = market.get("outcomePrices", "[]")
    try:
        outcomes = json.loads(outcomes_raw) if isinstance(outcomes_raw, str) else (outcomes_raw or [])
    except json.JSONDecodeError:
        outcomes = []
    try:
        prices = json.loads(prices_raw) if isinstance(prices_raw, str) else (prices_raw or [])
    except json.JSONDecodeError:
        prices = []

    winner = ""
    if prices:
        try:
            float_prices = [float(p) for p in prices]
            max_idx = float_prices.index(max(float_prices))
            winner = outcomes[max_idx] if max_idx < len(outcomes) else ""
        except (ValueError, IndexError):
            pass

    vol = 0
    try:
        vol = float(market.get("volumeNum", 0) or market.get("volume", 0) or 0)
    except (ValueError, TypeError):
        pass

    return {
        "winner": winner,
        "winner_binary": 1 if winner == "Up" else (0 if winner == "Down" else ""),
        "volume": vol,
        "last_trade_price": market.get("lastTradePrice", ""),
        "best_bid": market.get("bestBid", ""),
        "best_ask": market.get("bestAsk", ""),
        "spread": market.get("spread", ""),
        "closed": market.get("closed", ""),
    }


def parse_btc_prices(prices: list[dict]) -> dict:
    """Compute BTC price features from second-by-second data."""
    if not prices:
        return {k: "" for k in ["btc_open", "btc_close", "btc_high", "btc_low",
                                 "btc_return", "btc_volatility", "btc_range"]}

    vals = [p["price"] for p in prices]
    btc_open = vals[0]
    btc_close = vals[-1]
    btc_high = max(vals)
    btc_low = min(vals)
    btc_return = (btc_close - btc_open) / btc_open if btc_open != 0 else 0

    if len(vals) > 1:
        arr = np.array(vals)
        log_returns = np.diff(np.log(arr))
        btc_volatility = float(np.std(log_returns))
    else:
        btc_volatility = 0.0

    btc_range = (btc_high - btc_low) / btc_open if btc_open != 0 else 0

    return {
        "btc_open": round(btc_open, 2),
        "btc_close": round(btc_close, 2),
        "btc_high": round(btc_high, 2),
        "btc_low": round(btc_low, 2),
        "btc_return": round(btc_return, 8),
        "btc_volatility": round(btc_volatility, 8),
        "btc_range": round(btc_range, 8),
    }


def parse_trades(trades: list[dict]) -> dict:
    """Compute trade-level features."""
    if not trades:
        return {
            "n_trades": 0,
            "n_unique_traders": 0,
            "total_trade_size": 0,
            "avg_trade_price": "",
            "up_buy_pct": "",
        }

    n_trades = len(trades)
    wallets = {t.get("proxyWallet", "") for t in trades}
    wallets.discard("")
    n_unique_traders = len(wallets)

    sizes = [float(t.get("size", 0)) for t in trades]
    prices = [float(t.get("price", 0)) for t in trades]
    total_trade_size = sum(sizes)
    avg_trade_price = sum(s * p for s, p in zip(sizes, prices)) / total_trade_size if total_trade_size > 0 else 0

    up_buys = sum(1 for t in trades if t.get("outcome") == "Up" and t.get("side") == "BUY")
    up_buy_pct = up_buys / n_trades if n_trades > 0 else 0

    return {
        "n_trades": n_trades,
        "n_unique_traders": n_unique_traders,
        "total_trade_size": round(total_trade_size, 4),
        "avg_trade_price": round(avg_trade_price, 4),
        "up_buy_pct": round(up_buy_pct, 4),
    }


def process_market_dir(dir_path: Path) -> dict | None:
    """Process a single btc5min_<ts> directory into one row."""
    folder_name = dir_path.name
    if not folder_name.startswith("btc5min_"):
        return None

    market_file = dir_path / "market.json"
    prices_file = dir_path / "btc_prices.jsonl"
    trades_file = dir_path / "trades.jsonl"

    if not market_file.exists():
        return None

    with open(market_file, "r", encoding="utf-8") as f:
        market = json.load(f)

    slug = market.get("slug", folder_name.replace("btc5min_", "btc-updown-5m-"))
    ts_str = folder_name.split("_")[1]
    event_ts = int(ts_str)
    dt = datetime.fromtimestamp(event_ts, tz=timezone.utc)

    row = {
        "slug": slug,
        "event_timestamp": event_ts,
        "event_datetime": dt.strftime("%Y-%m-%d %H:%M:%S UTC"),
        "date": dt.strftime("%Y-%m-%d"),
        "hour": dt.hour,
        "minute": dt.minute,
        "day_of_week": dt.strftime("%A"),
    }

    row.update(parse_market(market))

    btc_prices = load_jsonl(prices_file) if prices_file.exists() else []
    row.update(parse_btc_prices(btc_prices))

    trades = load_jsonl(trades_file) if trades_file.exists() else []
    row.update(parse_trades(trades))

    return row


def main():
    if not RAW_DIR.exists():
        print(f"Error: raw directory not found: {RAW_DIR}")
        sys.exit(1)

    dirs = sorted([d for d in RAW_DIR.iterdir() if d.is_dir() and d.name.startswith("btc5min_")])
    print(f"Found {len(dirs)} market directories")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    rows = []
    errors = 0
    for i, d in enumerate(dirs):
        try:
            row = process_market_dir(d)
            if row:
                rows.append(row)
        except Exception as e:
            errors += 1
            if errors <= 10:
                print(f"  Error in {d.name}: {e}")

        if (i + 1) % 1000 == 0 or (i + 1) == len(dirs):
            print(f"  Processed {i + 1}/{len(dirs)} ({len(rows)} ok, {errors} errors)", flush=True)

    rows.sort(key=lambda r: r["event_timestamp"])

    with open(OUT_PATH, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)

    print(f"\nSaved {len(rows)} rows to {OUT_PATH}")
    print(f"Errors: {errors}")

    if rows:
        ups = sum(1 for r in rows if r["winner"] == "Up")
        downs = sum(1 for r in rows if r["winner"] == "Down")
        vols = [r["volume"] for r in rows if isinstance(r["volume"], (int, float)) and r["volume"] > 0]
        print(f"\n{'='*50}")
        print(f"  Period:   {rows[0]['date']} to {rows[-1]['date']}")
        print(f"  Markets:  {len(rows)}")
        print(f"  Up:       {ups} ({ups/len(rows)*100:.1f}%)")
        print(f"  Down:     {downs} ({downs/len(rows)*100:.1f}%)")
        print(f"  Avg vol:  ${sum(vols)/len(vols):,.0f}" if vols else "  No volume data")
        print(f"  Total vol: ${sum(vols):,.0f}" if vols else "")


if __name__ == "__main__":
    main()
