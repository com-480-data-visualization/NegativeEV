"""
Export 50 sequential 5-minute markets for the website trading playground.

Each event has 300 seconds indexed by time_remaining (300 → 0).
Per second: btc_price, btc_pct_change, yes_price, no_price (sum = 1).

Picks the last N complete markets from the most recent POOL_SIZE candidates
(sequential by event_timestamp). The frontend should loop when the list ends.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
PARQUET = ROOT / "data/processed/btc_5m_timeseries.parquet"
FULL_CSV = ROOT / "data/processed/btc_5m_full.csv"
OUT_JSON = ROOT / "website/public/data/playground_events.json"

N_EVENTS = 50
POOL_SIZE = 1000  # look at last 1000 chronologically ordered markets
SECONDS = 300


def main() -> None:
    full = pd.read_csv(
        FULL_CSV,
        usecols=["event_timestamp", "winner", "winner_binary", "slug"],
    ).sort_values("event_timestamp")

    pool = full.tail(POOL_SIZE)["event_timestamp"].tolist()

    ts = pd.read_parquet(PARQUET, engine="fastparquet")
    ts = ts[ts["event_timestamp"].isin(pool)]
    ts = ts.dropna(subset=["btc_price", "btc_pct_change", "implied_prob"])
    ts["yes_price"] = ts["implied_prob"].astype(float)
    ts["no_price"] = (1.0 - ts["yes_price"]).astype(float)
    ts["time_remaining"] = (SECONDS - ts["second"]).astype(int)

    meta = full.set_index("event_timestamp")

    complete: list[int] = []
    for et in pool:
        block = ts[ts["event_timestamp"] == et]
        if len(block) != SECONDS:
            continue
        if block["second"].nunique() != SECONDS:
            continue
        complete.append(et)

    selected = complete[-N_EVENTS:]
    if len(selected) < N_EVENTS:
        raise SystemExit(
            f"Only {len(selected)} complete markets in last {POOL_SIZE}; need {N_EVENTS}."
        )

    events = []
    for i, et in enumerate(selected):
        block = ts[ts["event_timestamp"] == et].sort_values("second")
        row = meta.loc[et]
        events.append(
            {
                "index": i,
                "event_timestamp": int(et),
                "slug": str(row["slug"]),
                "winner": str(row["winner"]),
                "winner_binary": int(row["winner_binary"]),
                "seconds": [
                    {
                        "time_remaining": int(r.time_remaining),
                        "second": int(r.second),
                        "btc_price": round(float(r.btc_price), 2),
                        "btc_pct_change": round(float(r.btc_pct_change), 6),
                        "yes_price": round(float(r.yes_price), 4),
                        "no_price": round(float(r.no_price), 4),
                    }
                    for r in block.itertuples(index=False)
                ],
            }
        )

    payload = {
        "version": 1,
        "loop": True,
        "n_events": len(events),
        "seconds_per_event": SECONDS,
        "description": (
            "Sequential replay markets for playground. "
            "time_remaining=300 is round open; 0 is resolution."
        ),
        "events": events,
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT_JSON.relative_to(ROOT)}")
    print(f"  events: {len(events)}")
    print(f"  first: {events[0]['slug']}")
    print(f"  last:  {events[-1]['slug']}")
    print(f"  size:  {OUT_JSON.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
