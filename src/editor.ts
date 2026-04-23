import * as PIXI from "pixi.js";
import { TileFeature, positionKey, defaultUnitTypes } from "area-tactics";
import type { MapJson, MapJsonUnit, MapJsonTile } from "area-tactics";
import { palette } from "./palette.js";
import {
  computeHexSize,
  hexCenter,
  hexCorners,
  pixelToHex,
  C,
  UNIT_LABEL,
  drawTileFeatureMarkers,
  cssHex,
} from "./render.js";

// ============================================================================
// Editor state
// ============================================================================

interface EditorTileData {
  features: TileFeature[];
  baseForPlayerId?: number;
}

interface EditorUnit {
  typeId: string;
  playerId: number;
  q: number;
  r: number;
}

interface EditorState {
  meta: { name: string; label: string };
  cols: number;
  rows: number;
  removedTiles: Set<string>;
  tiles: Map<string, EditorTileData>;
  units: EditorUnit[];
  unitCapacity: Record<number, number>;
}

const state: EditorState = {
  meta: { name: "new-map", label: "New Map" },
  cols: 10,
  rows: 10,
  removedTiles: new Set(),
  tiles: new Map(),
  units: [],
  unitCapacity: { 1: 10, 2: 10 },
};

// ============================================================================
// Tool definitions
// ============================================================================

type EditorTool =
  | "none"
  | "remove-tile"
  | "add-base-p1"
  | "add-base-p2"
  | "add-depot"
  | "add-facility"
  | "clear-feature"
  | "add-unit"
  | "remove-unit";

let activeTool: EditorTool = "none";

// ============================================================================
// Hex size
// ============================================================================

let HEX_SIZE = computeHexSize();

// ============================================================================
// PIXI setup
// ============================================================================

const container = document.getElementById("canvas-container")!;
const app = new PIXI.Application({
  resizeTo: container,
  backgroundColor: C.bg,
  antialias: true,
  autoDensity: true,
  resolution: window.devicePixelRatio || 1,
});
container.appendChild(app.view as HTMLCanvasElement);

const world = new PIXI.Container();
app.stage.addChild(world);

const mapGfx = new PIXI.Graphics();
world.addChild(mapGfx);

const unitGfx = new PIXI.Graphics();
world.addChild(unitGfx);

const labelLayer = new PIXI.Container();
world.addChild(labelLayer);

// Text pool — avoid GC thrashing on every render
const labelPool: PIXI.Text[] = [];
function getLabel(text: string, size: number): PIXI.Text {
  const t = labelPool.pop() ?? new PIXI.Text("", { fill: 0xffffff, fontWeight: "bold" });
  t.text = text;
  (t.style as PIXI.TextStyle).fontSize = size;
  t.anchor.set(0.5, 0.5);
  return t;
}

// ============================================================================
// Tile grid helpers
// ============================================================================

/** Compute all tile positions for the current cols/rows (same formula as maps.ts rectMapGrid). */
function computeGridTiles(): Array<{ q: number; r: number }> {
  const tiles: Array<{ q: number; r: number }> = [];
  for (let q = 0; q < state.cols; q++) {
    const rOffset = -Math.floor(q / 2);
    for (let vr = 0; vr < state.rows; vr++) {
      tiles.push({ q, r: rOffset + vr });
    }
  }
  return tiles;
}

/** Returns true if (q, r) is inside the current grid bounds. */
function isInGrid(q: number, r: number): boolean {
  if (q < 0 || q >= state.cols) return false;
  const rOffset = -Math.floor(q / 2);
  return r >= rOffset && r < rOffset + state.rows;
}

// ============================================================================
// Render
// ============================================================================

let hoveredPos: { q: number; r: number } | null = null;

function render(): void {
  mapGfx.clear();
  unitGfx.clear();
  labelPool.push(...(labelLayer.removeChildren() as PIXI.Text[]));

  const allTiles = computeGridTiles();

  // --- Hex grid ---
  for (const { q, r } of allTiles) {
    const [cx, cy] = hexCenter(q, r, HEX_SIZE);
    const key = positionKey({ q, r });
    const isRemoved = state.removedTiles.has(key);
    const isHovered = hoveredPos?.q === q && hoveredPos?.r === r;

    if (isRemoved) {
      // Removed tile: dark red fill with X overlay to make intent clear
      mapGfx.lineStyle(1, cssHex(palette.maroon));
      mapGfx.beginFill(cssHex(palette.darkRed), 0.85);
      mapGfx.drawPolygon(hexCorners(cx, cy, HEX_SIZE));
      mapGfx.endFill();
      const xSize = HEX_SIZE * 0.32;
      mapGfx.lineStyle(2, cssHex(palette.redBright), 0.8);
      mapGfx.moveTo(cx - xSize, cy - xSize);
      mapGfx.lineTo(cx + xSize, cy + xSize);
      mapGfx.moveTo(cx + xSize, cy - xSize);
      mapGfx.lineTo(cx - xSize, cy + xSize);
    } else {
      const fill = isHovered ? C.hexHover : C.hexFill;
      mapGfx.lineStyle(1, C.hexStroke);
      mapGfx.beginFill(fill);
      mapGfx.drawPolygon(hexCorners(cx, cy, HEX_SIZE));
      mapGfx.endFill();
    }
  }

  // --- Tile features (no claim state in the editor) ---
  drawTileFeatureMarkers(mapGfx, state.tiles, new Map(), HEX_SIZE);

  // --- Units ---
  const unitRadius = HEX_SIZE * 0.38;
  for (const unit of state.units) {
    const key = positionKey({ q: unit.q, r: unit.r });
    if (state.removedTiles.has(key)) continue;
    const [cx, cy] = hexCenter(unit.q, unit.r, HEX_SIZE);
    const pColor = unit.playerId === 1 ? C.p1 : C.p2;
    unitGfx.lineStyle(1, cssHex(palette.white), 0.35);
    unitGfx.beginFill(pColor);
    unitGfx.drawCircle(cx, cy, unitRadius);
    unitGfx.endFill();
    const lbl = getLabel(UNIT_LABEL[unit.typeId] ?? "?", Math.floor(HEX_SIZE * 0.45));
    lbl.x = cx;
    lbl.y = cy;
    labelLayer.addChild(lbl);
  }
}

// ============================================================================
// Tool application
// ============================================================================

function applyTool(q: number, r: number): void {
  const key = positionKey({ q, r });
  switch (activeTool) {
    case "remove-tile":
      if (state.removedTiles.has(key)) {
        state.removedTiles.delete(key);
      } else {
        state.removedTiles.add(key);
        state.tiles.delete(key);
        state.units = state.units.filter((u) => !(u.q === q && u.r === r));
      }
      break;
    case "add-base-p1":
      state.tiles.set(key, { features: [TileFeature.Base], baseForPlayerId: 1 });
      break;
    case "add-base-p2":
      state.tiles.set(key, { features: [TileFeature.Base], baseForPlayerId: 2 });
      break;
    case "add-depot":
      state.tiles.set(key, { features: [TileFeature.Depot] });
      break;
    case "add-facility":
      state.tiles.set(key, { features: [TileFeature.Facility] });
      break;
    case "clear-feature":
      state.tiles.delete(key);
      break;
    case "add-unit": {
      const typeId = (document.getElementById("ed-unit-type") as HTMLSelectElement).value;
      const playerId = parseInt(
        (document.getElementById("ed-unit-player") as HTMLSelectElement).value,
        10
      );
      // Replace any existing unit at this position
      state.units = state.units.filter((u) => !(u.q === q && u.r === r));
      state.units.push({ typeId, playerId, q, r });
      break;
    }
    case "remove-unit":
      state.units = state.units.filter((u) => !(u.q === q && u.r === r));
      break;
    default:
      break;
  }
  render();
}

// ============================================================================
// Resize
// ============================================================================

function resizeMap(newCols: number, newRows: number): void {
  state.cols = newCols;
  state.rows = newRows;

  // Remove tiles and units that are now out of bounds
  for (const key of [...state.tiles.keys()]) {
    const [q, r] = key.split(",").map(Number);
    if (!isInGrid(q, r)) state.tiles.delete(key);
  }
  for (const key of [...state.removedTiles]) {
    const [q, r] = key.split(",").map(Number);
    if (!isInGrid(q, r)) state.removedTiles.delete(key);
  }
  state.units = state.units.filter((u) => isInGrid(u.q, u.r));

  render();
}

// ============================================================================
// Import / Export
// ============================================================================

function exportMap(): void {
  const removedTilesArr = [...state.removedTiles].map((k) => {
    const [q, r] = k.split(",").map(Number);
    return { q, r };
  });

  const units: MapJsonUnit[] = state.units.map((u) => ({
    typeId: u.typeId,
    playerId: u.playerId,
    q: u.q,
    r: u.r,
  }));

  const tiles: MapJsonTile[] = [];
  state.tiles.forEach((tile, key) => {
    const [q, r] = key.split(",").map(Number);
    const entry: MapJsonTile = {
      q,
      r,
      features: tile.features.map((f) => f as string),
    };
    if (tile.baseForPlayerId !== undefined) entry.baseForPlayerId = tile.baseForPlayerId;
    tiles.push(entry);
  });

  const unitCapacity: Record<string, number> = {};
  for (const [pid, cap] of Object.entries(state.unitCapacity)) {
    unitCapacity[pid] = cap;
  }

  const json: MapJson = {
    meta: { name: state.meta.name, label: state.meta.label },
    data: {
      grid: {
        type: "rect",
        cols: state.cols,
        rows: state.rows,
        ...(removedTilesArr.length > 0 ? { removedTiles: removedTilesArr } : {}),
      },
      unitCapacity,
      units,
      tiles,
    },
  };

  const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${state.meta.name || "map"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importMap(json: MapJson): void {
  state.meta.name = json.meta.name;
  state.meta.label = json.meta.label;
  state.cols = json.data.grid.cols;
  state.rows = json.data.grid.rows;

  state.removedTiles.clear();
  for (const pos of json.data.grid.removedTiles ?? []) {
    state.removedTiles.add(positionKey(pos));
  }

  state.tiles.clear();
  for (const t of json.data.tiles ?? []) {
    state.tiles.set(positionKey({ q: t.q, r: t.r }), {
      features: t.features.map((f) => f as TileFeature),
      baseForPlayerId: t.baseForPlayerId,
    });
  }

  state.units = json.data.units.map((u) => ({
    typeId: u.typeId,
    playerId: u.playerId,
    q: u.q,
    r: u.r,
  }));

  state.unitCapacity = {};
  if (json.data.unitCapacity) {
    for (const [k, v] of Object.entries(json.data.unitCapacity)) {
      state.unitCapacity[Number(k)] = v;
    }
  }

  syncFormFromState();
  render();
}

// ============================================================================
// Sync form ↔ state
// ============================================================================

function syncFormFromState(): void {
  (document.getElementById("ed-name") as HTMLInputElement).value = state.meta.name;
  (document.getElementById("ed-label") as HTMLInputElement).value = state.meta.label;
  (document.getElementById("ed-cols") as HTMLInputElement).value = String(state.cols);
  (document.getElementById("ed-rows") as HTMLInputElement).value = String(state.rows);
  (document.getElementById("ed-cap1") as HTMLInputElement).value = String(
    state.unitCapacity[1] ?? ""
  );
  (document.getElementById("ed-cap2") as HTMLInputElement).value = String(
    state.unitCapacity[2] ?? ""
  );
}

// ============================================================================
// Tool button management
// ============================================================================

function setActiveTool(tool: EditorTool): void {
  activeTool = tool;
  document.querySelectorAll<HTMLButtonElement>(".tool-btn").forEach((btn) => {
    btn.classList.toggle("tool-active", btn.dataset.tool === tool);
  });
  // Show unit options row only when add-unit is active
  const unitOptsRow = document.getElementById("unit-opts-row")!;
  unitOptsRow.style.display = tool === "add-unit" ? "flex" : "none";
}

// ============================================================================
// Pan + click input
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

  if (!dragging && e.pointerType !== "touch") {
    const rect = canvas.getBoundingClientRect();
    const wx = e.clientX - rect.left - world.x;
    const wy = e.clientY - rect.top - world.y;
    const [q, r] = pixelToHex(wx, wy, HEX_SIZE);
    const newInGrid = isInGrid(q, r);
    const newPos = newInGrid ? { q, r } : null;
    const oldKey = hoveredPos ? positionKey(hoveredPos) : null;
    const newKey = newPos ? positionKey(newPos) : null;
    if (oldKey !== newKey) {
      hoveredPos = newPos;
      render();
    }
  }
});

canvas.addEventListener("pointerup", (e) => {
  if (!dragging && panStart && activeTool !== "none") {
    const rect = canvas.getBoundingClientRect();
    const wx = e.clientX - rect.left - world.x;
    const wy = e.clientY - rect.top - world.y;
    const [q, r] = pixelToHex(wx, wy, HEX_SIZE);
    if (isInGrid(q, r)) {
      applyTool(q, r);
    }
  }
  panStart = null;
  dragging = false;
});

canvas.addEventListener("mouseleave", () => {
  hoveredPos = null;
  render();
});

// ============================================================================
// Wire up controls
// ============================================================================

// Tool buttons
document.querySelectorAll<HTMLButtonElement>(".tool-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    setActiveTool((btn.dataset.tool as EditorTool) ?? "none");
  });
});

// Map info
document.getElementById("ed-name")!.addEventListener("input", (e) => {
  state.meta.name = (e.target as HTMLInputElement).value;
});
document.getElementById("ed-label")!.addEventListener("input", (e) => {
  state.meta.label = (e.target as HTMLInputElement).value;
});

// Resize
document.getElementById("ed-resize")!.addEventListener("click", () => {
  const newCols = parseInt((document.getElementById("ed-cols") as HTMLInputElement).value, 10);
  const newRows = parseInt((document.getElementById("ed-rows") as HTMLInputElement).value, 10);
  if (!newCols || !newRows || newCols < 1 || newRows < 1) return;
  resizeMap(newCols, newRows);
});

// Unit capacity
document.getElementById("ed-cap1")!.addEventListener("input", (e) => {
  const v = parseInt((e.target as HTMLInputElement).value, 10);
  if (!isNaN(v)) state.unitCapacity[1] = v;
});
document.getElementById("ed-cap2")!.addEventListener("input", (e) => {
  const v = parseInt((e.target as HTMLInputElement).value, 10);
  if (!isNaN(v)) state.unitCapacity[2] = v;
});

// Export
document.getElementById("ed-export-btn")!.addEventListener("click", exportMap);

// Import
const importFileInput = document.getElementById("ed-import-file") as HTMLInputElement;
document.getElementById("ed-import-btn")!.addEventListener("click", () => {
  importFileInput.value = "";
  importFileInput.click();
});
importFileInput.addEventListener("change", () => {
  const file = importFileInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const json = JSON.parse(ev.target?.result as string) as MapJson;
      importMap(json);
    } catch {
      alert("Failed to parse JSON file.");
    }
  };
  reader.readAsText(file);
});

// Populate unit-type select with all known types
const unitTypeSelect = document.getElementById("ed-unit-type") as HTMLSelectElement;
const knownTypes = defaultUnitTypes();
unitTypeSelect.innerHTML = "";
for (const typeId of knownTypes.keys()) {
  const opt = document.createElement("option");
  opt.value = typeId;
  opt.textContent = `${typeId} (${UNIT_LABEL[typeId] ?? typeId})`;
  unitTypeSelect.appendChild(opt);
}

// ============================================================================
// Window resize
// ============================================================================

window.addEventListener("resize", () => {
  const newSize = computeHexSize();
  if (newSize !== HEX_SIZE) {
    HEX_SIZE = newSize;
    render();
  }
});

// ============================================================================
// Initial render
// ============================================================================

syncFormFromState();
setActiveTool("none");
render();
