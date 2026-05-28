/**
 * Closing interactive section. The Playground component itself is
 * untouched; only the surrounding header copy changes so it lands as the
 * "your turn" payoff at the end of the narrative.
 */
import Playground from '../Playground'
import SectionHeader from '../layout/SectionHeader'

export default function PlaygroundSection() {
  return (
    <section id="playground" className="mx-auto max-w-5xl px-6 py-24 pb-32">
      <SectionHeader
        eyebrow="Your turn"
        title="Trading playground"
        description={
          <>
            Pick a session length and a difficulty mode, then replay real
            Polymarket BTC five-minute markets back-to-back with a starting
            balance of <span className="font-semibold text-white">$100</span>.
            Each round, the BTC chart and live token prices update tick by
            tick. Buy or sell{' '}
            <span className="font-semibold text-green-400">↑ UP</span> /{' '}
            <span className="font-semibold text-red-400">↓ DOWN</span> at any
            point. The winning side cashes out at close.
            <br />
            <br />
            <span className="font-semibold text-accent">Full</span> mode adds
            a live{' '}
            <span className="font-semibold text-accent">Historical Prediction Insight</span>{' '}
            panel that runs the calibration math on every tick. Use it as a
            second opinion, not an oracle: it flags{' '}
            <span className="text-white">where</span> history disagrees with
            the live price, not{' '}
            <span className="text-white">when</span> or{' '}
            <span className="text-white">how much</span> to bet. To get
            anything out of it you need to tune the thresholds in{' '}
            <span className="text-white">Verdict tuning</span>, time your
            entry inside the round, and size each trade yourself.
          </>
        }
      />
      <Playground />
    </section>
  )
}
