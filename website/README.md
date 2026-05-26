# NegativeEV website

React 19 + Vite + Tailwind CSS 4. Hand-authored rewrite of the [Lovable prototype](https://negativeev.lovable.app/).

## Development

```bash
cd website
npm install
npm run dev
```

Open the URL printed in the terminal (default `http://localhost:5173`).

## Data assets

| File | Description |
|------|-------------|
| `public/data/playground_events.json` | 50 sequential 5-min markets for the trading playground (regenerate with `python scripts/export_playground_events.py`) |

## Scripts

| Command         | Description              |
| --------------- | ------------------------ |
| `npm run dev`   | Local dev server + HMR   |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run lint`  | ESLint                   |
