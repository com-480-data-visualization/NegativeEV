/**
 * The headline visualisation. Deliberately *describes* the surface rather
 * than concluding from it: the four rewind sections below earn the right
 * to interpret what we are looking at here, and the dedicated 2D
 * "Convergence" section at the end of the analysis is where the surface
 * is quantitatively read back. Keep this section focused on the object
 * itself - what it is, how it was built, how to read it.
 */
import PlotFrame from '../layout/PlotFrame'
import SectionHeader from '../layout/SectionHeader'

export default function CalibrationSection() {
  return (
    <section id="calibration" className="mx-auto max-w-5xl px-6 py-24">
      <SectionHeader
        eyebrow="The headline visualisation"
        title="The calibration surface"
        description={
          `This 3D surface packs all 9,181 markets into a single view. ` +
          `We sort every market into a small bucket based on two things: ` +
          `how much time was left until the round closed, and how much ` +
          `Bitcoin had moved since it opened. Each cell on the surface ` +
          `shows the share of markets in that situation that ended UP; ` +
          `height and colour both encode it. A cell flat on the 50% plane ` +
          `behaved like a fair coin. Cells that rise toward 100% mean UP ` +
          `won more often than chance; cells that sink toward 0% mean DOWN ` +
          `dominated. From here we can ask the real question: at any moment ` +
          `in a round, did the live token price agree with what history says ` +
          `about that situation?`
        }
      />
      <PlotFrame
        src="/plots/up_cumulative_echarts3d.html"
        title="Cumulative calibration surface"
        height={720}
      />

      {/* Rewind lead-in - refuses to draw a conclusion here. The four
          sections below validate the building blocks; the Convergence
          section after them is where the surface is finally read out. */}
      <p className="mt-8 text-center text-sm text-muted italic">
        Before reading anything into those cells, a few sanity checks are in
        order. Is the dataset large and honest enough? Does anything obvious
        skew the outcome, like time of day, move size, or the previous round?
        The four sections below work through each question in turn.
      </p>
    </section>
  )
}
