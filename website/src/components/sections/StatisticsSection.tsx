/**
 * Rewind step 1 of 4 - does the dataset hold up? Three sanity checks, in
 * order of decreasing "macroness": time coverage, liquidity, and the shape
 * of the underlying BTC returns. If any of these collapsed, every later
 * conclusion would too.
 */
import WideDistributionChart from '../charts/WideDistributionChart'
import DailyVolumeChart from '../charts/DailyVolumeChart'
import TradesPerMarketChart from '../charts/TradesPerMarketChart'
import SectionHeader from '../layout/SectionHeader'
import InsightCallout from '../layout/InsightCallout'

interface CardProps { title: string; children: React.ReactNode }

function Card({ title, children }: CardProps) {
  return (
    <div className="rounded-2xl border border-border bg-surface-elevated px-5 pt-5 pb-4">
      <h3 className="text-sm font-semibold text-white mb-4">{title}</h3>
      {children}
    </div>
  )
}

export default function StatisticsSection() {
  return (
    <section id="statistics" className="mx-auto max-w-5xl px-6 py-24">
      <SectionHeader
        eyebrow="Rewind · 1 of 4"
        title="Is the dataset trustworthy?"
        description={
          `Before reading anything into the surface, three quick checks. Does ` +
          `the dataset cover enough days? Are the markets actually traded, or ` +
          `running empty? And how wild can BTC get inside a single ` +
          `five-minute window?`
        }
      />

      <div className="flex flex-col gap-8">
        {/* 1. Time coverage - do we have enough days? */}
        <div>
          <Card title="Daily traded volume (USD)">
            <DailyVolumeChart />
          </Card>
          <InsightCallout>
            Thirty-two consecutive days of trading. Volume scaled sharply
            through late February, peaked in the first week of March, then
            settled. No gaps: every day in the window has live markets, so
            the analysis is not built on a sparse, hand-picked slice.
          </InsightCallout>
        </div>

        {/* 2. Liquidity - are these markets real or paper-thin? */}
        <div>
          <Card title="Trades per market">
            <TradesPerMarketChart />
          </Card>
          <InsightCallout>
            Roughly 98% of markets clear more than 500 trades in five minutes,
            with most landing between 1,500 and 2,500. That density turns a
            noisy five-minute window into a near-continuous implied-probability
            signal.
          </InsightCallout>
        </div>

        {/* 3. Return regime - what's the move we're trying to predict? */}
        <div>
          <Card title="Final BTC Δ distribution, fat-tails view (±3%)">
            <WideDistributionChart />
          </Card>
          <InsightCallout>
            Real ±1% moves (and rarer ±2%+ swings) appear inside five minutes.
            The Gaussian fit visibly undershoots the tails, a classic
            leptokurtic return. The underlying asset is not a sleepy random
            walk, which is part of what makes the calibration question
            interesting.
          </InsightCallout>
        </div>
      </div>

      {/* Bridge into the next rewind step. */}
      <p className="mt-10 text-center text-sm text-muted italic">
        The data holds up. Next: when does the trading happen, and does
        any day or hour shift the outcome?
      </p>
    </section>
  )
}
