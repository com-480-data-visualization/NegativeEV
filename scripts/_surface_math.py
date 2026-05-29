"""Surface math for the cumulative 3D calibration script.

Builds the (Y threshold × T) directional tail-count surfaces, then
smooths and divides them to recover conditional probabilities.
The "directional" rule (right-tail for Y >= 0, left-tail for Y < 0)
produces a monotone surface that answers
    P(UP | BTC has already moved past Y, time T).
"""
from __future__ import annotations

from typing import Literal

import numpy as np
import pandas as pd
from scipy.ndimage import gaussian_filter


ImpliedUniverse = Literal["all", "up-only"]


def make_y_grid(y_min: float, y_max: float, bucket_width: float) -> np.ndarray:
    if bucket_width <= 0:
        raise ValueError("--bucket-width must be positive")
    if y_min >= y_max:
        raise ValueError("--y-min must be smaller than --y-max")

    n = int(round((y_max - y_min) / bucket_width)) + 1
    y = y_min + np.arange(n, dtype=float) * bucket_width
    y[-1] = y_max
    return np.round(y, 10)


def make_t_grid(market_seconds: int, time_step: int) -> list[int]:
    if time_step <= 0:
        raise ValueError("--time-step must be positive")
    return list(range(market_seconds, -1, -time_step))


def directional_by_threshold(
    values: np.ndarray,
    weights: np.ndarray,
    y_grid: np.ndarray,
) -> np.ndarray:
    """Directional tail count for P(UP | condition already met at time T).

    For each grid point y:
      - y >= 0:  out[i] = sum(weights where value >= y)   (right-tail / up-exceedance)
      - y <  0:  out[i] = sum(weights where value <= y)   (left-tail  / down-exceedance)

    Answers "given BTC has already moved at least Y, how often does it end UP?".
    The surface is monotone: strong up move -> high UP probability, strong down -> low.
    """
    if len(values) == 0:
        return np.zeros(len(y_grid), dtype=float)

    values  = np.asarray(values,  dtype=float)
    weights = np.asarray(weights, dtype=float)
    finite  = np.isfinite(values) & np.isfinite(weights)
    if not np.any(finite):
        return np.zeros(len(y_grid), dtype=float)

    clipped = np.clip(values[finite], y_grid[0], y_grid[-1])
    w       = weights[finite]

    idx = np.searchsorted(y_grid, clipped, side="right") - 1
    idx = np.clip(idx, 0, len(y_grid) - 1)
    per_bucket = np.zeros(len(y_grid), dtype=float)
    np.add.at(per_bucket, idx, w)

    # left_cs[i]  = sum of per_bucket[0..i]   (value <= y_grid[i])
    # right_cs[i] = sum of per_bucket[i..end] (value >= y_grid[i])
    left_cs  = np.cumsum(per_bucket)
    right_cs = np.cumsum(per_bucket[::-1])[::-1]

    return np.where(y_grid >= 0, right_cs, left_cs)


def build_surfaces(
    df: pd.DataFrame,
    y_grid: np.ndarray,
    t_vals: list[int],
    *,
    implied_universe: ImpliedUniverse,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Compute directional tail-count surfaces for conditional probability.

    Returns (Z_up, Z_isum, Z_icnt, Z_all). Smoothing + division to the actual
    probabilities is the caller's job (see `smooth_and_divide`).
    """
    n_y = len(y_grid)
    n_t = len(t_vals)

    Z_up   = np.zeros((n_y, n_t), dtype=float)
    Z_all  = np.zeros((n_y, n_t), dtype=float)
    Z_isum = np.zeros((n_y, n_t), dtype=float)
    Z_icnt = np.zeros((n_y, n_t), dtype=float)

    print("Computing directional conditional probability surfaces ...", flush=True)

    grouped = {int(t): g for t, g in df.groupby("time_remaining", sort=False)}
    ones = np.ones

    for t_idx, T in enumerate(t_vals):
        grp = grouped.get(T)
        if grp is None or grp.empty:
            continue

        all_m = grp[np.isfinite(grp["btc_pct_change"])]
        if not all_m.empty:
            vals = all_m["btc_pct_change"].to_numpy(float)
            Z_all[:, t_idx] = directional_by_threshold(vals, ones(len(vals)), y_grid)

        up = grp[(grp["winner_binary"] == 1) & np.isfinite(grp["btc_pct_change"])]
        if not up.empty:
            vals = up["btc_pct_change"].to_numpy(float)
            Z_up[:, t_idx] = directional_by_threshold(vals, ones(len(vals)), y_grid)

        if implied_universe == "up-only":
            impl_grp = grp[grp["winner_binary"] == 1]
        elif implied_universe == "all":
            impl_grp = grp
        else:
            raise ValueError("implied_universe must be 'all' or 'up-only'.")

        impl_grp = impl_grp[
            np.isfinite(impl_grp["btc_pct_change"]) & np.isfinite(impl_grp["implied_prob"])
        ]
        if not impl_grp.empty:
            vals  = impl_grp["btc_pct_change"].to_numpy(float)
            probs = impl_grp["implied_prob"].to_numpy(float)
            Z_isum[:, t_idx] = directional_by_threshold(vals, probs, y_grid)
            Z_icnt[:, t_idx] = directional_by_threshold(vals, ones(len(vals)), y_grid)

    # Coverage diagnostics. At Y=0 the right-tail count is "all markets with
    # BTC Δ >= 0", the most populated column on both sides.
    zero_idx = int(np.searchsorted(y_grid, 0.0, side="left"))
    total_markets = int(Z_all[zero_idx, :].max())
    total_up_peak = int(Z_up[zero_idx, :].max())
    print(f"  Grid: {n_y:,} thresholds x {n_t:,} time steps")
    print(f"  Peak all-markets count (at Y=0): {total_markets:,}")
    print(f"  Peak UP-markets count  (at Y=0): {total_up_peak:,}")

    return Z_up, Z_isum, Z_icnt, Z_all


def smooth_and_divide(
    numerator: np.ndarray,
    denominator: np.ndarray,
    sigma_y: float,
    sigma_t: float,
    min_denom: float = 0.5,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Smooth numerator and denominator independently, then divide.

    Returns (smoothed_num, smoothed_den, ratio) so callers can expose the
    smoothed counts in tooltips, keeping them consistent with the probability.
    Cells where smoothed denominator < min_denom are set to NaN.
    """
    num = np.nan_to_num(numerator.astype(float), nan=0.0)
    den = np.nan_to_num(denominator.astype(float), nan=0.0)

    if sigma_y > 0 or sigma_t > 0:
        sigma = (max(sigma_y, 0.0), max(sigma_t, 0.0))
        num = gaussian_filter(num, sigma=sigma, mode="nearest")
        den = gaussian_filter(den, sigma=sigma, mode="nearest")

    with np.errstate(invalid="ignore", divide="ignore"):
        ratio = np.where(den >= min_denom, num / den, np.nan)

    return num, den, np.clip(ratio, 0.0, 1.0)


def fill_along_y(arr: np.ndarray) -> np.ndarray:
    """Fill NaN cells by nearest-neighbour propagation along the Y axis.

    Forward pass carries the last valid value rightward (low Y -> high Y),
    backward pass carries the first valid value leftward. Keeps the surface
    visually continuous without blending values across the Y=0 directional
    boundary.
    """
    result = arr.copy()
    n_y, n_t = result.shape
    for ti in range(n_t):
        last = np.nan
        for yi in range(n_y):
            v = result[yi, ti]
            if np.isfinite(v):
                last = v
            elif np.isfinite(last):
                result[yi, ti] = last
        last = np.nan
        for yi in range(n_y - 1, -1, -1):
            v = result[yi, ti]
            if np.isfinite(v):
                last = v
            elif np.isfinite(last):
                result[yi, ti] = last
    return result
