/**
 * Sticky top navigation bar with scroll-spy highlighting.
 *
 * The list of sections is declared once at the module level so the same
 * source of truth drives the rendered links AND the scroll-spy observer.
 * Adding a new section means adding a single entry here and wiring the
 * matching `<section id="...">` in App.tsx.
 */
import { useScrollSpy } from '../../lib/scrollSpy'

interface NavItem { id: string; label: string }

// Labels match the narrative arc: hook → setup → headline → four
// "rewind" probes (Dataset → Activity → Prices → Streaks) → convergence
// → conclusion → interactive payoff. Every chapter is reachable from
// the nav so scroll-spy can highlight wherever the reader currently is.
export const NAV_SECTIONS: NavItem[] = [
  { id: 'overview',      label: 'Overview'     },
  { id: 'intro',         label: 'Introduction' },
  { id: 'calibration',   label: 'Headline'     },
  { id: 'statistics',    label: 'Dataset'      },
  { id: 'temporal',      label: 'Activity'     },
  { id: 'distributions', label: 'Prices'       },
  { id: 'markov',        label: 'Streaks'      },
  { id: 'convergence',   label: 'Convergence'  },
  { id: 'verdict',       label: 'Conclusion'   },
  { id: 'playground',    label: 'Playground'   },
]

const NAV_IDS = NAV_SECTIONS.map(s => s.id)

export default function NavHeader() {
  const active = useScrollSpy(NAV_IDS, 96)

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/85 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
      <div className="mx-auto max-w-6xl px-6 h-14 flex items-center gap-6">
        <a href="#overview" className="text-sm font-semibold tracking-tight text-white hover:text-accent transition-colors">
          NegativeEV
        </a>
        <nav className="flex-1 overflow-x-auto">
          <ul className="flex items-center gap-1 text-xs">
            {NAV_SECTIONS.map(s => {
              const isActive = active === s.id
              return (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    aria-current={isActive ? 'true' : undefined}
                    className={[
                      'inline-block px-3 py-1.5 rounded-md transition-colors whitespace-nowrap',
                      isActive
                        ? 'text-white bg-surface-elevated border border-border'
                        : 'text-muted hover:text-white hover:bg-surface-elevated/60 border border-transparent',
                    ].join(' ')}
                  >
                    {s.label}
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>
      </div>
    </header>
  )
}
