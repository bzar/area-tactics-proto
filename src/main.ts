import * as PIXI from "pixi.js";
import { loadMap, listMaps, defaultUnitTypes, createGameFromMap } from "./maps";
import { GameProcessor, GameFeatures } from "./game";
import { InputProcessor } from "./input";
import { ActionEvent, GameEvent, UnitRef } from "./events";
import { createPosition, positionKey, UnitId, Unit, EffectType, TileFeature, ClaimType, PlayerType } from "./domain";
import { runBot } from "./bot";

// ============================================================================
// Hex math — flat-top orientation
// ============================================================================

// Scale hex size so the game is legible on smaller retina screens.
// Reference: 28px at 1600px+ viewport width; inversely scales for narrower screens.
function computeHexSize(): number {
  return Math.max(28, Math.min(44, Math.round(1600 * 28 / Math.max(window.innerWidth, 900))));
}
let HEX_SIZE = computeHexSize();
const SQRT3 = Math.sqrt(3);
const WORLD_ORIGIN_X = 50;
const WORLD_ORIGIN_Y = 50;

function hexCenter(q: number, r: number): [number, number] {
  return [
    WORLD_ORIGIN_X + HEX_SIZE * 1.5 * q,
    WORLD_ORIGIN_Y + HEX_SIZE * SQRT3 * (r + q / 2),
  ];
}

function hexCorners(cx: number, cy: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    pts.push(cx + (HEX_SIZE - 1) * Math.cos(a), cy + (HEX_SIZE - 1) * Math.sin(a));
  }
  return pts;
}

function pixelToHex(px: number, py: number): [number, number] {
  const fq = (px - WORLD_ORIGIN_X) / (HEX_SIZE * 1.5);
  const fr = (py - WORLD_ORIGIN_Y) / (HEX_SIZE * SQRT3) - fq / 2;
  const fs = -fq - fr;
  let rq = Math.round(fq), rr = Math.round(fr), rs = Math.round(fs);
  const dq = Math.abs(rq - fq), dr = Math.abs(rr - fr), ds = Math.abs(rs - fs);
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
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
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
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(f(p, q, h + 1/3) * 255);
  const g = Math.round(f(p, q, h) * 255);
  const bv = Math.round(f(p, q, h - 1/3) * 255);
  return (r << 16) | (g << 8) | bv;
}

// Build per-player claimed fill: player H+S, hexFill L
function buildClaimedFill(playerHex: number, baseHex: number): number {
  const [h, s] = rgbToHsl(playerHex);
  const [, , l] = rgbToHsl(baseHex);
  return hslToHex(h, s, l);
}

// ============================================================================
// Colors and labels
// ============================================================================

const C = {
  bg:           0x1a1a2e,
  hexFill:      0x1e2847,
  hexHover:     0x253060,
  hexStroke:    0x334466,
  validMove:    0x1a4d2e,
  selected:     0x4d3a00,
  p1:           0x3366ee,
  p2:           0xdd3333,
  selectRing:   0xffcc00,
  influenceRing: 0xffffaa,
  energy:       0x2255ee,
  condition:    0xdd2222,
  barBg:        0x111827,
};

const UNIT_LABEL: Record<string, string> = {
  infantry: "I", mortar: "M", scout: "S", convoy: "C",
};

// Claimed tile fill colors: player H+S blended with hexFill L.
// Contested: midpoint of both player fills in RGB space.
const CLAIMED_P1 = buildClaimedFill(C.p1, C.hexFill);
const CLAIMED_P2 = buildClaimedFill(C.p2, C.hexFill);
const CLAIMED_CONTESTED = (
  (((((CLAIMED_P1 >> 16) & 0xff) + ((CLAIMED_P2 >> 16) & 0xff)) >> 1) << 16) |
  (((((CLAIMED_P1 >> 8) & 0xff)  + ((CLAIMED_P2 >> 8) & 0xff))  >> 1) << 8)  |
  ((((CLAIMED_P1 & 0xff)         + (CLAIMED_P2 & 0xff))          >> 1))
);

const PLAYER_CSS: Record<number, string> = {
  1: "#5588ff",
  2: "#ff5555",
};

// ============================================================================
// Event ticker
// ============================================================================

const tickerEl = document.getElementById("ticker")!;

function unitSpan(ref: UnitRef): string {
  const color = PLAYER_CSS[ref.playerId] ?? "#cccccc";
  const label = UNIT_LABEL[ref.typeId] ?? ref.typeId;
  return `<span style="color:${color};font-weight:bold">${label}#${ref.unitId}</span>`;
}

function tickerLine(html: string) {
  const div = document.createElement("div");
  div.className = "t-line";
  div.innerHTML = html;
  tickerEl.prepend(div);
}

function tickerSeparator() {
  const div = document.createElement("div");
  div.className = "t-sep";
  tickerEl.prepend(div);
}

function tickerClear() {
  tickerEl.innerHTML = "";
}

function logGameEvent(e: GameEvent) {
  switch (e.type) {
    case "UnitMoved":
      tickerLine(`${unitSpan(e.unit)} moved to (${e.position.q}, ${e.position.r})`);
      break;
    case "UnitDamaged": {
      const typeLabel = e.damageType === "Normal" ? "" : ` <span style="color:#aaa">[${e.damageType}]</span>`;
      const detail = e.damageToCondition > 0
        ? `${e.damageToEnergy} energy, ${e.damageToCondition} condition`
        : `${e.damageToEnergy} energy`;
      tickerLine(`${unitSpan(e.attacker)} → ${unitSpan(e.unit)} dealt ${e.power}${typeLabel}: ${detail}`);
      break;
    }
    case "EnergyRegenerated": {
      const note = e.supported ? " <span style=\"color:#aaa\">[supported]</span>" : "";
      tickerLine(`${unitSpan(e.unit)} regenerated ${e.amount} energy${note}`);
      break;
    }
    case "UnitDestroyed":
      tickerLine(`${unitSpan(e.unit)} was <span style="color:#ff4444">destroyed</span> by ${unitSpan(e.destroyedBy)}`);
      break;
    case "TurnStarted":
      tickerSeparator();
      tickerLine(`<span style="color:#aaaacc">— Turn ${e.turn}, Player ${e.playerId} —</span>`);
      break;
    case "GameEnded":
      tickerLine(`<span style="color:#ffcc00">Game over — Player ${e.winnerId} wins!</span>`);
      break;
    case "BuildOrdered":
      tickerLine(`${unitSpan(e.unit)} build ordered at (${e.facilityPosition.q}, ${e.facilityPosition.r})`);
      break;
    case "UnitBuilt":
      tickerLine(`${unitSpan(e.unit)} <span style="color:#88ffaa">construction complete</span>`);
      break;
    case "BuildCancelled":
      tickerLine(`${unitSpan(e.unit)} build <span style="color:#ff8844">cancelled</span>`);
      break;
  }
}



const unitTypes = defaultUnitTypes();

function freshGame(mapName: string, features: GameFeatures = { support: false }, p2IsAI = false) {
  const def = loadMap(mapName);
  const g = createGameFromMap(def, unitTypes);
  if (p2IsAI) {
    const p2 = g.players.get(2);
    if (p2) p2.type = PlayerType.AI;
  }
  return { game: g, gameProcessor: new GameProcessor(g, unitTypes, features), inputProcessor: new InputProcessor() };
}

let { game, gameProcessor, inputProcessor } = freshGame("test");
let selectedUnitId: UnitId | null = null;
let validDests: Array<[number, number]> = [];
let hoveredPos: { q: number; r: number } | null = null;

// ============================================================================
// Pixi setup
// ============================================================================

const app = new PIXI.Application({
  resizeTo: window,
  backgroundColor: C.bg,
  antialias: true,
  autoDensity: true,
  resolution: window.devicePixelRatio || 1,
});
document.getElementById("canvas-container")!.appendChild(app.view as HTMLCanvasElement);

// World container — panned by dragging
const world = new PIXI.Container();
app.stage.addChild(world);

const mapGfx = new PIXI.Graphics();
world.addChild(mapGfx);

// Relations layer — between hex grid and units
const relationsGfx = new PIXI.Graphics();
world.addChild(relationsGfx);

const unitGfx = new PIXI.Graphics();
world.addChild(unitGfx);

const labelLayer = new PIXI.Container();
world.addChild(labelLayer);

// Text pool for unit labels (avoid thrashing GC)
const labelPool: PIXI.Text[] = [];
function getLabel(text: string, size: number): PIXI.Text {
  const t = labelPool.pop() ?? new PIXI.Text("", { fill: 0xffffff, fontWeight: "bold" });
  t.text = text;
  (t.style as PIXI.TextStyle).fontSize = size;
  t.anchor.set(0.5, 0.5);
  return t;
}

// ============================================================================
// Render
// ============================================================================

// Returns:
//   byPlayer: positionKey → playerIds (for border coloring)
//   byUnit:   positionKey → UnitIds   (for mouseover unit highlighting)
function buildTileInfluence(): { byPlayer: Map<string, Set<number>>; byUnit: Map<string, Set<UnitId>> } {
  const byPlayer = new Map<string, Set<number>>();
  const byUnit = new Map<string, Set<UnitId>>();
  game.players.forEach((player) => {
    player.units.forEach((unit) => {
      const ut = unitTypes.get(unit.typeId);
      if (!ut) return;
      for (const tile of game.map.grid.tilesInRange(unit.position, ut.aoiMin, ut.aoiMax)) {
        const key = positionKey(tile);
        if (!byPlayer.has(key)) byPlayer.set(key, new Set());
        byPlayer.get(key)!.add(player.id);
        if (!byUnit.has(key)) byUnit.set(key, new Set());
        byUnit.get(key)!.add(unit.id);
      }
    });
  });
  return { byPlayer, byUnit };
}

// Draws support lines (cyan: convoy → supported friendly units).
function drawRelations() {
  relationsGfx.clear();

  game.players.forEach((player) => {
    const supportedTiles = gameProcessor.getSupportedTiles(player.id);
    if (supportedTiles.size === 0) return;

    const basePos = game.map.bases.get(player.id);
    const [bx, by] = basePos ? hexCenter(basePos.q, basePos.r) : [0, 0];

    // Categorise units: convoys vs non-convoys
    const convoys: Unit[] = [];
    const nonConvoys: Unit[] = [];
    player.units.forEach((unit) => {
      const ut = unitTypes.get(unit.typeId);
      if (!ut) return;
      (ut.effectType === EffectType.Support ? convoys : nonConvoys).push(unit);
    });

    // Base → units it directly supports (within base 3-radius, non-convoy)
    // Base → convoys on supported tile (network, thick)
    if (basePos) {
      const baseRadius = new Set(
        game.map.grid.tilesInRange(basePos, 0, 3).map(positionKey)
      );
      nonConvoys.forEach((unit) => {
        const unitKey = positionKey(unit.position);
        if (!baseRadius.has(unitKey) || !supportedTiles.has(unitKey)) return;
        const [ux, uy] = hexCenter(unit.position.q, unit.position.r);
        relationsGfx.lineStyle(1.5, 0x00ccff, 0.45);
        relationsGfx.moveTo(bx, by); relationsGfx.lineTo(ux, uy);
      });
      convoys.forEach((convoy) => {
        const cKey = positionKey(convoy.position);
        if (!baseRadius.has(cKey) || !supportedTiles.has(cKey)) return;
        const [cx, cy] = hexCenter(convoy.position.q, convoy.position.r);
        relationsGfx.lineStyle(2.5, 0x00ccff, 0.6);
        relationsGfx.moveTo(bx, by); relationsGfx.lineTo(cx, cy);
      });
    }

    // Convoy → units / other convoys in its AoI that are supported
    convoys.forEach((convoy) => {
      const cKey = positionKey(convoy.position);
      if (!supportedTiles.has(cKey)) return; // convoy itself must be supported
      const [cvx, cvy] = hexCenter(convoy.position.q, convoy.position.r);
      const convoyAoi = new Set(
        game.map.grid.tilesInRange(convoy.position,
          unitTypes.get(convoy.typeId)!.aoiMin,
          unitTypes.get(convoy.typeId)!.aoiMax).map(positionKey)
      );
      nonConvoys.forEach((unit) => {
        const unitKey = positionKey(unit.position);
        if (supportedTiles.has(unitKey) && convoyAoi.has(unitKey)) {
          const [ux, uy] = hexCenter(unit.position.q, unit.position.r);
          relationsGfx.lineStyle(1.5, 0x00ccff, 0.45);
          relationsGfx.moveTo(cvx, cvy); relationsGfx.lineTo(ux, uy);
        }
      });
      convoys.forEach((other) => {
        if (other.id === convoy.id) return;
        const otherKey = positionKey(other.position);
        if (supportedTiles.has(otherKey) && convoyAoi.has(otherKey)) {
          const [ox, oy] = hexCenter(other.position.q, other.position.r);
          relationsGfx.lineStyle(2.5, 0x00ccff, 0.6);
          relationsGfx.moveTo(cvx, cvy); relationsGfx.lineTo(ox, oy);
        }
      });
    });
  });
}

function render() {
  mapGfx.clear();
  relationsGfx.clear();
  unitGfx.clear();
  labelPool.push(...labelLayer.removeChildren() as PIXI.Text[]);

  const { grid } = game.map;

  // --- Hex grid ---
  const { byPlayer, byUnit } = buildTileInfluence();
  const claims = gameProcessor.getClaims();
  const hoveredKey = hoveredPos ? positionKey(hoveredPos) : null;
  const hoveredInfluencers: Set<UnitId> = hoveredKey ? (byUnit.get(hoveredKey) ?? new Set()) : new Set();

  for (const { q, r } of grid.getTiles()) {
    const [cx, cy] = hexCenter(q, r);
    const isValid = validDests.some(([vq, vr]) => vq === q && vr === r);
    const isHovered = hoveredPos !== null && hoveredPos.q === q && hoveredPos.r === r;
    const key = positionKey({ q, r });
    const claimList = claims.get(key);
    let claimFill = C.hexFill;
    if (claimList && claimList.length > 0) {
      if (claimList.length > 1) claimFill = CLAIMED_CONTESTED;
      else claimFill = claimList[0].playerId === 1 ? CLAIMED_P1 : CLAIMED_P2;
    }
    const fill = isValid ? C.validMove : isHovered ? C.hexHover : claimFill;
    const influencers = byPlayer.get(key);
    let strokeColor = C.hexStroke;
    let strokeWidth = 1;
    if (influencers && influencers.size > 0) {
      strokeWidth = 2;
      if (influencers.size > 1)    strokeColor = 0xffffff;
      else if (influencers.has(1)) strokeColor = C.p1;
      else                         strokeColor = C.p2;
    }
    mapGfx.lineStyle(strokeWidth, strokeColor);
    mapGfx.beginFill(fill);
    mapGfx.drawPolygon(hexCorners(cx, cy));
    mapGfx.endFill();
  }

  // --- Tile features ---
  game.map.tiles.forEach((tile, key) => {
    const pos = (() => {
      // Reconstruct position from key "q,r"
      const [q, r] = key.split(",").map(Number);
      return { q, r };
    })();
    const [cx, cy] = hexCenter(pos.q, pos.r);

    for (const feature of tile.features) {
      if (feature === TileFeature.Base) {
        // 5-pointed star, colored by owning player
        const color = tile.baseForPlayerId === 1 ? C.p1 : tile.baseForPlayerId === 2 ? C.p2 : 0xffffff;
        const outerR = HEX_SIZE * 0.32, innerR = HEX_SIZE * 0.13;
        const pts: number[] = [];
        for (let i = 0; i < 10; i++) {
          const a = (Math.PI / 5) * i - Math.PI / 2;
          const r = i % 2 === 0 ? outerR : innerR;
          pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
        }
        mapGfx.lineStyle(1, 0xffffff, 0.5);
        mapGfx.beginFill(color, 0.85);
        mapGfx.drawPolygon(pts);
        mapGfx.endFill();

      } else if (feature === TileFeature.Depot) {
        // Wide flat rectangle — gold if directly and uniquely claimed, else grey
        const claimList = claims.get(key);
        const directUnique = claimList?.length === 1 && claimList[0].claimType === ClaimType.Direct;
        const color = directUnique ? (claimList![0].playerId === 1 ? C.p1 : C.p2) : 0x777788;
        const w = HEX_SIZE * 0.72, h = HEX_SIZE * 0.22;
        mapGfx.lineStyle(1, 0xffffff, 0.4);
        mapGfx.beginFill(color, 0.85);
        mapGfx.drawRect(cx - w / 2, cy - h / 2, w, h);
        mapGfx.endFill();

      } else if (feature === TileFeature.Facility) {
        // Small hexagon — teal if directly and uniquely claimed, else grey
        const claimList = claims.get(key);
        const directUnique = claimList?.length === 1 && claimList[0].claimType === ClaimType.Direct;
        const color = directUnique ? (claimList![0].playerId === 1 ? C.p1 : C.p2) : 0x777788;
        const r = HEX_SIZE * 0.34;
        const pts: number[] = [];
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i;
          pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
        }
        mapGfx.lineStyle(1.5, 0xffffff, 0.5);
        mapGfx.beginFill(color, 0.85);
        mapGfx.drawPolygon(pts);
        mapGfx.endFill();
      }
    }
  });

  // --- Units ---
  const unitRadius = HEX_SIZE * 0.48;
  const barW = HEX_SIZE * 1.0;
  const barH = 3;

  game.players.forEach((player) => {
    const pColor = player.id === 1 ? C.p1 : C.p2;
    player.units.forEach((unit) => {
      const [cx, cy] = hexCenter(unit.position.q, unit.position.r);
      const isSelected = unit.id === selectedUnitId;
      const ut = unitTypes.get(unit.typeId)!;

      // Influence hover highlight — outermost ring, behind everything else
      if (hoveredInfluencers.has(unit.id)) {
        unitGfx.lineStyle(0);
        unitGfx.beginFill(C.influenceRing, 0.3);
        unitGfx.drawCircle(cx, cy, unitRadius + 10);
        unitGfx.endFill();
      }

      // Selection highlight behind unit
      if (isSelected) {
        unitGfx.lineStyle(0);
        unitGfx.beginFill(C.selectRing, 0.4);
        unitGfx.drawCircle(cx, cy, unitRadius + 5);
        unitGfx.endFill();
      }

      // Unit circle — translucent when under construction
      const alpha = unit.underConstruction ? 0.45 : 1;
      unitGfx.lineStyle(isSelected ? 2 : 1, isSelected ? C.selectRing : 0xffffff, (isSelected ? 1 : 0.35) * alpha);
      unitGfx.beginFill(pColor, alpha);
      unitGfx.drawCircle(cx, cy, unitRadius);
      unitGfx.endFill();

      // Energy bar (blue) above unit
      const barX = cx - barW / 2;
      const barY = cy - unitRadius - 7;
      unitGfx.lineStyle(0);
      unitGfx.beginFill(C.barBg, alpha);
      unitGfx.drawRect(barX, barY - barH - 1, barW, barH);
      unitGfx.drawRect(barX, barY, barW, barH);
      unitGfx.beginFill(C.energy, alpha);
      unitGfx.drawRect(barX, barY - barH - 1, barW * (unit.energy / ut.maxEnergy), barH);
      unitGfx.beginFill(C.condition, alpha);
      unitGfx.drawRect(barX, barY, barW * (unit.condition / ut.maxCondition), barH);
      unitGfx.endFill();

      // Unit type label
      const lbl = getLabel(UNIT_LABEL[unit.typeId] ?? "?", Math.floor(HEX_SIZE * 0.5));
      lbl.x = cx;
      lbl.y = cy;
      lbl.alpha = alpha;
      labelLayer.addChild(lbl);
    });
  });

  drawRelations();
}

function updateHUD() {
  const currentPlayer = game.players.get(game.currentPlayerId);
  const label = currentPlayer?.type === PlayerType.AI ? "AI" : `Player ${game.currentPlayerId}`;
  (document.getElementById("turn-display") as HTMLElement).textContent =
    `Turn ${game.turn}  —  ${label}`;
  game.players.forEach((player) => {
    const load = gameProcessor.getUnitLoad(player.id);
    const cap = gameProcessor.getUnitCapacity(player.id);
    const el = document.getElementById(`load-p${player.id}`);
    if (el) el.textContent = cap !== undefined ? `Load: ${load} / ${cap}` : `Load: ${load}`;
  });
}

const unitInfoEl = document.getElementById("unit-info") as HTMLElement;

function updateUnitInfo() {
  if (!hoveredPos) { unitInfoEl.style.display = "none"; return; }
  const key = positionKey(hoveredPos);
  let unit: Unit | undefined;
  let playerId = 0;
  for (const [pid, player] of game.players) {
    for (const u of player.units.values()) {
      if (positionKey(u.position) === key) { unit = u; playerId = pid; break; }
    }
    if (unit) break;
  }
  if (!unit) { unitInfoEl.style.display = "none"; return; }

  const ut = unitTypes.get(unit.typeId)!;
  const bgColor = playerId === 1 ? "#1a2f6e" : "#6e1a1a";
  const aoi = ut.aoiMin === ut.aoiMax ? `${ut.aoiMin}` : `${ut.aoiMin}–${ut.aoiMax}`;
  unitInfoEl.style.display = "block";
  unitInfoEl.style.background = bgColor;
  unitInfoEl.innerHTML =
    `<b>${unit.typeId}  #${unit.id}</b>\n` +
    `Energy:    ${unit.energy} / ${ut.maxEnergy}\n` +
    `Condition: ${unit.condition} / ${ut.maxCondition}\n` +
    `AoI:       ${aoi}\n` +
    `Power:     ${ut.power}  (${ut.effectType})\n` +
    `Movement:  ${ut.movement}`;
}

// ============================================================================
// Build dialog
// ============================================================================

let buildDialogPos: { q: number; r: number } | null = null;
let buildDialogSelectedType: string | null = null;

function isBuildableFacility(pos: { q: number; r: number }): boolean {
  const key = positionKey(pos);
  const tile = game.map.tiles.get(key);
  if (!tile?.features.includes(TileFeature.Facility)) return false;
  const claims = gameProcessor.getClaims();
  const claimList = claims.get(key);
  const myClaim = claimList?.find((c) => c.playerId === game.currentPlayerId);
  return myClaim?.claimType === ClaimType.Direct && (claimList?.length ?? 0) === 1;
}

let buildDialogOpenedAt = 0;

function openBuildDialog(pos: { q: number; r: number }) {
  buildDialogOpenedAt = Date.now();
  buildDialogPos = pos;
  buildDialogSelectedType = null;

  const key = positionKey(pos);
  const capacity = gameProcessor.getUnitCapacity(game.currentPlayerId);
  const load = gameProcessor.getUnitLoad(game.currentPlayerId);

  // Find existing build order at this facility (if any) and subtract its cost
  // so we compare against the "load without this slot"
  const existingOrder = Array.from(game.players.get(game.currentPlayerId)!.units.values())
    .find((u) => u.underConstruction && positionKey(u.position) === key);
  const slotsInUse = load - (existingOrder ? (unitTypes.get(existingOrder.typeId)?.cost ?? 0) : 0);

  const listEl = document.getElementById("build-list")!;
  listEl.innerHTML = "";
  const allTypes = Array.from(unitTypes.entries());
  let firstAvailableId: string | null = null;

  for (const [typeId, ut] of allTypes) {
    const canAfford = capacity === undefined || slotsInUse + ut.cost <= capacity;
    const li = document.createElement("li");
    li.dataset.typeId = typeId;
    li.innerHTML = `<span>${typeId}</span><span class="bl-cost">(${ut.cost})</span>`;
    if (!canAfford) {
      li.classList.add("bl-disabled");
    } else {
      if (!firstAvailableId) firstAvailableId = typeId;
      li.addEventListener("click", () => selectBuildType(typeId));
    }
    listEl.appendChild(li);
  }

  const confirmBtn = document.getElementById("build-confirm-btn") as HTMLButtonElement;
  confirmBtn.disabled = true;

  const preselect = existingOrder?.typeId ?? firstAvailableId;
  if (preselect && !document.querySelector(`#build-list li[data-type-id="${preselect}"].bl-disabled`)) {
    selectBuildType(preselect);
  } else {
    // Clear detail panel
    const ctx = (document.getElementById("build-portrait") as HTMLCanvasElement).getContext("2d")!;
    ctx.clearRect(0, 0, 80, 80);
    document.getElementById("build-stats")!.textContent = "";
  }

  document.getElementById("build-dialog")!.classList.add("visible");
}

function selectBuildType(typeId: string) {
  buildDialogSelectedType = typeId;

  document.querySelectorAll("#build-list li").forEach((li) => {
    li.classList.toggle("bl-selected", (li as HTMLElement).dataset.typeId === typeId);
  });

  const ut = unitTypes.get(typeId)!;
  const aoi = ut.aoiMin === ut.aoiMax ? `${ut.aoiMin}` : `${ut.aoiMin}–${ut.aoiMax}`;

  // Draw portrait
  const portrait = document.getElementById("build-portrait") as HTMLCanvasElement;
  const ctx = portrait.getContext("2d")!;
  ctx.clearRect(0, 0, 80, 80);
  const color = game.currentPlayerId === 1 ? "#3366ee" : "#dd3333";
  ctx.beginPath();
  ctx.arc(40, 40, 36, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(UNIT_LABEL[typeId] ?? "?", 40, 41);

  document.getElementById("build-stats")!.textContent =
    `${typeId}\n` +
    `Type:      ${ut.effectType}\n` +
    `AoI:       ${aoi}\n` +
    `Power:     ${ut.power}\n` +
    `Movement:  ${ut.movement}\n` +
    `Energy:    ${ut.maxEnergy}\n` +
    `Condition: ${ut.maxCondition}\n` +
    `Cost:      ${ut.cost}`;

  (document.getElementById("build-confirm-btn") as HTMLButtonElement).disabled = false;
}

function closeBuildDialog() {
  buildDialogPos = null;
  buildDialogSelectedType = null;
  document.getElementById("build-dialog")!.classList.remove("visible");
}

// Dialog button / backdrop handlers
document.getElementById("build-close-btn")!.addEventListener("click", closeBuildDialog);
document.getElementById("build-dialog")!.addEventListener("click", (e) => {
  if ((e.target as HTMLElement).id === "build-dialog" && Date.now() - buildDialogOpenedAt > 300) closeBuildDialog();
});
document.getElementById("build-confirm-btn")!.addEventListener("click", () => {
  if (!buildDialogPos || !buildDialogSelectedType) return;
  const pos = createPosition(buildDialogPos.q, buildDialogPos.r);
  gameProcessor.handle({ type: "OrderBuild", facilityPosition: pos, unitTypeId: buildDialogSelectedType }, (e) => {
    logGameEvent(e);
  });
  updateHUD();
  render();
  closeBuildDialog();
});

// ============================================================================
// Action / event handling
// ============================================================================

function processActions(actions: ActionEvent[]) {
  for (const action of actions) {
    if (action.type === "UnitSelected") {
      selectedUnitId = action.unitId;
      validDests = action.validDestinations.map((p) => [p.q, p.r] as [number, number]);
    } else if (action.type === "SelectionCleared") {
      selectedUnitId = null;
      validDests = [];
    } else if (action.type === "Move" || action.type === "EndTurn") {
      selectedUnitId = null;
      validDests = [];
      gameProcessor.handle(action, (e) => {
        logGameEvent(e);
        if (e.type === "GameEnded") showGameOver(e.winnerId);
      });
      updateHUD();
    }
  }
  render();
  updateUnitInfo();
  scheduleBotIfAI();
}

/** If the current player is an AI, run the bot after a brief render delay. */
function scheduleBotIfAI() {
  const player = game.players.get(game.currentPlayerId);
  if (player?.type !== PlayerType.AI) return;
  updateHUD(); // show current state before thinking
  setTimeout(() => {
    let gameEnded = false;
    runBot(gameProcessor, (e) => {
      logGameEvent(e);
      if (e.type === "GameEnded") { showGameOver(e.winnerId); gameEnded = true; }
    });
    selectedUnitId = null;
    validDests = [];
    updateHUD();
    render();
    updateUnitInfo();
    // If the bot's EndTurn flipped back to a human player we're done.
    // If it somehow flipped to another AI (future multi-bot support), recurse.
    if (!gameEnded) scheduleBotIfAI();
  }, 0);
}

function showNewGame() {
  document.getElementById("game-over")!.classList.remove("visible");
  document.getElementById("new-game")!.classList.add("visible");
}

function showGameOver(winnerId: number) {
  document.getElementById("winner-text")!.textContent = `Player ${winnerId} wins!`;
  document.getElementById("game-over")!.classList.add("visible");
}

// ============================================================================
// Pan / click input
// ============================================================================

const canvas = app.view as HTMLCanvasElement;

let panStart: { x: number; y: number; wx: number; wy: number } | null = null;
let dragging = false;
let dragThreshold = 5;

canvas.addEventListener("pointerdown", (e) => {
  panStart = { x: e.clientX, y: e.clientY, wx: world.x, wy: world.y };
  dragging = false;
  dragThreshold = e.pointerType === "touch" ? 15 : 5;
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  if (panStart) {
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    if (!dragging && (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold)) {
      dragging = true;
    }
    if (dragging) {
      world.x = panStart.wx + dx;
      world.y = panStart.wy + dy;
    }
  }

  // Only update hover from pointermove for non-touch (mouse/pen)
  if (!dragging && e.pointerType !== "touch") {
    const rect = canvas.getBoundingClientRect();
    const wx = e.clientX - rect.left - world.x;
    const wy = e.clientY - rect.top - world.y;
    const [q, r] = pixelToHex(wx, wy);
    const newPos = game.map.grid.isInBounds(createPosition(q, r)) ? { q, r } : null;
    const oldKey = hoveredPos ? positionKey(hoveredPos) : null;
    const newKey = newPos ? positionKey(newPos) : null;
    if (oldKey !== newKey) {
      hoveredPos = newPos;
      render();
      updateUnitInfo();
    }
  }
});

canvas.addEventListener("pointerup", (e) => {
  if (!dragging && panStart) {
    const rect = canvas.getBoundingClientRect();
    const wx = e.clientX - rect.left - world.x;
    const wy = e.clientY - rect.top - world.y;
    const [q, r] = pixelToHex(wx, wy);
    const pos = createPosition(q, r);
    if (game.map.grid.isInBounds(pos)) {
      // On touch, pointermove doesn't update hoveredPos — do it here so
      // influence highlights and the unit info box reflect the tapped tile.
      hoveredPos = { q, r };

      const key = positionKey(pos);
      const hasBuildableUnit = Array.from(game.players.values()).some((p) =>
        Array.from(p.units.values()).some((u) => positionKey(u.position) === key && !u.underConstruction)
      );
      const isValidMoveDest = selectedUnitId !== null &&
        validDests.some(([dq, dr]) => dq === q && dr === r);

      if (!isValidMoveDest && !hasBuildableUnit && isBuildableFacility(pos)) {
        // Clear any pending unit selection before opening dialog
        inputProcessor.clearSelection();
        selectedUnitId = null;
        validDests = [];
        render();
        openBuildDialog(pos);
      } else {
        const actions: ActionEvent[] = [];
        inputProcessor.handle({ type: "TileDown", position: pos }, gameProcessor, (a) => actions.push(a));
        processActions(actions);
      }
    }
  }
  panStart = null;
  dragging = false;
});

document.getElementById("end-turn-btn")!.addEventListener("click", () => {
  const actions: ActionEvent[] = [];
  inputProcessor.handle({ type: "EndTurn" }, gameProcessor, (a) => actions.push(a));
  processActions(actions);
});

document.getElementById("back-btn")!.addEventListener("click", showNewGame);

// ── New-game screen ──
const mapOptionsEl = document.getElementById("map-options")!;
listMaps().forEach(({ name, label }, i) => {
  const div = document.createElement("div");
  div.className = "map-option";
  div.innerHTML = `<input type="radio" name="map" id="map-${name}" value="${name}" ${i === 0 ? "checked" : ""} />
                   <label for="map-${name}">${label}</label>`;
  mapOptionsEl.appendChild(div);
});

document.getElementById("start-btn")!.addEventListener("click", () => {
  const selected = (document.querySelector('input[name="map"]:checked') as HTMLInputElement)?.value ?? "test";
  const features: GameFeatures = {
    support: (document.getElementById("f-support") as HTMLInputElement).checked,
    flanking: (document.getElementById("f-flanking") as HTMLInputElement).checked,
  };
  const p2IsAI = (document.querySelector('input[name="mode"]:checked') as HTMLInputElement)?.value === "hva";
  ({ game, gameProcessor, inputProcessor } = freshGame(selected, features, p2IsAI));
  selectedUnitId = null;
  validDests = [];
  hoveredPos = null;
  world.x = 0;
  world.y = 0;
  tickerClear();
  document.getElementById("new-game")!.classList.remove("visible");
  updateHUD();
  render();
});

// Init — new-game screen is shown first; game starts on "Start Game" click

// Recompute hex size on viewport resize so content stays legible at any window size
window.addEventListener("resize", () => {
  const newSize = computeHexSize();
  if (newSize !== HEX_SIZE) {
    HEX_SIZE = newSize;
    render();
  }
});
