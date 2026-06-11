# Red Bee Portal Generator

A single-page web tool that generates on-brand Red Bee **portal** graphics — the
nested, receding square tunnel from the 2026 brand system — at any pixel size,
and exports them as **PNG**, **JPEG** or **SVG**.

Built with Next.js (App Router) + TypeScript. No runtime dependencies beyond
Next and React.

## What it does

- **Full portal mode** — pick a ratio (1:1, 16:9, 4:5) and a position (left,
  right, top, bottom, centre). The portal is scaled to fit with a clear border
  (10% of its shorter side) on a 900-shade background, never distorted.
- **Cropped portal mode** — bleed the portal off one or two canvas edges, scale
  it 100–200%, and optionally add an 800-shade multiply gradient overlay from
  any edge. Off-brand output is made impossible: at least one complete edge must
  stay visible, all six recession steps remain visible, and the solid 900 centre
  (the focal point) can never be cropped off canvas — the scale auto-clamps and
  explains why.
- **Palettes** — Red, Blue, Green, Violet. Red leads. These are the only colours
  the tool can produce.
- **Export** — PNG (lossless, recommended for the hard-edged seams), JPEG (q
  0.92, for platforms that require it), and SVG (vector, true output size).
  Filenames follow `redbee-portal-{family}-{width}x{height}.{png|jpg|svg}`.

## Architecture notes

- `src/lib/brand.ts` and `src/lib/portal.ts` are **DOM-free**: the brand
  constants and the pure SVG-string generator have no browser dependencies, so
  they run on the server, stay testable, and keep the preview hydration-safe.
- `src/components/PortalGenerator.tsx` is the only client component. Every
  interaction with `document`, `window`, `Image`, canvas and blob URLs lives
  inside event handlers — never at module scope or during render.
- The same generated SVG drives the live preview and the SVG export; raster
  exports rasterise that SVG to an offscreen canvas at the exact pixel size, then
  composite the gradient overlay with `globalCompositeOperation = 'multiply'`.
- The app is a standard Next.js app (no `output: 'export'`). It is deliberately
  structured so **password protection or auth can be added later via middleware
  without touching the generator**.

## Local development

```bash
npm install
npm run dev
# open http://localhost:3000
```

## Production build

```bash
npm run build
npm run start
# serves the optimised production build on http://localhost:3000
```

## Deploy to Vercel

1. Push this repository to GitHub/GitLab/Bitbucket.
2. In Vercel, **Import** the repository. Framework preset: **Next.js** (zero
   config). The project lives at the repository root, so no **Root Directory**
   override is needed.
3. Deploy. No environment variables are required.

> Note: the Violet 400 value (`#ed96f5`) is marked **TBC** in the 2026 draft
> guidelines and may change; update it in `src/lib/brand.ts` if the final value
> differs.
