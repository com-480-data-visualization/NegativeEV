/**
 * Small narrative paragraph placed under a chart to highlight the takeaway.
 *
 * Visual: a thin accent-coloured left border with italic muted text.
 * Used ~10 times across the page; kept stateless and prop-driven so the
 * copy lives next to the chart it describes.
 */
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
}

export default function InsightCallout({ children }: Props) {
  return (
    <p className="mt-3 border-l-2 border-accent/70 pl-3 italic text-sm leading-relaxed text-gray-300">
      {children}
    </p>
  )
}
