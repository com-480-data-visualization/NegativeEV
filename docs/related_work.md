# Related Work - NegativeEV (Polymarket BTC 5-min)

## 1. Existing Visualization Tools & Dashboards

### Brier.fyi
- Analyzes 98,259+ historical Polymarket markets
- 2D calibration curves (predicted probability vs. actual resolution)
- Filters by traders, volume, duration, days before resolution
- **Key difference:** 2D only, long-duration markets (days/weeks), no 5-min markets
- URL: https://brier.fyi/charts/polymarket/

### Polymarket Analytics
- Commercial dashboard: market search, top traders, real-time activity tracking
- Focused on portfolio/position tracking, not calibration analysis
- URL: https://www.polymarketanalytics.com/

### Dune Analytics - Polymarket
- On-chain dashboards using Polygon blockchain data
- Tables: market_trades, market_prices_hourly/daily, positions, market_details
- Useful for quantitative analysis but no probabilistic calibration visualizations
- URLs: https://dune.com/polymarket_analytics, https://dune.com/rchen8/polymarket

### Manifold Markets Calibration
- Brier Score: 0.17371
- Interactive calibration curve showing quality improves with 10-20+ traders
- URL: https://manifold.markets/calibration

## 2. Academic Papers

### "The Anatomy of Polymarket" (Tsang & Yang, 2025)
- Transaction-level analysis using complete on-chain data
- Volume decomposition framework: minting, burning, token conversion
- Documents market maturation: reduced arbitrage, decreased Kyle's lambda
- URL: https://arxiv.org/abs/2603.03136

### "Prediction Markets? Accuracy and Efficiency of $2.4B in 2024" 
- Multi-platform comparison: Polymarket (67% accuracy), PredictIt (93%), Kalshi (78%)
- Persistent cross-platform arbitrage opportunities
- URL: https://ideas.repec.org/p/osf/socarx/d5yx2_v1.html

### "Microstructure of Wealth Transfer in Prediction Markets" (Becker, 2025)
- 72.1M trades, $18.26B volume
- Systematic wealth transfer from Takers to Makers
- Identifies "Optimism Tax" and favorite-longshot bias
- URL: https://jbecker.dev/research/prediction-market-microstructure

### "Makers and Takers: Economics of Kalshi" (Whelan)
- Low-price contracts earn less than break-even after fees
- High-price contracts earn more, favorite-longshot bias in regulated markets
- URL: https://www.karlwhelan.com/Papers/Kalshi.pdf

### "How Manipulable Are Prediction Markets?" (2025)
- Experimental study on prediction market manipulability
- IRB approval from Paris School of Economics
- URL: https://arxiv.org/abs/2503.03312

### Classic references
- Rothschild & Wolfers (2009): Prediction markets beat polls in 74% of comparisons
- Wolfers & Zitzewitz (2008): Market prices are good probability estimates long-run
- Atanasov et al. (2015): Markets beat simple polls, but algorithmic polls can match

## 3. BTC 5-Minute Markets - Specific Research

### No published analysis exists
- btc-updown-5m markets launched in 2025, first trades in early February 2026
- Generated $25.2M in volume in first 40 hours (~$52K per window)
- ~288 markets per day per asset
- Source: https://longbridge.com/en/news/275964981

### Known characteristics
- 95%+ of trades are from HFT bots
- Last 5-7 seconds show amplified volatility
- 7.1% of addresses bought both YES and NO simultaneously (profitable 80% of time)
- Sources: https://medium.com/@benjamin.bigdev/unlocking-edges-in-polymarkets-5-minute-crypto-markets-last-second-dynamics-bot-strategies-and-db8efcb5c196

## 4. Originality of Our Approach

| Aspect | Existing work | Our project |
|--------|--------------|-------------|
| Calibration | 2D curves (Brier.fyi, Manifold) | **3D surface** |
| Time horizon | Days/weeks/months | **5 minutes** |
| Asset | Politics, sports, macro | **Bitcoin (BTC)** |
| Data | Midpoint probability | **Token price in continuous time** |
| Visualization | Static curves/filters | **Interactive 3D (rotation, zoom, overlay)** |

**Closest analogy:** Implied volatility surfaces in options finance.
We adapt (strike × expiry × IV) → (token price × time remaining × real probability).

## 5. Visual Inspiration

### 3D Interactive Surfaces
- Plotly.js 3D Surface Plots: https://plotly.com/javascript/3d-surface-plots
- D3.js 3D Surface: https://gist.github.com/supereggbert/aff58196188816576af0
- d3-x3d Surface Plot: https://observablehq.com/@jamesleesaunders/d3-x3d-components-surface-plot
- Interactive 2D/3D Probability Distributions (PMC 2023): https://pmc.ncbi.nlm.nih.gov/articles/PMC10361712/

### Financial Visualization
- CoinMarketCap Crypto Heat Map: https://coinmarketcap.com/crypto-heatmap/
- Implied volatility surface tools: Pineify, QuanTopo, VolSurface (GitHub)

### Probability & Uncertainty
- NYT Election Needle: https://www.nytimes.com/interactive/2020/11/03/us/elections/forecast-president.html
- Observable D3 probability notebooks

### Scrollytelling & Data Narratives
- The Pudding: https://pudding.cool/
- Scrollama + D3 framework: https://github.com/edriessen/scrollytelling-scrollama-d3-demo

## 6. Past COM-480 Projects (Quality Benchmarks)

| Year | Project | URL |
|------|---------|-----|
| 2024 | Formula 1 | https://github.com/com-480-data-visualization/project-2024-Formula1 |
| 2024 | WALS Viz | https://github.com/com-480-data-visualization/project-2024-wals-viz |
| 2023 | Lausanne Transportation | https://github.com/com-480-data-visualization/project-2023-the-vizards |

All projects: https://github.com/com-480-data-visualization (317+ repos)
