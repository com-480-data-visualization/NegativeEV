#!/usr/bin/env python3
"""Conditional 3D calibration surface for Polymarket BTC 5-minute UP/DOWN markets.

Writes a standalone HTML file (ECharts + ECharts-GL) that, for each time
remaining T and BTC threshold Y, answers:

    "Given the BTC price change condition is already met at time T, what is
     the historical probability that the market ends UP?"

Realized surface (directional):
    Y >= 0:  realized[Y, T] = P(UP | BTC Δ >= Y, time T)
    Y <  0:  realized[Y, T] = P(UP | BTC Δ <= Y, time T)

Implied surface uses the same matching set:
    implied[Y, T]  = avg(implied_prob | same condition as realized)
    gap[Y, T]      = realized[Y, T] - implied[Y, T]

Implementation is split across:
    _surface_data.py    parquet loading + cleaning
    _surface_math.py    grid, directional tail counts, smoothing
    _surface_payload.py ECharts payload + HTML template substitution
    templates/cumulative_surface.html  standalone HTML page

This module is the CLI entry point.

Output: docs/up_cumulative_echarts3d.html
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

from _surface_data import load_data
from _surface_math import (
    build_surfaces,
    fill_along_y,
    make_t_grid,
    make_y_grid,
    smooth_and_divide,
)
from _surface_payload import build_html, surface_payload


# ── Defaults ───────────────────────────────────────────────────────────────────
PARQUET = Path("data/processed/btc_5m_timeseries.parquet")
DOCS = Path("docs")
OUT_HTML = "up_cumulative_echarts3d.html"

MARKET_SECONDS = 300
Y_MIN, Y_MAX = -0.50, 0.40          # percent units, not decimals
BUCKET_WIDTH_DEFAULT = 0.01          # -0.50..+0.40 gives 91 thresholds
TIME_STEP_DEFAULT = 5                # seconds between displayed time_remaining rows

# sigma_y=0: the directional tail formula is naturally monotone in Y; smoothing
# in Y crosses the Y=0 boundary and mixes incompatible left/right tail counts.
# sigma_t smooths across adjacent time steps to reduce per-step noise.
SIGMA_Y = 0.0
SIGMA_T = 3.0

# Page background. Matches the website's `--color-surface-elevated` so the
# iframe blends into the card it sits in.
BG = "#161922"


def print_self_check(
    *,
    Z_real_s: np.ndarray,
    Z_impl_s: np.ndarray,
    Z_all_count: np.ndarray,
    Z_up_count: np.ndarray,
    coverage: np.ndarray,
) -> None:
    print("Self-check ...")

    fin_r = Z_real_s[np.isfinite(Z_real_s)]
    fin_i = Z_impl_s[np.isfinite(Z_impl_s)]

    print(f"  Smoothed realized: min={float(fin_r.min()):.4f}  max={float(fin_r.max()):.4f}  "
          f"mean={float(fin_r.mean()):.4f}  (cells with data: {fin_r.size:,})")
    print(f"  Smoothed implied:  min={float(fin_i.min()):.4f}  max={float(fin_i.max()):.4f}  "
          f"mean={float(fin_i.mean()):.4f}  (cells with data: {fin_i.size:,})")

    for name, Z in (("realized", Z_real_s), ("implied", Z_impl_s)):
        fin = Z[np.isfinite(Z)]
        if fin.size and (float(fin.min()) < -1e-6 or float(fin.max()) > 1 + 1e-6):
            print(f"  WARNING: {name} has values outside [0, 1]: "
                  f"min={float(fin.min()):.6f}, max={float(fin.max()):.6f}")
        else:
            print(f"  Range check OK for {name}: values in [0, 1]")

    print(f"  Coverage: max={float(coverage.max()):.4f}  min(nonzero)="
          f"{float(coverage[coverage > 0].min()) if np.any(coverage > 0) else 0:.4f}")

    mean_per_bucket = float(Z_all_count[Z_all_count > 0].mean()) if np.any(Z_all_count > 0) else 0
    print(f"  Mean markets per non-empty bucket: {mean_per_bucket:.1f}")
    if mean_per_bucket < 5:
        print("  NOTE: data is sparse per bucket - smoothing provides most of the density.")


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="Build UP cumulative 3D calibration surface HTML with ECharts-GL.")
    parser.add_argument("--parquet", type=Path, default=PARQUET)
    parser.add_argument("--docs", type=Path, default=DOCS)
    parser.add_argument("--out", type=str, default=OUT_HTML, help="Output HTML filename inside --docs")
    parser.add_argument("--id-col", type=str, default=None, help="Market/event id column. Auto-detected if omitted.")
    parser.add_argument("--second-col", type=str, default="second")
    parser.add_argument("--btc-col", type=str, default="btc_pct_change")
    parser.add_argument("--implied-col", type=str, default="implied_prob")
    parser.add_argument("--winner-col", type=str, default="winner_binary")
    parser.add_argument("--engine", type=str, default="auto", help="pandas parquet engine: auto, pyarrow, or fastparquet")
    parser.add_argument(
        "--implied-scale",
        choices=["auto", "prob", "percent"],
        default="auto",
        help="Use 'prob' for 0..1, 'percent' for 0..100, or 'auto' to infer.",
    )
    parser.add_argument("--market-seconds", type=int, default=MARKET_SECONDS)
    parser.add_argument("--time-step", type=int, default=TIME_STEP_DEFAULT)
    parser.add_argument("--y-min", type=float, default=Y_MIN)
    parser.add_argument("--y-max", type=float, default=Y_MAX)
    parser.add_argument("--bucket-width", type=float, default=BUCKET_WIDTH_DEFAULT)
    parser.add_argument("--sigma-y", type=float, default=SIGMA_Y)
    parser.add_argument("--sigma-t", type=float, default=SIGMA_T)
    parser.add_argument(
        "--skip-first",
        type=int,
        default=0,
        help="Drop the N oldest prediction markets (by event_timestamp) before computing surfaces.",
    )
    parser.add_argument(
        "--implied-universe",
        choices=["all", "up-only"],
        default="all",
        help=(
            "Rows used for implied-probability mass. 'all' is the usual calibration comparison; "
            "'up-only' ignores eventual-DOWN markets even for implied mass."
        ),
    )
    args = parser.parse_args()

    if args.market_seconds <= 0:
        raise ValueError("--market-seconds must be positive")
    if args.time_step <= 0:
        raise ValueError("--time-step must be positive")
    if args.y_min >= args.y_max:
        raise ValueError("--y-min must be smaller than --y-max")

    print(
        f"Settings: y=[{args.y_min:+.2f}%, {args.y_max:+.2f}%], "
        f"bucket_width={args.bucket_width:.4f}%, time_step={args.time_step}s, "
        f"sigma=({args.sigma_y}, {args.sigma_t}), implied_universe={args.implied_universe}"
    )

    args.docs.mkdir(parents=True, exist_ok=True)

    df, total_up, _ = load_data(
        args.parquet,
        id_col=args.id_col,
        second_col=args.second_col,
        btc_col=args.btc_col,
        implied_col=args.implied_col,
        winner_col=args.winner_col,
        market_seconds=args.market_seconds,
        time_step=args.time_step,
        engine=args.engine,
        implied_scale=args.implied_scale,
        skip_first=args.skip_first,
    )

    y_grid = make_y_grid(args.y_min, args.y_max, args.bucket_width)
    t_vals = make_t_grid(args.market_seconds, args.time_step)

    Z_up, Z_isum, Z_icnt, Z_all = build_surfaces(
        df,
        y_grid,
        t_vals,
        implied_universe=args.implied_universe,
    )

    # Coverage at Y=0 right-tail: used only to drop degenerate boundary time steps.
    zero_idx = int(np.searchsorted(y_grid, 0.0, side="left"))
    peak_all = float(Z_all[zero_idx, :].max()) or 1.0
    coverage = Z_all[zero_idx, :] / peak_all

    t_arr = np.array(t_vals, dtype=int)
    keep = (coverage > 0) & (t_arr < args.market_seconds) & (t_arr > 0)
    dropped = t_arr[~keep].tolist()
    if dropped:
        print(f"  Dropping {len(dropped)} degenerate time step(s): {dropped}", flush=True)
    t_vals   = t_arr[keep].tolist()
    Z_up     = Z_up[:, keep]
    Z_isum   = Z_isum[:, keep]
    Z_icnt   = Z_icnt[:, keep]
    Z_all    = Z_all[:, keep]
    coverage = coverage[keep]

    print("Smoothing and computing conditional probabilities ...", flush=True)
    Z_up_s,   Z_all_s,  Z_real_s = smooth_and_divide(Z_up,   Z_all,  args.sigma_y, args.sigma_t, min_denom=5)
    Z_isum_s, Z_icnt_s, Z_impl_s = smooth_and_divide(Z_isum, Z_icnt, args.sigma_y, args.sigma_t, min_denom=5)

    # Fill remaining NaN cells (sparse early-T / extreme-Y) by nearest-valid
    # neighbour along Y so the surface has no holes or sudden collapses.
    Z_real_s = fill_along_y(Z_real_s)
    Z_impl_s = fill_along_y(Z_impl_s)
    Z_all_s  = fill_along_y(Z_all_s)
    Z_up_s   = fill_along_y(Z_up_s)

    Z_gap    = Z_real_s - Z_impl_s

    print_self_check(
        Z_real_s=Z_real_s,
        Z_impl_s=Z_impl_s,
        Z_all_count=Z_all_s,
        Z_up_count=Z_up_s,
        coverage=coverage,
    )

    X = np.array(t_vals, dtype=float)
    Y = y_grid.astype(float)

    print("Building ECharts-GL payload ...", flush=True)
    payload = surface_payload(
        X=X,
        Y=Y,
        Z_real_s=Z_real_s,
        Z_impl_s=Z_impl_s,
        Z_gap=Z_gap,
        Z_up_count=Z_up_s,
        Z_all_count=Z_all_s,
        Z_impl_count=Z_icnt_s,
        total_up=total_up,
        market_seconds=args.market_seconds,
        implied_universe=args.implied_universe,
        bucket_width=args.bucket_width,
    )

    print("Writing HTML ...", flush=True)
    out = args.docs / args.out
    out.write_text(build_html(payload, BG), encoding="utf-8")
    print(f"  Saved: {out}")
    print("\nAll done.")


if __name__ == "__main__":
    main()
