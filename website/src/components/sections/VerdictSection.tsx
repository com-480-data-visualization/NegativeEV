/**
 * Closing prose block between the rewind chain and the Playground. Four
 * short paragraphs:
 *   1. The headline answer ("mostly yes, depends on the round state").
 *   2. The time-remaining mechanism: MSE drops 10x from open to close,
 *      because the market starts with almost no info and gains it tick
 *      by tick.
 *   3. The two patterns that survive all the way to close - sharp BTC
 *      moves (MAE roughly doubles for |dBTC| > 10%) and a steady ~1 pp
 *      UP under-pricing across every snapshot.
 *   4. One-line summary + handoff to the playground.
 *
 * Numbers in the prose come from the live data files; cross-checked by
 * scripts/verify_verdict_numbers.py - rerun it after any data refresh
 * to confirm the prose still matches.
 *
 * Text-only by design: this is the moment we answer the question posed
 * by the Hero, not the moment we show another chart.
 */
export default function VerdictSection() {
  return (
    <section id="verdict" className="mx-auto max-w-5xl px-6 py-24">
      <div className="relative overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-surface-elevated to-surface-elevated/40 px-6 py-10 sm:px-10">
        {/* Decorative accent glow - same recipe as the Hero gauge card. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -left-24 h-56 w-56 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, #c084fc 0%, transparent 70%)' }}
        />

        <div className="relative max-w-3xl mx-auto text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent">
            Verdict
          </p>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white leading-tight">
            So, do these markets really predict?
          </h2>

          <div className="mt-6 flex flex-col gap-4 text-left sm:text-center text-base leading-relaxed text-gray-300">
            <p>
              Mostly,{' '}
              <span className="text-green-400 font-semibold">yes</span>, but
              it depends on{' '}
              <span className="text-white font-medium">when in the round</span>
              {' '}you look. The dataset is real and liquid. No hour of the
              week shifts the needle. Most rounds barely move, and volume
              tracks{' '}
              <span className="text-white font-medium">uncertainty</span>{' '}
              rather than direction. Consecutive rounds are statistically
              independent. The four rewind sections ruled out every "easy"
              edge, so whatever predictive signal exists has to live inside
              the active round.
            </p>

            <p>
              That is exactly what the{' '}
              <span className="text-white font-medium">calibration curves</span>
              {' '}above show. When a round opens, the market has almost no
              information: a few seconds of BTC history, very little volume,
              prices clustered near{' '}
              <span className="text-white font-medium">50 %</span>. The MSE
              between live price and outcome is near{' '}
              <span className="text-white font-mono">0.003</span>. By the
              final tick, with five minutes of BTC moves and most of the
              trading already done, it collapses to{' '}
              <span className="text-white font-mono">0.0003</span> -{' '}
              <span className="text-green-400 font-semibold">an order of magnitude better</span>.
              The crowd converges on the right answer as the clock runs down.
            </p>

            <p>
              Two patterns survive all the way to close. When BTC has moved
              sharply since open ({'|'}ΔBTC{'|'} above{' '}
              <span className="text-white font-medium">10 %</span>), the mean
              absolute calibration error roughly{' '}
              <span className="text-amber-400 font-semibold">doubles</span>.
              Those are the bright cells at the front of the headline surface,
              where the move outran the order book. And across every snapshot,
              realised UP outcomes sit a steady{' '}
              <span className="text-amber-400 font-semibold">~1 pp above</span>
              {' '}the implied UP price: a small but persistent{' '}
              <span className="text-white font-medium">under-pricing of UP</span>
              {' '}that holds even one tick before resolution. The noisy corners
              near 0 % and 100 %, where a single trade moves the price, add
              a few more cells where a contrarian bet has room to work.
            </p>

            <p>
              In short: the crowd is doing its job, with a handful of
              measurable{' '}
              <span className="text-white font-medium">blind spots</span>.
              Want to test it yourself?
            </p>
          </div>

          <a
            href="#playground"
            className="mt-7 inline-flex items-center gap-2 rounded-full border border-accent/60 bg-accent/10 px-4 py-2 text-sm font-medium text-white hover:bg-accent/20 transition-colors"
          >
            Try the trading playground
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round"
              strokeLinejoin="round" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  )
}
