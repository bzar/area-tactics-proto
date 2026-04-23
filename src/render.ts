import * as PIXI from "pixi.js";
import { TileFeature, ClaimType } from "area-tactics";
import { palette } from "./palette.js";

/** Convert a CSS hex color string (e.g. '#315dcd') to a PIXI number (e.g. 0x315dcd). */
export function cssHex(s: string): number {
  return parseInt(s.replace("#", ""), 16);
}

// ============================================================================
// Hex math — flat-top orientation
// ============================================================================

export const SQRT3 = Math.sqrt(3);
export const WORLD_ORIGIN_X = 50;
export const WORLD_ORIGIN_Y = 50;

export function computeHexSize(): number {
  return Math.max(28, Math.min(44, Math.round((1600 * 28) / Math.max(window.innerWidth, 900))));
}

export function hexCenter(q: number, r: number, hexSize: number): [number, number] {
  return [WORLD_ORIGIN_X + hexSize * 1.5 * q, WORLD_ORIGIN_Y + hexSize * SQRT3 * (r + q / 2)];
}

export function hexCorners(cx: number, cy: number, hexSize: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    pts.push(cx + (hexSize - 1) * Math.cos(a), cy + (hexSize - 1) * Math.sin(a));
  }
  return pts;
}

export function pixelToHex(px: number, py: number, hexSize: number): [number, number] {
  const fq = (px - WORLD_ORIGIN_X) / (hexSize * 1.5);
  const fr = (py - WORLD_ORIGIN_Y) / (hexSize * SQRT3) - fq / 2;
  const fs = -fq - fr;
  let rq = Math.round(fq),
    rr = Math.round(fr);
  const rs = Math.round(fs);
  const dq = Math.abs(rq - fq),
    dr = Math.abs(rr - fr),
    ds = Math.abs(rs - fs);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return [rq, rr];
}

// ============================================================================
// HSL utilities — for claim fill tinting
// ============================================================================

function rgbToHsl(hex: number): [number, number, number] {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === r) h = ((g - b) / d + 6) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToHex(h: number, s: number, l: number): number {
  const f = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const rv = Math.round(f(p, q, h + 1 / 3) * 255);
  const gv = Math.round(f(p, q, h) * 255);
  const bv = Math.round(f(p, q, h - 1 / 3) * 255);
  return (rv << 16) | (gv << 8) | bv;
}

// Build per-player claimed fill: player H+S, hexFill L
export function buildClaimedFill(playerHex: number, baseHex: number): number {
  const [h, s] = rgbToHsl(playerHex);
  const [, , l] = rgbToHsl(baseHex);
  return hslToHex(h, s, l);
}

// ============================================================================
// Colors and labels
// ============================================================================

export const C = {
  bg:             cssHex(palette.blackPurple),  // deepest background
  hexFill:        cssHex(palette.blackTeal),    // normal hex tile fill
  hexHover:       cssHex(palette.deepTeal),     // hovered hex fill
  hexStroke:      cssHex(palette.deepSlate),    // hex border
  validMove:      cssHex(palette.forestGreen),  // valid move destination
  selected:       cssHex(palette.plumDark),     // selection background (unused; reserved)
  p1:             cssHex(palette.blue),         // player 1 — matches CSS --p1
  p2:             cssHex(palette.orange),       // player 2 — matches CSS --p2
  selectRing:     cssHex(palette.gold),         // unit selection ring
  influenceRing:  cssHex(palette.yellowLight),  // influence-range hover ring
  tickerHighlight: cssHex(palette.white),       // ticker hover / ghost ring
  energy:         cssHex(palette.cyan),         // energy bar (cyan)
  condition:      cssHex(palette.green),        // condition bar (green)
  barBg:          cssHex(palette.blackPurple),  // stat-bar background
};

export const UNIT_LABEL: Record<string, string> = {
  infantry: "I",
  mortar: "M",
  scout: "S",
  convoy: "C",
  tank: "T",
};

// Claimed tile fill colors: player H+S blended with hexFill L.
// Contested: midpoint of both player fills in RGB space.
export const CLAIMED_P1 = buildClaimedFill(C.p1, C.hexFill);
export const CLAIMED_P2 = buildClaimedFill(C.p2, C.hexFill);
export const CLAIMED_CONTESTED =
  (((((CLAIMED_P1 >> 16) & 0xff) + ((CLAIMED_P2 >> 16) & 0xff)) >> 1) << 16) |
  (((((CLAIMED_P1 >> 8) & 0xff) + ((CLAIMED_P2 >> 8) & 0xff)) >> 1) << 8) |
  (((CLAIMED_P1 & 0xff) + (CLAIMED_P2 & 0xff)) >> 1);

// ============================================================================
// Shared tile data interfaces (structural-compatible with game domain types)
// ============================================================================

export interface TileData {
  features: TileFeature[];
  baseForPlayerId?: number;
}

export interface ClaimData {
  playerId: number;
  claimType: ClaimType;
}

// ============================================================================
// Shared drawing: tile feature markers
// ============================================================================

/**
 * Draws Base, Depot, and Facility markers onto `gfx` for all tiles in the map.
 * `claims` may be an empty map when rendering without game state (e.g. the editor).
 */
export function drawTileFeatureMarkers(
  gfx: PIXI.Graphics,
  tiles: Map<string, TileData>,
  claims: Map<string, ClaimData[]>,
  hexSize: number
): void {
  tiles.forEach((tile, key) => {
    const [q, r] = key.split(",").map(Number);
    const [cx, cy] = hexCenter(q, r, hexSize);

    for (const feature of tile.features) {
      if (feature === TileFeature.Base) {
        const color =
          tile.baseForPlayerId === 1 ? C.p1 : tile.baseForPlayerId === 2 ? C.p2
            : cssHex(palette.white);
        const outerR = hexSize * 0.32,
          innerR = hexSize * 0.13;
        const pts: number[] = [];
        for (let i = 0; i < 10; i++) {
          const a = (Math.PI / 5) * i - Math.PI / 2;
          const rad = i % 2 === 0 ? outerR : innerR;
          pts.push(cx + rad * Math.cos(a), cy + rad * Math.sin(a));
        }
        gfx.lineStyle(1, cssHex(palette.white), 0.5);
        gfx.beginFill(color, 0.85);
        gfx.drawPolygon(pts);
        gfx.endFill();
      } else if (feature === TileFeature.Depot) {
        const claimList = claims.get(key);
        const directUnique = claimList?.length === 1 && claimList[0].claimType === ClaimType.Direct;
        const color = directUnique ? (claimList![0].playerId === 1 ? C.p1 : C.p2)
          : cssHex(palette.warmGray);
        const w = hexSize * 0.72,
          h = hexSize * 0.22;
        gfx.lineStyle(1, cssHex(palette.white), 0.4);
        gfx.beginFill(color, 0.85);
        gfx.drawRect(cx - w / 2, cy - h / 2, w, h);
        gfx.endFill();
      } else if (feature === TileFeature.Facility) {
        const claimList = claims.get(key);
        const directUnique = claimList?.length === 1 && claimList[0].claimType === ClaimType.Direct;
        const color = directUnique ? (claimList![0].playerId === 1 ? C.p1 : C.p2)
          : cssHex(palette.warmGray);
        const rad = hexSize * 0.34;
        const pts: number[] = [];
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i;
          pts.push(cx + rad * Math.cos(a), cy + rad * Math.sin(a));
        }
        gfx.lineStyle(1.5, cssHex(palette.white), 0.5);
        gfx.beginFill(color, 0.85);
        gfx.drawPolygon(pts);
        gfx.endFill();
      }
    }
  });
}
