/**
 * Site footer. Two-block layout: a short project intro on the left
 * (project name + tagline) and authors + a compact GitHub link on the
 * right, followed by a thin course-credit strip at the bottom.
 *
 * The GitHub URL is held as a single constant so it's easy to swap.
 */
const GITHUB_URL = 'https://github.com/com-480-data-visualization/NegativeEV'

const AUTHORS = ['Anton Svet', 'Santiago Rivadeneira', 'Arthur Margeat']

export default function Footer() {
  return (
    <footer className="border-t border-border bg-surface-elevated/50">
      <div className="mx-auto max-w-6xl px-6 py-10 flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">

        {/* Project blurb */}
        <div className="max-w-md">
          <p className="text-white font-semibold text-base mb-1.5">NegativeEV</p>
          <p className="text-sm text-muted leading-relaxed">
            Do prediction markets really predict? We analysed 9,181 Polymarket
            BTC five-minute markets to find where crowd wisdom falls short.
          </p>
        </div>

        {/* Repo button on top, authors line beneath it. */}
        <div className="flex flex-col gap-3 sm:items-end">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="View source on GitHub"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border bg-surface text-sm text-gray-200 hover:text-white hover:border-accent hover:bg-surface-elevated transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.16-.02-2.1-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.28-1.67-1.28-1.67-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.74-1.55-2.55-.29-5.23-1.28-5.23-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.18 1.18.92-.26 1.91-.39 2.89-.39s1.97.13 2.89.39c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.77.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.4-5.25 5.68.41.36.78 1.05.78 2.12 0 1.53-.01 2.76-.01 3.14 0 .31.21.67.8.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
            </svg>
            View source
          </a>
          <div className="text-sm text-muted">
            By{' '}
            <span className="text-gray-200">
              {AUTHORS.join(' · ')}
            </span>
          </div>
        </div>
      </div>

      {/* Compact bottom strip: course credit + data sources */}
      <div className="border-t border-border/60">
        <div className="mx-auto max-w-6xl px-6 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
          <span>COM-480 · Data Visualization · EPFL · 2026</span>
          <span>Data: Polymarket trades + Binance BTC/USD prices</span>
        </div>
      </div>
    </footer>
  )
}
