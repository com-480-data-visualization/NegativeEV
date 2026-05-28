/**
 * Setup section between the Hero hook and the Calibration headline. Gives a
 * reader with no finance background just enough vocabulary - prediction
 * market, our specific dataset, calibration - to read the surface that comes
 * right after.
 *
 * Intentionally text-only: a single row of three definition cards, then a
 * one-line hand-off into Calibration. No nav anchor, no chart.
 */
import type { ReactNode } from 'react'
import SectionHeader from '../layout/SectionHeader'

interface CardProps { eyebrow: string; title: string; children: ReactNode }

/** One compact explainer card. Styled to match the surrounding card grid
 *  (same rounded-2xl + border + bg-surface-elevated palette) so the row
 *  reads as a single visual unit. */
function DefinitionCard({ eyebrow, title, children }: CardProps) {
  return (
    <div className="rounded-2xl border border-border bg-surface-elevated p-5 flex flex-col gap-3">
      <span className="text-[0.7rem] font-semibold uppercase tracking-widest text-accent">
        {eyebrow}
      </span>
      <h3 className="text-base font-semibold text-white leading-snug">{title}</h3>
      <p className="text-sm leading-relaxed text-muted">{children}</p>
    </div>
  )
}

export default function IntroSection() {
  return (
    // `id="intro"` exists as a scroll target for the Hero chevron only; it
    // is intentionally left out of NAV_SECTIONS so the nav stays clean.
    <section id="intro" className="mx-auto max-w-5xl px-6 pt-24 pb-16">
      <SectionHeader
        eyebrow="Setup"
        title="But first, what is a prediction market?"
        description={
          `Three quick definitions before the data arrives: what these ` +
          `markets are, why we picked the 5-minute Bitcoin family, and ` +
          `what calibration means. If you already know all three, scroll ` +
          `past. The rest of the page does the work.`
        }
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <DefinitionCard eyebrow="01" title="What's a prediction market?">
          Buy a token that pays{' '}
          <span className="text-white font-medium">$1</span> if an event
          happens, <span className="text-white font-medium">$0</span> if it
          doesn't. The price is, in theory, the crowd's probability. Pay{' '}
          <span className="text-white font-medium">70¢</span> for a Yes token
          and the market is saying the event happens 70% of the time.
        </DefinitionCard>

        <DefinitionCard eyebrow="02" title="Why 5-minute BTC markets?">
          Polymarket opens one every five minutes:{' '}
          <span className="text-green-400 font-medium">Up</span> or{' '}
          <span className="text-red-400 font-medium">Down</span> in five?
          {' '}<span className="text-white font-medium">288</span> markets a
          day, <span className="text-white font-medium">9,181</span> resolved
          in our window. Fast turnover gives us the sample size to test
          whether the prices hold up.
        </DefinitionCard>

        <DefinitionCard eyebrow="03" title="What does &quot;right&quot; mean?">
          <span className="text-white font-medium">Calibration.</span> When
          the price says 70%, does the outcome happen 70% of the
          time? If yes, the wisdom of crowds works. If no, the gap between
          price and reality is a possible{' '}
          <span className="text-accent font-medium">edge</span>.
        </DefinitionCard>
      </div>

      <p className="mt-8 text-center text-sm italic text-muted">
        Here's what we found across all{' '}
        <span className="text-white not-italic font-medium">9,181</span>{' '}
        rounds.
      </p>
    </section>
  )
}
