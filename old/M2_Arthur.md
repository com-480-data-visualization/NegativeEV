# COM-480 Milestone 2: NegativeEV

## Project Goal

Our project, **NegativeEV**, aims to explore the "wisdom of crowds" at extremely short timescales. By leveraging a custom, high-frequency dataset combining Polymarket's 5-minute Bitcoin prediction markets with Binance spot prices, our main objective is to visualize **market calibration**. Specifically, we want to visually answer a central question: *When a token trades at 70 cents (implying a 70% probability of an outcome), does that predicted event actually occur 70% of the time at such micro-durations?*

To make this complex, high-frequency financial data accessible, our final product will be an interactive, scrollytelling-driven website. Users will be guided through foundational concepts, such as market volume, bid-ask spreads, and basic 2D calibration curves, before being introduced to our core visualization: a **3D interactive surface** that illustrates how market calibration evolves as a function of both time remaining and Bitcoin price momentum. 

This project targets researchers in market microstructure, data scientists benchmarking prediction models, and anyone interested in behavioral finance, offering an unprecedented visual tool to spot where the market systematically over- or under-estimates outcomes.

## Visualizations

To build a compelling narrative, we have broken down our visual approach into distinct components, moving from simple introductory charts to complex, multi-dimensional interactions.

*(Note: Please refer to the sketches provided below for a visual representation of our intended layout and graphics.)*

`[Insert Sketch 1: Global website layout and scrollytelling flow]`

### 1. 2D Introductory Charts (Distributions & Temporal Calibration)
Before introducing the 3D surface, we need to establish baseline metrics. This includes histograms showing the distribution of final token prices right before market resolution, and 2D calibration curves comparing market implied probability to actual observed frequency at specific time horizons (e.g., just after opening vs. 3 minutes before closing). 
* **Tools used:** We will use **Recharts** or **Visx** (by Airbnb), which are highly optimized, React-native visualization libraries perfect for rendering clean, responsive, and interactive 2D charts (SVG/Canvas).

`[Insert Sketch 2: 2D Calibration Curve and Histogram UI]`

### 2. The Core 3D Calibration Surface
This is the Minimal Viable Product (MVP) core of our project. It adapts the concept of an "implied volatility surface" from traditional finance. The visualization is an interactive 3D surface where the axes are: time remaining (0-300s), BTC price variation (%), and the calibration error (implied probability vs. realized outcome frequency). Users will be able to rotate, pan, and zoom to explore the data landscape.
* **Tools used:** **Plotly.js** (via `react-plotly.js`) for rendering the 3D mesh. Plotly is robust for scientific 3D data. Alternatively, we may use **React Three Fiber** (a React wrapper for Three.js) if we need deeper custom rendering capabilities. 
* **Data Prep Tools:** **Python (Pandas, NumPy)** is used offline to clean the 16.8 million trades and pre-compute the multidimensional grid/matrices required for the surface.

`[Insert Sketch 3: 3D Surface visualization with axis labels and tooltips]`

### 3. Interactive Scrollytelling Architecture
The visualizations will be embedded within a narrative flow. As the user scrolls down the page, text blocks will trigger changes in the visualizations (e.g., highlighting a specific part of a curve, or morphing a 2D plot into the 3D surface).
* **Tools used:** The website will be built using **Next.js** and **React** for a robust, component-based architecture. Styling will be handled via **Tailwind CSS** for rapid and consistent UI design. Scroll-driven animations will be managed using libraries like **React Scrollama** or **Framer Motion**.

## Additional Ideas

If time permits, we plan to implement the following features to enhance engagement and interactivity. These can be dropped without endangering the core meaning of the project:

* **Live Market Path (3D Trajectory):** Superimposing an animated 3D line (a "trail") directly onto the main calibration surface. This would dynamically replay a specific 5-minute market, showing how it navigates across the surface as time ticks down and prices fluctuate.
* **Gamification (Trading Bot Simulator):** Integrating an educational mini-game where users start with a virtual portfolio (e.g., $1,000). Users can tweak trading hyperparameters based on the calibration surface (e.g., *Buy YES if the implied probability is X% lower than the historical surface*). The site will then replay historical data to see if the user's strategy successfully exploits visual market inefficiencies.
* **Interactive Slicing & Context Filters:** Allowing users to dynamically "slice" the 3D surface to view exact 2D cross-sections (e.g., locking the time axis). We also aim to add toggles to filter the underlying data by market context, such as isolating high-volatility days.
* **Rich Tooltips:** Displaying deep statistics (volume traded, number of markets aggregated) when hovering over specific nodes on the 3D surface.

## Notes And Additional Information

**Functional Project Prototype Review**
At this stage of the project, we have successfully validated the technical feasibility of both our web architecture and our data modeling:
1. **Initial Web Prototype:** We have deployed a functional skeleton of our website, which is currently running at **[https://negativeev.lovable.app](https://negativeev.lovable.app)**. This prototype validates our Next.js/React structure, routing, and Tailwind layout, providing the exact placeholders where our interactive widgets will be injected.
2. **Offline 3D Generation:** In parallel, we have written comprehensive Python scripts that successfully generate the 3D surface visualization from our raw API dataset. This confirms that our data is sound and mathematically forms a continuous, insightful surface. 
3. **Next Steps:** The primary work for Milestone 3 consists of bridging these two achievements: exporting the Python-generated surface matrices into a lightweight format (JSON) and rendering them interactively via React libraries within our live Next.js prototype.
