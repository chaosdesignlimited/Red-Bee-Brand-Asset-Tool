// Pure, DOM-free Red Bee "portal" generator.
//
// The portal is a nested, receding square tunnel: six recession steps drawn as
// mitred trapezoid rings (shades 400..800) closing on a solid 900 centre
// square. Geometry is emitted as an SVG string in absolute canvas coordinates
// so the same string drives the on-screen preview, the SVG export, and the
// raster (PNG/JPEG) base layer.

import { adjustLightness, Family, PALETTE } from './brand';

export type Ratio = '1:1' | '16:9' | '4:5';
export type FullPosition = 'left' | 'right' | 'top' | 'bottom' | 'centre';
export type Edge = 'top' | 'right' | 'bottom' | 'left';

export const RATIO_VALUE: Record<Ratio, number> = {
  '1:1': 1,
  '16:9': 16 / 9,
  '4:5': 4 / 5,
};

// Five trapezoid rings (400..800) then a solid 900 centre = six steps total.
const RING_SHADES = [400, 500, 600, 700, 800] as const;
const CENTRE_SHADE = 900 as const;
// Number of ring boundaries between outer frame (t=0) and centre square (t=1).
const SPAN = RING_SHADES.length; // 5

// Centre square side as a fraction of the portal's shorter side (12-15% range).
const CENTRE_FRACTION = 0.135;

// Subtle bevel shading (HSL lightness points). The six shade steps do the main
// work; this only nudges each face so it reads as a 3D surface.
const EDGE_LIGHTEN = 4; // outer edge of a face vs. its base shade
const FACE_BIAS: Record<Edge, number> = {
  top: -3, // ceiling reads a touch darker
  bottom: 3, // floor catches a touch more light
  left: 0,
  right: 0,
};

export interface PortalConfig {
  family: Family;
  canvasW: number;
  canvasH: number;
  mode: 'full' | 'cropped';
  // Full mode
  ratio: Ratio;
  position: FullPosition;
  // Cropped mode
  cropEdges: Edge[];
  scale: number; // 1.0 .. 2.0
  gradientOn: boolean;
  gradientEdge: Edge;
}

export interface GradientSpec {
  edge: Edge;
  color: string; // family 800 hex
  startOpacity: number; // 0.8 at the edge
  zoneFraction: number; // gradient runs over this fraction of the canvas
}

export interface Scene {
  width: number;
  height: number;
  svg: string; // full SVG incl. gradient overlay (preview + SVG export)
  baseSvg: string; // SVG without overlay (raster base layer)
  gradient: GradientSpec | null; // applied via canvas multiply for raster
  note: string | null; // clamp / validation message
}

interface Rect {
  l: number;
  r: number;
  t: number;
  b: number;
}

interface Geometry {
  portalW: number;
  portalH: number;
  ox: number;
  oy: number;
  centre: number; // centre square side
  note: string | null;
}

const round = (x: number) => Math.round(x * 1000) / 1000;

// Boundary rectangle at step index i (0 = outer frame, SPAN = centre square),
// in local portal coordinates [0..W] x [0..H].
function boundaryRect(i: number, W: number, H: number, centre: number): Rect {
  const t = i / SPAN;
  const halfW = (W / 2) * (1 - t) + (centre / 2) * t;
  const halfH = (H / 2) * (1 - t) + (centre / 2) * t;
  const cx = W / 2;
  const cy = H / 2;
  return { l: cx - halfW, r: cx + halfW, t: cy - halfH, b: cy + halfH };
}

// --- Full mode geometry: portal fits the canvas with >=10% clear space -------

function fullGeometry(cfg: PortalConfig): Geometry {
  const { canvasW: cw, canvasH: ch } = cfg;
  const ratio = RATIO_VALUE[cfg.ratio];

  let pw: number;
  let ph: number;
  if (ratio >= 1) {
    // Landscape / square: height is the shorter side; border = 0.1 * ph.
    ph = Math.min(ch / 1.2, cw / (ratio + 0.2));
    pw = ratio * ph;
  } else {
    // Portrait: width is the shorter side; border = 0.1 * pw.
    pw = Math.min(cw / 1.2, ch / (1 / ratio + 0.2));
    ph = pw / ratio;
  }

  const border = 0.1 * Math.min(pw, ph);

  let ox: number;
  if (cfg.position === 'left') ox = border;
  else if (cfg.position === 'right') ox = cw - pw - border;
  else ox = (cw - pw) / 2;

  let oy: number;
  if (cfg.position === 'top') oy = border;
  else if (cfg.position === 'bottom') oy = ch - ph - border;
  else oy = (ch - ph) / 2;

  return { portalW: pw, portalH: ph, ox, oy, centre: CENTRE_FRACTION * Math.min(pw, ph), note: null };
}

// --- Cropped mode geometry ---------------------------------------------------

// Geometry for a given scale, before any clamping.
function croppedAt(cfg: PortalConfig, s: number) {
  const { canvasW: cw, canvasH: ch, cropEdges: e } = cfg;
  const cropL = e.includes('left');
  const cropR = e.includes('right');
  const cropT = e.includes('top');
  const cropB = e.includes('bottom');
  const hC = cropL || cropR;
  const vC = cropT || cropB;

  const portalW = hC ? cw * s : cw;
  const portalH = vC ? ch * s : ch;

  let ox: number;
  if (cropL && cropR) ox = (cw - portalW) / 2; // both edges bleed
  else if (cropR) ox = 0; // left edge flush, right bleeds
  else if (cropL) ox = cw - portalW; // right edge flush, left bleeds
  else ox = (cw - portalW) / 2; // axis not cropped (portalW === cw)

  let oy: number;
  if (cropT && cropB) oy = (ch - portalH) / 2;
  else if (cropB) oy = 0; // top edge flush, bottom bleeds
  else if (cropT) oy = ch - portalH; // bottom edge flush, top bleeds
  else oy = (ch - portalH) / 2;

  const centre = CENTRE_FRACTION * Math.min(portalW, portalH);
  return { portalW, portalH, ox, oy, centre };
}

// The solid 900 centre (the focal point) must stay fully on canvas. This keeps
// all six recession steps at least partially visible.
function centreOnCanvas(cfg: PortalConfig, s: number): boolean {
  const g = croppedAt(cfg, s);
  const cx = g.ox + g.portalW / 2;
  const cy = g.oy + g.portalH / 2;
  const half = g.centre / 2;
  const eps = 0.5;
  return (
    cx - half >= -eps &&
    cx + half <= cfg.canvasW + eps &&
    cy - half >= -eps &&
    cy + half <= cfg.canvasH + eps
  );
}

function croppedGeometry(cfg: PortalConfig): Geometry {
  const requested = cfg.scale;
  let s = requested;
  let note: string | null = null;

  if (!centreOnCanvas(cfg, s)) {
    // The constraint is monotonic in s for single-edge crops, so bisect down
    // to the largest scale that keeps the centre on canvas.
    let lo = 1;
    let hi = requested;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (centreOnCanvas(cfg, mid)) lo = mid;
      else hi = mid;
    }
    s = lo;
    note = `Scale clamped to ${Math.round(s * 100)}% so the portal's centre stays on canvas.`;
  }

  const g = croppedAt(cfg, s);
  return { ...g, note };
}

// --- SVG emission ------------------------------------------------------------

interface PortalParts {
  defs: string;
  body: string;
}

function corners(rect: Rect) {
  return {
    tl: [rect.l, rect.t] as const,
    tr: [rect.r, rect.t] as const,
    br: [rect.r, rect.b] as const,
    bl: [rect.l, rect.b] as const,
  };
}

// Emit the portal (defs + shapes) in absolute canvas coordinates.
function buildPortal(family: Family, W: number, H: number, ox: number, oy: number, centre: number): PortalParts {
  const defs: string[] = [];
  const body: string[] = [];
  const cx = ox + W / 2;
  const cy = oy + H / 2;

  const off = (p: readonly [number, number]): [number, number] => [round(p[0] + ox), round(p[1] + oy)];
  const poly = (pts: Array<readonly [number, number]>) => pts.map((p) => off(p).join(',')).join(' ');

  RING_SHADES.forEach((shade, k) => {
    const outer = boundaryRect(k, W, H, centre);
    const inner = boundaryRect(k + 1, W, H, centre);
    const o = corners(outer);
    const i = corners(inner);
    const base = PALETTE[family][shade];

    const faces: Array<{ id: Edge; pts: Array<readonly [number, number]>; axis: [number, number, number, number] }> = [
      // [x1,y1,x2,y2] = outer-edge midpoint -> inner-edge midpoint, in local coords.
      { id: 'top', pts: [o.tl, o.tr, i.tr, i.tl], axis: [W / 2, outer.t, W / 2, inner.t] },
      { id: 'right', pts: [o.tr, o.br, i.br, i.tr], axis: [outer.r, H / 2, inner.r, H / 2] },
      { id: 'bottom', pts: [o.br, o.bl, i.bl, i.br], axis: [W / 2, outer.b, W / 2, inner.b] },
      { id: 'left', pts: [o.bl, o.tl, i.tl, i.bl], axis: [outer.l, H / 2, inner.l, H / 2] },
    ];

    faces.forEach((face) => {
      const gid = `r${k}${face.id[0]}`;
      const bias = FACE_BIAS[face.id];
      const outerCol = adjustLightness(base, EDGE_LIGHTEN + bias);
      const innerCol = adjustLightness(base, -EDGE_LIGHTEN + bias);
      const [x1, y1, x2, y2] = face.axis;
      defs.push(
        `<linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="${round(x1 + ox)}" y1="${round(
          y1 + oy,
        )}" x2="${round(x2 + ox)}" y2="${round(y2 + oy)}">` +
          `<stop offset="0" stop-color="${outerCol}"/>` +
          `<stop offset="1" stop-color="${innerCol}"/>` +
          `</linearGradient>`,
      );
      body.push(`<polygon points="${poly(face.pts)}" fill="url(#${gid})"/>`);
    });
  });

  // Solid 900 centre square (the focal point).
  const c = boundaryRect(SPAN, W, H, centre);
  body.push(
    `<rect x="${round(c.l + ox)}" y="${round(c.t + oy)}" width="${round(c.r - c.l)}" height="${round(
      c.b - c.t,
    )}" fill="${PALETTE[family][CENTRE_SHADE]}"/>`,
  );

  // Hairline strokes on the diagonal seams sharpen the tunnel read without
  // softening edges. cx/cy unused beyond documenting the vanishing point.
  void cx;
  void cy;

  return { defs: defs.join(''), body: body.join('') };
}

function gradientSpec(cfg: PortalConfig): GradientSpec | null {
  if (cfg.mode !== 'cropped' || !cfg.gradientOn) return null;
  return {
    edge: cfg.gradientEdge,
    color: PALETTE[cfg.family][800],
    startOpacity: 0.8,
    zoneFraction: 0.6,
  };
}

// Overlay axis in canvas coordinates: from the chosen edge inward over the zone.
export function gradientAxis(g: GradientSpec, cw: number, ch: number) {
  const zw = cw * g.zoneFraction;
  const zh = ch * g.zoneFraction;
  switch (g.edge) {
    case 'bottom':
      return { x1: 0, y1: ch, x2: 0, y2: ch - zh };
    case 'top':
      return { x1: 0, y1: 0, x2: 0, y2: zh };
    case 'left':
      return { x1: 0, y1: 0, x2: zw, y2: 0 };
    case 'right':
      return { x1: cw, y1: 0, x2: cw - zw, y2: 0 };
  }
}

function gradientOverlaySvg(g: GradientSpec, cw: number, ch: number): string {
  const a = gradientAxis(g, cw, ch);
  return (
    `<defs><linearGradient id="overlay" gradientUnits="userSpaceOnUse" x1="${a.x1}" y1="${a.y1}" x2="${a.x2}" y2="${a.y2}">` +
    `<stop offset="0" stop-color="${g.color}" stop-opacity="${g.startOpacity}"/>` +
    `<stop offset="1" stop-color="${g.color}" stop-opacity="0"/>` +
    `</linearGradient></defs>` +
    `<rect x="0" y="0" width="${cw}" height="${ch}" fill="url(#overlay)" style="mix-blend-mode:multiply"/>`
  );
}

export function buildScene(cfg: PortalConfig): Scene {
  const { canvasW: cw, canvasH: ch } = cfg;
  const geo = cfg.mode === 'full' ? fullGeometry(cfg) : croppedGeometry(cfg);
  const portal = buildPortal(cfg.family, geo.portalW, geo.portalH, geo.ox, geo.oy, geo.centre);

  // Background is the family's 900 shade. It only shows through where the
  // portal does not cover (full-mode clear space, or rounding hairlines).
  const bg = PALETTE[cfg.family][900];
  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}" viewBox="0 0 ${cw} ${ch}" preserveAspectRatio="xMidYMid meet">`;
  const background = `<rect x="0" y="0" width="${cw}" height="${ch}" fill="${bg}"/>`;
  const core = `${open}<defs>${portal.defs}</defs>${background}${portal.body}`;

  const baseSvg = `${core}</svg>`;
  const grad = gradientSpec(cfg);
  const svg = grad ? `${core}${gradientOverlaySvg(grad, cw, ch)}</svg>` : baseSvg;

  return { width: cw, height: ch, svg, baseSvg, gradient: grad, note: geo.note };
}
