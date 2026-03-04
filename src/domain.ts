// ============================================================================
// Game State
// ============================================================================

export enum DamageType {
  Normal = "Normal",
  Split = "Split",
  Flanked = "Flanked",
  SplitAndFlanked = "SplitAndFlanked",
}

export enum EffectType {
  Direct = "Direct",
  Indirect = "Indirect",
  Support = "Support",
}

export interface UnitType {
  id: string;
  effectType: EffectType;
  power: number;
  aoiMin: number;
  aoiMax: number;
  maxEnergy: number;
  maxCondition: number;
  movement: number;
  cost: number;
}

export type UnitId = number & { readonly __brand: "UnitId" };

export interface Unit {
  id: UnitId;
  position: Position;
  typeId: string;
  playerId: number;
  energy: number;
  condition: number;
  underConstruction?: boolean;
}

export enum PlayerType {
  Human = "Human",
  AI = "AI",
}

export interface Player {
  id: number;
  type: PlayerType;
  units: Map<UnitId, Unit>;
}

export interface Game {
  map: GameMap;
  players: Map<number, Player>;
  currentPlayerId: number;
  turn: number;
}

// ============================================================================
// Grid and Position
// ============================================================================

export interface Position {
  q: number;
  r: number;
}

export function createPosition(q: number, r: number): Position {
  return { q, r };
}

export function positionsEqual(a: Position, b: Position): boolean {
  return a.q === b.q && a.r === b.r;
}

export class HexGrid {
  private tilePositions: Position[];
  private tileSet: Set<string>;
  readonly minQ: number;
  readonly maxQ: number;
  readonly minR: number;
  readonly maxR: number;
  readonly tileCount: number;

  constructor(positions: Position[]) {
    this.tilePositions = positions;
    this.tileSet = new Set(positions.map(positionKey));
    this.tileCount = positions.length;
    let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity;
    for (const { q, r } of positions) {
      if (q < minQ) minQ = q;
      if (q > maxQ) maxQ = q;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
    }
    this.minQ = minQ === Infinity ? 0 : minQ;
    this.maxQ = maxQ === -Infinity ? 0 : maxQ;
    this.minR = minR === Infinity ? 0 : minR;
    this.maxR = maxR === -Infinity ? 0 : maxR;
  }

  static rect(width: number, height: number): HexGrid {
    const positions: Position[] = [];
    for (let q = 0; q < width; q++)
      for (let r = 0; r < height; r++)
        positions.push(createPosition(q, r));
    return new HexGrid(positions);
  }

  getTiles(): Position[] {
    return this.tilePositions;
  }

  isInBounds(pos: Position): boolean {
    if (pos.q < this.minQ || pos.q > this.maxQ || pos.r < this.minR || pos.r > this.maxR) return false;
    return this.tileSet.has(positionKey(pos));
  }

  distance(a: Position, b: Position): number {
    return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
  }

  neighbors(pos: Position): Position[] {
    const dirs = [
      { q: 1, r: 0 },
      { q: 1, r: -1 },
      { q: 0, r: -1 },
      { q: -1, r: 0 },
      { q: -1, r: 1 },
      { q: 0, r: 1 },
    ];
    return dirs
      .map((dir) => createPosition(pos.q + dir.q, pos.r + dir.r))
      .filter((p) => this.isInBounds(p));
  }

  tilesInRange(center: Position, minRange: number, maxRange: number): Position[] {
    const tiles: Position[] = [];
    const qr = center.q + center.r;
    for (let q = center.q - maxRange; q <= center.q + maxRange; q++) {
      for (let r = Math.max(center.r - maxRange, qr - q - maxRange); r <= Math.min(center.r + maxRange, qr - q + maxRange); r++) {
        const pos = createPosition(q, r);
        const dist = this.distance(center, pos);
        if (dist >= minRange && dist <= maxRange && this.isInBounds(pos)) {
          tiles.push(pos);
        }
      }
    }
    return tiles;
  }
}

export enum TileFeature {
  Base = "Base",
  Depot = "Depot",
  Facility = "Facility",
}

export interface Tile {
  position: Position;
  features: TileFeature[];
  /** For Base tiles, which player this base belongs to. */
  baseForPlayerId?: number;
}

export function positionKey(pos: Position): string {
  return `${pos.q},${pos.r}`;
}

export interface GameMap {
  grid: HexGrid;
  tiles: Map<string, Tile>;
  /** Quick lookup: playerId → position of that player's base tile. */
  bases: Map<number, Position>;
  /** Per-player unit capacity. Optional; absent means unlimited. */
  unitCapacity?: Map<number, number>;
}


// ============================================================================
// Influence
// ============================================================================

export interface Influence {
  influencerId: UnitId;
  influenceeId: UnitId;
}

export class InfluenceMap {
  private influencers: Map<UnitId, Set<UnitId>> = new Map();
  private influencees: Map<UnitId, Set<UnitId>> = new Map();

  addInfluence(influence: Influence): void {
    const { influencerId, influenceeId } = influence;

    if (!this.influencers.has(influencerId)) {
      this.influencers.set(influencerId, new Set());
    }
    this.influencers.get(influencerId)!.add(influenceeId);

    if (!this.influencees.has(influenceeId)) {
      this.influencees.set(influenceeId, new Set());
    }
    this.influencees.get(influenceeId)!.add(influencerId);
  }

  removeInfluence(influence: Influence): void {
    const { influencerId, influenceeId } = influence;

    this.influencers.get(influencerId)?.delete(influenceeId);
    this.influencees.get(influenceeId)?.delete(influencerId);
  }

  clear(): void {
    this.influencers.clear();
    this.influencees.clear();
  }

  getUnitsInfluencedBy(unitId: UnitId): Set<UnitId> {
    return this.influencers.get(unitId) || new Set();
  }

  getUnitsInfluencing(unitId: UnitId): Set<UnitId> {
    return this.influencees.get(unitId) || new Set();
  }

  getAllInfluences(): Influence[] {
    const influences: Influence[] = [];
    this.influencers.forEach((influencees, influencerId) => {
      influencees.forEach((influenceeId) => {
        influences.push({ influencerId, influenceeId });
      });
    });
    return influences;
  }
}

// ============================================================================
// Claims
// ============================================================================

export enum ClaimType {
  Direct = "Direct",
  Indirect = "Indirect",
}

export interface Claim {
  playerId: number;
  claimType: ClaimType;
}

/**
 * positionKey → one Claim per player that claims the tile.
 * A tile is Contested when it has more than one entry.
 */
export type ClaimMap = Map<string, Claim[]>;
