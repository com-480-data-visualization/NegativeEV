"""Payload and HTML rendering for the cumulative 3D surface script.

Turns the smoothed surface arrays into the ECharts-GL point list, wraps
that in a per-mode dataset payload, and substitutes it into the HTML
template alongside the page background colour.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np


TEMPLATE_PATH = Path(__file__).resolve().parent / "templates" / "cumulative_surface.html"


def round_float(x: float, ndigits: int = 6) -> float:
    if not np.isfinite(x):
        return 0.0
    return round(float(x), ndigits)


def matrix_to_surface_points(
    *,
    X: np.ndarray,
    Y: np.ndarray,
    Z_real: np.ndarray,
    Z_impl: np.ndarray,
    Z_gap: np.ndarray,
    Z_surface: np.ndarray,
    Z_up_count: np.ndarray,
    Z_all_count: np.ndarray,
    Z_impl_count: np.ndarray,
) -> list[list[float | int]]:
    """ECharts surface data points.

    Each point:
      [time_elapsed, y_upper, z_surface, realized, implied, gap,
       up_count_in_bucket, all_count_in_bucket, impl_count_in_bucket]

    X stores time_remaining (descending: 295…5). The ECharts GL xAxis3D uses
    inverse: true so the display shows 295 on the left (market start) → 5 on
    the right (market end).
    """
    out: list[list[float | int]] = []
    for yi, y in enumerate(Y):
        for ti, t in enumerate(X):
            z_s  = Z_surface[yi, ti]
            z_r  = Z_real[yi, ti]
            z_i  = Z_impl[yi, ti]
            z_g  = Z_gap[yi, ti]
            out.append(
                [
                    int(t),
                    round_float(float(y), 4),
                    round_float(float(z_s)  if np.isfinite(z_s)  else float("nan"), 6),
                    round_float(float(z_r)  if np.isfinite(z_r)  else float("nan"), 6),
                    round_float(float(z_i)  if np.isfinite(z_i)  else float("nan"), 6),
                    round_float(float(z_g)  if np.isfinite(z_g)  else float("nan"), 6),
                    round_float(float(Z_up_count[yi, ti]),  1),
                    round_float(float(Z_all_count[yi, ti]), 1),
                    round_float(float(Z_impl_count[yi, ti]), 1),
                ]
            )
    return out


def surface_payload(
    *,
    X: np.ndarray,
    Y: np.ndarray,
    Z_real_s: np.ndarray,
    Z_impl_s: np.ndarray,
    Z_gap: np.ndarray,
    Z_up_count: np.ndarray,
    Z_all_count: np.ndarray,
    Z_impl_count: np.ndarray,
    total_up: int,
    market_seconds: int,
    implied_universe: str,
    bucket_width: float,
) -> dict:
    # Stretch the gap z-axis to the actual data range so the surface fills the box.
    finite_gap = Z_gap[np.isfinite(Z_gap)]
    gap_abs = max(abs(float(finite_gap.min())), abs(float(finite_gap.max())), 0.01) if finite_gap.size else 0.1
    gap_range = round(gap_abs * 1.15, 4)   # 15% headroom

    # ECharts GL surface grid auto-detection requires ascending X values.
    # X is time_remaining descending [295…5]; reverse it and flip the T axis of
    # all Z arrays so data is ascending [5…295]. xAxis3D uses inverse:true so
    # the display shows 295 on the left (market start) → 5 on the right.
    X_asc = X[::-1]
    shared_points_kw = dict(
        X=X_asc, Y=Y,
        Z_real=Z_real_s[:, ::-1], Z_impl=Z_impl_s[:, ::-1], Z_gap=Z_gap[:, ::-1],
        Z_up_count=Z_up_count[:, ::-1], Z_all_count=Z_all_count[:, ::-1],
        Z_impl_count=Z_impl_count[:, ::-1],
    )
    return {
        "meta": {
            "totalUp": int(total_up),
            "marketSeconds": int(market_seconds),
            "impliedUniverse": implied_universe,
            "nTime": int(len(X_asc)),
            "nY": int(len(Y)),
            "timeMin": int(np.min(X_asc)),
            "timeMax": int(np.max(X_asc)),
            "yMin": float(np.min(Y)),
            "yMax": float(np.max(Y)),
            "bucketWidth": float(bucket_width),
        },
        "datasets": {
            "realized": {
                "title": "Realized P(UP)",
                "subtitle": "How often UP actually wins when BTC has moved by Y at time T",
                "zName": "Realized P(UP)",
                "zMin": 0,
                "zMax": 1,
                "visualMin": 0,
                "visualMax": 1,
                "palette": "prob",
                "data": matrix_to_surface_points(
                    **shared_points_kw, Z_surface=Z_real_s[:, ::-1],
                ),
            },
            "implied": {
                "title": "Implied P(UP)",
                "subtitle": "What the market was pricing UP at, in the same situation",
                "zName": "Implied P(UP)",
                "zMin": 0,
                "zMax": 1,
                "visualMin": 0,
                "visualMax": 1,
                "palette": "prob",
                "data": matrix_to_surface_points(
                    **shared_points_kw, Z_surface=Z_impl_s[:, ::-1],
                ),
            },
            "gap": {
                "title": "Calibration gap (realized − implied)",
                "subtitle": "Blue = market under-prices UP  ·  red = market over-prices UP",
                "zName": "Realized − Implied gap",
                "zMin": -gap_range,
                "zMax": gap_range,
                "visualMin": -gap_range,
                "visualMax": gap_range,
                "palette": "gap",
                "data": matrix_to_surface_points(
                    **shared_points_kw, Z_surface=Z_gap[:, ::-1],
                ),
            },
        },
    }


def build_html(payload: dict, bg: str) -> str:
    """Render the HTML template with the payload and page background colour."""
    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    payload_json = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    # Substitute the two literal placeholders. `replace` (vs str.format) sidesteps
    # the f-string brace-doubling that made the inline template hard to read.
    return template.replace("{BG}", bg).replace("{payload_json}", payload_json)
