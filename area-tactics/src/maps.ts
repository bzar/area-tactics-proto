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

import testMapJson from "../maps/test.json" with { type: "json" };
import smallMapJson from "../maps/small.json" with { type: "json" };
import twoBasesMapJson from "../maps/two-bases.json" with { type: "json" };

// ============================================================================
// JSON map format
// ============================================================================

export interface MapJsonGrid {
  type: "rect";
  cols: number;
  rows: number;
}

export interface MapJsonUnit {
  typeId: string;
  playerId: number;
  q: number;
  r: number;
}

export interface MapJsonTile {
  q: number;
  r: number;
  features: string[];
  baseForPlayerId?: number;
}

export interface MapJson {
  meta: {
    name: string;
    label: string;
  };
  data: {
    grid: MapJsonGrid;
    unitCapacity?: Record<string, number>;
    units: MapJsonUnit[];
    tiles?: MapJsonTile[];
  };
}

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
  label: string;
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
    maxEnergy: 6,
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
    maxEnergy: 4,
    maxCondition: 5,
    movement: 2,
    cost: 2,
  });
  types.set("scout", {
    id: "scout",
    effectType: EffectType.Direct,
    power: 3,
    aoiMin: 0,
    aoiMax: 4,
    maxEnergy: 10,
    maxCondition: 6,
    movement: 7,
    cost: 2,
  });
  types.set("tank", {
    id: "tank",
    effectType: EffectType.Direct,
    power: 7,
    aoiMin: 0,
    aoiMax: 3,
    maxEnergy: 10,
    maxCondition: 15,
    movement: 5,
    cost: 3,
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
// JSON map parser
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

export function parseMapJson(json: MapJson): MapDefinition {
  const { meta, data } = json;

  const grid = rectMapGrid(data.grid.cols, data.grid.rows);

  const unitPlacements: UnitPlacement[] = data.units.map((u) => ({
    typeId: u.typeId,
    playerId: u.playerId,
    position: createPosition(u.q, u.r),
  }));

  const tilePlacements: TileFeaturePlacement[] = (data.tiles ?? []).map((t) => ({
    position: createPosition(t.q, t.r),
    features: t.features.map((f) => f as TileFeature),
    baseForPlayerId: t.baseForPlayerId,
  }));

  const unitCapacity = data.unitCapacity
    ? Object.fromEntries(Object.entries(data.unitCapacity).map(([k, v]) => [Number(k), v]))
    : undefined;

  return {
    name: meta.name,
    label: meta.label,
    grid,
    unitPlacements,
    tilePlacements,
    unitCapacity,
  };
}

// ============================================================================
// Map registry — maps are imported as JSON and bundled at build time
// ============================================================================

const ALL_MAPS: Record<string, MapDefinition> = {
  test: parseMapJson(testMapJson as MapJson),
  small: parseMapJson(smallMapJson as MapJson),
  "two-bases": parseMapJson(twoBasesMapJson as MapJson),
};

// ============================================================================
// Map loader
// ============================================================================

export function loadMap(name: string): MapDefinition {
  const definition = ALL_MAPS[name];
  if (!definition) throw new Error(`Unknown map: "${name}"`);
  return definition;
}

export function listMaps(): Array<{ name: string; label: string }> {
  return Object.entries(ALL_MAPS).map(([, def]) => ({ name: def.name, label: def.label }));
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
  const bases = new Map<number, Position[]>();
  for (const tp of definition.tilePlacements ?? []) {
    const key = positionKey(tp.position);
    tiles.set(key, {
      position: tp.position,
      features: tp.features,
      baseForPlayerId: tp.baseForPlayerId,
    });
    if (tp.features.includes(TileFeature.Base) && tp.baseForPlayerId !== undefined) {
      const existing = bases.get(tp.baseForPlayerId) ?? [];
      existing.push(tp.position);
      bases.set(tp.baseForPlayerId, existing);
    }
  }

  const unitCapacity = definition.unitCapacity
    ? new Map(Object.entries(definition.unitCapacity).map(([k, v]) => [Number(k), v]))
    : undefined;

  const map: GameMap = { grid: definition.grid, tiles, bases, unitCapacity };
  const currentPlayerId = Array.from(playerIds).sort((a, b) => a - b)[0];
  return { map, players, currentPlayerId, turn: 1 };
}
