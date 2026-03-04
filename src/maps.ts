import {
  Game,
  GameMap,
  Unit,
  UnitId,
  UnitType,
  Player,
  PlayerType,
  Position,
  HexGrid,
  EffectType,
  TileFeature,
  Tile,
  createPosition,
  positionKey,
} from "./domain";

// ============================================================================
// Map definition types
// ============================================================================

export interface UnitPlacement {
  typeId: string;
  playerId: number;
  position: Position;
}

export interface TileFeaturePlacement {
  position: Position;
  features: TileFeature[];
  /** Required when features includes Base. */
  baseForPlayerId?: number;
}

export interface MapDefinition {
  name: string;
  grid: HexGrid;
  unitPlacements: UnitPlacement[];
  tilePlacements?: TileFeaturePlacement[];
  unitCapacity?: Record<number, number>;
}

// ============================================================================
// Standard unit types (from design doc)
// ============================================================================

export function defaultUnitTypes(): Map<string, UnitType> {
  const types = new Map<string, UnitType>();
  types.set("infantry", {
    id: "infantry",
    effectType: EffectType.Direct,
    power: 4,
    aoiMin: 0,
    aoiMax: 2,
    maxEnergy: 10,
    maxCondition: 10,
    movement: 3,
    cost: 1,
  });
  types.set("mortar", {
    id: "mortar",
    effectType: EffectType.Indirect,
    power: 10,
    aoiMin: 3,
    aoiMax: 5,
    maxEnergy: 10,
    maxCondition: 5,
    movement: 2,
    cost: 2,
  });
  types.set("scout", {
    id: "scout",
    effectType: EffectType.Direct,
    power: 6,
    aoiMin: 0,
    aoiMax: 4,
    maxEnergy: 20,
    maxCondition: 10,
    movement: 7,
    cost: 2,
  });
  types.set("convoy", {
    id: "convoy",
    effectType: EffectType.Support,
    power: 0,
    aoiMin: 0,
    aoiMax: 4,
    maxEnergy: 5,
    maxCondition: 5,
    movement: 5,
    cost: 1,
  });
  return types;
}

// ============================================================================
// Map loader
// ============================================================================

export function loadMap(name: string): MapDefinition {
  const definition = ALL_MAPS[name];
  if (!definition) throw new Error(`Unknown map: "${name}"`);
  return definition;
}

export function listMaps(): Array<{ name: string; label: string }> {
  return Object.entries(ALL_MAPS).map(([name, def]) => ({ name, label: def.label }));
}

// ============================================================================
// Game factory
// ============================================================================

export function createGameFromMap(
  definition: MapDefinition,
  unitTypes: Map<string, UnitType>
): Game {
  let nextUnitId = 1;

  const playerIds = new Set(definition.unitPlacements.map((p) => p.playerId));
  const players = new Map<number, Player>();
  playerIds.forEach((id) => {
    players.set(id, { id, type: PlayerType.Human, units: new Map<UnitId, Unit>() });
  });

  for (const placement of definition.unitPlacements) {
    const unitType = unitTypes.get(placement.typeId);
    if (!unitType) throw new Error(`Unknown unit type: "${placement.typeId}"`);
    const unitId = nextUnitId++ as unknown as UnitId;
    const unit: Unit = {
      id: unitId,
      position: placement.position,
      typeId: placement.typeId,
      playerId: placement.playerId,
      energy: unitType.maxEnergy,
      condition: unitType.maxCondition,
    };
    players.get(placement.playerId)!.units.set(unitId, unit);
  }

  const tiles = new Map<string, Tile>();
  const bases = new Map<number, Position>();
  for (const tp of definition.tilePlacements ?? []) {
    const key = positionKey(tp.position);
    tiles.set(key, { position: tp.position, features: tp.features, baseForPlayerId: tp.baseForPlayerId });
    if (tp.features.includes(TileFeature.Base) && tp.baseForPlayerId !== undefined) {
      bases.set(tp.baseForPlayerId, tp.position);
    }
  }

  const unitCapacity = definition.unitCapacity
    ? new Map(Object.entries(definition.unitCapacity).map(([k, v]) => [Number(k), v]))
    : undefined;

  const map: GameMap = { grid: definition.grid, tiles, bases, unitCapacity };
  const currentPlayerId = Array.from(playerIds).sort((a, b) => a - b)[0];
  return { map, players, currentPlayerId, turn: 1 };
}

// ============================================================================
// "test" map — 30×20 visual rectangle
//
// Flat-top hex visual rectangle: for column q, r ranges from -floor(q/2) to
// 19-floor(q/2), so every column covers the same 20 visual rows.
//
// Player 1 (left):  q=0 infantry, q=1 mortars, q=2 scouts, q=3 convoys
// Player 2 (right): q=29 infantry, q=28 mortars, q=27 scouts, q=26 convoys
// Units placed at the same visual rows (0,4,8,12,16 or 2,6,10,14,18) on each side.
// ============================================================================

function rectMapGrid(cols: number, rows: number): HexGrid {
  const positions: Position[] = [];
  for (let q = 0; q < cols; q++) {
    const rOffset = -Math.floor(q / 2);
    for (let vr = 0; vr < rows; vr++) {
      positions.push(createPosition(q, rOffset + vr));
    }
  }
  return new HexGrid(positions);
}

function placements(typeId: string, playerId: number, q: number, visualRows: number[]): UnitPlacement[] {
  const rOffset = -Math.floor(q / 2);
  return visualRows.map((vr) => ({ typeId, playerId, position: createPosition(q, rOffset + vr) }));
}

const testMap: MapDefinition = {
  name: "test",
  grid: rectMapGrid(30, 20),
  unitPlacements: [
    // Player 1 — visual rows 0,4,8,12,16 for infantry/scouts; 2,6,10,14,18 for mortars/convoys
    ...placements("infantry", 1, 0,  [0, 4, 8, 12, 16]),
    ...placements("mortar",   1, 1,  [2, 6, 10, 14, 18]),
    ...placements("scout",    1, 2,  [0, 4, 8, 12, 16]),
    ...placements("convoy",   1, 3,  [2, 6, 10, 14, 18]),
    // Player 2 — same visual rows, mirrored on the right columns
    ...placements("infantry", 2, 29, [0, 4, 8, 12, 16]),
    ...placements("mortar",   2, 28, [2, 6, 10, 14, 18]),
    ...placements("scout",    2, 27, [0, 4, 8, 12, 16]),
    ...placements("convoy",   2, 26, [2, 6, 10, 14, 18]),
  ],
  tilePlacements: [
    // P1: base at top-left corner, facility at bottom-left corner
    { position: createPosition(0, 0),    features: [TileFeature.Base],     baseForPlayerId: 1 },
    { position: createPosition(0, 19),   features: [TileFeature.Facility] },
    // P2: base at bottom-right corner, facility at top-right corner
    { position: createPosition(29, 5),   features: [TileFeature.Base],     baseForPlayerId: 2 },
    { position: createPosition(29, -14), features: [TileFeature.Facility] },
    // 5 depots along center vertical (q=14, rOffset=-7)
    { position: createPosition(14, -7),  features: [TileFeature.Depot] },
    { position: createPosition(14, -2),  features: [TileFeature.Depot] },
    { position: createPosition(14,  3),  features: [TileFeature.Depot] },
    { position: createPosition(14,  7),  features: [TileFeature.Depot] },
    { position: createPosition(14, 12),  features: [TileFeature.Depot] },
  ],
  // Unit capacity = starting load + 1 per player
  // 5 infantry(1) + 5 mortars(2) + 5 scouts(2) + 5 convoys(1) = 30 → capacity 31
  unitCapacity: { 1: 31, 2: 31 },
};

// ============================================================================
// "small" map — 10×10 visual rectangle, two players, opposing corners
//
// Player 1 (top-left):  3 infantry at q=0, mortar at q=1
// Player 2 (bottom-right): 3 infantry at q=9, mortar at q=8
// ============================================================================

const smallMap: MapDefinition = {
  name: "small",
  grid: rectMapGrid(10, 10),
  unitPlacements: [
    ...placements("infantry", 1, 0, [0, 2, 4]),
    ...placements("mortar",   1, 1, [1]),
    ...placements("infantry", 2, 9, [5, 7, 9]),
    ...placements("mortar",   2, 8, [8]),
  ],
  // Unit capacity = starting load + 1 per player
  // 3 infantry(1) + 1 mortar(2) = 5 → capacity 6
  unitCapacity: { 1: 6, 2: 6 },
};

// Export for use in tests
export { rectMapGrid, placements };

const ALL_MAPS: Record<string, MapDefinition & { label: string }> = {  test:  { ...testMap,  label: "Test (30×20)" },
  small: { ...smallMap, label: "Small (10×10)" },
};
