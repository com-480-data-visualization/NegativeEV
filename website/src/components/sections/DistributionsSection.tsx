/**
 * Rewind step 3 of 4 - what kind of move are we even pricing? A histogram
 * of final BTC returns followed by a scatter of volume against the same
 * return. Together they explain why prices hover near 50% and why volume,
 * not direction, is the honest signal of uncertainty.
 */
import BtcDistributionChart from '../BtcDistributionChart'
import VolumeVsChangeScatter from '../charts/VolumeVsChangeScatter'
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

export default function DistributionsSection() {
  return (
    <section id="distributions" className="mx-auto max-w-5xl px-6 py-24">
      <SectionHeader
        eyebrow="Rewind · 3 of 4"
        title="What kind of moves are being priced?"
        description={
          `Most five-minute rounds end with BTC nearly flat. So why bet? ` +
          `Because the rounds that do move are uncertain by nature, and ` +
          `that is where the money flows.`
        }
      />

      <div className="flex flex-col gap-8">
        <div>
          <Card title="Final BTC Δ distribution by outcome">
            <BtcDistributionChart />
          </Card>
          <InsightCallout>
            Most rounds finish within ±0.1%, and the green (UP wins) and red
            (DOWN wins) sides mirror each other. The normal-fit curve
            undershoots the tails: extreme moves show up more often than a
            Gaussian predicts. The same fat tails appear on the wider view
            above.
          </InsightCallout>
        </div>

        <div>
          <Card title="Market volume vs final BTC change">
            <VolumeVsChangeScatter />
          </Card>
          <InsightCallout>
            High-volume markets cluster around 0%: those are the rounds traders
            saw as most uncertain. Volume tracks{' '}
            <span className="text-white">how unsure the crowd was</span>, not
            which way it leaned. Buying UP because volume is high is not a
            strategy.
          </InsightCallout>
        </div>
      </div>

      {/* Bridge into the next rewind step. */}
      <p className="mt-10 text-center text-sm text-muted italic">
        One question remains: what if the previous round tips the next one?
        Could a streak-following strategy beat the market?
      </p>
    </section>
  )
}
