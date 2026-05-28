/**
 * Rewind step 4 of 4 - are rounds independent? The Markov diagram + streak
 * histogram are the existing chart; only the surrounding copy changes so
 * the chapter explicitly hands off to the Verdict.
 */
import MarkovDiagram from '../MarkovDiagram'
import SectionHeader from '../layout/SectionHeader'
import InsightCallout from '../layout/InsightCallout'

export default function MarkovSection() {
  return (
    <section id="markov" className="mx-auto max-w-5xl px-6 py-24">
      <SectionHeader
        eyebrow="Rewind · 4 of 4"
        title="Does the previous round predict the next?"
        description={
          `A transition probability answers one question: given the last round ` +
          `ended UP, how often did the next one also go UP? If rounds are ` +
          `independent, like successive coin flips, the four arrows should ` +
          `land near 50% and streak lengths should follow a clean geometric ` +
          `curve. Hit Simulate to walk the chain step by step.`
        }
      />
      <MarkovDiagram />
      <InsightCallout>
        Streak lengths fall off as a clean geometric curve, the shape
        independent coin flips produce. No clustering, no momentum, no mean
        reversion. Past rounds carry no signal.
      </InsightCallout>

      {/* Bridge into the Convergence section. */}
      <p className="mt-10 text-center text-sm text-muted italic">
        Every "easy" edge (time of day, direction, streak) is ruled out. The
        only signal left lives inside the active round. Below, we slice the
        headline surface to see when in the round it emerges.
      </p>
    </section>
  )
}
