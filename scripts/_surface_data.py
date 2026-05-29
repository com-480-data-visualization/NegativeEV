"""Data loading for the cumulative 3D surface script.

Helpers for inspecting and reading the per-second Polymarket parquet,
plus column detection, dtype normalisation, and the deduplicated
(market, second) frame the surface math expects.
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd


ID_CANDIDATES = (
    "event_timestamp",
    "market_id",
    "condition_id",
    "question_id",
    "market_slug",
    "slug",
    "event_slug",
    "ticker",
    "id",
)


def parquet_columns(path: Path) -> list[str]:
    """Return parquet column names without loading the full dataset."""
    if not path.exists():
        raise FileNotFoundError(f"Parquet file not found: {path}")

    try:
        import pyarrow.parquet as pq  # type: ignore

        return list(pq.ParquetFile(path).schema.names)
    except Exception:
        try:
            import fastparquet  # type: ignore

            return list(fastparquet.ParquetFile(path).columns)
        except Exception as exc:
            raise RuntimeError(
                "Could not inspect parquet columns. Install pyarrow or fastparquet."
            ) from exc


def first_existing(columns: Iterable[str], candidates: Iterable[str]) -> str | None:
    colset = set(columns)
    for c in candidates:
        if c in colset:
            return c
    return None


def require_col(columns: Iterable[str], name: str) -> str:
    if name not in set(columns):
        raise ValueError(f"Required column not found: {name!r}")
    return name


def detect_id_col(columns: list[str], requested: str | None) -> str:
    if requested:
        return require_col(columns, requested)

    detected = first_existing(columns, ID_CANDIDATES)
    if detected is None:
        raise ValueError(
            "Could not detect a market/event id column. Pass --id-col explicitly. "
            f"Available columns: {columns}"
        )
    return detected


def normalize_implied_prob(s: pd.Series, scale: str) -> pd.Series:
    """Return implied probability in [0, 1].

    scale="prob"    -> input already 0..1
    scale="percent" -> input is 0..100
    scale="auto"    -> divide by 100 only if values look like percentages
    """
    out = pd.to_numeric(s, errors="coerce").astype(float)

    if scale == "percent":
        out = out / 100.0
    elif scale == "auto":
        finite = out[np.isfinite(out)]
        if len(finite) > 0:
            q99 = float(finite.quantile(0.99))
            max_v = float(finite.max())
            if q99 > 1.01 and max_v <= 100.0:
                print("  Detected implied_prob values that look like percentages; dividing by 100.")
                out = out / 100.0
    elif scale != "prob":
        raise ValueError("--implied-scale must be one of: auto, prob, percent")

    return out.clip(lower=0.0, upper=1.0)


def load_data(
    parquet: Path,
    *,
    id_col: str | None,
    second_col: str,
    btc_col: str,
    implied_col: str,
    winner_col: str,
    market_seconds: int,
    time_step: int,
    engine: str,
    implied_scale: str,
    skip_first: int = 0,
) -> tuple[pd.DataFrame, int, str]:
    """Load + clean the per-second frame. Returns (df, total_up, id_col)."""
    print("Loading data ...", flush=True)

    cols = parquet_columns(parquet)
    id_col = detect_id_col(cols, id_col)
    for c in (second_col, btc_col, implied_col, winner_col):
        require_col(cols, c)

    read_cols = [id_col, second_col, btc_col, implied_col, winner_col]
    df = pd.read_parquet(parquet, columns=read_cols, engine=engine)
    df = df.rename(
        columns={
            id_col: "market_id",
            second_col: "second",
            btc_col: "btc_pct_change",
            implied_col: "implied_prob",
            winner_col: "winner_binary",
        }
    )

    # Keep rows with missing btc/implied for now; the realized and implied surfaces
    # apply their own finite-value masks. A missing implied_prob must not delete a
    # realized observation.
    df["second"] = pd.to_numeric(df["second"], errors="coerce")
    df["btc_pct_change"] = pd.to_numeric(df["btc_pct_change"], errors="coerce")
    df["implied_prob"] = normalize_implied_prob(df["implied_prob"], implied_scale)
    df["winner_binary"] = pd.to_numeric(df["winner_binary"], errors="coerce")

    df = df.dropna(subset=["market_id", "second", "winner_binary"])
    df = df[df["winner_binary"].isin([0, 1])].copy()
    df["second"] = np.rint(df["second"]).astype(np.int16)
    df = df[(df["second"] >= 0) & (df["second"] <= market_seconds)].copy()

    if df.empty:
        raise ValueError("No usable rows after basic cleaning.")

    # One outcome per market. max() guards against duplicate/inconsistent rows.
    outcome_by_market = df.groupby("market_id", sort=False)["winner_binary"].max().astype(np.int8)

    # Optionally drop the N oldest markets (sorted by market_id ≈ event_timestamp).
    if skip_first > 0:
        ordered_ids = outcome_by_market.index.sort_values()
        if skip_first >= len(ordered_ids):
            raise ValueError(
                f"--skip-first {skip_first} ≥ total markets {len(ordered_ids)}; nothing left."
            )
        keep_ids = set(ordered_ids[skip_first:])
        df = df[df["market_id"].isin(keep_ids)].copy()
        outcome_by_market = outcome_by_market[outcome_by_market.index.isin(keep_ids)]
        print(f"  Skipped first {skip_first:,} markets (oldest by event_timestamp); "
              f"{len(keep_ids):,} markets remaining.")

    total_up = int((outcome_by_market == 1).sum())
    if total_up <= 0:
        raise ValueError("No eventual-UP markets found; total_up is zero.")

    df["winner_binary"] = df["market_id"].map(outcome_by_market).astype(np.int8)

    # One coherent row per (market, second). drop_duplicates(keep="last") keeps
    # the last full row instead of groupby.last(), which can mix columns from
    # different source rows.
    df = df.sort_values(["market_id", "second"], kind="mergesort")
    df = df.drop_duplicates(["market_id", "second"], keep="last").copy()

    df["time_remaining"] = (market_seconds - df["second"]).astype(np.int16)

    # Keep the displayed grid exactly aligned to requested time_remaining buckets.
    df = df[df["time_remaining"] % time_step == 0].copy()

    n_markets = int(outcome_by_market.shape[0])
    print(f"  ID column: {id_col}")
    print(f"  Unique markets: {n_markets:,}")
    print(f"  Eventual-UP markets / denominator: {total_up:,}")
    print(f"  Rows after de-dup/time filter: {len(df):,}")
    print(f"  Displayed time steps with at least one row: {df['time_remaining'].nunique():,}")

    return df, total_up, id_col
