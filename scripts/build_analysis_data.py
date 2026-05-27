#!/usr/bin/env python3
"""
Build JSON data files for Block B (distributions & heatmaps) and
Block C (Markov chain) sections of the NegativeEV website.

Outputs (relative to repo root):
  website/public/data/btc_distribution.json
  website/public/data/hourly_heatmap.json
  website/public/data/markov.json

Classification of UP/DOWN:
  We use the actual first-vs-last BTC price in each event, NOT winner_binary,
  to avoid any label inconsistencies. Events where last == first (ties) are dropped.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

# ── Config ────────────────────────────────────────────────────────────────────
PARQUET     = Path("data/processed/btc_5m_timeseries.parquet")
OUT_DIR     = Path("website/public/data")
HIST_LO     = -0.55   # clip lower bound (%)
HIST_HI     =  0.55   # clip upper bound (%)
N_BINS      = 60


# ── Load & per-event aggregation ──────────────────────────────────────────────
def load_events() -> pd.DataFrame:
    df = pd.read_parquet(PARQUET, engine="fastparquet")

    # Deduplicate (same logic as build_cumulative_surface_html.py)
    df = df.sort_values(["event_timestamp", "second"])
    df = df.drop_duplicates(subset=["event_timestamp", "second"], keep="last")

    # Per-event: first and last price
    grp   = df.sort_values("second").groupby("event_timestamp")
    first = grp.first()[["btc_price"]]
    last  = grp.last()[["btc_price"]]

    events = first.join(last, lsuffix="_first", rsuffix="_last").reset_index()
    events["final_pct"] = (
        (events["btc_price_last"] - events["btc_price_first"])
        / events["btc_price_first"] * 100.0
    )
    events["actual_up"] = events["btc_price_last"] > events["btc_price_first"]

    # Drop ties
    events = events[events["btc_price_last"] != events["btc_price_first"]].copy()

    # Datetime for heatmap
    events["dt"]   = pd.to_datetime(events["event_timestamp"], unit="s", utc=True)
    events["hour"] = events["dt"].dt.hour
    events["dow"]  = events["dt"].dt.dayofweek  # 0 = Monday

    return events


# ── Block B-1: BTC Δ distribution histogram ───────────────────────────────────
def build_distribution(events: pd.DataFrame) -> dict:
    edges = np.linspace(HIST_LO, HIST_HI, N_BINS + 1)

    up_vals   = events.loc[events["actual_up"],  "final_pct"].clip(HIST_LO, HIST_HI)
    down_vals = events.loc[~events["actual_up"], "final_pct"].clip(HIST_LO, HIST_HI)

    up_counts,   _ = np.histogram(up_vals,   bins=edges)
    down_counts, _ = np.histogram(down_vals, bins=edges)

    bins = []
    for i in range(N_BINS):
        bins.append({
            "lo":   round(float(edges[i]),   4),
            "hi":   round(float(edges[i+1]), 4),
            "up":   int(up_counts[i]),
            "down": int(down_counts[i]),
        })

    # Normal fit on full (unclipped) distribution
    mean_pct = float(events["final_pct"].mean())
    std_pct  = float(events["final_pct"].std())
    n_total  = len(events)
    bin_width = (HIST_HI - HIST_LO) / N_BINS

    # Normal curve y-values (scaled to match histogram counts)
    norm_xs = [(edges[i] + edges[i+1]) / 2 for i in range(N_BINS)]
    scale   = n_total * bin_width
    norm_ys = [
        float(scale / (std_pct * math.sqrt(2 * math.pi))
              * math.exp(-0.5 * ((x - mean_pct) / std_pct) ** 2))
        for x in norm_xs
    ]

    return {
        "bins":        bins,
        "normal_fit":  {"mean": round(mean_pct, 5), "std": round(std_pct, 5)},
        "normal_curve": [{"x": round(x, 4), "y": round(y, 2)} for x, y in zip(norm_xs, norm_ys)],
        "clip_lo":     HIST_LO,
        "clip_hi":     HIST_HI,
        "total_up":    int(events["actual_up"].sum()),
        "total_down":  int((~events["actual_up"]).sum()),
        "total":       int(len(events)),
    }


# ── Block B-2: Hourly UP-rate heatmap ─────────────────────────────────────────
def build_heatmap(events: pd.DataFrame) -> dict:
    cells = []
    for dow in range(7):
        for hour in range(24):
            mask = (events["dow"] == dow) & (events["hour"] == hour)
            sub  = events[mask]
            if len(sub) == 0:
                cells.append({"dow": dow, "hour": hour, "count": 0, "up_rate": None})
            else:
                cells.append({
                    "dow":     dow,
                    "hour":    hour,
                    "count":   int(len(sub)),
                    "up_rate": round(float(sub["actual_up"].mean()), 4),
                })

    days  = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    hours = list(range(24))
    return {"cells": cells, "days": days, "hours": hours}


# ── Block C: Markov chain ─────────────────────────────────────────────────────
def build_markov(events: pd.DataFrame) -> dict:
    # Sort by event_timestamp to get chronological sequence
    seq = events.sort_values("event_timestamp")["actual_up"].astype(int).tolist()

    # Transition counts
    uu = ud = du = dd = 0
    for a, b in zip(seq[:-1], seq[1:]):
        if a == 1 and b == 1: uu += 1
        elif a == 1 and b == 0: ud += 1
        elif a == 0 and b == 1: du += 1
        else: dd += 1

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

    # Streak length distribution
    up_streaks:   dict[int, int] = {}
    down_streaks: dict[int, int] = {}
    if seq:
        run_val = seq[0]
        run_len = 1
        for s in seq[1:]:
            if s == run_val:
                run_len += 1
            else:
                bucket = up_streaks if run_val == 1 else down_streaks
                bucket[run_len] = bucket.get(run_len, 0) + 1
                run_val = s
                run_len = 1
        # last run
        bucket = up_streaks if run_val == 1 else down_streaks
        bucket[run_len] = bucket.get(run_len, 0) + 1

    max_streak = max(
        max(up_streaks.keys(),   default=0),
        max(down_streaks.keys(), default=0),
    )
    streaks = [
        {"length": ln,
         "up":   up_streaks.get(ln, 0),
         "down": down_streaks.get(ln, 0)}
        for ln in range(1, min(max_streak + 1, 16))  # cap display at 15
    ]

    return {
        "transitions": transitions,
        "marginals":   marginals,
        "streaks":     streaks,
        "counts": {"uu": uu, "ud": ud, "du": du, "dd": dd},
    }


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    print("Loading and aggregating events…")
    events = load_events()
    print(f"  {len(events)} events  |  UP: {events['actual_up'].sum()}  DOWN: {(~events['actual_up']).sum()}")

    print("Building BTC Δ distribution…")
    dist = build_distribution(events)
    (OUT_DIR / "btc_distribution.json").write_text(json.dumps(dist, indent=2))
    print(f"  → {OUT_DIR}/btc_distribution.json")

    print("Building hourly heatmap…")
    heatmap = build_heatmap(events)
    (OUT_DIR / "hourly_heatmap.json").write_text(json.dumps(heatmap, indent=2))
    print(f"  → {OUT_DIR}/hourly_heatmap.json")

    print("Building Markov chain data…")
    markov = build_markov(events)
    (OUT_DIR / "markov.json").write_text(json.dumps(markov, indent=2))
    print(f"  → {OUT_DIR}/markov.json")
    print(f"  Transitions: {markov['transitions']}")
    print(f"  Marginals:   {markov['marginals']}")


if __name__ == "__main__":
    main()
