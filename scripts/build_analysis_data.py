#!/usr/bin/env python3
"""Build JSON data files consumed by the NegativeEV website.

Reads:
  data/processed/btc_5m_timeseries.parquet  – per-second prices, drives event aggregation
  data/processed/btc_5m_full.csv            – per-market summary (volume + trade counts)

Writes (under website/public/data/):
  btc_distribution.json   hourly_heatmap.json     markov.json
  daily_volume.json       trades_per_market.json  volume_vs_change.json
  hero_stats.json         calibration_curves.json

UP/DOWN labelling uses the official `winner_binary` column from the
per-second parquet (same source as the calibration tooling), so the
hero stats match the EDA notebook and every chart agrees on outcomes.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd

# Windows consoles default to cp1252 which can't encode Δ / arrows.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# ── Config ────────────────────────────────────────────────────────────────────
PARQUET     = Path("data/processed/btc_5m_timeseries.parquet")
MARKET_CSV  = Path("data/processed/btc_5m_full.csv")
OUT_DIR     = Path("website/public/data")

# Narrow distribution (focused on the bulk of the distribution).
HIST_LO     = -0.55
HIST_HI     =  0.55
N_BINS      = 60

# Wide distribution (fat-tails view).
WIDE_LO     = -3.0
WIDE_HI     =  3.0
WIDE_BINS   = 80

# Scatter payload cap. Kept low to keep network payload small.
SCATTER_MAX = 3000

# Trades-per-market histogram buckets (right-edge inclusive, last bucket open).
TRADE_EDGES = [0, 100, 500, 1000, 1500, 2000, 2500, 3000]
TRADE_LABELS = ["1-100", "101-500", "501-1000", "1001-1500",
                "1501-2000", "2001-2500", "2501-3000", "3000+"]

# Calibration curves: per-second snapshots at four moments in a 5-minute market.
# Each snapshot is binned by implied price and we plot the empirical UP rate
# against the average implied price per bucket - i.e. one reliability curve
# per checkpoint. The 0/120/240/299 spread mirrors the notebook EDA.
CAL_CHECKPOINTS = [
    (0,   "5 min remaining"),
    (120, "3 min remaining"),
    (240, "1 min remaining"),
    (299, "Just before close"),
]
CAL_QBINS    = 40   # quantile buckets - dense enough to draw a smooth line
CAL_MIN_PCT  = 10   # drop buckets with fewer markets to keep estimates stable


# ── Loaders ───────────────────────────────────────────────────────────────────
def load_events() -> pd.DataFrame:
    """Per-event aggregation from the per-second parquet.

    `actual_up` comes from the official `winner_binary` column (same as
    Polymarket's resolution and the EDA notebook). We still compute
    `final_pct` from the per-second first vs last BTC price so the
    distribution charts have a continuous magnitude to plot.
    """
    # Engine is auto-selected (pyarrow or fastparquet, whichever is installed).
    df = pd.read_parquet(PARQUET)

    df = df.sort_values(["event_timestamp", "second"])
    df = df.drop_duplicates(subset=["event_timestamp", "second"], keep="last")

    grp   = df.sort_values("second").groupby("event_timestamp")
    first = grp.first()[["btc_price"]]
    last  = grp.last()[["btc_price"]]
    # Pull the official outcome once per event (same value on every row
    # of that event, so `.first()` is safe).
    wb    = grp.first()[["winner_binary"]]

    events = (
        first.join(last, lsuffix="_first", rsuffix="_last")
             .join(wb)
             .reset_index()
    )
    events["final_pct"] = (
        (events["btc_price_last"] - events["btc_price_first"])
        / events["btc_price_first"] * 100.0
    )
    # Authoritative UP outcome from Polymarket resolution (boolean for
    # consistent downstream `.sum()` / `~` usage).
    events["actual_up"] = events["winner_binary"].astype(int) == 1

    events["dt"]   = pd.to_datetime(events["event_timestamp"], unit="s", utc=True)
    events["hour"] = events["dt"].dt.hour
    events["dow"]  = events["dt"].dt.dayofweek

    return events


def load_market_csv() -> pd.DataFrame:
    """Per-market summary rows. Source for volume- and trade-count-based charts."""
    df = pd.read_csv(MARKET_CSV)
    df["volume"]    = pd.to_numeric(df["volume"],    errors="coerce").fillna(0.0)
    df["n_trades"]  = pd.to_numeric(df["n_trades"],  errors="coerce").fillna(0).astype(int)
    df["btc_return"] = pd.to_numeric(df["btc_return"], errors="coerce")
    return df


# ── Block B-1: BTC Δ distribution histogram ───────────────────────────────────
def _histogram_set(events: pd.DataFrame, lo: float, hi: float, n_bins: int) -> dict:
    """Build a single histogram + normal-fit pair for the requested range.

    Factored out so we can emit both the narrow and wide views from the same
    underlying events without duplicating math.
    """
    edges = np.linspace(lo, hi, n_bins + 1)

    up_vals   = events.loc[events["actual_up"],  "final_pct"].clip(lo, hi)
    down_vals = events.loc[~events["actual_up"], "final_pct"].clip(lo, hi)
    up_counts,   _ = np.histogram(up_vals,   bins=edges)
    down_counts, _ = np.histogram(down_vals, bins=edges)

    bins = [{
        "lo":   round(float(edges[i]),   4),
        "hi":   round(float(edges[i+1]), 4),
        "up":   int(up_counts[i]),
        "down": int(down_counts[i]),
    } for i in range(n_bins)]

    mean_pct  = float(events["final_pct"].mean())
    std_pct   = float(events["final_pct"].std())
    bin_width = (hi - lo) / n_bins
    scale     = len(events) * bin_width

    norm_xs = [(edges[i] + edges[i+1]) / 2 for i in range(n_bins)]
    norm_ys = [
        float(scale / (std_pct * math.sqrt(2 * math.pi))
              * math.exp(-0.5 * ((x - mean_pct) / std_pct) ** 2))
        for x in norm_xs
    ]

    return {
        "bins":         bins,
        "normal_curve": [{"x": round(x, 4), "y": round(y, 2)} for x, y in zip(norm_xs, norm_ys)],
        "normal_fit":   {"mean": round(mean_pct, 5), "std": round(std_pct, 5)},
        "clip_lo":      lo,
        "clip_hi":      hi,
    }


def build_distribution(events: pd.DataFrame) -> dict:
    """Narrow + wide histograms in a single payload (same totals for both)."""
    narrow = _histogram_set(events, HIST_LO, HIST_HI, N_BINS)
    wide   = _histogram_set(events, WIDE_LO, WIDE_HI, WIDE_BINS)

    return {
        **narrow,
        "wide_bins":         wide["bins"],
        "wide_normal_curve": wide["normal_curve"],
        "wide_normal_fit":   wide["normal_fit"],
        "wide_clip_lo":      wide["clip_lo"],
        "wide_clip_hi":      wide["clip_hi"],
        "total_up":          int(events["actual_up"].sum()),
        "total_down":        int((~events["actual_up"]).sum()),
        "total":             int(len(events)),
    }


# ── Block B-2: Hourly heatmap (count, UP rate, USD volume) ────────────────────
def build_heatmap(events: pd.DataFrame, markets: pd.DataFrame) -> dict:
    # Index per-market USD volume by event_timestamp for O(1) lookup per cell.
    vol_lookup = markets.set_index("event_timestamp")["volume"]

    cells = []
    for dow in range(7):
        for hour in range(24):
            sub = events[(events["dow"] == dow) & (events["hour"] == hour)]
            if len(sub) == 0:
                cells.append({"dow": dow, "hour": hour, "count": 0,
                              "up_rate": None, "volume": 0.0})
                continue
            ts  = sub["event_timestamp"]
            vol = float(vol_lookup.reindex(ts).fillna(0).sum())
            cells.append({
                "dow":     dow,
                "hour":    hour,
                "count":   int(len(sub)),
                "up_rate": round(float(sub["actual_up"].mean()), 4),
                "volume":  round(vol, 2),
            })

    return {
        "cells": cells,
        "days":  ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
        "hours": list(range(24)),
    }


# ── Block C: Markov chain ─────────────────────────────────────────────────────
def build_markov(events: pd.DataFrame) -> dict:
    seq = events.sort_values("event_timestamp")["actual_up"].astype(int).tolist()

    uu = ud = du = dd = 0
    for a, b in zip(seq[:-1], seq[1:]):
        if   a == 1 and b == 1: uu += 1
        elif a == 1 and b == 0: ud += 1
        elif a == 0 and b == 1: du += 1
        else:                   dd += 1

    n_up   = uu + ud
    n_down = du + dd

    transitions = {
        "uu": round(uu / n_up,   4) if n_up   > 0 else 0.5,
        "ud": round(ud / n_up,   4) if n_up   > 0 else 0.5,
        "du": round(du / n_down, 4) if n_down > 0 else 0.5,
        "dd": round(dd / n_down, 4) if n_down > 0 else 0.5,
    }

    total = len(seq)
    marginals = {
        "up":   round(sum(seq) / total,     4),
        "down": round(1 - sum(seq) / total, 4),
    }

    up_streaks:   dict[int, int] = {}
    down_streaks: dict[int, int] = {}
    if seq:
        run_val, run_len = seq[0], 1
        for s in seq[1:]:
            if s == run_val:
                run_len += 1
            else:
                bucket = up_streaks if run_val == 1 else down_streaks
                bucket[run_len] = bucket.get(run_len, 0) + 1
                run_val, run_len = s, 1
        bucket = up_streaks if run_val == 1 else down_streaks
        bucket[run_len] = bucket.get(run_len, 0) + 1

    max_streak = max(
        max(up_streaks.keys(),   default=0),
        max(down_streaks.keys(), default=0),
    )
    # Cap display at 15 to keep the histogram readable.
    streaks = [
        {"length": ln,
         "up":   up_streaks.get(ln, 0),
         "down": down_streaks.get(ln, 0)}
        for ln in range(1, min(max_streak + 1, 16))
    ]

    return {
        "transitions": transitions,
        "marginals":   marginals,
        "streaks":     streaks,
        "counts":      {"uu": uu, "ud": ud, "du": du, "dd": dd},
    }


# ── Stats section builders (CSV-driven) ───────────────────────────────────────
def build_daily_volume(markets: pd.DataFrame) -> dict:
    """Aggregate USD volume per calendar day, ordered chronologically."""
    daily = (
        markets.groupby("date", as_index=False)
        .agg(volume_usd=("volume", "sum"), n_markets=("slug", "count"))
        .sort_values("date")
    )
    return {
        "days": [
            {"date": str(row["date"]),
             "volume_usd": round(float(row["volume_usd"]), 2),
             "n_markets":  int(row["n_markets"])}
            for _, row in daily.iterrows()
        ]
    }


def build_trades_per_market(markets: pd.DataFrame) -> dict:
    """Histogram + summary stats for the per-market trade count."""
    n_trades = markets["n_trades"].to_numpy()
    edges    = np.array(TRADE_EDGES + [np.iinfo(np.int64).max])
    counts, _ = np.histogram(n_trades, bins=edges)

    bins = [
        {"label": TRADE_LABELS[i], "count": int(counts[i])}
        for i in range(len(TRADE_LABELS))
    ]

    return {
        "bins": bins,
        "summary": {
            "avg":           round(float(np.mean(n_trades)),   1),
            "median":        int(np.median(n_trades)),
            "total_markets": int(len(n_trades)),
        },
    }


def build_volume_vs_change(markets: pd.DataFrame) -> dict:
    """Scatter points for (USD volume, BTC return %) pairs.

    The CSV stores `btc_return` as a fraction (e.g. 0.001 = +0.1%); we convert
    it to a percentage before serializing so the front-end stays unit-aware.

    Subsampling is done with a deterministic stride to keep the payload small
    while preserving the visible density pattern.
    """
    df = markets[["volume", "btc_return"]].dropna()
    df = df[(df["volume"] > 0)]

    if len(df) > SCATTER_MAX:
        stride = math.ceil(len(df) / SCATTER_MAX)
        df = df.iloc[::stride]

    points = [
        {"v": round(float(row["volume"]), 2),
         "p": round(float(row["btc_return"]) * 100.0, 4)}
        for _, row in df.iterrows()
    ]
    return {"points": points, "total": int(len(points))}


def build_hero_stats(events: pd.DataFrame, markets: pd.DataFrame) -> dict:
    """Aggregate landing-page stats. Both sources are needed: the parquet drives
    UP-rate (computed from actual prices), the CSV drives volume.
    """
    dates  = pd.to_datetime(markets["date"])
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
              "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    def fmt(d: pd.Timestamp) -> str:
        return f"{months[d.month - 1]} {d.day}, {d.year}"

    d_min, d_max = dates.min(), dates.max()
    days_of_data = int((d_max - d_min).days + 1)

    return {
        "total_markets": int(len(markets)),
        "total_volume_usd": round(float(markets["volume"].sum()), 2),
        "days_of_data":  days_of_data,
        "up_rate":       round(float(events["actual_up"].mean()), 4),
        "n_up":          int(events["actual_up"].sum()),
        "n_down":        int((~events["actual_up"]).sum()),
        "date_range": {
            "start": d_min.strftime("%Y-%m-%d"),
            "end":   d_max.strftime("%Y-%m-%d"),
            "label": f"{fmt(d_min)} – {fmt(d_max)}",
        },
    }


# ── Block D: Calibration curves at multiple time horizons ────────────────────
def build_calibration_curves(parquet_path: Path) -> dict:
    """Per-second reliability curves at each checkpoint in CAL_CHECKPOINTS.

    For every checkpoint second we take a snapshot of the per-second timeseries,
    bin it into quantile buckets of implied price, and compute (avg implied,
    realised UP rate, n) per bucket. The output drives a multi-line calibration
    chart on the website - one curve per checkpoint, plus an MSE that quantifies
    how far each curve sits from the y = x diagonal.
    """
    cols = ["second", "implied_prob", "winner_binary"]
    df   = pd.read_parquet(parquet_path, columns=cols)

    checkpoints = []
    for sec, label in CAL_CHECKPOINTS:
        snap = df.loc[df["second"] == sec, ["implied_prob", "winner_binary"]].dropna()
        snap = snap[snap["winner_binary"].isin([0, 1])]
        if len(snap) < CAL_QBINS * CAL_MIN_PCT:
            continue

        snap = snap.assign(
            winner_binary=snap["winner_binary"].astype(float),
            bucket=pd.qcut(snap["implied_prob"], q=CAL_QBINS, duplicates="drop"),
        )
        cal = snap.groupby("bucket", observed=True).agg(
            avg_prob=("implied_prob", "mean"),
            up_rate =("winner_binary", "mean"),
            n       =("winner_binary", "size"),
        )
        cal = cal[cal["n"] >= CAL_MIN_PCT]
        if cal.empty:
            continue

        mse = float(((cal["up_rate"] - cal["avg_prob"]) ** 2).mean())
        points = [
            {"p":  round(float(row["avg_prob"]), 4),
             "up": round(float(row["up_rate"]),  4),
             "n":  int(row["n"])}
            for _, row in cal.iterrows()
        ]
        checkpoints.append({
            "second":    int(sec),
            "label":     label,
            "mse":       round(mse, 5),
            "n_markets": int(len(snap)),
            "points":    points,
        })

    return {"checkpoints": checkpoints}


# ── Main ──────────────────────────────────────────────────────────────────────
def _dump(name: str, payload: dict) -> None:
    path = OUT_DIR / name
    path.write_text(json.dumps(payload, indent=2))
    print(f"  → {path}")


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print("Loading and aggregating events…")
    events  = load_events()
    print(f"  {len(events)} events  |  UP: {events['actual_up'].sum()}  DOWN: {(~events['actual_up']).sum()}")

    print("Loading per-market CSV…")
    markets = load_market_csv()
    print(f"  {len(markets)} markets  |  total volume: ${markets['volume'].sum():,.0f}")

    print("Building BTC Δ distribution (narrow + wide)…")
    _dump("btc_distribution.json", build_distribution(events))

    print("Building hourly heatmap…")
    _dump("hourly_heatmap.json", build_heatmap(events, markets))

    print("Building Markov chain data…")
    markov = build_markov(events)
    _dump("markov.json", markov)
    print(f"  Transitions: {markov['transitions']}")
    print(f"  Marginals:   {markov['marginals']}")

    print("Building daily volume…")
    _dump("daily_volume.json", build_daily_volume(markets))

    print("Building trades-per-market histogram…")
    _dump("trades_per_market.json", build_trades_per_market(markets))

    print("Building volume vs BTC change scatter…")
    _dump("volume_vs_change.json", build_volume_vs_change(markets))

    print("Building hero stats…")
    hero = build_hero_stats(events, markets)
    _dump("hero_stats.json", hero)
    print(f"  {hero['total_markets']} markets · ${hero['total_volume_usd']:,.0f} · "
          f"{hero['days_of_data']} days · UP rate {hero['up_rate']*100:.1f}%")

    print("Building calibration curves…")
    curves = build_calibration_curves(PARQUET)
    _dump("calibration_curves.json", curves)
    for c in curves["checkpoints"]:
        print(f"  {c['label']:<22s} MSE={c['mse']:.4f}  n={c['n_markets']}  buckets={len(c['points'])}")


if __name__ == "__main__":
    main()
