/**
 * Closing analytical step. The four rewind sections have ruled out every
 * "easy" edge; the only place predictive signal can live is inside the
 * active round. This section quantifies exactly that: a 2D slice of the
 * 3D headline surface at four moments before close, with the MSE attached
 * to each curve. Naturally hands off to the Verdict.
 */
import CalibrationCurvesChart from '../charts/CalibrationCurvesChart'
import SectionHeader from '../layout/SectionHeader'
import InsightCallout from '../layout/InsightCallout'

export default function CalibrationOverTimeSection() {
  return (
    <section id="convergence" className="mx-auto max-w-5xl px-6 py-24">
      <SectionHeader
        eyebrow="Closing argument"
        title="When does the market actually figure it out?"
        description={
          `Every "easy" edge has been ruled out. Whatever predictive signal ` +
          `exists lives inside the active round. Here is the headline surface ` +
          `sliced at four moments before close: markets are binned by their ` +
          `live implied UP probability, and the realised UP rate is plotted ` +
          `per bucket. Curves closer to the dashed diagonal mean the market ` +
          `price is a more honest forecast.`
        }
      />
      <div className="rounded-2xl border border-border bg-surface-elevated px-5 pt-5 pb-4">
        <CalibrationCurvesChart />
      </div>
      <InsightCallout>
        As the clock runs down, the curves collapse onto the diagonal and MSE
        shrinks by an order of magnitude. The market learns what it did not
        know at open. The largest miscalibration sits at the price extremes
        (near 0% and 100%), where thin order books amplify noise. That is the
        answer the surface above was pointing at.
      </InsightCallout>
    </section>
  )
}
