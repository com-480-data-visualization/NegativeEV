// Header used INSIDE the playground only. The uppercase tracking-widest
// accent eyebrow stays reserved for the page-level sections in App.tsx
// (Calibration, Playground, …); this one is more compact.

import type { ReactNode } from 'react'
import InfoTooltip from '../InfoTooltip'

interface Props {
  title: string
  tooltip?: string
  right?: ReactNode
}

export default function SubSectionHeader({ title, tooltip, right }: Props) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3 pb-2 border-b border-border/60">
      <h3 className="text-base font-semibold text-white flex items-center">
        <span>{title}</span>
        {tooltip && <InfoTooltip text={tooltip} />}
      </h3>
      {right}
    </div>
  )
}
