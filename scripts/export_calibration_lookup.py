"""
Export a 2D calibration lookup table for the website Trading Playground.

For each cell (time_remaining T, btc_pct_change Y):
    realized[T, Y] = mean(winner_binary)  over all (market, second) rows in the bucket
    implied[T, Y]  = mean(implied_prob)   over the same rows
    n_samples[T, Y] = count of rows in the bucket

Both realized and implied are conditional probabilities P(UP | T, Y) directly,
*not* cumulative surfaces. They feed the live CalibrationPanel in the playground.

A light 2D Gaussian smoothing is applied to absorb small-bucket noise. Cells
with n_samples < N_MIN are set to None in the JSON output to signal
"insufficient history" to the frontend.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.ndimage import gaussian_filter

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# ── Paths ───────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
PARQUET = ROOT / "data/processed/btc_5m_timeseries.parquet"
OUT_JSON = ROOT / "website/public/data/calibration_lookup.json"

# ── Grid configuration ──────────────────────────────────────────────────────
MARKET_SECONDS = 300
T_STEP = 5                       # seconds — grid every 5s of time_remaining
Y_MIN, Y_MAX = -0.60, 0.60       # percentage points (BTC pct change since open)
Y_STEP = 0.01                    # percentage point bucket width

# ── Smoothing & masking ─────────────────────────────────────────────────────
SIGMA_T = 1.5                    # 1 step ≈ 5s of smoothing
SIGMA_Y = 2.0                    # 1 step ≈ 0.01% of smoothing
N_MIN = 30                       # cells below this are masked as null

# ── Columns ─────────────────────────────────────────────────────────────────
ID_COL = "event_timestamp"
SECOND_COL = "second"
BTC_COL = "btc_pct_change"
IMPLIED_COL = "implied_prob"
WINNER_COL = "winner_binary"


def normalize_implied_prob(s: pd.Series) -> pd.Series:
    """Detect & convert percent-scale implied_prob to [0, 1]."""
    out = pd.to_numeric(s, errors="coerce").astype(float)
    finite = out[np.isfinite(out)]
    if len(finite) > 0:
        q99 = float(finite.quantile(0.99))
        max_v = float(finite.max())
        if q99 > 1.01 and max_v <= 100.0:
            print("  Detected implied_prob in [0,100]; dividing by 100.")
            out = out / 100.0
    return out.clip(lower=0.0, upper=1.0)


def main() -> None:
    if not PARQUET.exists():
        raise SystemExit(f"Missing parquet: {PARQUET}")

    print(f"Loading {PARQUET.relative_to(ROOT)} ...", flush=True)
    df = pd.read_parquet(
        PARQUET,
        columns=[ID_COL, SECOND_COL, BTC_COL, IMPLIED_COL, WINNER_COL],
    )

    df[SECOND_COL] = pd.to_numeric(df[SECOND_COL], errors="coerce")
    df[BTC_COL] = pd.to_numeric(df[BTC_COL], errors="coerce")
    df[IMPLIED_COL] = normalize_implied_prob(df[IMPLIED_COL])
    df[WINNER_COL] = pd.to_numeric(df[WINNER_COL], errors="coerce")

    df = df.dropna(subset=[ID_COL, SECOND_COL, WINNER_COL])
    df = df[df[WINNER_COL].isin([0, 1])].copy()
    df[SECOND_COL] = np.rint(df[SECOND_COL]).astype(np.int16)
    df = df[(df[SECOND_COL] >= 0) & (df[SECOND_COL] <= MARKET_SECONDS)].copy()

    outcome = df.groupby(ID_COL, sort=False)[WINNER_COL].max().astype(np.int8)
    df[WINNER_COL] = df[ID_COL].map(outcome).astype(np.int8)

    df = df.sort_values([ID_COL, SECOND_COL], kind="mergesort")
    df = df.drop_duplicates([ID_COL, SECOND_COL], keep="last").copy()

    df["time_remaining"] = (MARKET_SECONDS - df[SECOND_COL]).astype(np.int16)
    df = df[df["time_remaining"] % T_STEP == 0].copy()

    n_markets = int(df[ID_COL].nunique())
    print(f"  Markets: {n_markets:,}  |  rows after filter: {len(df):,}")

    # ── Grids ───────────────────────────────────────────────────────────────
    t_grid = np.arange(0, MARKET_SECONDS + 1, T_STEP, dtype=np.int32)
    n_y = int(round((Y_MAX - Y_MIN) / Y_STEP)) + 1
    y_grid = np.round(Y_MIN + np.arange(n_y) * Y_STEP, 4)
    print(f"  Grid: {len(t_grid)} T-steps × {len(y_grid)} Y-bins  "
          f"({len(t_grid) * len(y_grid):,} cells)")

    # ── Bin assignments ────────────────────────────────────────────────────
    # Y bin = nearest grid point (rounded). Drop rows outside [Y_MIN, Y_MAX].
    mask = (
        np.isfinite(df[BTC_COL])
        & (df[BTC_COL] >= Y_MIN - Y_STEP / 2)
        & (df[BTC_COL] <= Y_MAX + Y_STEP / 2)
    )
    work = df.loc[mask, ["time_remaining", BTC_COL, IMPLIED_COL, WINNER_COL]].copy()

    work["y_idx"] = np.clip(
        np.rint((work[BTC_COL] - Y_MIN) / Y_STEP).astype(np.int32),
        0, len(y_grid) - 1,
    )
    work["t_idx"] = (work["time_remaining"] // T_STEP).astype(np.int32)

    # ── Aggregations ────────────────────────────────────────────────────────
    # realized aggregation (uses winner_binary — always finite after cleaning)
    real_grp = work.groupby(["t_idx", "y_idx"], sort=False)[WINNER_COL].agg(["sum", "count"])
    real_sum = np.zeros((len(t_grid), len(y_grid)), dtype=np.float64)
    real_cnt = np.zeros_like(real_sum)
    if not real_grp.empty:
        ti = real_grp.index.get_level_values("t_idx").to_numpy()
        yi = real_grp.index.get_level_values("y_idx").to_numpy()
        real_sum[ti, yi] = real_grp["sum"].to_numpy()
        real_cnt[ti, yi] = real_grp["count"].to_numpy()

    # implied aggregation (drop rows with missing implied_prob)
    impl_work = work.dropna(subset=[IMPLIED_COL])
    impl_grp = impl_work.groupby(["t_idx", "y_idx"], sort=False)[IMPLIED_COL].agg(["sum", "count"])
    impl_sum = np.zeros_like(real_sum)
    impl_cnt = np.zeros_like(real_sum)
    if not impl_grp.empty:
        ti = impl_grp.index.get_level_values("t_idx").to_numpy()
        yi = impl_grp.index.get_level_values("y_idx").to_numpy()
        impl_sum[ti, yi] = impl_grp["sum"].to_numpy()
        impl_cnt[ti, yi] = impl_grp["count"].to_numpy()

    # ── Smoothing ───────────────────────────────────────────────────────────
    # Smooth sums and counts separately, then divide. This gives a weighted
    # average that respects sample density (sparse cells contribute less to
    # their neighbours' smoothed values).
    if SIGMA_T > 0 or SIGMA_Y > 0:
        real_sum_s = gaussian_filter(real_sum, sigma=(SIGMA_T, SIGMA_Y), mode="nearest")
        real_cnt_s = gaussian_filter(real_cnt, sigma=(SIGMA_T, SIGMA_Y), mode="nearest")
        impl_sum_s = gaussian_filter(impl_sum, sigma=(SIGMA_T, SIGMA_Y), mode="nearest")
        impl_cnt_s = gaussian_filter(impl_cnt, sigma=(SIGMA_T, SIGMA_Y), mode="nearest")
    else:
        real_sum_s, real_cnt_s = real_sum, real_cnt
        impl_sum_s, impl_cnt_s = impl_sum, impl_cnt

    # Probabilities (NaN where divisor is ~0)
    with np.errstate(divide="ignore", invalid="ignore"):
        realized = np.where(real_cnt_s > 0, real_sum_s / real_cnt_s, np.nan)
        implied = np.where(impl_cnt_s > 0, impl_sum_s / impl_cnt_s, np.nan)

    # ── Masking — use raw counts for the n_samples gate ─────────────────────
    raw_n = real_cnt.astype(np.int64)
    insufficient = raw_n < N_MIN
    realized[insufficient] = np.nan
    implied[insufficient] = np.nan

    # ── Diagnostics ─────────────────────────────────────────────────────────
    valid = np.isfinite(realized) & np.isfinite(implied)
    if valid.any():
        gap = implied - realized
        print(f"  Valid cells: {int(valid.sum()):,} / {valid.size:,} "
              f"({valid.mean() * 100:.1f}%)")
        print(f"  realized: min={realized[valid].min():.3f} "
              f"max={realized[valid].max():.3f} "
              f"mean={realized[valid].mean():.3f}")
        print(f"  implied:  min={implied[valid].min():.3f} "
              f"max={implied[valid].max():.3f} "
              f"mean={implied[valid].mean():.3f}")
        print(f"  gap:      min={gap[valid].min():+.4f} "
              f"max={gap[valid].max():+.4f} "
              f"mean={gap[valid].mean():+.4f}")
    else:
        print("  WARNING: no valid cells produced.")

    # ── Serialize ───────────────────────────────────────────────────────────
    def to_list(arr: np.ndarray, decimals: int) -> list[list[float | None]]:
        rounded = np.where(
            np.isfinite(arr),
            np.round(arr, decimals),
            None,
        )
        return [
            [None if (v is None or (isinstance(v, float) and math.isnan(v))) else float(v)
             for v in row]
            for row in rounded.tolist()
        ]

    payload = {
        "version": 1,
        "n_total_markets": n_markets,
        "n_min_samples": N_MIN,
        "t_grid": t_grid.tolist(),
        "y_grid": [float(round(y, 4)) for y in y_grid.tolist()],
        "smoothing": {"sigma_t": SIGMA_T, "sigma_y": SIGMA_Y},
        "realized": to_list(realized, 4),
        "implied": to_list(implied, 4),
        "n_samples": raw_n.tolist(),
    }

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {OUT_JSON.relative_to(ROOT)}  ({OUT_JSON.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
