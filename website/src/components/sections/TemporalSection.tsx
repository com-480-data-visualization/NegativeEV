/**
 * Rewind step 2 of 4 - does the time of day matter? Two heatmaps over the
 * same (day-of-week, hour) grid, first volume then UP rate, so the reader
 * can visually check whether activity peaks coincide with any outcome bias.
 */
import HeatmapChart from '../HeatmapChart'
import SectionHeader from '../layout/SectionHeader'
import InsightCallout from '../layout/InsightCallout'

interface CardProps { title: string; subtitle: string; children: React.ReactNode }

function Card({ title, subtitle, children }: CardProps) {
  return (
    <div className="rounded-2xl border border-border bg-surface-elevated px-5 pt-5 pb-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="text-xs text-muted mt-0.5">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}

export default function TemporalSection() {
  return (
    <section id="temporal" className="mx-auto max-w-5xl px-6 py-24">
      <SectionHeader
        eyebrow="Rewind · 2 of 4"
        title="Does the time of day matter?"
        description={
          `The dataset checks out. Next question: is the platform active ` +
          `uniformly across the week, and does any (day, hour) bucket favour ` +
          `UP or DOWN? If a clear time-of-day edge existed, you would barely ` +
          `need the rest of this site.`
        }
      />

      <div className="flex flex-col gap-8">
        <div>
          <Card title="Trading volume" subtitle="Total USD volume per (day, hour) bucket">
            <HeatmapChart mode="volume" />
          </Card>
          <InsightCallout>
            Volume clusters on weekday afternoons, 13:00-16:00 UTC, when US
            desks come online and Europe is still active. Weekends and early
            UTC mornings are quieter, with the brightest cells producing
            several times the volume of the dimmest.
          </InsightCallout>
        </div>

        <div>
          <Card title="UP rate" subtitle="Empirical UP-win rate per bucket  ·  green > 50%  ·  red < 50%">
            <HeatmapChart mode="up_rate" />
          </Card>
          <InsightCallout>
            The UP rate stays close to 50% across the board. The few
            stand-out cells fall in the lowest-volume corners: small-sample
            noise, not a structural time-of-day edge.
          </InsightCallout>
        </div>
      </div>

      {/* Bridge into the next rewind step. */}
      <p className="mt-10 text-center text-sm text-muted italic">
        No time-of-day edge. So what is the market trying to predict? What
        do these five-minute price moves actually look like?
      </p>
    </section>
  )
}
