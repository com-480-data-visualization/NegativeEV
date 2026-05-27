# NegativeEV — Plot Generation & Data Pipeline

This document explains every script, data file, and the exact commands needed to
reproduce all plots. Run all commands from the **repository root**.

---

## Prerequisites

```bash
# Activate the project venv (contains all Python deps)
source .venv/bin/activate
```

Python dependencies (see `requirements.txt`): `pandas`, `numpy`, `scipy`,
`fastparquet`.

---

## Data files

| File | Description |
|---|---|
| `data/processed/btc_5m_timeseries.parquet` | Main dataset. One row per (market, second). ~9,181 markets × 300 seconds. Columns: `event_timestamp`, `second`, `implied_prob`, `btc_price`, `btc_pct_change`, `winner_binary`. |
| `data/processed/btc_5m_full.csv` | Raw trade-level CSV (not used by current scripts). |

---

## Scripts

### 1. `scripts/build_cumulative_surface_html.py`

Generates `docs/up_cumulative_echarts3d.html` — the interactive 3D calibration
surface embedded in Section 1 of the website.

**What it computes:**

For every (time-remaining `T`, BTC-change threshold `Y`) grid cell:

- **Realized**: `#{eventual-UP markets with btc_pct_change(T) ≤ Y} / total_UP`
- **Implied**: `Σ implied_prob for markets with btc_pct_change(T) ≤ Y / total_UP`
- **Gap**: implied − realized

The first 2,000 oldest markets are skipped (`--skip-first 2000`) because early
data is anomalous. Surfaces are Gaussian-smoothed (`sigma-y=3.0`, `sigma-t=2.0`)
for visual clarity.

**Standard command (smooth output):**

```bash
python scripts/build_cumulative_surface_html.py \
  --skip-first 2000 \
  --sigma-y 3.0 \
  --sigma-t 2.0
```

**Raw / experimental variants:**

```bash
# No smoothing (raw grid, shows noise)
python scripts/build_cumulative_surface_html.py --skip-first 2000 --sigma-y 0 --sigma-t 0

# Finer time resolution (slower, larger HTML)
python scripts/build_cumulative_surface_html.py --skip-first 2000 --sigma-y 3.0 --sigma-t 2.0 --time-step 3

# Use all markets (no skip)
python scripts/build_cumulative_surface_html.py --sigma-y 3.0 --sigma-t 2.0
```

**Output:** `docs/up_cumulative_echarts3d.html` (~3 MB standalone HTML)

---

### 2. `scripts/build_analysis_data.py`

Generates three JSON files used by the website's Block B and Block C sections.
Uses **all 9,175 markets** (6 exact-tie events dropped). Classifies UP/DOWN from
actual first-vs-last BTC price — not `winner_binary` — to stay consistent with
what users see in the trading playground.

**Command:**

```bash
python scripts/build_analysis_data.py
```

**Outputs:**

| File | Section | Description |
|---|---|---|
| `website/public/data/btc_distribution.json` | Block B | Histogram bins (60 bins, ±0.55% clip) with `up`/`down` counts per bin, and a pre-computed normal-fit curve. |
| `website/public/data/hourly_heatmap.json` | Block B | 7×24 grid (day-of-week × hour UTC). Each cell: market count and UP rate. |
| `website/public/data/markov.json` | Block C | Markov transition probabilities (UU, UD, DU, DD), marginal UP/DOWN rates, and streak-length distribution. |

---

### 3. `scripts/export_playground_events.py`

Exports the first 50 sequential markets (by event_timestamp) to a JSON file
used by the Trading Playground in the website.

**Command:**

```bash
python scripts/export_playground_events.py
```

**Output:** `website/public/data/playground_events.json`

Each event contains 300 seconds of: `time_remaining`, `second`, `btc_price`,
`btc_pct_change`, `yes_price`, `no_price`, `winner_binary`.

---

## Website

The website is a React + Vite + Tailwind app under `website/`.

```bash
cd website
npm install      # first time only
npm run dev      # start dev server at http://localhost:5173
npm run build    # production build to website/dist/
```

The dev server serves `docs/*.html` under `/plots/` so the iframe in Section 1
loads `docs/up_cumulative_echarts3d.html` directly without copying files.

---

## Full regeneration (all plots from scratch)

```bash
# From repo root, with venv active:
python scripts/build_cumulative_surface_html.py --skip-first 2000 --sigma-y 3.0 --sigma-t 2.0
python scripts/build_analysis_data.py
python scripts/export_playground_events.py
```

---

## Section map

| Website section | Data source | Script |
|---|---|---|
| Hero stats (9,181 / 51.4% / …) | Hardcoded from dataset EDA | — |
| Section 1 — Calibration surface | `docs/up_cumulative_echarts3d.html` | `build_cumulative_surface_html.py` |
| Section 2 — BTC Δ histogram | `website/public/data/btc_distribution.json` | `build_analysis_data.py` |
| Section 2 — Hourly heatmap | `website/public/data/hourly_heatmap.json` | `build_analysis_data.py` |
| Section 3 — Markov chain | `website/public/data/markov.json` | `build_analysis_data.py` |
| Section 4 — Trading playground | `website/public/data/playground_events.json` | `export_playground_events.py` |
