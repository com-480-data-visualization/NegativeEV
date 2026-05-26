import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Serve ../docs at /plots/ so iframes can load the HTML plots
    {
      name: 'serve-plots',
      configureServer(server) {
        server.middlewares.use('/plots', (req, res, next) => {
          const docsDir = path.resolve(__dirname, '../docs')
          const fileName = (req.url ?? '/').replace(/^\/+/, '')
          if (!fileName) { next(); return }
          const filePath = path.join(docsDir, fileName)
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
    },
  ],
})
