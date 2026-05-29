import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DOCS_DIR = path.resolve(__dirname, '../docs')

// HTML files from ../docs/ that the website embeds via iframes at /plots/*.
// Keep this list explicit so we don't bundle stale generated plots.
const PLOT_FILES = ['up_cumulative_echarts3d.html'] as const

function plotsPlugin(): Plugin {
  return {
    name: 'plots',
    // Dev: serve ../docs/* at /plots/* via middleware.
    configureServer(server) {
      server.middlewares.use('/plots', (req, res, next) => {
        const fileName = (req.url ?? '/').replace(/^\/+/, '')
        if (!fileName) { next(); return }
        const filePath = path.join(DOCS_DIR, fileName)
        try {
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase()
            const mime = ext === '.html' ? 'text/html; charset=utf-8'
                       : ext === '.js'   ? 'application/javascript'
                       : ext === '.css'  ? 'text/css'
                       : 'application/octet-stream'
            res.setHeader('Content-Type', mime)
            res.end(fs.readFileSync(filePath))
            return
          }
        } catch { /* fall through to next */ }
        next()
      })
    },
    // Build: copy ../docs/* into dist/plots/* so static hosts (Vercel)
    // can serve the same URLs in production.
    closeBundle() {
      const outDir = path.resolve(__dirname, 'dist/plots')
      fs.mkdirSync(outDir, { recursive: true })
      for (const name of PLOT_FILES) {
        const src = path.join(DOCS_DIR, name)
        const dst = path.join(outDir, name)
        if (fs.existsSync(src)) {
          fs.copyFileSync(src, dst)
        } else {
          console.warn(`[plots] missing ${src}; iframe will 404 in production`)
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), plotsPlugin()],
})
