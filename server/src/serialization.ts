import { Game, GameMap, Player, Unit, UnitId, Position, PlayerType, HexGrid, Tile } from "area-tactics";

interface SerializedPlayer {
  id: number;
  type: PlayerType;
  eliminated?: boolean;
  units: [number, Unit][];
}

interface SerializedGame {
  gridTiles: Position[];
  mapTiles: [string, Tile][];
  mapBases: [number, Position[]][];
  unitCapacity?: [number, number][];
  players: [number, SerializedPlayer][];
  currentPlayerId: number;
  turn: number;
}

interface PersistedState {
  game: SerializedGame;
  turnStartPositions: [number, Position][];
}

export function serializeState(game: Game, turnStartPositions: Map<UnitId, Position>): string {
  const s: PersistedState = {
    game: {
      gridTiles: game.map.grid.getTiles(),
      mapTiles: Array.from(game.map.tiles.entries()),
      mapBases: Array.from(game.map.bases.entries()),
      unitCapacity: game.map.unitCapacity
        ? Array.from(game.map.unitCapacity.entries())
        : undefined,
      players: Array.from(game.players.entries()).map(([id, player]) => [
        id,
        {
          id: player.id,
          type: player.type,
          eliminated: player.eliminated,
          units: Array.from(player.units.entries()).map(([uid, unit]) => [uid as number, unit]),
        },
      ]),
      currentPlayerId: game.currentPlayerId,
      turn: game.turn,
    },
    turnStartPositions: Array.from(turnStartPositions.entries()).map(([id, pos]) => [
      id as number,
      pos,
    ]),
  };
  return JSON.stringify(s);
}

export function deserializeState(json: string): {
  game: Game;
  turnStartPositions: Map<UnitId, Position>;
} {
  const { game: s, turnStartPositions: tspArr }: PersistedState = JSON.parse(json);

  const grid = new HexGrid(s.gridTiles);
  const tiles = new Map<string, Tile>(s.mapTiles);
  const bases = new Map<number, Position[]>(s.mapBases);
  const unitCapacity = s.unitCapacity ? new Map<number, number>(s.unitCapacity) : undefined;
  const gameMap: GameMap = { grid, tiles, bases, unitCapacity };

  const players = new Map<number, Player>(
    s.players.map(([id, p]) => [
      id,
      {
        id: p.id,
        type: p.type as PlayerType,
        eliminated: p.eliminated,
        units: new Map<UnitId, Unit>(p.units.map(([uid, unit]) => [uid as UnitId, unit])),
      },
    ])
  );

  const game: Game = {
    map: gameMap,
    players,
    currentPlayerId: s.currentPlayerId,
    turn: s.turn,
  };

  const turnStartPositions = new Map<UnitId, Position>(
    tspArr.map(([id, pos]) => [id as UnitId, pos])
  );

  return { game, turnStartPositions };
}
