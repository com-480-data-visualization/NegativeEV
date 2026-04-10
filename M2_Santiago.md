# COM-480 Milestone 2: NegativeEV

| Student | SCIPER |
|---|---|
| Anton Svet | 347212 |
| Santiago Rivadeneira | 339832 |
| Arthur Margeat | 330258 |

*Individual contribution by Santiago Rivadeneira, to be merged with the drafts from Anton and Arthur into the final team document.*

## 1. Project Goal

Polymarket recently launched **Bitcoin 5-minute prediction markets**: every five minutes a new market opens where users bet whether BTC will finish *Up* or *Down* relative to the opening price. Each round resolves in exactly 300 seconds, creating a rare *"wisdom of the crowds"* stress-test two orders of magnitude faster than any market traditionally studied.

**NegativeEV** asks one focused question:

> **When the market implies a 70 % probability of Up, does Up actually occur 70 % of the time?**

We answer it visually, by showing how **observed outcome frequencies** compare to **market-implied probabilities** along the two dimensions that should drive them: the **time remaining** inside the 5-minute round, and the **BTC price momentum** since it opened. Target audience: researchers in market microstructure, quant practitioners benchmarking prediction models, and anyone curious whether ultra-short-horizon prediction markets really predict.

## 2. Data Pipeline

Our custom dataset joins **Polymarket's CLOB + Gamma APIs** with **Binance 1-second BTC spot prices**. The pipeline (`scripts/build_dataset.py`) produces two artefacts: `btc_5m_full.csv` (one row / market, 27 features) and `btc_5m_timeseries.parquet` (one row / market-second).

| Metric | Value |
|---|---|
| Resolved markets | **9,181** |
| Total trades | **16.8 M** |
| Total volume | **$686 M** |
| Avg trades / market | **1,835** |
| Up rate | **51.4 %** |
| Date range | Feb 12 to Mar 15, 2026 |

Cleaning ~15 GB of raw JSON from three endpoints down to the ~6 MB of tabular data the frontend consumes required cross-endpoint deduplication, a temporal join against Binance at 1 s granularity, 2D binning over `(time_remaining, BTC_Δ%)` for the calibration grid, and pre-aggregation of hourly and Markov statistics. Stack: **pandas / numpy / pyarrow**, with **Cursor + Claude Code** assisting the iterative scripting (see §6).

## 3. Visualizations (MVP)

Four visual building blocks, each already implemented in the live prototype (§6). Global layout: single-scroll flow *hero → 3D surface → 2D distributions → temporal heatmaps → Markov → closing*. The *Reference render* link under each block points to a PNG produced by our offline Python pipeline. These are not hand-drawn mockups, but the real exploratory output the final interactive version will mirror.

**A. Hero / dataset overview.** Animated stat counters (markets, volume, Up rate, date range) anchoring the reader before any interactive viz. *Tools:* React + Tailwind. *Lectures (past):* **01_1 Intro**, **07_1 Designing Viz**, **07_2 Do & Don't Viz**.

**B. 3D Calibration Surface *(centrepiece)*.** Two superimposed surfaces (a flat 50/50 reference plane and the actual historical Up-rate) coloured by calibration error. Users rotate, zoom, hover, and toggle each surface. Axes: time remaining (s) × BTC Δ (%) × P(Up). Arthur has already generated the offline surfaces (`docs/surface_overlay.html`, `surface_error.html`, `surface_implied.html`, `surface_realized.html`), confirming the grid is sound. *Live demo (from the prototype):*

![3D calibration surface demo](./docs/videos/surface_demo.gif)

*Reference render:* `docs/images/price_surface.png`. *Tools:* **Plotly.js** via `react-plotly.js`; Python offline for the pre-computed grid. *Lectures (past):* **05_1 Interaction**, **05_2 More interactive D3**, **06_1 Perception & Colors** (diverging colormap). *Lectures (future):* **11_1 Tabular Data** (multivariate grid aggregation).

**C. Distributions, temporal heatmaps & market efficiency.** A cluster of 2D charts establishing baseline intuition *before* the 3D surface: BTC Δ histogram by outcome (with a normal-fit overlay to expose fat tails), hourly outcome distribution, volume-vs-Δ scatter (log Y), daily-volume area chart, trades-per-market bar chart, and two heatmaps (volume, Up-rate) over day-of-week × hour. They answer *when* the market is active, *how* outcomes are shaped, and whether volatility correlates with volume. *Reference renders:* `docs/images/last_trade_price_outcome.png`, `docs/images/market_calibration.png`. *Tools:* **Recharts** for 2D charts, custom SVG for heatmaps. *Lectures (past):* **04_1 Data**, **06_2 Mark & Channel**. *Lectures (future):* **11_1 Tabular Data**.

**D. Markov transition diagram + streak chart.** Does an *Up* round make the next round more likely to be *Up*? We compute the four transition probabilities from the ordered sequence of 9,181 resolutions and render an interactive SVG with an animated *simulation* mode (hit "Simulate" and a 20-step random walk highlights each arrow as it fires). A bar chart shows the empirical streak-length distribution. *Live demo (from the prototype):*

![Markov analysis demo](./docs/videos/markov_demo.gif)

*Reference render:* `docs/images/markov.png`. *Tools:* hand-written SVG + React state; Recharts for the streak histogram. *Lectures (past):* **05_1 Interaction**. *Lectures (future):* **10 Graphs** (node-link diagrams).

## 4. Extra ideas *(droppable)*

- **Live market replay**: an animated 3D line tracing a single real 5-minute round across the calibration surface.
- **Trading playground**: $100 virtual capital, user tweaks two hyperparameters (entry threshold, bet size), site backtests against a 100-market sample and reports PnL.
- **Interactive slicing**: lock one axis of the 3D surface to get exact 2D cross-sections; context filters (high-volatility days, weekends only, etc.).
- **Scrollytelling**: text blocks triggering viz state changes on scroll. *Tools:* Framer Motion + React Scrollama. *Lecture (future):* **12_1 Storytelling**.

## 5. Independent implementation tracks

Five parallelizable tracks for M3: **(1)** data layer *(DONE)*, **(2)** 3D surface component, **(3)** 2D chart library, **(4)** Markov interactive + streak chart, **(5)** narrative shell. Track 1 is non-negotiable; tracks 2 and 3 are core; tracks 4 and 5 can be trimmed.

## 6. Functional Prototype Review

A fully interactive skeleton is already deployed at:

**→ https://preview--negativeev.lovable.app/**

**Methodology disclosure (AI-assisted tools).** The prototype was built in two distinct phases:

1. **Data cleaning (~15 GB to ~6 MB)**: Python ingestion, join and aggregation scripts developed iteratively with **Cursor + Claude Code** (deduplication, Binance 1 s alignment, grid binning). All code was reviewed and run locally.
2. **UI scaffolding**: the React + Tailwind + Plotly/Recharts frontend was bootstrapped with **Lovable** (AI web-app builder) as a *design-exploration* tool to lock the information architecture and visual identity before committing to a hand-written final version.

**This prototype is explicitly not our final deliverable.** Its purpose is to (a) validate that the chosen stack can render every visualization we want, (b) lock the narrative architecture, and (c) show tangible progress on all four MVP visualizations.

**What already works:** animated hero counters; 3D calibration surface (auto-rotating Plotly, pauses on user interaction); BTC Δ histogram + hourly outcome distribution + volume scatter; volume and Up-rate heatmaps over day-of-week × hour; Markov diagram with interactive 20-step simulation; streak-length histogram; market efficiency cluster (normal-fit overlay, daily volume area chart, trades-per-market); dark theme, scroll-linked navbar, fade-in animations, responsive layout.

**Next steps for M3:** migrate from Lovable into a hand-written **Next.js + React** repo authored by the team (reusing only the pre-computed data and the validated component structure); add the **scrollytelling** layer; wire in Arthur's offline surfaces (`docs/surface_overlay.html`); ship at least one extra idea (trading playground or slicing).
