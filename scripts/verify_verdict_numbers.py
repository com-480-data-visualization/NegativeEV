"""Cross-check the numbers quoted in the VerdictSection prose against the
live JSON data shipped to the website.

Prints, for each claim in the verdict copy:
  - MSE evolution across the four calibration checkpoints (open -> close).
  - Weighted mean (realized - implied) gap on the calibration lookup,
    globally and stratified by time_remaining and by |BTC % change|.
  - The raw outcome UP-rate vs the 50/50 null, with a z-score.

Run it after any regeneration of the data files
(`build_analysis_data.py` or `export_calibration_lookup.py`) to confirm
the verdict prose still matches the dataset. If the numbers drift, the
prose in `website/src/components/sections/VerdictSection.tsx` should be
updated to match."""
import json
import numpy as np
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "website" / "public" / "data"

# 1) Calibration curves: where does each curve sit relative to the diagonal?
cc = json.loads((ROOT / "calibration_curves.json").read_text())
print("=== Calibration curves: weighted mean(up - p) by checkpoint ===")
print("    (negative = market over-prices UP ; positive = market under-prices UP)\n")
for ck in cc["checkpoints"]:
    pts = ck["points"]
    w = np.array([p["n"] for p in pts], float)
    diff = np.array([p["up"] - p["p"] for p in pts], float)
    wmean = (diff * w).sum() / w.sum()
    print(f"  {ck['label']:>22}  N={int(w.sum()):>5}  mean(up-p)={wmean*100:+.3f} pp   MSE={ck['mse']:.5f}")

# 2) Calibration lookup: 2D grid of (time_remaining, BTC_pct_change)
cl = json.loads((ROOT / "calibration_lookup.json").read_text())
t_grid = np.array(cl["t_grid"])               # time_remaining (seconds)
y_grid = np.array(cl["y_grid"])               # btc_pct_change
realized = np.array(cl["realized"], float)    # [t][y]
implied = np.array(cl["implied"], float)
n_samp = np.array(cl["n_samples"])

mask = np.isfinite(realized) & np.isfinite(implied) & (n_samp >= 30)
g_all = (realized - implied)[mask]
n_all = n_samp[mask]
print()
print("=== Global stats over the lookup grid (gap = realized - implied) ===")
print(f"  N cells={mask.sum()}, total samples={int(n_all.sum())}")
print(f"  weighted mean gap = {((g_all*n_all).sum()/n_all.sum())*100:+.3f} pp")
print(f"  weighted MAE      = {((np.abs(g_all)*n_all).sum()/n_all.sum())*100:.3f} pp")

# Stratify by time remaining (does calibration genuinely improve as the
# clock runs down? -> the second paragraph of the verdict).
print()
print("=== Stratified by time_remaining ===")
for lo, hi in [(0, 60), (60, 120), (120, 180), (180, 240), (240, 300)]:
    rows = (t_grid >= lo) & (t_grid < hi)
    sub = mask & rows[:, None]
    if sub.sum() == 0:
        continue
    g = (realized - implied)[sub]
    ns = n_samp[sub]
    print(
        f"  t_remaining in [{lo:3d},{hi:3d})s  N={int(ns.sum()):>6}  "
        f"mean gap={(g*ns).sum()/ns.sum()*100:+.3f} pp   "
        f"MAE={(np.abs(g)*ns).sum()/ns.sum()*100:.3f} pp"
    )

# Stratify by |BTC move| (do sharp moves break calibration? -> the third
# paragraph of the verdict).
print()
print("=== Stratified by |BTC % change since open| ===")
absy = np.abs(y_grid)
for lo, hi in [(0, 0.05), (0.05, 0.1), (0.1, 0.2), (0.2, 0.3), (0.3, 1.0)]:
    cols = (absy >= lo) & (absy < hi)
    sub = mask & cols[None, :]
    if sub.sum() == 0:
        continue
    g = (realized - implied)[sub]
    ns = n_samp[sub]
    print(
        f"  |dBTC| in [{lo:.2f},{hi:.2f})%  N={int(ns.sum()):>6}  "
        f"mean gap={(g*ns).sum()/ns.sum()*100:+.3f} pp   "
        f"MAE={(np.abs(g)*ns).sum()/ns.sum()*100:.3f} pp"
    )

# 3) Outcome bias: is there an asymmetry in the realized UP rate alone?
# Verdict para 3 mentions a steady ~1 pp UP under-pricing - this is the
# raw-outcome side of that story.
print()
print("=== Outcome asymmetry (realized UP rate weighted by samples) ===")
r = realized[mask]
mean_real = (r * n_all).sum() / n_all.sum()
print(f"  weighted mean realized P(UP) across all (t, dBTC) cells = {mean_real*100:.3f}%")
print("  (above 50% = the dataset itself has more UP outcomes; cross-check vs hero_stats.up_rate)")

hero = json.loads((ROOT / "hero_stats.json").read_text())
print(f"  hero_stats.up_rate = {hero['up_rate']*100:.3f}%  (n_up={hero['n_up']}, n_down={hero['n_down']})")
se = (0.5 * 0.5 / (hero["n_up"] + hero["n_down"])) ** 0.5
print(f"  SE under H0 (50/50) = {se*100:.3f} pp, so z = {(hero['up_rate']-0.5)/se:.2f}")
