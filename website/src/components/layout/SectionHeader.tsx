/**
 * Standard header block for analysis sections: small eyebrow tag, large
 * heading, then a muted lead paragraph. Identical visual to the previous
 * App.tsx inline version - extracted so sections can compose it.
 */
import type { ReactNode } from 'react'

interface Props {
  eyebrow?:    string
  title:       string
  description: ReactNode
}

export default function SectionHeader({ eyebrow, title, description }: Props) {
  return (
    <div className="mb-8">
      {eyebrow && (
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent">
          {eyebrow}
        </p>
      )}
      <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
        {title}
      </h2>
      <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
        {description}
      </p>
    </div>
  )
}
