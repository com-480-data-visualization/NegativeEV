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

For every (time-remaining `T`, BTC threshold `Y`) grid cell the surface answers:

> "Given the BTC price move condition is already met at time T, what fraction of
> historical markets ended UP?"

The Z-axis is a **directional conditional probability**:

- **Y ≥ 0 (upward threshold)**: `P(UP | BTC Δ ≥ Y, T)` = #{UP markets with BTC Δ ≥ Y at T} / #{all markets with BTC Δ ≥ Y at T}
- **Y < 0 (downward threshold)**: `P(UP | BTC Δ ≤ Y, T)` = #{UP markets with BTC Δ ≤ Y at T} / #{all markets with BTC Δ ≤ Y at T}

Surface behaviour:
- **BTC Δ ≥ +0.40%, T = 5 s** → Z ≈ 1.0 (nearly guaranteed UP)
- **BTC Δ ≤ −0.40%, T = 5 s** → Z ≈ 0.0 (nearly guaranteed DOWN)
- **BTC Δ ≈ 0%, T = 150 s**   → Z ≈ 0.50 (coin flip)

The three modes are:
- **Realized**: historical UP rate over matching markets
- **Implied**: average implied P(UP) quoted by the market, same matching set
- **Gap**: realized − implied (positive = market under-prices UP)

Only T-direction smoothing (`sigma-t`) is applied. Sparse cells that remain below
`min_denom=5` effective observations after smoothing are filled by nearest-neighbour
propagation along the Y axis (forward then backward pass), so the surface has no
holes or sudden collapses at early T / extreme Y.

**Verified spot-check values (raw, no smoothing):**

| Condition | T remaining | n | P(UP) |
|---|---|---|---|
| BTC Δ ≥ +0.05% | 5 s | 2,914 | 98.9% |
| BTC Δ ≥ +0.10% | 5 s | 1,817 | 99.9% |
| BTC Δ ≥ +0.20% | 5 s | 709 | 100% |
| BTC Δ ≤ −0.05% | 5 s | 2,850 | 2.2% |
| BTC Δ ≤ −0.10% | 5 s | 1,825 | 0.9% |
| BTC Δ ≥ +0.05% | 50 s | 2,870 | 93.4% |
| BTC Δ ≥ +0.05% | 150 s | 2,485 | 82.9% |
| BTC Δ ≥ +0.05% | 295 s | 321 | 64.5% |

**Known discontinuity at Y=0:** the formula switches from left-tail (Y<0) to
right-tail (Y≥0), so the matching count jumps at that boundary (~370 markets at
T=5s are in the [-0.01%, 0%) gap). This is mathematically correct.

**Rendering notes (important for smooth output):**

- Data is serialised with X = `time_remaining` in **ascending** order (5 s → 295 s).
  ECharts GL requires ascending X for correct surface grid auto-detection; descending
  data causes triangulation artifacts ("fins").
  The `xAxis3D` uses `inverse: true` (display-only flip) so the chart reads
  295 s on the left (market start) → 5 s on the right (market end).
- Shading must be `'color'`. `'lambert'` produces artifacts on steep gradients.

**Standard command:**

```bash
python scripts/build_cumulative_surface_html.py \
  --sigma-y 0 \
  --sigma-t 3.0
```

sigma_y must be 0: Y-direction smoothing crosses the Y=0 boundary and mixes
incompatible left-tail / right-tail counts, which dilutes probabilities near Y=0
(e.g. pulling P(UP | BTC Δ ≥ +0.05%, T=5s) from 98.9% down to ~80%).
The directional tail counts are naturally monotone in Y — no Y smoothing needed.

**Variants:**

```bash
# Completely raw (no smoothing at all — noisy in time direction)
python scripts/build_cumulative_surface_html.py --sigma-y 0 --sigma-t 0

# Finer time resolution (slower, larger HTML)
python scripts/build_cumulative_surface_html.py --sigma-y 0 --sigma-t 3.0 --time-step 3

# Skip first N markets (oldest data may be anomalous)
python scripts/build_cumulative_surface_html.py --sigma-y 0 --sigma-t 3.0 --skip-first 500
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
python scripts/build_cumulative_surface_html.py --sigma-y 0 --sigma-t 3.0
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
