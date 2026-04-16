# NegativeEV
### Are Polymarket's 5-minute Bitcoin markets actually well-calibrated?

**COM-480 Data Visualization · EPFL Spring 2026 · Milestone 2**

*Santiago Rivadeneira, individual contribution (to be merged with Anton Svet and Arthur Margeat for the final team submission).*

**Team:** Anton Svet (347212) · Santiago Rivadeneira (339832) · Arthur Margeat (330258)  
**Prototype:** https://negativeev.lovable.app/ · **Repository:** https://github.com/com-480-data-visualization/NegativeEV

<p align="center"><img src="./docs/images/price_surface.png" alt="Preview of the 3D calibration surface" width="78%"/></p>

---

## 1. Project Goal

In late 2025 Polymarket launched **btc-updown-5m**, a family of prediction markets where a new round opens every five minutes: traders bet whether BTC will finish *Up* or *Down* relative to the opening price. With ~288 markets per day and 9,181 resolved rounds in our window, this is a natural experiment on crowd calibration at sub-minute granularity, two orders of magnitude faster than any market classically studied.

**NegativeEV** asks one focused question:

> **When the market implies a 70 % probability of Up, does Up actually occur 70 % of the time?**

We answer it visually, comparing **observed outcome frequencies** against **market-implied probabilities** along the two dimensions that should drive them: **time remaining** inside the 5-minute round, and **BTC price momentum** since it opened.

**Target audience.** Three readers frame the design. A **quant researcher** wants to find exploitable calibration gaps and drills into the 3D surface with slicing. A **crypto journalist** wants an intuitive story and reads the scrollytelling linearly. A **curious non-expert** with no prior Polymarket exposure needs to know whether this is signal or noise and plays with the Markov simulation. The design goal is to serve all three on **one scrollytelling page with stepped reveal**, not three separate dashboards.

**Dataset at a glance** (built in Milestone 1, see `scripts/build_dataset.py`): **9,181 resolved markets**, **16.8 M trades**, **$686 M total volume**, **1,835 avg trades per market**, **51.4 % Up rate** (4,719 Up / 4,462 Down), median bid-ask spread of 1 cent, spanning Feb 12 to Mar 15 2026. Full EDA in `notebooks/eda_btc5m.ipynb`.

**Visual inspiration.** NYT *Election Needle* for uncertainty under time pressure, *The Pudding* for scroll-driven narrative, and the implied-volatility surface tradition from options finance for the 3D centrepiece.

---

## 2. Visualizations (MVP)

### 2.1 Global scrollytelling layout

The site is a single-scroll narrative. Blocks fade in as the user scrolls, and the 3D surface auto-rotates until the user interacts with it. Sections, top to bottom:

1. **Hero** (entry point, not a visualization): animated dataset counters.
2. **Block A** *(centrepiece, the MVP)*: 3D Calibration Surface.
3. **Block B**: Distributions, temporal heatmaps, market-efficiency cluster.
4. **Block C**: Markov transition diagram + streak histogram.
5. **Closing**: repository, team, references.

### 2.2 Hero and dataset overview

**What:** four animated stat counters (`9,181 markets`, `$686 M volume`, `51.4 % Up`, `32 days`) rising from zero over two seconds as the section enters the viewport.  
**Why:** anchors the reader in real dataset scale before any interactive element competes for attention.  
**Encoding:** text marks, no visual channels beyond typographic weight; the animation itself is the interaction.  
**Tools:** React 19 + Tailwind + a custom `useAnimatedCounter` hook driven by `requestAnimationFrame` with cubic ease-out.  
**Lectures applied (past):** *01_1 Intro to Data Viz* (why show scale first), *07_1 Designing Viz* and *07_2 Do & Don't Viz* (progressive disclosure).

### 2.3 Block A. 3D Calibration Surface *(centrepiece, the MVP)*

<p align="center"><img src="./docs/videos/surface_demo.gif" alt="3D calibration surface live demo" width="52%"/></p>

**What:** two superimposed 3D surfaces showing how the empirical Up-rate deviates from the 50 % prior as a function of time remaining and BTC price variation.  
**Why:** the MVP, because it answers the calibration question in a single rotatable image. It adapts the classic *implied volatility surface* from options finance, substituting `(strike, expiry, IV)` with `(BTC Δ, time remaining, real P(Up))`.  
**Encoding (marks & channels):** position on all three axes; color saturation on a diverging `RdYlGn` palette encodes the *error* (actual minus 0.5), **not** the probability itself. A diverging palette on probability would wrongly imply that 1 is "good" and 0 is "bad"; both are equally informative outcomes. The theoretical 50/50 reference plane is rendered semi-transparent (40 % alpha) so overlap is readable.  
**Interactions:** drag rotates, scroll zooms, hover reveals a `(time, Δ, P(Up), sample count)` tooltip, click slices a 2D cross-section below, a toggle hides the reference plane.  
**Tools:** Plotly.js via `react-plotly.js` for the mesh; Python offline (pandas + numpy + pyarrow) pre-computes a 30 × 20 grid shipped as a 7 KB JSON. Arthur has already generated offline variants (`docs/surface_*.html`), confirming the grid is sound. *Rejected alternatives:* Three.js / React Three Fiber (would force custom shaders, axes and colorbars), raw D3 (no 3D scenegraph).  
**Lectures:** *05_1 Interaction* and *05_2 More interactive D3* for drag/hover/click feedback; *06_1 Perception & Colors* for the diverging palette on error; *06_2 Mark & Channel* for position-dominated encoding; *11_1 Tabular Data* (future) for grid-aggregation refinement. *Reference render:* `docs/images/price_surface.png`.

### 2.4 Block B. Distributions, temporal heatmaps and market efficiency

**What:** a 2D cluster that establishes baseline intuition *before* the 3D surface. BTC Δ histogram stacked by outcome with a normal-fit overlay to expose fat tails, hourly outcome bars, volume-vs-Δ scatter (log Y), daily volume area chart, trades-per-market bars, and two day-of-week × hour heatmaps for volume and Up-rate.  
**Why:** answers the easy questions first (*when* is the market active, *how* are outcomes shaped, *does* volatility correlate with volume) so the reader arrives at the 3D surface already fluent in the data.  
**Encoding:** position (x-axis) for binned quantitative dimensions, length (bar height) for counts, ordered hue for Up/Down category. Heatmaps use sequential `viridis` for volume (ordered quantitative) and the same diverging `RdYlGn` as the 3D surface for Up-rate, preserving cross-section consistency.  
**Interactions:** hover shows tick-level detail, click on a bar filters the scatter, heatmap cells expand on click.  
**Tools:** Recharts for bars/scatter/histograms/area, custom SVG for heatmaps (needed for pixel-perfect axis labels). *Rejected alternatives:* Visx (more boilerplate for the same result), raw D3 (too low-level at this scale).  
**Lectures:** *04_1 Data* (histogram and binning decisions), *06_1 Perception* and *06_2 Mark & Channel* (palette choice), *11_1 Tabular Data* (future). *Reference renders:* `docs/images/last_trade_price_outcome.png`, `docs/images/market_calibration.png`.

### 2.5 Block C. Markov transition diagram + streak histogram

<p align="center"><img src="./docs/videos/markov_demo.gif" alt="Markov simulation live demo" width="52%"/></p>

**What:** a hand-written interactive SVG with two state circles (Up, Down) and four directed edges carrying the empirical transition probabilities computed from the ordered sequence of 9,181 resolutions. A *Simulate* button fires a 20-step random walk that highlights each traversed edge; a companion bar chart shows the streak-length distribution.  
**Why:** tests whether consecutive outcomes are truly independent or whether short streaks, persistence or reversals hide in the data. The animated simulation makes the abstract transition matrix tangible for non-quant readers.  
**Encoding:** node size encodes marginal frequency, edge width encodes transition probability (redundant with the numeric label for robustness), highlight color during simulation. The streak chart uses grouped bars with one color per direction.  
**Interactions:** hover on an edge dims the unrelated ones, hover on the simulated sequence highlights the traversed edge, speed slider (100 to 1000 ms per step).  
**Tools:** hand-written SVG + React state (no library needed for two states); Recharts for the streak histogram. *Rejected alternatives:* D3 force-layout (topology is fixed and doesn't benefit from force simulation).  
**Lectures:** *05_1 Interaction*; *10 Graphs* (future) for vocabulary on node-link diagrams and to justify the more ambitious information-propagation network listed as an extra. *Reference render:* `docs/images/markov.png`.

---

## 3. Design decisions and tool stack

**Visual identity.** Dark theme (`#0f172a`) to match trading-platform convention and let chromatic data pop. Up = green (`#22c55e`), Down = red (`#ef4444`), calibration error on a diverging `RdYlGn`, volume on sequential `viridis`, interaction accent in blue (`#3b82f6`). Typography: **Inter** (body) and **JetBrains Mono** (numbers and code).

**Accessibility and performance.** Red and green get combined with directional icons (`▲`/`▼`) for color-blind safety, every chart has an `aria-label`, `prefers-reduced-motion` disables auto-rotation and step animations, heatmaps collapse to a single column on mobile. The scatter is downsampled to 2 000 points from 9,181 for 60 fps; the 3D matrix ships as a 7 KB pre-computed JSON to avoid aggregating 16.8 M trades on the client.

**Tool stack comparison** (choices per need, with one rejected alternative each):

| Need | Chosen | Rejected (why) |
|---|---|---|
| 3D surface | Plotly.js (`react-plotly.js`) | Three.js / R3F (would force custom shaders, axes and colorbar) |
| 2D charts | Recharts | Visx (more boilerplate for the same result at this scale) |
| Heatmaps | Custom SVG | Recharts Treemap (no pixel-perfect axis labels) |
| Markov diagram | Hand-written SVG + React state | D3 force-layout (fixed 2-state topology doesn't need simulation) |
| Scrollytelling | React Scrollama + Framer Motion | GSAP ScrollTrigger (Scrollama is the de-facto standard for viz) |

---

## 4. MVP, extras, and prototype review

### 4.1 Extras *(creative, droppable without damaging the core story)*

Ranked by visual impact per engineering effort, highest first:

- **Live market replay.** An animated 3D line tracing a single real 5-minute round across the calibration surface (~1 day of work, loads `btc_price_paths.json` lazily).
- **Trading playground.** $100 virtual capital, user tweaks entry probability threshold and bet size, site backtests against a 100-market random sample and reports PnL (~2 to 3 days, client-side simulator).
- **Interactive slicing.** Lock one axis of the 3D surface to reveal a 2D cross-section below, plus context filters (high-volatility days, weekends only, specific hour bands) (~2 days).
- **Scrollytelling upgrade.** Text blocks trigger viz state changes on scroll (morph 2D calibration curve into the 3D surface, region highlighting) (~2 to 3 days). *Lecture needed (future): 12_1 Storytelling.*

### 4.2 Independent implementation tracks

Five parallelizable tracks so the team can divide the work cleanly: **(1)** data layer (DONE), **(2)** 3D surface component, **(3)** 2D chart library, **(4)** Markov interactive, **(5)** narrative shell. Tracks 2 and 3 are the non-negotiable core.

### 4.3 Functional prototype review

A fully interactive skeleton is already deployed at **https://negativeev.lovable.app/**.

**Methodology disclosure (AI-assisted tools).** Two distinct phases used AI assistants: the **data-cleaning pipeline** (~15 GB of raw JSON down to ~6 MB of tabular data) was developed iteratively with **Cursor + Claude Code**, with all code reviewed and run locally by us; the **React + Tailwind + Plotly/Recharts frontend** was bootstrapped with **Lovable** as a design-exploration tool to lock the information architecture and visual identity before a hand-authored rewrite.

**What already works.** All four MVP blocks are live: animated hero counters; auto-rotating 3D calibration surface (pauses on user interaction); 2D distribution and heatmap cluster; Markov diagram with animated 20-step simulation and streak histogram. The dark theme, scroll-linked navbar, fade-in section animations and responsive breakpoints are in place.

**Known limitations (addressed in M3).** The prototype runs on Vite + React (not Next.js), renders as a pure SPA, scrollytelling is not yet wired (only scroll-triggered fade-ins), Markov simulation state does not persist in the URL, and the accessibility pass is still pending. For Milestone 3 we migrate into a hand-authored Next.js + React repo (reusing the pre-computed data and validated component structure), wire in proper scrollytelling via Framer Motion + React Scrollama, integrate Arthur's offline surface variants, and ship at least one extra idea.
