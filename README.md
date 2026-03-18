# Project of Data Visualization (COM-480)

| Student's name | SCIPER |
| -------------- | ------ |
| Anton Svet | 347212 |
| Santiago Rivadeneira | 339832 |
| | |

[Milestone 1](#milestone-1) • [Milestone 2](#milestone-2) • [Milestone 3](#milestone-3)

## Milestone 1 (20th March, 5pm)

**10% of the final grade**

This is a preliminary milestone to let you set up goals for your final project and assess the feasibility of your ideas.
Please, fill the following sections about your project.

*(max. 2000 characters per section)*

### Dataset

> Find a dataset (or multiple) that you will explore. Assess the quality of the data it contains and how much preprocessing / data-cleaning it will require before tackling visualization. We recommend using a standard dataset as this course is not about scraping nor data processing.
>
> Hint: some good pointers for finding quality publicly available datasets ([Google dataset search](https://datasetsearch.research.google.com/), [Kaggle](https://www.kaggle.com/datasets), [OpenSwissData](https://opendata.swiss/en/), [SNAP](https://snap.stanford.edu/data/) and [FiveThirtyEight](https://data.fivethirtyeight.com/)).

### Problematic

Prediction markets have emerged as powerful forecasting tools. In the 2024 US elections, Polymarket correctly called 49 of 50 states, outperforming every major polling aggregator. The theoretical foundation, the "wisdom of crowds", posits that when participants stake real capital, market prices converge to true event probabilities.

But does this hold at micro-durations? Polymarket's Bitcoin 5-minute markets (btc-updown-5m) create a new market every 5 minutes: users bet whether BTC will go up or down relative to the opening price. With ~288 markets daily and thousands resolved since December 2024, we have an unprecedented dataset to test calibration at ultra-short timescales.

Our central question: **when a token trades at 70 cents (implying 70% probability), does the predicted outcome actually occur 70% of the time?** We investigate how this calibration varies across time remaining, price momentum, and volatility.

The core visualization is an interactive 3D surface comparing market-implied probability vs. historical outcome frequency. Axes: time remaining (0–300s), BTC price variation (%), and probability. Users can rotate, zoom, and overlay surfaces to spot where the market systematically over- or under-estimates outcomes.

Target audience: traders seeking pricing inefficiencies, researchers in market microstructure, data scientists benchmarking prediction models, and anyone interested in behavioral finance. Evidence suggests systematic biases in short-term markets: favorite-longshot bias, bot dominance (95%+ of trades), and last-second volatility spikes. Our tool makes these patterns visually explorable.

### Exploratory Data Analysis

> Pre-processing of the data set you chose
> - Show some basic statistics and get insights about the data

### Related work

**Existing work with prediction market data:** [Brier.fyi](https://brier.fyi/charts/polymarket/) analyzes 98,000+ Polymarket markets with 2D calibration curves, showing that contracts at 70% resolve correctly ~70% of the time. However, it focuses on long-duration markets and uses static 2D plots. Polymarket Analytics and Dune dashboards track positions and on-chain activity but lack probabilistic calibration. Academic work by Tsang & Yang (2026) analyzes Polymarket's 2024 election microstructure, while Becker (2026) documents systematic wealth transfer from takers to makers and identifies an "Optimism Tax."

**Originality of our approach:** No prior work combines: (1) 3D surface visualization, (2) ultra-short-term prediction markets (5 min), and (3) calibration analysis comparing token prices to actual outcome frequencies. The closest analogy is the implied volatility surface from options finance: we adapt this concept from (strike × expiry × IV) to (token price × time remaining × real probability). Our dataset (btc-updown-5m, since Dec 2024) has not been studied in any published work.

**Visual inspiration:** The [NYT Election Needle](https://www.nytimes.com/interactive/2020/11/03/us/elections/forecast-president.html) for communicating probability under uncertainty. FiveThirtyEight's interactive forecast models. [The Pudding](https://pudding.cool/)'s scrollytelling approach for data narratives. Plotly.js and d3-x3d for interactive 3D surface rendering. Past COM-480 projects (Lausanne Transportation 2023, Formula 1 2024) as benchmarks for expected quality.

**No prior exploration:** This dataset has not been used in any other course or project by our team.

## Milestone 2 (17th April, 5pm)

**10% of the final grade**


## Milestone 3 (29th May, 5pm)

**80% of the final grade**


## Late policy

- < 24h: 80% of the grade for the milestone
- < 48h: 70% of the grade for the milestone

