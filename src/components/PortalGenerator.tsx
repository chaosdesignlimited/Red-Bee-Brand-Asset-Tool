'use client';

import { useMemo, useState } from 'react';
import { FAMILIES, FAMILY_LABEL, Family, PALETTE, hexToRgb } from '@/lib/brand';
import {
  buildScene,
  Edge,
  FullPosition,
  gradientAxis,
  PortalConfig,
  Ratio,
  Scene,
} from '@/lib/portal';

const RATIOS: Ratio[] = ['1:1', '16:9', '4:5'];
const POSITIONS: FullPosition[] = ['left', 'right', 'top', 'bottom', 'centre'];
const EDGES: Edge[] = ['top', 'right', 'bottom', 'left'];

// Crop edges work per axis: at most one of the vertical pair (top / bottom) and
// at most one of the horizontal pair (left / right). That allows a single edge
// or a corner (e.g. top + left), but never an opposite pair (top + bottom or
// left + right) or three-plus edges. Selecting an edge drops the opposite one on
// the same axis.
const OPPOSITE_EDGE: Record<Edge, Edge> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

// Raster exports can render at a multiple of the canvas size for sharper output.
// The generator is vector, so the scene is rebuilt at the larger dimensions —
// this is true resolution, not an upscale of the 1x bitmap.
const EXPORT_SCALES = [1, 2];

const SIZE_MIN = 100;
const SIZE_MAX = 8000;

function clampSize(raw: string): number {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return SIZE_MIN;
  return Math.min(SIZE_MAX, Math.max(SIZE_MIN, n));
}

// --- Browser-only export helpers (only ever called from event handlers) ------

function svgToBlobUrl(svg: string): string {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  return URL.createObjectURL(blob);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to render SVG'));
    img.src = url;
  });
}

async function rasterize(scene: Scene, type: 'image/png' | 'image/jpeg', quality?: number): Promise<Blob> {
  const { width, height } = scene;
  const url = svgToBlobUrl(scene.baseSvg);
  let img: HTMLImageElement;
  try {
    img = await loadImage(url);
  } finally {
    // Image keeps its own reference once decoded; safe to revoke after load.
    URL.revokeObjectURL(url);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  ctx.drawImage(img, 0, 0, width, height);

  // Gradient overlay is drawn here (not via SVG blend) so it survives raster.
  if (scene.gradient) {
    const g = scene.gradient;
    const a = gradientAxis(g, width, height);
    const grad = ctx.createLinearGradient(a.x1, a.y1, a.x2, a.y2);
    const { r, g: gg, b } = hexToRgb(g.color);
    grad.addColorStop(0, `rgba(${r}, ${gg}, ${b}, ${g.startOpacity})`);
    grad.addColorStop(1, `rgba(${r}, ${gg}, ${b}, 0)`);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Export failed'))),
      type,
      quality,
    );
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Yield to the browser so the busy state can paint before heavy raster work.
const nextFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

export default function PortalGenerator() {
  const [family, setFamily] = useState<Family>('red');
  const [widthInput, setWidthInput] = useState('1080');
  const [heightInput, setHeightInput] = useState('1080');
  const [mode, setMode] = useState<'full' | 'cropped'>('full');
  const [ratio, setRatio] = useState<Ratio>('1:1');
  const [position, setPosition] = useState<FullPosition>('centre');
  const [cropEdges, setCropEdges] = useState<Edge[]>(['right']);
  const [scale, setScale] = useState(1.4);
  const [gradientOn, setGradientOn] = useState(false);
  const [gradientEdge, setGradientEdge] = useState<Edge>('bottom');
  const [edgeNote, setEdgeNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportScale, setExportScale] = useState(1);

  const canvasW = clampSize(widthInput);
  const canvasH = clampSize(heightInput);

  const config = useMemo<PortalConfig>(
    () => ({
      family,
      canvasW,
      canvasH,
      mode,
      ratio,
      position,
      cropEdges,
      scale,
      gradientOn,
      gradientEdge,
    }),
    [family, canvasW, canvasH, mode, ratio, position, cropEdges, scale, gradientOn, gradientEdge],
  );

  // Pure: safe to compute during render (no DOM access).
  const scene = useMemo<Scene>(() => buildScene(config), [config]);

  function toggleEdge(edge: Edge) {
    setCropEdges((prev) => {
      if (prev.includes(edge)) {
        const next = prev.filter((e) => e !== edge);
        return next.length ? next : prev; // keep at least one edge cropped
      }
      // Opposite edges on the same axis are mutually exclusive, so selecting one
      // drops the other. The result is a single edge or an adjacent corner.
      return [...prev.filter((e) => e !== OPPOSITE_EDGE[edge]), edge];
    });
  }

  function normalizeSize(which: 'w' | 'h') {
    if (which === 'w') setWidthInput(String(clampSize(widthInput)));
    else setHeightInput(String(clampSize(heightInput)));
  }

  async function handleExport(kind: 'png' | 'jpeg' | 'svg') {
    if (busy) return;
    const outW = canvasW * exportScale;
    const outH = canvasH * exportScale;
    const filename = `redbee-portal-${family}-${outW}x${outH}.${kind === 'jpeg' ? 'jpg' : kind}`;
    setBusy(true);
    try {
      await nextFrame();
      // Rebuild the scene at the export dimensions so the vector renders at full
      // resolution (the composition is proportional, so it matches the preview).
      const exportScene = exportScale === 1 ? scene : buildScene({ ...config, canvasW: outW, canvasH: outH });
      if (kind === 'svg') {
        downloadBlob(new Blob([exportScene.svg], { type: 'image/svg+xml;charset=utf-8' }), filename);
      } else if (kind === 'png') {
        downloadBlob(await rasterize(exportScene, 'image/png'), filename);
      } else {
        downloadBlob(await rasterize(exportScene, 'image/jpeg', 0.92), filename);
      }
    } catch (err) {
      setEdgeNote(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="masthead">
        <h1>
          Red Bee Portal Generator<span className="stop" aria-hidden="true">.</span>
        </h1>
        <p>On-brand portal graphics at any pixel size. Export PNG, JPEG or SVG.</p>
      </header>

      <div className="layout">
        <section className="controls" aria-label="Controls">
          <fieldset className="group">
            <legend>Canvas size</legend>
            <div className="row">
              <label className="field">
                <span>Width (px)</span>
                <input
                  type="number"
                  min={SIZE_MIN}
                  max={SIZE_MAX}
                  value={widthInput}
                  onChange={(e) => setWidthInput(e.target.value)}
                  onBlur={() => normalizeSize('w')}
                />
              </label>
              <label className="field">
                <span>Height (px)</span>
                <input
                  type="number"
                  min={SIZE_MIN}
                  max={SIZE_MAX}
                  value={heightInput}
                  onChange={(e) => setHeightInput(e.target.value)}
                  onBlur={() => normalizeSize('h')}
                />
              </label>
            </div>
            <p className="hint">{SIZE_MIN}–{SIZE_MAX}px per side.</p>
          </fieldset>

          <fieldset className="group">
            <legend>Palette</legend>
            <div className="swatches">
              {FAMILIES.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`swatch${family === f ? ' active' : ''}`}
                  aria-pressed={family === f}
                  onClick={() => setFamily(f)}
                >
                  <span className="chip" style={{ background: PALETTE[f][400] }} />
                  {FAMILY_LABEL[f]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="group">
            <legend>Mode</legend>
            <div className="segmented">
              <button
                type="button"
                className={mode === 'full' ? 'active' : ''}
                aria-pressed={mode === 'full'}
                onClick={() => setMode('full')}
              >
                Full portal
              </button>
              <button
                type="button"
                className={mode === 'cropped' ? 'active' : ''}
                aria-pressed={mode === 'cropped'}
                onClick={() => setMode('cropped')}
              >
                Cropped portal
              </button>
            </div>
          </fieldset>

          {mode === 'full' ? (
            <>
              <fieldset className="group">
                <legend>Portal ratio</legend>
                <div className="segmented">
                  {RATIOS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={ratio === r ? 'active' : ''}
                      aria-pressed={ratio === r}
                      onClick={() => setRatio(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset className="group">
                <legend>Position</legend>
                <div className="segmented wrap">
                  {POSITIONS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={position === p ? 'active' : ''}
                      aria-pressed={position === p}
                      onClick={() => setPosition(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          ) : (
            <>
              <fieldset className="group">
                <legend>Crop edges</legend>
                <div className="segmented wrap">
                  {EDGES.map((e) => (
                    <button
                      key={e}
                      type="button"
                      className={cropEdges.includes(e) ? 'active' : ''}
                      aria-pressed={cropEdges.includes(e)}
                      onClick={() => toggleEdge(e)}
                    >
                      {e}
                    </button>
                  ))}
                </div>
                <p className="hint">One edge, or a corner — top+bottom and left+right do not combine.</p>
              </fieldset>

              <fieldset className="group">
                <legend>Portal scale</legend>
                <div className="row">
                  <input
                    type="range"
                    min={1}
                    max={2}
                    step={0.05}
                    value={scale}
                    onChange={(e) => setScale(parseFloat(e.target.value))}
                    aria-label="Portal scale"
                  />
                  <output className="readout">{Math.round(scale * 100)}%</output>
                </div>
              </fieldset>

              <fieldset className="group">
                <legend>Gradient overlay</legend>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={gradientOn}
                    onChange={(e) => setGradientOn(e.target.checked)}
                  />
                  <span>Darken with {FAMILY_LABEL[family]} 800 (multiply)</span>
                </label>
                {gradientOn && (
                  <div className="segmented wrap" style={{ marginTop: 10 }}>
                    {EDGES.map((e) => (
                      <button
                        key={e}
                        type="button"
                        className={gradientEdge === e ? 'active' : ''}
                        aria-pressed={gradientEdge === e}
                        onClick={() => setGradientEdge(e)}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </fieldset>
            </>
          )}

          <fieldset className="group export">
            <legend>Export</legend>
            <div className="segmented" role="group" aria-label="Export resolution">
              {EXPORT_SCALES.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={exportScale === f ? 'active' : ''}
                  aria-pressed={exportScale === f}
                  onClick={() => setExportScale(f)}
                >
                  {f}×
                </button>
              ))}
            </div>
            <p className="hint">
              Output: {canvasW * exportScale} × {canvasH * exportScale} px
              {exportScale > 1 ? ` (${exportScale}× the canvas)` : ''}
            </p>
            <button type="button" className="dl primary" disabled={busy} onClick={() => handleExport('png')}>
              Download PNG <span className="tag">best quality</span>
            </button>
            <div className="row">
              <button type="button" className="dl" disabled={busy} onClick={() => handleExport('jpeg')}>
                JPEG
              </button>
              <button type="button" className="dl" disabled={busy} onClick={() => handleExport('svg')}>
                SVG
              </button>
            </div>
            <p className="hint">Flat colour with hard seams — PNG is lossless and recommended.</p>
          </fieldset>
        </section>

        <section className="stage" aria-label="Preview">
          <div className="canvas-wrap">
            <div
              className="preview"
              // Bound both axes (<=100% wide, <=70vh tall) while preserving the
              // exact canvas ratio, so no preview ever distorts the artwork.
              style={{
                width: `min(100%, ${((70 * canvasW) / canvasH).toFixed(3)}vh)`,
                aspectRatio: `${canvasW} / ${canvasH}`,
              }}
              // SVG string comes from the DOM-free generator; no user input is interpolated.
              dangerouslySetInnerHTML={{ __html: scene.svg }}
            />
          </div>
          <div className="stage-meta">
            <span>
              {canvasW} × {canvasH}px · {FAMILY_LABEL[family]} · {mode === 'full' ? 'Full' : 'Cropped'}
            </span>
            {busy && <span className="busy">Rendering…</span>}
          </div>
          {(scene.note || edgeNote) && (
            <div className="notes" role="status">
              {scene.note && <p>{scene.note}</p>}
              {edgeNote && <p>{edgeNote}</p>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
