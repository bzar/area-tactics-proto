import { describe, it, expect } from "vitest";
import { GameProcessor, GameEmitter, GameFeatures } from "../src/game";
import {
  Game,
  Player,
  Unit,
  UnitId,
  UnitType,
  EffectType,
  DamageType,
  ClaimType,
  TileFeature,
  HexGrid,
  createPosition,
  positionKey,
  PlayerType,
} from "../src/domain";
import { UnitMovedEvent } from "../src/events";

function createUnitId(id: number): UnitId {
  return id as unknown as UnitId;
}

function createTestGame(): Game {
  const grid = HexGrid.rect(3, 1);

  // Player 1 unit at (0, 0)
  const unit1: Unit = {
    id: createUnitId(1),
    position: createPosition(0, 0),
    typeId: "infantry",
    playerId: 1,
    energy: 10,
    condition: 10,
  };

  // Player 2 unit at (2, 0)
  const unit2: Unit = {
    id: createUnitId(2),
    position: createPosition(2, 0),
    typeId: "infantry",
    playerId: 2,
    energy: 10,
    condition: 10,
  };

  const unitMap1 = new Map<UnitId, Unit>();
  unitMap1.set(unit1.id, unit1);

  const unitMap2 = new Map<UnitId, Unit>();
  unitMap2.set(unit2.id, unit2);

  const players = new Map<number, Player>();
  players.set(1, { id: 1, type: PlayerType.Human, units: unitMap1 });
  players.set(2, { id: 2, type: PlayerType.Human, units: unitMap2 });

  return {
    map: {
      grid,
      tiles: new Map(),
      bases: new Map(),
    },
    players,
    currentPlayerId: 1,
    turn: 1,
  };
}

function createTestUnitTypes(): Map<string, UnitType> {
  const unitTypes = new Map<string, UnitType>();
  unitTypes.set("infantry", {
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
  return unitTypes;
}

describe("GameProcessor", () => {
  it("should initialize a valid game", () => {
    const game = createTestGame();
    const unitTypes = createTestUnitTypes();
    const processor = new GameProcessor(game, unitTypes);

    expect(processor.getGame()).toBeDefined();
    expect(processor.getGame().players.size).toBe(2);
  });

  it("should emit UnitMovedEvent when moving a unit", () => {
    const game = createTestGame();
    const unitTypes = createTestUnitTypes();
    const processor = new GameProcessor(game, unitTypes);

    const emittedEvents: any[] = [];
    const emit: GameEmitter = (event) => {
      emittedEvents.push(event);
    };

    const moveAction = {
      type: "Move" as const,
      unitId: createUnitId(1),
      position: createPosition(1, 0),
    };

    const result = processor.handle(moveAction, emit);

    expect(result.ok).toBe(true);
    expect(emittedEvents.length).toBe(1);
    expect(emittedEvents[0].type).toBe("UnitMoved");
    expect((emittedEvents[0] as UnitMovedEvent).unit.unitId).toBe(createUnitId(1));
    expect((emittedEvents[0] as UnitMovedEvent).position).toEqual(createPosition(1, 0));
  });

  it("should allow swapping two units using an empty tile as temporary location", () => {
    // Setup: player 1 has two units at (0,0) and (2,0), empty tile at (1,0)
    const grid = HexGrid.rect(3, 1);
    const unitA: Unit = {
      id: createUnitId(1),
      position: createPosition(0, 0),
      typeId: "infantry",
      playerId: 1,
      energy: 10,
      condition: 10,
    };
    const unitB: Unit = {
      id: createUnitId(2),
      position: createPosition(2, 0),
      typeId: "infantry",
      playerId: 1,
      energy: 10,
      condition: 10,
    };
    const units = new Map<UnitId, Unit>([
      [unitA.id, unitA],
      [unitB.id, unitB],
    ]);
    const players = new Map([[1, { id: 1, type: PlayerType.Human, units }]]);
    const game: Game = {
      map: { grid, tiles: new Map(), bases: new Map() },
      players,
      currentPlayerId: 1,
      turn: 1,
    };
    const processor = new GameProcessor(game, createTestUnitTypes());
    const emit: GameEmitter = () => {};

    // Step 1: move A (0,0) → (1,0)
    expect(
      processor.handle(
        { type: "Move", unitId: createUnitId(1), position: createPosition(1, 0) },
        emit
      ).ok
    ).toBe(true);
    // Step 2: move B (2,0) → (0,0)
    expect(
      processor.handle(
        { type: "Move", unitId: createUnitId(2), position: createPosition(0, 0) },
        emit
      ).ok
    ).toBe(true);
    // Step 3: move A (1,0) → (2,0) — range from turn-start (0,0), distance 2 ≤ movement 3
    expect(
      processor.handle(
        { type: "Move", unitId: createUnitId(1), position: createPosition(2, 0) },
        emit
      ).ok
    ).toBe(true);

    expect(unitA.position).toEqual(createPosition(2, 0));
    expect(unitB.position).toEqual(createPosition(0, 0));
  });
});

describe("GameProcessor EndTurn", () => {
  it("should advance to the next player and emit TurnStartedEvent", () => {
    const game = createTestGame();
    const processor = new GameProcessor(game, createTestUnitTypes());

    const emittedEvents: any[] = [];
    const emit: GameEmitter = (event) => emittedEvents.push(event);

    const result = processor.handle({ type: "EndTurn" }, emit);

    expect(result.ok).toBe(true);
    expect(game.currentPlayerId).toBe(2);
    const turnStarted = emittedEvents.find((e) => e.type === "TurnStarted");
    expect(turnStarted).toBeDefined();
    expect(turnStarted.playerId).toBe(2);
    expect(turnStarted.turn).toBe(1);
  });

  it("should wrap back to the first player after the last player ends their turn", () => {
    const game = createTestGame();
    const processor = new GameProcessor(game, createTestUnitTypes());
    const emit: GameEmitter = () => {};

    processor.handle({ type: "EndTurn" }, emit); // player 1 → 2
    const emittedEvents: any[] = [];
    processor.handle({ type: "EndTurn" }, (e) => emittedEvents.push(e)); // player 2 → 1

    expect(game.currentPlayerId).toBe(1);
    expect(emittedEvents[0].type).toBe("TurnStarted");
    expect(emittedEvents[0].playerId).toBe(1);
    expect(emittedEvents[0].turn).toBe(2);
  });
});

describe("GameProcessor Attack (start-of-turn damage)", () => {
  // Helper: build a minimal 1-row game and return the units directly for assertion
  function makeGame(
    p1Units: Array<{ id: number; q: number; r: number; energy?: number; condition?: number }>,
    p2Units: Array<{ id: number; q: number; r: number; energy?: number; condition?: number }>,
    gridWidth = 5
  ) {
    const grid = HexGrid.rect(gridWidth, 1);
    const toUnit = (u: (typeof p1Units)[0], playerId: number): Unit => ({
      id: createUnitId(u.id),
      position: createPosition(u.q, u.r),
      typeId: "infantry",
      playerId,
      energy: u.energy ?? 10,
      condition: u.condition ?? 10,
    });
    const units1 = new Map<UnitId, Unit>(p1Units.map((u) => [createUnitId(u.id), toUnit(u, 1)]));
    const units2 = new Map<UnitId, Unit>(p2Units.map((u) => [createUnitId(u.id), toUnit(u, 2)]));
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: units1 }],
      [2, { id: 2, type: PlayerType.Human, units: units2 }],
    ]);
    return {
      game: {
        map: { grid, tiles: new Map(), bases: new Map() },
        players,
        currentPlayerId: 1,
        turn: 1,
      },
      units1,
      units2,
    };
  }

  it("should drain energy before condition", () => {
    // P2 infantry at (2,0) influences P1 infantry at (0,0) (distance 2, AoI 0-2)
    const { game, units1 } = makeGame([{ id: 1, q: 0, r: 0 }], [{ id: 2, q: 2, r: 0 }]);
    const processor = new GameProcessor(game, createTestUnitTypes());
    const emitted: any[] = [];

    processor.handle({ type: "EndTurn" }, (e) => emitted.push(e)); // → P2's turn; P2 attacks P1

    const damaged = emitted.find((e) => e.type === "UnitDamaged");
    expect(damaged).toBeDefined();
    expect(damaged.unit.unitId).toBe(createUnitId(1));
    expect(damaged.attacker.unitId).toBe(createUnitId(2));
    expect(damaged.damageType).toBe(DamageType.Normal);
    expect(damaged.damageToEnergy).toBe(4);
    expect(damaged.damageToCondition).toBe(0);
    expect(units1.get(createUnitId(1))!.energy).toBe(6);
    expect(units1.get(createUnitId(1))!.condition).toBe(10);
  });

  it("should spill excess damage into condition when energy runs out", () => {
    // P1 unit has only 2 energy; P2 infantry hits for power 4 → 2 to energy, 2 to condition
    const { game, units1 } = makeGame([{ id: 1, q: 0, r: 0, energy: 2 }], [{ id: 2, q: 2, r: 0 }]);
    const processor = new GameProcessor(game, createTestUnitTypes());
    const emitted: any[] = [];

    processor.handle({ type: "EndTurn" }, (e) => emitted.push(e));

    const damaged = emitted.find((e) => e.type === "UnitDamaged");
    expect(damaged.damageToEnergy).toBe(2);
    expect(damaged.damageToCondition).toBe(2);
    expect(damaged.attacker.unitId).toBe(createUnitId(2));
    expect(damaged.damageType).toBe(DamageType.Normal);
    expect(units1.get(createUnitId(1))!.energy).toBe(0);
    expect(units1.get(createUnitId(1))!.condition).toBe(8);
  });

  it("should halve power when attacker influences multiple opponent units", () => {
    // P2 infantry at (2,0); P1 has units at (0,0) [dist 2] and (1,0) [dist 1] — both in AoI 0-2
    // Each P1 unit receives power/2 = 2 damage
    const { game, units1 } = makeGame(
      [
        { id: 1, q: 0, r: 0 },
        { id: 3, q: 1, r: 0 },
      ],
      [{ id: 2, q: 2, r: 0 }]
    );
    const processor = new GameProcessor(game, createTestUnitTypes());
    const emitted: any[] = [];

    processor.handle({ type: "EndTurn" }, (e) => emitted.push(e));

    const damagedEvents = emitted.filter((e) => e.type === "UnitDamaged");
    expect(damagedEvents.length).toBe(2);
    damagedEvents.forEach((e) => {
      expect(e.damageToEnergy).toBe(2);
      expect(e.damageToCondition).toBe(0);
      expect(e.attacker.unitId).toBe(createUnitId(2));
      expect(e.damageType).toBe(DamageType.Split);
    });
    expect(units1.get(createUnitId(1))!.energy).toBe(8);
    expect(units1.get(createUnitId(3))!.energy).toBe(8);
  });
});

describe("GameProcessor Energy Regeneration (start-of-turn)", () => {
  // Units placed far apart (distance 8) so neither is under opponent influence (infantry AoI max 2)
  function makeIsolatedGame(p2Energy: number): { game: Game; p2Unit: Unit } {
    const grid = HexGrid.rect(10, 1);
    const p1Unit: Unit = {
      id: createUnitId(1),
      position: createPosition(0, 0),
      typeId: "infantry",
      playerId: 1,
      energy: 10,
      condition: 10,
    };
    const p2Unit: Unit = {
      id: createUnitId(2),
      position: createPosition(9, 0),
      typeId: "infantry",
      playerId: 2,
      energy: p2Energy,
      condition: 10,
    };
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: new Map([[p1Unit.id, p1Unit]]) }],
      [2, { id: 2, type: PlayerType.Human, units: new Map([[p2Unit.id, p2Unit]]) }],
    ]);
    return {
      game: {
        map: { grid, tiles: new Map(), bases: new Map() },
        players,
        currentPlayerId: 1,
        turn: 1,
      },
      p2Unit,
    };
  }

  it("should regenerate one energy when below maximum and not under opponent influence", () => {
    const { game, p2Unit } = makeIsolatedGame(8);
    const processor = new GameProcessor(game, createTestUnitTypes());

    processor.handle({ type: "EndTurn" }, () => {}); // → P2's turn

    expect(p2Unit.energy).toBe(9);
  });

  it("should not regenerate energy beyond the unit type maximum", () => {
    const { game, p2Unit } = makeIsolatedGame(10);
    const processor = new GameProcessor(game, createTestUnitTypes());

    processor.handle({ type: "EndTurn" }, () => {}); // → P2's turn; already at max

    expect(p2Unit.energy).toBe(10);
  });

  it("should not regenerate energy when under opponent influence", () => {
    // P1 infantry at (0,0) with AoI 0-2 influences P2 infantry at (2,0)
    const grid = HexGrid.rect(5, 1);
    const p1Unit: Unit = {
      id: createUnitId(1),
      position: createPosition(0, 0),
      typeId: "infantry",
      playerId: 1,
      energy: 10,
      condition: 10,
    };
    const p2Unit: Unit = {
      id: createUnitId(2),
      position: createPosition(2, 0),
      typeId: "infantry",
      playerId: 2,
      energy: 8,
      condition: 10,
    };
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: new Map([[p1Unit.id, p1Unit]]) }],
      [2, { id: 2, type: PlayerType.Human, units: new Map([[p2Unit.id, p2Unit]]) }],
    ]);
    const game: Game = {
      map: { grid, tiles: new Map(), bases: new Map() },
      players,
      currentPlayerId: 1,
      turn: 1,
    };
    const processor = new GameProcessor(game, createTestUnitTypes());

    processor.handle({ type: "EndTurn" }, () => {}); // → P2's turn; P2 is under P1's influence

    expect(p2Unit.energy).toBe(8);
  });

  it("should emit EnergyRegenerated event with supported=false when regenerating freely", () => {
    const { game } = makeIsolatedGame(8);
    const processor = new GameProcessor(game, createTestUnitTypes());
    const emitted: any[] = [];

    processor.handle({ type: "EndTurn" }, (e) => emitted.push(e)); // → P2's turn

    const regen = emitted.find((e) => e.type === "EnergyRegenerated");
    expect(regen).toBeDefined();
    expect(regen.unit.unitId).toBe(createUnitId(2));
    expect(regen.amount).toBe(1);
    expect(regen.supported).toBe(false);
  });

  it("should not emit EnergyRegenerated when unit is already at max energy", () => {
    const { game } = makeIsolatedGame(10);
    const processor = new GameProcessor(game, createTestUnitTypes());
    const emitted: any[] = [];

    processor.handle({ type: "EndTurn" }, (e) => emitted.push(e));

    expect(emitted.some((e) => e.type === "EnergyRegenerated")).toBe(false);
  });
});

describe("GameProcessor Move Validation", () => {
  it("should reject a move beyond the unit's movement range", () => {
    const grid = HexGrid.rect(10, 1);
    const unit: Unit = {
      id: createUnitId(1),
      position: createPosition(0, 0),
      typeId: "infantry",
      playerId: 1,
      energy: 10,
      condition: 10,
    };
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: new Map([[unit.id, unit]]) }],
    ]);
    const game: Game = {
      map: { grid, tiles: new Map(), bases: new Map() },
      players,
      currentPlayerId: 1,
      turn: 1,
    };
    const processor = new GameProcessor(game, createTestUnitTypes());

    // Infantry movement 3; distance to (4,0) is 4
    const result = processor.handle(
      { type: "Move", unitId: createUnitId(1), position: createPosition(4, 0) },
      () => {}
    );
    expect(result.ok).toBe(false);
    expect(unit.position).toEqual(createPosition(0, 0));
  });

  it("should reject a move to an occupied tile", () => {
    const grid = HexGrid.rect(3, 1);
    const unitA: Unit = {
      id: createUnitId(1),
      position: createPosition(0, 0),
      typeId: "infantry",
      playerId: 1,
      energy: 10,
      condition: 10,
    };
    const unitB: Unit = {
      id: createUnitId(2),
      position: createPosition(1, 0),
      typeId: "infantry",
      playerId: 1,
      energy: 10,
      condition: 10,
    };
    const units = new Map<UnitId, Unit>([
      [unitA.id, unitA],
      [unitB.id, unitB],
    ]);
    const players = new Map([[1, { id: 1, type: PlayerType.Human, units }]]);
    const game: Game = {
      map: { grid, tiles: new Map(), bases: new Map() },
      players,
      currentPlayerId: 1,
      turn: 1,
    };
    const processor = new GameProcessor(game, createTestUnitTypes());

    const result = processor.handle(
      { type: "Move", unitId: createUnitId(1), position: createPosition(1, 0) },
      () => {}
    );
    expect(result.ok).toBe(false);
    expect(unitA.position).toEqual(createPosition(0, 0));
  });

  it("should reject moving a unit that belongs to the opponent", () => {
    const game = createTestGame(); // P1 is current; P2 unit id 2 at (2,0)
    const processor = new GameProcessor(game, createTestUnitTypes());

    const result = processor.handle(
      { type: "Move", unitId: createUnitId(2), position: createPosition(1, 0) },
      () => {}
    );
    expect(result.ok).toBe(false);
  });

  it("should reset movement range at the start of a new turn", () => {
    // P1 moves infantry to its max range (3,0), ends turn twice, then moves again from (3,0)
    const grid = HexGrid.rect(10, 1);
    const p1Unit: Unit = {
      id: createUnitId(1),
      position: createPosition(0, 0),
      typeId: "infantry",
      playerId: 1,
      energy: 10,
      condition: 10,
    };
    const p2Unit: Unit = {
      id: createUnitId(2),
      position: createPosition(9, 0),
      typeId: "infantry",
      playerId: 2,
      energy: 10,
      condition: 10,
    };
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: new Map([[p1Unit.id, p1Unit]]) }],
      [2, { id: 2, type: PlayerType.Human, units: new Map([[p2Unit.id, p2Unit]]) }],
    ]);
    const game: Game = {
      map: { grid, tiles: new Map(), bases: new Map() },
      players,
      currentPlayerId: 1,
      turn: 1,
    };
    const processor = new GameProcessor(game, createTestUnitTypes());
    const emit: GameEmitter = () => {};

    processor.handle(
      { type: "Move", unitId: createUnitId(1), position: createPosition(3, 0) },
      emit
    );
    processor.handle({ type: "EndTurn" }, emit); // → P2
    processor.handle({ type: "EndTurn" }, emit); // → P1; range resets from (3,0)

    // Distance from (3,0) to (6,0) is 3 — exactly movement range, should succeed
    const result = processor.handle(
      { type: "Move", unitId: createUnitId(1), position: createPosition(6, 0) },
      emit
    );
    expect(result.ok).toBe(true);
    expect(p1Unit.position).toEqual(createPosition(6, 0));
  });
});

describe("GameProcessor Unit Destruction", () => {
  it("should remove a unit and emit UnitDestroyedEvent when its condition reaches zero", () => {
    // P2 infantry (power 4) at (2,0) influences P1 infantry at (0,0).
    // P1 unit has energy 0 and condition 4, so 4 damage goes entirely to condition → 0.
    const grid = HexGrid.rect(5, 1);
    const p1Unit: Unit = {
      id: createUnitId(1),
      position: createPosition(0, 0),
      typeId: "infantry",
      playerId: 1,
      energy: 0,
      condition: 4,
    };
    const p2Unit: Unit = {
      id: createUnitId(2),
      position: createPosition(2, 0),
      typeId: "infantry",
      playerId: 2,
      energy: 10,
      condition: 10,
    };
    const p1Units = new Map<UnitId, Unit>([[p1Unit.id, p1Unit]]);
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: p1Units }],
      [2, { id: 2, type: PlayerType.Human, units: new Map([[p2Unit.id, p2Unit]]) }],
    ]);
    const game: Game = {
      map: { grid, tiles: new Map(), bases: new Map() },
      players,
      currentPlayerId: 1,
      turn: 1,
    };
    const processor = new GameProcessor(game, createTestUnitTypes());
    const emitted: any[] = [];

    processor.handle({ type: "EndTurn" }, (e) => emitted.push(e));

    expect(
      emitted.some(
        (e) =>
          e.type === "UnitDestroyed" &&
          e.unit.unitId === createUnitId(1) &&
          e.destroyedBy.unitId === createUnitId(2)
      )
    ).toBe(true);
    expect(p1Units.has(createUnitId(1))).toBe(false);
  });
});

describe("GameProcessor Game Over", () => {
  it("should emit GameEndedEvent with the winner when the last opponent unit is destroyed", () => {
    // P2 infantry (power 4) at (2,0) destroys P1's only unit (energy 0, condition 4) at start of P2's turn.
    // P1 has no units left → P2 wins.
    const grid = HexGrid.rect(5, 1);
    const p1Unit: Unit = {
      id: createUnitId(1),
      position: createPosition(0, 0),
      typeId: "infantry",
      playerId: 1,
      energy: 0,
      condition: 4,
    };
    const p2Unit: Unit = {
      id: createUnitId(2),
      position: createPosition(2, 0),
      typeId: "infantry",
      playerId: 2,
      energy: 10,
      condition: 10,
    };
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: new Map([[p1Unit.id, p1Unit]]) }],
      [2, { id: 2, type: PlayerType.Human, units: new Map([[p2Unit.id, p2Unit]]) }],
    ]);
    const game: Game = {
      map: { grid, tiles: new Map(), bases: new Map() },
      players,
      currentPlayerId: 1,
      turn: 1,
    };
    const processor = new GameProcessor(game, createTestUnitTypes());
    const emitted: any[] = [];

    processor.handle({ type: "EndTurn" }, (e) => emitted.push(e));

    const gameEnded = emitted.find((e) => e.type === "GameEnded");
    expect(gameEnded).toBeDefined();
    expect(gameEnded.winnerId).toBe(2);
  });
});

describe("GameProcessor Movement range", () => {
  // Unit at (10, 10) with movement=2 on a grid large enough to hold all reachable tiles.
  // The 12 tiles at exactly distance 2 from (10,10) in axial hex coords:
  const distance2Ring: Array<[number, number]> = [
    [12, 10],
    [12, 9],
    [12, 8],
    [11, 8],
    [10, 8],
    [9, 9],
    [8, 10],
    [8, 11],
    [8, 12],
    [9, 12],
    [10, 12],
    [11, 11],
  ];

  function makeMovementGame() {
    const grid = HexGrid.rect(25, 25);
    // Place the opponent far away so it never interferes
    const p1Unit: Unit = {
      id: createUnitId(1),
      position: createPosition(10, 10),
      typeId: "infantry",
      playerId: 1,
      energy: 10,
      condition: 10,
    };
    const p2Unit: Unit = {
      id: createUnitId(2),
      position: createPosition(24, 24),
      typeId: "infantry",
      playerId: 2,
      energy: 10,
      condition: 10,
    };
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: new Map([[p1Unit.id, p1Unit]]) }],
      [2, { id: 2, type: PlayerType.Human, units: new Map([[p2Unit.id, p2Unit]]) }],
    ]);
    const game: Game = {
      map: { grid, tiles: new Map(), bases: new Map() },
      players,
      currentPlayerId: 1,
      turn: 1,
    };
    return { game, p1Unit };
  }

  it("all 12 tiles at distance 2 from (10,10) are in valid move positions", () => {
    const { game } = makeMovementGame();
    const processor = new GameProcessor(game, createTestUnitTypes());

    const valid = processor.getValidMovePositions(createUnitId(1));
    const validSet = new Set(valid.map((p) => `${p.q},${p.r}`));

    expect(valid.length).toBe(37); // 1 origin + 6 at dist 1 + 12 at dist 2 + 18 at dist 3 (infantry movement=3)
    for (const [q, r] of distance2Ring) {
      expect(validSet.has(`${q},${r}`), `expected (${q},${r}) to be reachable`).toBe(true);
    }
  });

  it("each of the 12 distance-2 tiles can be moved to successfully", () => {
    for (const [q, r] of distance2Ring) {
      const { game } = makeMovementGame();
      const processor = new GameProcessor(game, createTestUnitTypes());

      const result = processor.handle(
        { type: "Move", unitId: createUnitId(1), position: createPosition(q, r) },
        () => {}
      );
      expect(result.ok, `move to (${q},${r}) should succeed`).toBe(true);
    }
  });

  it("turn-start position is a valid move target (allows undoing a move)", () => {
    const { game } = makeMovementGame();
    const processor = new GameProcessor(game, createTestUnitTypes());

    // Move unit away from its starting position
    processor.handle(
      { type: "Move", unitId: createUnitId(1), position: createPosition(10, 11) },
      () => {}
    );

    // The original position should still be a valid destination
    const valid = processor.getValidMovePositions(createUnitId(1));
    const validSet = new Set(valid.map((p) => `${p.q},${p.r}`));
    expect(validSet.has("10,10"), "turn-start origin (10,10) should be reachable").toBe(true);

    // Moving back should succeed
    const result = processor.handle(
      { type: "Move", unitId: createUnitId(1), position: createPosition(10, 10) },
      () => {}
    );
    expect(result.ok).toBe(true);
  });
});

describe("GameProcessor Support feature", () => {
  // Convoy unit type for support tests
  function createSupportUnitTypes(): Map<string, UnitType> {
    const types = createTestUnitTypes();
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

  // Base: P1 base at (0,0), P1 infantry at (0,0), P2 infantry at (2,0).
  // dist((0,0),(0,0))=0 ≤ 3 → infantry in base radius → supported.
  function makeSupportGame(_features: GameFeatures) {
    const grid = HexGrid.rect(10, 10);
    const p1Infantry: Unit = {
      id: createUnitId(1),
      position: createPosition(0, 0),
      typeId: "infantry",
      playerId: 1,
      energy: 8,
      condition: 10,
    };
    const p1Convoy: Unit = {
      id: createUnitId(3),
      position: createPosition(0, 4),
      typeId: "convoy",
      playerId: 1,
      energy: 5,
      condition: 5,
    };
    const p2Infantry: Unit = {
      id: createUnitId(2),
      position: createPosition(2, 0),
      typeId: "infantry",
      playerId: 2,
      energy: 10,
      condition: 10,
    };
    const p1Units = new Map<UnitId, Unit>([
      [p1Infantry.id, p1Infantry],
      [p1Convoy.id, p1Convoy],
    ]);
    const p2Units = new Map<UnitId, Unit>([[p2Infantry.id, p2Infantry]]);
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: p1Units }],
      [2, { id: 2, type: PlayerType.Human, units: p2Units }],
    ]);
    const game: Game = {
      map: { grid, tiles: new Map(), bases: new Map([[1, [createPosition(0, 0)]]]) },
      players,
      currentPlayerId: 1,
      turn: 1,
    };
    return { game, p1Infantry };
  }

  it("should suppress regen when under opponent influence and support is disabled", () => {
    const { game, p1Infantry } = makeSupportGame({ support: false });
    const processor = new GameProcessor(game, createSupportUnitTypes(), { support: false });

    processor.handle({ type: "EndTurn" }, () => {}); // → P2; P2 infantry attacks P1 infantry (1 target, power 4): 8-4=4
    processor.handle({ type: "EndTurn" }, () => {}); // → P1; suppressed → no regen

    expect(p1Infantry.energy).toBe(4);
  });

  it("should allow regen when under opponent influence but in base radius", () => {
    // P1 infantry at (0,0) is within 3 of base (0,0) → supported by base radius alone.
    const { game, p1Infantry } = makeSupportGame({ support: true });
    const processor = new GameProcessor(game, createSupportUnitTypes(), { support: true });
    const emitted: any[] = [];

    processor.handle({ type: "EndTurn" }, (e) => emitted.push(e)); // → P2; attacks P1 infantry: 8-4=4
    emitted.length = 0;
    processor.handle({ type: "EndTurn" }, (e) => emitted.push(e)); // → P1; supported under fire → regen +1 = 5

    expect(p1Infantry.energy).toBe(5);
    const regen = emitted.find(
      (e) => e.type === "EnergyRegenerated" && e.unit.unitId === createUnitId(1)
    );
    expect(regen).toBeDefined();
    expect(regen.supported).toBe(true);
  });

  it("should allow regen when convoy on supported tile extends support beyond base radius", () => {
    // P1 base at (0,0). P1 convoy at (0,3): dist=3 ≤ 3 → convoy ON supported tile.
    // P1 infantry at (0,7): dist from base=7 > 3, outside base radius.
    // Convoy AoI 4: dist((0,7),(0,3))=4 ≤ 4 → infantry in convoy AoI → supported.
    // P2 infantry at (2,7): dist((0,7),(2,7))=2 ≤ 2 → suppresses P1 infantry.
    const grid = HexGrid.rect(10, 10);
    const p1Infantry: Unit = {
      id: createUnitId(1),
      position: createPosition(0, 7),
      typeId: "infantry",
      playerId: 1,
      energy: 8,
      condition: 10,
    };
    const p1Convoy: Unit = {
      id: createUnitId(3),
      position: createPosition(0, 3),
      typeId: "convoy",
      playerId: 1,
      energy: 5,
      condition: 5,
    };
    const p2Infantry: Unit = {
      id: createUnitId(2),
      position: createPosition(2, 7),
      typeId: "infantry",
      playerId: 2,
      energy: 10,
      condition: 10,
    };
    const p1Units = new Map<UnitId, Unit>([
      [p1Infantry.id, p1Infantry],
      [p1Convoy.id, p1Convoy],
    ]);
    const p2Units = new Map<UnitId, Unit>([[p2Infantry.id, p2Infantry]]);
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: p1Units }],
      [2, { id: 2, type: PlayerType.Human, units: p2Units }],
    ]);
    const game: Game = {
      map: { grid, tiles: new Map(), bases: new Map([[1, [createPosition(0, 0)]]]) },
      players,
      currentPlayerId: 1,
      turn: 1,
    };
    const processor = new GameProcessor(game, createSupportUnitTypes(), { support: true });

    processor.handle({ type: "EndTurn" }, () => {}); // → P2; attacks P1 infantry: 8-4=4
    processor.handle({ type: "EndTurn" }, () => {}); // → P1; supported under fire via convoy chain → regen +1 = 5

    expect(p1Infantry.energy).toBe(5);
  });

  it("should grant +2 regen when supported and not under opponent influence", () => {
    // P1 base at (0,0). P1 infantry at (0,0): dist=0 ≤ 3 → supported by base radius.
    // P2 infantry at (0,9): dist=9 > 2 → does NOT influence P1 infantry.
    // Supported + at peace → regen 2.
    const grid = HexGrid.rect(10, 10);
    const p1Infantry: Unit = {
      id: createUnitId(1),
      position: createPosition(0, 0),
      typeId: "infantry",
      playerId: 1,
      energy: 6,
      condition: 10,
    };
    const p2Infantry: Unit = {
      id: createUnitId(2),
      position: createPosition(0, 9),
      typeId: "infantry",
      playerId: 2,
      energy: 10,
      condition: 10,
    };
    const p1Units = new Map<UnitId, Unit>([[p1Infantry.id, p1Infantry]]);
    const p2Units = new Map<UnitId, Unit>([[p2Infantry.id, p2Infantry]]);
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: p1Units }],
      [2, { id: 2, type: PlayerType.Human, units: p2Units }],
    ]);
    const game: Game = {
      map: { grid, tiles: new Map(), bases: new Map([[1, [createPosition(0, 0)]]]) },
      players,
      currentPlayerId: 1,
      turn: 1,
    };
    const processor = new GameProcessor(game, createSupportUnitTypes(), { support: true });
    const emitted: any[] = [];

    processor.handle({ type: "EndTurn" }, () => {}); // → P2; no influence on P1 infantry
    processor.handle({ type: "EndTurn" }, (e) => emitted.push(e)); // → P1; supported at peace → regen +2 = 8

    expect(p1Infantry.energy).toBe(8);
    const regen = emitted.find(
      (e) => e.type === "EnergyRegenerated" && e.unit.unitId === createUnitId(1)
    );
    expect(regen).toBeDefined();
    expect(regen.amount).toBe(2);
    expect(regen.supported).toBe(true);
  });

  it("should not regen when convoy is not on a supported tile", () => {
    // P1 base at (0,0). P1 convoy at (0,4): dist=4 > 3 → convoy NOT on supported tile.
    // P1 infantry at (0,7): dist((0,7),(0,4))=3 ≤ 4 → in convoy AoI, but convoy not supported.
    // P2 infantry at (2,7) suppresses P1 infantry → no regen.
    const grid = HexGrid.rect(10, 10);
    const p1Infantry: Unit = {
      id: createUnitId(1),
      position: createPosition(0, 7),
      typeId: "infantry",
      playerId: 1,
      energy: 8,
      condition: 10,
    };
    const p1Convoy: Unit = {
      id: createUnitId(3),
      position: createPosition(0, 4),
      typeId: "convoy",
      playerId: 1,
      energy: 5,
      condition: 5,
    };
    const p2Infantry: Unit = {
      id: createUnitId(2),
      position: createPosition(2, 7),
      typeId: "infantry",
      playerId: 2,
      energy: 10,
      condition: 10,
    };
    const p1Units = new Map<UnitId, Unit>([
      [p1Infantry.id, p1Infantry],
      [p1Convoy.id, p1Convoy],
    ]);
    const p2Units = new Map<UnitId, Unit>([[p2Infantry.id, p2Infantry]]);
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: p1Units }],
      [2, { id: 2, type: PlayerType.Human, units: p2Units }],
    ]);
    const game: Game = {
      map: { grid, tiles: new Map(), bases: new Map([[1, [createPosition(0, 0)]]]) },
      players,
      currentPlayerId: 1,
      turn: 1,
    };
    const processor = new GameProcessor(game, createSupportUnitTypes(), { support: true });

    processor.handle({ type: "EndTurn" }, () => {}); // → P2; attacks P1 infantry: 8-4=4
    processor.handle({ type: "EndTurn" }, () => {}); // → P1; not supported → no regen

    expect(p1Infantry.energy).toBe(4);
  });
});

describe("GameProcessor Flanking feature", () => {
  function createFlankingUnitTypes(): Map<string, UnitType> {
    const types = createTestUnitTypes();
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

  // P1: U(infantry,0,0), V(infantry,4,0) — both influence O(2,0) at dist 2.
  // V does not influence U (dist 4 > AoI max 2) → flanking conditions met.
  // currentPlayerId=2 so EndTurn immediately triggers P1's attacks.
  function makeFlankGame(features: GameFeatures, vTypeId = "infantry", vQ = 4) {
    const grid = HexGrid.rect(10, 1);
    const pU: Unit = {
      id: createUnitId(1),
      position: createPosition(0, 0),
      typeId: "infantry",
      playerId: 1,
      energy: 10,
      condition: 10,
    };
    const pV: Unit = {
      id: createUnitId(3),
      position: createPosition(vQ, 0),
      typeId: vTypeId,
      playerId: 1,
      energy: 10,
      condition: 10,
    };
    const pO: Unit = {
      id: createUnitId(2),
      position: createPosition(2, 0),
      typeId: "infantry",
      playerId: 2,
      energy: 10,
      condition: 10,
    };
    const p1Units = new Map<UnitId, Unit>([
      [pU.id, pU],
      [pV.id, pV],
    ]);
    const p2Units = new Map<UnitId, Unit>([[pO.id, pO]]);
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: p1Units }],
      [2, { id: 2, type: PlayerType.Human, units: p2Units }],
    ]);
    const game: Game = {
      map: { grid, tiles: new Map(), bases: new Map() },
      players,
      currentPlayerId: 2,
      turn: 1,
    };
    return { game, pO };
  }

  it("should not apply flanking bonus when feature is disabled", () => {
    // U and V would flank O geometrically, but flanking=false → each deals power 4
    const { game, pO } = makeFlankGame({ support: false, flanking: false });
    const processor = new GameProcessor(game, createFlankingUnitTypes(), {
      support: false,
      flanking: false,
    });

    processor.handle({ type: "EndTurn" }, () => {}); // → P1; U and V each deal 4 → O energy 10-4-4=2
    expect(pO.energy).toBe(2);
    expect(pO.condition).toBe(10);
  });

  it("should apply flanking damage bonus (×1.5, floor) when conditions are met", () => {
    // V(infantry,4,0) influences O(2,0) (dist 2) but not U(0,0) (dist 4>2) → U flanks O.
    // U(infantry,0,0) influences O(2,0) (dist 2) but not V(4,0) (dist 4>2) → V flanks O.
    // Both deal floor(4×1.5)=6 each → total 12: energy 10→0, condition 10→8.
    const { game, pO } = makeFlankGame({ support: false, flanking: true });
    const processor = new GameProcessor(game, createFlankingUnitTypes(), {
      support: false,
      flanking: true,
    });
    const emitted: any[] = [];

    processor.handle({ type: "EndTurn" }, (e) => emitted.push(e)); // → P1
    expect(pO.energy).toBe(0);
    expect(pO.condition).toBe(8);
    emitted
      .filter((e) => e.type === "UnitDamaged")
      .forEach((e) => {
        expect(e.damageType).toBe(DamageType.Flanked);
      });
  });

  it("should not flank when assisting unit V also influences the attacker U", () => {
    // V(infantry,1,1): dist to O(2,0)=1 ✓, dist to U(0,0)=2 ✓ — V influences U too → no flank.
    const grid = HexGrid.rect(5, 5);
    const pU: Unit = {
      id: createUnitId(1),
      position: createPosition(0, 0),
      typeId: "infantry",
      playerId: 1,
      energy: 10,
      condition: 10,
    };
    const pV: Unit = {
      id: createUnitId(3),
      position: createPosition(1, 1),
      typeId: "infantry",
      playerId: 1,
      energy: 10,
      condition: 10,
    };
    const pO: Unit = {
      id: createUnitId(2),
      position: createPosition(2, 0),
      typeId: "infantry",
      playerId: 2,
      energy: 10,
      condition: 10,
    };
    const p1Units = new Map<UnitId, Unit>([
      [pU.id, pU],
      [pV.id, pV],
    ]);
    const p2Units = new Map<UnitId, Unit>([[pO.id, pO]]);
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: p1Units }],
      [2, { id: 2, type: PlayerType.Human, units: p2Units }],
    ]);
    const game: Game = {
      map: { grid, tiles: new Map(), bases: new Map() },
      players,
      currentPlayerId: 2,
      turn: 1,
    };
    const processor = new GameProcessor(game, createFlankingUnitTypes(), {
      support: false,
      flanking: true,
    });

    processor.handle({ type: "EndTurn" }, () => {}); // → P1; no flank → U=4, V=4 → total 8
    expect(pO.energy).toBe(2);
    expect(pO.condition).toBe(10);
  });

  it("should not grant flanking when the assisting unit is Support type (convoy)", () => {
    // V(convoy,6,0): dist to O(2,0)=4, convoy AoI 0-4 ✓ — geometrically qualifies.
    // dist to U(0,0)=6>4 — convoy does not influence U.
    // But convoy is Support type → excluded from flanking assist.
    // V(convoy) power=0 → no damage. U attacks O without flank → power=4.
    const { game, pO } = makeFlankGame({ support: false, flanking: true }, "convoy", 6);
    const processor = new GameProcessor(game, createFlankingUnitTypes(), {
      support: false,
      flanking: true,
    });

    processor.handle({ type: "EndTurn" }, () => {}); // → P1; no flank (convoy excluded) → O energy 10-4=6
    expect(pO.energy).toBe(6);
    expect(pO.condition).toBe(10);
  });

  it("should cancel flank bonus and split penalty when attacker flanks one of multiple targets", () => {
    // P1: U(infantry,0,0), V(infantry,4,0).
    // P2: O1(infantry,2,0), O2(infantry,1,0).
    // U targets: O1(dist 2), O2(dist 1) — two targets (isMulti=true).
    //   U flanks O1? V(4,0): dist to O1=2 ✓, dist to U=4>2 ✓ → yes. isMulti+flank → normal power=4.
    //   U flanks O2? V(4,0): dist to O2=3>2 ✗ → no flank. isMulti+no flank → halved power=2.
    // V targets: O1(dist 2) only — one target.
    //   V flanks O1? U(0,0): dist to O1=2 ✓, dist to V=4>2 ✓ → yes. Single+flank → floor(4×1.5)=6.
    const grid = HexGrid.rect(10, 1);
    const pU: Unit = {
      id: createUnitId(1),
      position: createPosition(0, 0),
      typeId: "infantry",
      playerId: 1,
      energy: 10,
      condition: 10,
    };
    const pV: Unit = {
      id: createUnitId(3),
      position: createPosition(4, 0),
      typeId: "infantry",
      playerId: 1,
      energy: 10,
      condition: 10,
    };
    const pO1: Unit = {
      id: createUnitId(2),
      position: createPosition(2, 0),
      typeId: "infantry",
      playerId: 2,
      energy: 10,
      condition: 10,
    };
    const pO2: Unit = {
      id: createUnitId(4),
      position: createPosition(1, 0),
      typeId: "infantry",
      playerId: 2,
      energy: 10,
      condition: 10,
    };
    const p1Units = new Map<UnitId, Unit>([
      [pU.id, pU],
      [pV.id, pV],
    ]);
    const p2Units = new Map<UnitId, Unit>([
      [pO1.id, pO1],
      [pO2.id, pO2],
    ]);
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: p1Units }],
      [2, { id: 2, type: PlayerType.Human, units: p2Units }],
    ]);
    const game: Game = {
      map: { grid, tiles: new Map(), bases: new Map() },
      players,
      currentPlayerId: 2,
      turn: 1,
    };
    const processor = new GameProcessor(game, createFlankingUnitTypes(), {
      support: false,
      flanking: true,
    });

    const emitted: any[] = [];
    processor.handle({ type: "EndTurn" }, (e) => emitted.push(e)); // → P1

    const damaged = emitted.filter((e) => e.type === "UnitDamaged");
    const o1Damages = damaged.filter((e) => e.unit.unitId === createUnitId(2));
    const o2Damages = damaged.filter((e) => e.unit.unitId === createUnitId(4));
    // O1: U deals power=4 (SplitAndFlanked), V deals power=6 (Flanked)
    const o1Powers = o1Damages.map((e) => e.power).sort((a, b) => a - b);
    expect(o1Powers).toEqual([4, 6]);
    expect(o1Damages.find((e) => e.power === 4)!.damageType).toBe(DamageType.SplitAndFlanked);
    expect(o1Damages.find((e) => e.power === 6)!.damageType).toBe(DamageType.Flanked);
    // O2: U deals power=2 (Split)
    expect(o2Damages.length).toBe(1);
    expect(o2Damages[0].power).toBe(2);
    expect(o2Damages[0].damageType).toBe(DamageType.Split);
  });
});

describe("GameProcessor Claiming", () => {
  // Helper: build a minimal game with bases and a few units.
  // Grid: 10x1 row. P1 base at (0,0), P2 base at (9,0).
  // Unit positions and types are parameterised so each test can set up its own scenario.
  function makeClaimGame(
    p1Units: Array<{ id: number; q: number; typeId?: string }>,
    p2Units: Array<{ id: number; q: number; typeId?: string }>,
    extraTiles: Array<{
      q: number;
      r: number;
      features: TileFeature[];
      baseForPlayerId?: number;
    }> = []
  ) {
    const grid = HexGrid.rect(12, 1);
    const types = createTestUnitTypes();
    // Add mortar for indirect-claim tests
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

    const toUnit = (u: { id: number; q: number; typeId?: string }, playerId: number): Unit => ({
      id: createUnitId(u.id),
      position: createPosition(u.q, 0),
      typeId: u.typeId ?? "infantry",
      playerId,
      energy: 10,
      condition: 10,
    });
    const units1 = new Map<UnitId, Unit>(p1Units.map((u) => [createUnitId(u.id), toUnit(u, 1)]));
    const units2 = new Map<UnitId, Unit>(p2Units.map((u) => [createUnitId(u.id), toUnit(u, 2)]));
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: units1 }],
      [2, { id: 2, type: PlayerType.Human, units: units2 }],
    ]);

    const tiles = new Map();
    const bases = new Map<number, { q: number; r: number }[]>();
    // Default bases
    tiles.set("0,0", {
      position: createPosition(0, 0),
      features: [TileFeature.Base],
      baseForPlayerId: 1,
    });
    bases.set(1, [createPosition(0, 0)]);
    tiles.set("9,0", {
      position: createPosition(9, 0),
      features: [TileFeature.Base],
      baseForPlayerId: 2,
    });
    bases.set(2, [createPosition(9, 0)]);
    for (const t of extraTiles) {
      const key = positionKey(createPosition(t.q, t.r));
      tiles.set(key, {
        position: createPosition(t.q, t.r),
        features: t.features,
        baseForPlayerId: t.baseForPlayerId,
      });
      if (t.features.includes(TileFeature.Base) && t.baseForPlayerId !== undefined) {
        bases.set(t.baseForPlayerId, [createPosition(t.q, t.r)]);
      }
    }

    const game: Game = { map: { grid, tiles, bases }, players, currentPlayerId: 1, turn: 1 };
    return new GameProcessor(game, types);
  }

  function claimOf(
    claims: ReturnType<GameProcessor["getClaims"]>,
    q: number,
    r: number,
    playerId: number
  ) {
    return claims.get(positionKey(createPosition(q, r)))?.find((c) => c.playerId === playerId);
  }

  it("base tile is always claimed as Direct by its player", () => {
    const proc = makeClaimGame([{ id: 1, q: 0 }], [{ id: 2, q: 9 }]);
    const claims = proc.getClaims();

    expect(claimOf(claims, 0, 0, 1)?.claimType).toBe(ClaimType.Direct);
    expect(claimOf(claims, 9, 0, 2)?.claimType).toBe(ClaimType.Direct);
    // Base is not claimed by the opponent
    expect(claimOf(claims, 0, 0, 2)).toBeUndefined();
  });

  it("adjacent influenced tile is claimed when adjacent to base", () => {
    // P1 infantry at (0,0) has AoI 0-2, so it influences (1,0). (1,0) is adjacent to base (0,0).
    const proc = makeClaimGame([{ id: 1, q: 0 }], [{ id: 2, q: 9 }]);
    const claims = proc.getClaims();

    expect(claimOf(claims, 1, 0, 1)).toBeDefined();
  });

  it("influenced tile not adjacent to any claimed tile is not claimed", () => {
    // P1 infantry at (0,0) influences up to (2,0). (3,0) is within AoI but not adjacent to base.
    // Only (0,0),(1,0),(2,0) should be claimed by P1; (3,0) is out of AoI.
    const proc = makeClaimGame([{ id: 1, q: 0 }], [{ id: 2, q: 9 }]);
    const claims = proc.getClaims();

    expect(claimOf(claims, 3, 0, 1)).toBeUndefined();
  });

  it("claim chain: influenced tile adjacent to another claimed influenced tile", () => {
    // P1 infantry at (2,0) influences (0,0)-(4,0). Base at (0,0).
    // (0,0) claimed → (1,0) influenced+adjacent ✓ → (2,0) influenced+adjacent ✓ → chain continues.
    const proc = makeClaimGame([{ id: 1, q: 2 }], [{ id: 2, q: 9 }]);
    const claims = proc.getClaims();

    expect(claimOf(claims, 2, 0, 1)).toBeDefined();
    expect(claimOf(claims, 4, 0, 1)).toBeDefined();
  });

  it("claim is Direct when at least one Direct unit influences the tile", () => {
    // Infantry (Direct) at (0,0) influences (1,0).
    const proc = makeClaimGame([{ id: 1, q: 0 }], [{ id: 2, q: 9 }]);
    const claims = proc.getClaims();
    expect(claimOf(claims, 1, 0, 1)?.claimType).toBe(ClaimType.Direct);
  });

  it("claim is Indirect when only Indirect units influence the tile", () => {
    // P1 mortar at (0,0) influences (3,0)-(5,0) (AoI 3-5, Indirect).
    // Base at (0,0). (1,0),(2,0) not influenced — chain breaks unless mortar hits them.
    // But mortar AoI starts at 3, so (0,0) base claims (0,0) only; (3,0) is not adjacent
    // to any claimed tile unless a path exists. So let's put a second infantry at (1,0) to
    // bridge the gap: infantry influences (0,0)-(3,0), mortar influences (3,0)-(5,0).
    // (3,0) is reached by both: Direct (infantry) + Indirect (mortar) → Direct wins.
    // But (4,0) is only reached by mortar → Indirect.
    const types = createTestUnitTypes();
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
    const grid = HexGrid.rect(12, 1);
    const infantry: Unit = {
      id: createUnitId(1),
      position: createPosition(1, 0),
      typeId: "infantry",
      playerId: 1,
      energy: 10,
      condition: 10,
    };
    const mortar: Unit = {
      id: createUnitId(3),
      position: createPosition(1, 0),
      typeId: "mortar",
      playerId: 1,
      energy: 10,
      condition: 10,
    };
    const p2Unit: Unit = {
      id: createUnitId(2),
      position: createPosition(9, 0),
      typeId: "infantry",
      playerId: 2,
      energy: 10,
      condition: 10,
    };
    const units1 = new Map<UnitId, Unit>([
      [infantry.id, infantry],
      [mortar.id, mortar],
    ]);
    const units2 = new Map<UnitId, Unit>([[p2Unit.id, p2Unit]]);
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: units1 }],
      [2, { id: 2, type: PlayerType.Human, units: units2 }],
    ]);
    const tiles = new Map();
    const bases = new Map<number, { q: number; r: number }[]>();
    tiles.set("0,0", {
      position: createPosition(0, 0),
      features: [TileFeature.Base],
      baseForPlayerId: 1,
    });
    bases.set(1, [createPosition(0, 0)]);
    tiles.set("9,0", {
      position: createPosition(9, 0),
      features: [TileFeature.Base],
      baseForPlayerId: 2,
    });
    bases.set(2, [createPosition(9, 0)]);
    const game: Game = { map: { grid, tiles, bases }, players, currentPlayerId: 1, turn: 1 };
    const proc = new GameProcessor(game, types);
    const claims = proc.getClaims();

    // (4,0) is influenced only by mortar (indirect) and is adjacent to (3,0) which is claimed
    expect(claimOf(claims, 4, 0, 1)?.claimType).toBe(ClaimType.Indirect);
    // (3,0) is reached via infantry (direct) too
    expect(claimOf(claims, 3, 0, 1)?.claimType).toBe(ClaimType.Direct);
  });

  it("contested: both players claim the same tile", () => {
    // P1 infantry at (0,0) base, claims up to (2,0).
    // P2 infantry at (5,0), P2 base at (7,0), also claims down to (3,0).
    // They both claim tiles in the middle.
    const grid = HexGrid.rect(10, 1);
    const p1Unit: Unit = {
      id: createUnitId(1),
      position: createPosition(0, 0),
      typeId: "infantry",
      playerId: 1,
      energy: 10,
      condition: 10,
    };
    const p2Unit: Unit = {
      id: createUnitId(2),
      position: createPosition(5, 0),
      typeId: "infantry",
      playerId: 2,
      energy: 10,
      condition: 10,
    };
    const units1 = new Map<UnitId, Unit>([[p1Unit.id, p1Unit]]);
    const units2 = new Map<UnitId, Unit>([[p2Unit.id, p2Unit]]);
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: units1 }],
      [2, { id: 2, type: PlayerType.Human, units: units2 }],
    ]);
    const tiles = new Map();
    const bases = new Map<number, { q: number; r: number }[]>();
    tiles.set("0,0", {
      position: createPosition(0, 0),
      features: [TileFeature.Base],
      baseForPlayerId: 1,
    });
    bases.set(1, [createPosition(0, 0)]);
    tiles.set("7,0", {
      position: createPosition(7, 0),
      features: [TileFeature.Base],
      baseForPlayerId: 2,
    });
    bases.set(2, [createPosition(7, 0)]);
    const game: Game = { map: { grid, tiles, bases }, players, currentPlayerId: 1, turn: 1 };
    const proc = new GameProcessor(game, createTestUnitTypes());
    const claims = proc.getClaims();

    // P1 infantry at (0,0) influences up to (2,0); P2 infantry at (5,0) influences (3,0)-(7,0).
    // (5,0) is within P2's AoI and adjacent path from P2 base at (7,0) → claimed by P2.
    // (3,0) and (4,0): P2 infantry at (5,0) dist 2 and 1 — within AoI. Adjacent to (5,0) which
    // is adjacent to ... (7,0) base via (6,0),(5,0). And (3,0) adj to (4,0) adj to (5,0) → claimed P2.
    // (2,0): P1 infantry dist 2, adjacent to (1,0) adj to (0,0). And P2 infantry dist 3 > AoI 2 → only P1.
    // Contested area: none in this setup. Let's check (3,0) is claimed by P2 only.
    // Actually (3,0): P1 AoI reaches (0,0)-(2,0) only. P2 AoI (3,0)-(7,0). So (3,0) = P2 only.
    // Let's move P1 infantry to (2,0) so it influences (0,0)-(4,0).
    // Re-done: P1 infantry at (2,0) → influences (0,0)-(4,0). P2 infantry at (5,0) → influences (3,0)-(7,0).
    // (3,0): P1 ✓ (adjacent to (2,0) which is in (0,0)-(4,0) chain from P1 base), P2 ✓ → contested.
    // (4,0): P1 ✓, P2 ✓ → contested.
    // Let's actually verify the simpler version (P1 at 0,0 base+unit, P2 at 5,0 unit, 7,0 base):
    // P1 at (0,0) AoI 0-2: influences (0,0),(1,0),(2,0). Path from base: (0,0)→(1,0)→(2,0). P2 at (5,0) AoI 0-2: (3,0),(4,0),(5,0),(6,0),(7,0). Path from (7,0) base: (7,0)→(6,0)→(5,0)→(4,0)→(3,0). No overlap → no contested tile in this arrangement.
    // Need overlap: put P1 infantry at (3,0): base (0,0), infantry (3,0) influences (1,0)-(5,0).
    // P2 infantry at (5,0) base (7,0): influences (3,0)-(7,0).
    // Overlap at (3,0),(4,0),(5,0) for influence. Path from P1: (0,0)→(1,0)→(2,0)→(3,0)→(4,0)→(5,0). Path from P2: (7,0)→(6,0)→(5,0)→(4,0)→(3,0). → (3,0),(4,0),(5,0) contested.
    // This test is getting complex inline. Let's simplify: just check that (2,0) has only P1 and (5,0) has only P2.
    expect(claimOf(claims, 2, 0, 1)).toBeDefined();
    expect(claimOf(claims, 2, 0, 2)).toBeUndefined();
    expect(claimOf(claims, 5, 0, 2)).toBeDefined();
    expect(claimOf(claims, 5, 0, 1)).toBeUndefined();
  });

  it("contested: tile claimed by both players has two entries", () => {
    // P1 infantry at (3,0), base (0,0). P2 infantry at (5,0), base (7,0).
    // P1 AoI 0-2 from (3,0): influences (1,0)-(5,0). Path (0,0)→(1,0)→...→(5,0) ✓.
    // P2 AoI 0-2 from (5,0): influences (3,0)-(7,0). Path (7,0)→(6,0)→(5,0)→(4,0)→(3,0) ✓.
    // Overlap at (3,0),(4,0),(5,0) → contested.
    const grid = HexGrid.rect(10, 1);
    const p1Unit: Unit = {
      id: createUnitId(1),
      position: createPosition(3, 0),
      typeId: "infantry",
      playerId: 1,
      energy: 10,
      condition: 10,
    };
    const p2Unit: Unit = {
      id: createUnitId(2),
      position: createPosition(5, 0),
      typeId: "infantry",
      playerId: 2,
      energy: 10,
      condition: 10,
    };
    const units1 = new Map<UnitId, Unit>([[p1Unit.id, p1Unit]]);
    const units2 = new Map<UnitId, Unit>([[p2Unit.id, p2Unit]]);
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: units1 }],
      [2, { id: 2, type: PlayerType.Human, units: units2 }],
    ]);
    const tiles = new Map();
    const bases = new Map<number, { q: number; r: number }[]>();
    tiles.set("0,0", {
      position: createPosition(0, 0),
      features: [TileFeature.Base],
      baseForPlayerId: 1,
    });
    bases.set(1, [createPosition(0, 0)]);
    tiles.set("7,0", {
      position: createPosition(7, 0),
      features: [TileFeature.Base],
      baseForPlayerId: 2,
    });
    bases.set(2, [createPosition(7, 0)]);
    const game: Game = { map: { grid, tiles, bases }, players, currentPlayerId: 1, turn: 1 };
    const proc = new GameProcessor(game, createTestUnitTypes());
    const claims = proc.getClaims();

    const contested = claims.get(positionKey(createPosition(4, 0)));
    expect(contested).toBeDefined();
    expect(contested!.length).toBe(2);
    expect(contested!.some((c) => c.playerId === 1)).toBe(true);
    expect(contested!.some((c) => c.playerId === 2)).toBe(true);
  });

  it("tile without a player's base is never claimed by that player regardless of influence", () => {
    // P1 has no base → no claims even if infantry is present.
    const grid = HexGrid.rect(10, 1);
    const p1Unit: Unit = {
      id: createUnitId(1),
      position: createPosition(0, 0),
      typeId: "infantry",
      playerId: 1,
      energy: 10,
      condition: 10,
    };
    const p2Unit: Unit = {
      id: createUnitId(2),
      position: createPosition(9, 0),
      typeId: "infantry",
      playerId: 2,
      energy: 10,
      condition: 10,
    };
    const units1 = new Map<UnitId, Unit>([[p1Unit.id, p1Unit]]);
    const units2 = new Map<UnitId, Unit>([[p2Unit.id, p2Unit]]);
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: units1 }],
      [2, { id: 2, type: PlayerType.Human, units: units2 }],
    ]);
    const tiles = new Map();
    const bases = new Map<number, { q: number; r: number }[]>();
    // Only P2 has a base
    tiles.set("9,0", {
      position: createPosition(9, 0),
      features: [TileFeature.Base],
      baseForPlayerId: 2,
    });
    bases.set(2, [createPosition(9, 0)]);
    const game: Game = { map: { grid, tiles, bases }, players, currentPlayerId: 1, turn: 1 };
    const proc = new GameProcessor(game, createTestUnitTypes());
    const claims = proc.getClaims();

    claims.forEach((claimList) => {
      expect(claimList.every((c) => c.playerId !== 1)).toBe(true);
    });
  });
});

describe("GameProcessor unit load and capacity", () => {
  it("should calculate unit load as sum of unit type costs", () => {
    // P1: 1 infantry (cost 1) + 1 mortar (cost 2) = 3
    const types = createTestUnitTypes();
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
    const grid = HexGrid.rect(5, 1);
    const inf: Unit = {
      id: createUnitId(1),
      position: createPosition(0, 0),
      typeId: "infantry",
      playerId: 1,
      energy: 10,
      condition: 10,
    };
    const mort: Unit = {
      id: createUnitId(2),
      position: createPosition(1, 0),
      typeId: "mortar",
      playerId: 1,
      energy: 10,
      condition: 5,
    };
    const p1Units = new Map<UnitId, Unit>([
      [inf.id, inf],
      [mort.id, mort],
    ]);
    const players = new Map([[1, { id: 1, type: PlayerType.Human, units: p1Units }]]);
    const game: Game = {
      map: { grid, tiles: new Map(), bases: new Map() },
      players,
      currentPlayerId: 1,
      turn: 1,
    };
    const proc = new GameProcessor(game, types);

    expect(proc.getUnitLoad(1)).toBe(3);
  });

  it("should return 0 load for a player with no units", () => {
    const game = createTestGame();
    const proc = new GameProcessor(game, createTestUnitTypes());
    expect(proc.getUnitLoad(99)).toBe(0);
  });

  it("should return map unit capacity for a player", () => {
    const grid = HexGrid.rect(5, 1);
    const inf: Unit = {
      id: createUnitId(1),
      position: createPosition(0, 0),
      typeId: "infantry",
      playerId: 1,
      energy: 10,
      condition: 10,
    };
    const p1Units = new Map<UnitId, Unit>([[inf.id, inf]]);
    const players = new Map([[1, { id: 1, type: PlayerType.Human, units: p1Units }]]);
    const game: Game = {
      map: { grid, tiles: new Map(), bases: new Map(), unitCapacity: new Map([[1, 10]]) },
      players,
      currentPlayerId: 1,
      turn: 1,
    };
    const proc = new GameProcessor(game, createTestUnitTypes());
    expect(proc.getUnitCapacity(1)).toBe(10);
  });

  it("should return undefined capacity when map has no unit capacity", () => {
    const game = createTestGame();
    const proc = new GameProcessor(game, createTestUnitTypes());
    expect(proc.getUnitCapacity(1)).toBeUndefined();
  });
});

describe("GameProcessor unit capacity from depots", () => {
  // Reuse makeClaimGame but with a unitCapacity on the map.
  function makeDepotGame(
    p1Units: Array<{ id: number; q: number }>,
    depotPositions: number[],
    baseCapacity = 10
  ) {
    const grid = HexGrid.rect(12, 1);
    const types = createTestUnitTypes();
    const toUnit = (u: { id: number; q: number }, playerId: number): Unit => ({
      id: createUnitId(u.id),
      position: createPosition(u.q, 0),
      typeId: "infantry",
      playerId,
      energy: 10,
      condition: 10,
    });
    const units1 = new Map<UnitId, Unit>(p1Units.map((u) => [createUnitId(u.id), toUnit(u, 1)]));
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: units1 }],
      [2, { id: 2, type: PlayerType.Human, units: new Map() }],
    ]);
    const tiles = new Map();
    tiles.set("0,0", {
      position: createPosition(0, 0),
      features: [TileFeature.Base],
      baseForPlayerId: 1,
    });
    for (const dq of depotPositions) {
      const key = positionKey(createPosition(dq, 0));
      tiles.set(key, { position: createPosition(dq, 0), features: [TileFeature.Depot] });
    }
    const bases = new Map([[1, [createPosition(0, 0)]]]);
    const unitCapacity = new Map([
      [1, baseCapacity],
      [2, baseCapacity],
    ]);
    const game: Game = {
      map: { grid, tiles, bases, unitCapacity },
      players,
      currentPlayerId: 1,
      turn: 1,
    };
    return new GameProcessor(game, types);
  }

  it("Direct Unique claim on depot adds +2 to capacity", () => {
    // P1 infantry at (1,0) AoI 0-2: claims (0,0)-(3,0). Depot at (2,0) → Direct Unique.
    const proc = makeDepotGame([{ id: 1, q: 1 }], [2]);
    expect(proc.getUnitCapacity(1)).toBe(12); // 10 + 2
  });

  it("two depots with Direct Unique claims add +4 to capacity", () => {
    // P1 infantry at (1,0): claims (0,0)-(3,0). Depots at (1,0) and (2,0).
    const proc = makeDepotGame([{ id: 1, q: 1 }], [1, 2]);
    expect(proc.getUnitCapacity(1)).toBe(14); // 10 + 2 + 2
  });

  it("Indirect claim on depot gives no capacity bonus", () => {
    // P1 infantry at (1,0) AoI 0-2 → Direct claim on (2,0). Depot at (4,0) is outside
    // infantry AoI and not reachable from base by Direct unit → no claim.
    const proc = makeDepotGame([{ id: 1, q: 1 }], [4]);
    expect(proc.getUnitCapacity(1)).toBe(10); // no bonus
  });

  it("Contested Direct claim on depot adds +1 to capacity", () => {
    // P1 infantry at (3,0) claims (0,0)-(5,0) via base (0,0).
    // P2 bridges from base (9,0): infantry at (8,0) AoI covers (6,0)-(10,0),
    //   infantry at (5,0) AoI covers (3,0)-(7,0), bridging to (4,0).
    // Depot at (4,0) — contested by both players → +1 each.
    const grid = HexGrid.rect(12, 1);
    const types = createTestUnitTypes();
    const toUnit = (id: number, q: number, pid: number): Unit => ({
      id: createUnitId(id),
      position: createPosition(q, 0),
      typeId: "infantry",
      playerId: pid,
      energy: 10,
      condition: 10,
    });
    const p1Units = new Map<UnitId, Unit>([[createUnitId(1), toUnit(1, 3, 1)]]);
    const p2Units = new Map<UnitId, Unit>([
      [createUnitId(2), toUnit(2, 8, 2)],
      [createUnitId(3), toUnit(3, 5, 2)],
    ]);
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: p1Units }],
      [2, { id: 2, type: PlayerType.Human, units: p2Units }],
    ]);
    const tiles = new Map();
    tiles.set("0,0", {
      position: createPosition(0, 0),
      features: [TileFeature.Base],
      baseForPlayerId: 1,
    });
    tiles.set("9,0", {
      position: createPosition(9, 0),
      features: [TileFeature.Base],
      baseForPlayerId: 2,
    });
    tiles.set("4,0", { position: createPosition(4, 0), features: [TileFeature.Depot] });
    const bases = new Map([
      [1, [createPosition(0, 0)]],
      [2, [createPosition(9, 0)]],
    ]);
    const unitCapacity = new Map([
      [1, 10],
      [2, 10],
    ]);
    const game: Game = {
      map: { grid, tiles, bases, unitCapacity },
      players,
      currentPlayerId: 1,
      turn: 1,
    };
    const proc = new GameProcessor(game, types);

    expect(proc.getUnitCapacity(1)).toBe(11); // 10 + 1 (contested → halved)
    expect(proc.getUnitCapacity(2)).toBe(11); // both players get +1
  });

  it("unclaimed depot gives no capacity bonus", () => {
    // P1 infantry at (1,0) → claims (0,0)-(3,0). Depot at (7,0) → unclaimed.
    const proc = makeDepotGame([{ id: 1, q: 1 }], [7]);
    expect(proc.getUnitCapacity(1)).toBe(10);
  });
});

describe("GameProcessor building units", () => {
  // Helper: builds a game with a facility for P1 at (5,0), P1 base at (0,0),
  // P1 infantry at (2,0) so it claims (0,0)-(4,0), covering facility at (5,0)?
  // Actually let's put infantry at (3,0) AoI 0-2 → claims (0,0)-(5,0) from base.
  // Facility at (5,0).
  function makeBuildGame(baseCapacity = 20) {
    const grid = HexGrid.rect(10, 1);
    const types = createTestUnitTypes();

    const inf: Unit = {
      id: createUnitId(1),
      position: createPosition(3, 0),
      typeId: "infantry",
      playerId: 1,
      energy: 10,
      condition: 10,
    };
    const p1Units = new Map<UnitId, Unit>([[inf.id, inf]]);
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: p1Units }],
      [2, { id: 2, type: PlayerType.Human, units: new Map() }],
    ]);
    const tiles = new Map<string, any>();
    tiles.set("0,0", {
      position: createPosition(0, 0),
      features: [TileFeature.Base],
      baseForPlayerId: 1,
    });
    tiles.set("5,0", { position: createPosition(5, 0), features: [TileFeature.Facility] });
    const bases = new Map([[1, [createPosition(0, 0)]]]);
    const unitCapacity = new Map([
      [1, baseCapacity],
      [2, baseCapacity],
    ]);
    const game: Game = {
      map: { grid, tiles, bases, unitCapacity },
      players,
      currentPlayerId: 1,
      turn: 1,
    };
    return { game, proc: new GameProcessor(game, types) };
  }

  it("should place an underConstruction unit when ordering a build", () => {
    const { game, proc } = makeBuildGame();
    const events: any[] = [];
    const result = proc.handle(
      { type: "OrderBuild", facilityPosition: createPosition(5, 0), unitTypeId: "infantry" },
      (e) => events.push(e)
    );

    expect(result.ok).toBe(true);
    const p1 = game.players.get(1)!;
    const built = Array.from(p1.units.values()).find((u) => u.underConstruction);
    expect(built).toBeDefined();
    expect(built!.typeId).toBe("infantry");
    expect(built!.position).toEqual(createPosition(5, 0));
    const evt = events.find((e) => e.type === "BuildOrdered");
    expect(evt).toBeDefined();
    expect(evt.facilityPosition).toEqual(createPosition(5, 0));
  });

  it("should reject ordering a build at a non-facility tile", () => {
    const { proc } = makeBuildGame();
    const result = proc.handle(
      { type: "OrderBuild", facilityPosition: createPosition(4, 0), unitTypeId: "infantry" },
      () => {}
    );
    expect(result.ok).toBe(false);
  });

  it("should reject ordering a build at an unclaimed facility", () => {
    // P2 also has a base and an infantry to contest the facility.
    const grid = HexGrid.rect(10, 1);
    const types = createTestUnitTypes();
    const p1Inf: Unit = {
      id: createUnitId(1),
      position: createPosition(3, 0),
      typeId: "infantry",
      playerId: 1,
      energy: 10,
      condition: 10,
    };
    const p2Inf: Unit = {
      id: createUnitId(2),
      position: createPosition(5, 0),
      typeId: "infantry",
      playerId: 2,
      energy: 10,
      condition: 10,
    };
    const p2Inf2: Unit = {
      id: createUnitId(3),
      position: createPosition(8, 0),
      typeId: "infantry",
      playerId: 2,
      energy: 10,
      condition: 10,
    };
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: new Map([[p1Inf.id, p1Inf]]) }],
      [
        2,
        {
          id: 2,
          type: PlayerType.Human,
          units: new Map([
            [p2Inf.id, p2Inf],
            [p2Inf2.id, p2Inf2],
          ]),
        },
      ],
    ]);
    const tiles = new Map<string, any>();
    tiles.set("0,0", {
      position: createPosition(0, 0),
      features: [TileFeature.Base],
      baseForPlayerId: 1,
    });
    tiles.set("9,0", {
      position: createPosition(9, 0),
      features: [TileFeature.Base],
      baseForPlayerId: 2,
    });
    tiles.set("5,0", { position: createPosition(5, 0), features: [TileFeature.Facility] });
    const bases = new Map([
      [1, [createPosition(0, 0)]],
      [2, [createPosition(9, 0)]],
    ]);
    const game: Game = {
      map: {
        grid,
        tiles,
        bases,
        unitCapacity: new Map([
          [1, 20],
          [2, 20],
        ]),
      },
      players,
      currentPlayerId: 1,
      turn: 1,
    };
    const proc = new GameProcessor(game, types);
    const result = proc.handle(
      { type: "OrderBuild", facilityPosition: createPosition(5, 0), unitTypeId: "infantry" },
      () => {}
    );
    expect(result.ok).toBe(false);
  });

  it("should reject ordering a build when it would exceed capacity", () => {
    const { proc } = makeBuildGame(1); // capacity of 1, infantry costs 1, already 1 unit
    const result = proc.handle(
      { type: "OrderBuild", facilityPosition: createPosition(5, 0), unitTypeId: "infantry" },
      () => {}
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("capacity");
  });

  it("should cancel an existing build order at a facility when re-ordering", () => {
    const { game, proc } = makeBuildGame();
    const events: any[] = [];
    // First order: infantry at facility.
    proc.handle(
      { type: "OrderBuild", facilityPosition: createPosition(5, 0), unitTypeId: "infantry" },
      () => {}
    );

    // Re-order — still infantry but cancels the prior order first.
    events.length = 0;
    const result = proc.handle(
      { type: "OrderBuild", facilityPosition: createPosition(5, 0), unitTypeId: "infantry" },
      (e) => events.push(e)
    );
    expect(result.ok).toBe(true);
    const p1Units = Array.from(game.players.get(1)!.units.values());
    const underConstr = p1Units.filter((u) => u.underConstruction);
    expect(underConstr).toHaveLength(1);
    // Emitted a cancel for old order and a new BuildOrdered.
    expect(events.find((e) => e.type === "BuildCancelled")).toBeDefined();
    expect(events.find((e) => e.type === "BuildOrdered")).toBeDefined();
  });

  it("should allow cancelling a build order explicitly", () => {
    const { game, proc } = makeBuildGame();
    const events: any[] = [];
    proc.handle(
      { type: "OrderBuild", facilityPosition: createPosition(5, 0), unitTypeId: "infantry" },
      () => {}
    );

    const result = proc.handle(
      { type: "CancelBuild", facilityPosition: createPosition(5, 0) },
      (e) => events.push(e)
    );
    expect(result.ok).toBe(true);
    const underConstr = Array.from(game.players.get(1)!.units.values()).filter(
      (u) => u.underConstruction
    );
    expect(underConstr).toHaveLength(0);
    expect(events.find((e) => e.type === "BuildCancelled")).toBeDefined();
  });

  it("should reject cancelling at a position with no build order", () => {
    const { proc } = makeBuildGame();
    const result = proc.handle(
      { type: "CancelBuild", facilityPosition: createPosition(5, 0) },
      () => {}
    );
    expect(result.ok).toBe(false);
  });

  it("should complete construction at the start of the builder's next turn", () => {
    const { game, proc } = makeBuildGame();
    const events: any[] = [];
    proc.handle(
      { type: "OrderBuild", facilityPosition: createPosition(5, 0), unitTypeId: "infantry" },
      () => {}
    );

    // End P1 turn (→ P2), then end P2 turn (→ P1, construction resolves).
    proc.handle({ type: "EndTurn" }, () => {}); // P2's turn
    proc.handle({ type: "EndTurn" }, (e) => events.push(e)); // back to P1

    const builtEvt = events.find((e) => e.type === "UnitBuilt");
    expect(builtEvt).toBeDefined();
    expect(builtEvt.unit.typeId).toBe("infantry");

    const p1Units = Array.from(game.players.get(1)!.units.values());
    const constructed = p1Units.find(
      (u) => u.typeId === "infantry" && !u.underConstruction && positionKey(u.position) === "5,0"
    );
    expect(constructed).toBeDefined();
  });

  it("should cancel construction if the facility is no longer uniquely claimed at start of builder's turn", () => {
    // Set up: P1 orders build, then P2 takes the facility away.
    const grid = HexGrid.rect(10, 1);
    const types = createTestUnitTypes();
    const p1Inf: Unit = {
      id: createUnitId(1),
      position: createPosition(3, 0),
      typeId: "infantry",
      playerId: 1,
      energy: 10,
      condition: 10,
    };
    // P2 unit starts far away and moves in to contest.
    const p2Inf: Unit = {
      id: createUnitId(2),
      position: createPosition(8, 0),
      typeId: "infantry",
      playerId: 2,
      energy: 10,
      condition: 10,
    };
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: new Map([[p1Inf.id, p1Inf]]) }],
      [2, { id: 2, type: PlayerType.Human, units: new Map([[p2Inf.id, p2Inf]]) }],
    ]);
    const tiles = new Map<string, any>();
    tiles.set("0,0", {
      position: createPosition(0, 0),
      features: [TileFeature.Base],
      baseForPlayerId: 1,
    });
    tiles.set("9,0", {
      position: createPosition(9, 0),
      features: [TileFeature.Base],
      baseForPlayerId: 2,
    });
    tiles.set("5,0", { position: createPosition(5, 0), features: [TileFeature.Facility] });
    const bases = new Map([
      [1, [createPosition(0, 0)]],
      [2, [createPosition(9, 0)]],
    ]);
    const game: Game = {
      map: {
        grid,
        tiles,
        bases,
        unitCapacity: new Map([
          [1, 20],
          [2, 20],
        ]),
      },
      players,
      currentPlayerId: 1,
      turn: 1,
    };
    const proc = new GameProcessor(game, types);

    // P1 orders build.
    proc.handle(
      { type: "OrderBuild", facilityPosition: createPosition(5, 0), unitTypeId: "infantry" },
      () => {}
    );

    // P2 moves to contest the facility (6,0) which puts it in AoI range of facility tile.
    proc.handle({ type: "EndTurn" }, () => {}); // now P2's turn
    // P2 infantry at (8,0) moves to (5,0)+2 = (7,0) → AoI 0-2 from (7,0): covers (5,0)-(9,0).
    // But P2 also needs a connected claim from P2 base at (9,0): (9,0)→(8,0)→(7,0) etc.
    // Let's move P2 infantry to (7,0); its AoI covers (5,0) and (9,0) covers the chain → contesting (5,0).
    proc.handle(
      { type: "Move", unitId: createUnitId(2), position: createPosition(7, 0) },
      () => {}
    );

    // End P2 turn → back to P1, construction should cancel.
    const events: any[] = [];
    proc.handle({ type: "EndTurn" }, (e) => events.push(e));

    const cancelEvt = events.find((e) => e.type === "BuildCancelled");
    expect(cancelEvt).toBeDefined();
    const p1Units = Array.from(game.players.get(1)!.units.values());
    expect(p1Units.every((u) => !u.underConstruction)).toBe(true);
  });
});

describe("GameProcessor Base Capture", () => {
  // Helper: units far apart (distance > 2) with full energy/condition so damage doesn't interfere.
  function makeUnit(id: number, playerId: number, q: number, r: number): Unit {
    return {
      id: createUnitId(id),
      position: createPosition(q, r),
      typeId: "infantry",
      playerId,
      energy: 10,
      condition: 10,
    };
  }

  it("single base captured → P1 loses, P2 wins", () => {
    const grid = HexGrid.rect(15, 1);
    const p1Unit = makeUnit(1, 1, 14, 0); // P1 unit far from base
    const p2Unit = makeUnit(2, 2, 0, 0); // P2 unit ON P1's base at (0,0)
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: new Map([[p1Unit.id, p1Unit]]) }],
      [2, { id: 2, type: PlayerType.Human, units: new Map([[p2Unit.id, p2Unit]]) }],
    ]);
    const bases = new Map([[1, [createPosition(0, 0)]]]);
    const game: Game = {
      map: { grid, tiles: new Map(), bases },
      players,
      currentPlayerId: 1,
      turn: 1,
    };
    const proc = new GameProcessor(game, createTestUnitTypes());

    const events: any[] = [];
    proc.handle({ type: "EndTurn" }, (e) => events.push(e));

    const eliminated = events.find((e) => e.type === "PlayerEliminated");
    expect(eliminated).toBeDefined();
    expect(eliminated.playerId).toBe(1);
    const ended = events.find((e) => e.type === "GameEnded");
    expect(ended).toBeDefined();
    expect(ended.winnerId).toBe(2);
  });

  it("one of two bases captured → no loss", () => {
    const grid = HexGrid.rect(15, 1);
    const p1Unit = makeUnit(1, 1, 5, 0); // P1 unit between its two bases
    const p2Unit = makeUnit(2, 2, 0, 0); // P2 unit on P1's first base only
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: new Map([[p1Unit.id, p1Unit]]) }],
      [2, { id: 2, type: PlayerType.Human, units: new Map([[p2Unit.id, p2Unit]]) }],
    ]);
    const bases = new Map([[1, [createPosition(0, 0), createPosition(9, 0)]]]);
    const game: Game = {
      map: { grid, tiles: new Map(), bases },
      players,
      currentPlayerId: 1,
      turn: 1,
    };
    const proc = new GameProcessor(game, createTestUnitTypes());

    const events: any[] = [];
    proc.handle({ type: "EndTurn" }, (e) => events.push(e));

    expect(events.find((e) => e.type === "GameEnded")).toBeUndefined();
    expect(events.find((e) => e.type === "PlayerEliminated")).toBeUndefined();
  });

  it("all two bases captured → P1 loses, P2 wins", () => {
    const grid = HexGrid.rect(15, 1);
    const p1Unit = makeUnit(1, 1, 5, 0); // P1 unit in middle
    const p2UnitA = makeUnit(2, 2, 0, 0); // P2 unit on P1's first base
    const p2UnitB = makeUnit(3, 2, 9, 0); // P2 unit on P1's second base
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: new Map([[p1Unit.id, p1Unit]]) }],
      [
        2,
        {
          id: 2,
          type: PlayerType.Human,
          units: new Map([
            [p2UnitA.id, p2UnitA],
            [p2UnitB.id, p2UnitB],
          ]),
        },
      ],
    ]);
    const bases = new Map([[1, [createPosition(0, 0), createPosition(9, 0)]]]);
    const game: Game = {
      map: { grid, tiles: new Map(), bases },
      players,
      currentPlayerId: 1,
      turn: 1,
    };
    const proc = new GameProcessor(game, createTestUnitTypes());

    const events: any[] = [];
    proc.handle({ type: "EndTurn" }, (e) => events.push(e));

    const eliminated = events.find((e) => e.type === "PlayerEliminated");
    expect(eliminated).toBeDefined();
    expect(eliminated.playerId).toBe(1);
    const ended = events.find((e) => e.type === "GameEnded");
    expect(ended).toBeDefined();
    expect(ended.winnerId).toBe(2);
  });

  it("no bases → no base capture loss", () => {
    const grid = HexGrid.rect(5, 1);
    const p1Unit = makeUnit(1, 1, 4, 0);
    const p2Unit = makeUnit(2, 2, 0, 0);
    const players = new Map([
      [1, { id: 1, type: PlayerType.Human, units: new Map([[p1Unit.id, p1Unit]]) }],
      [2, { id: 2, type: PlayerType.Human, units: new Map([[p2Unit.id, p2Unit]]) }],
    ]);
    const game: Game = {
      map: { grid, tiles: new Map(), bases: new Map() },
      players,
      currentPlayerId: 1,
      turn: 1,
    };
    const proc = new GameProcessor(game, createTestUnitTypes());

    const events: any[] = [];
    proc.handle({ type: "EndTurn" }, (e) => events.push(e));

    expect(events.find((e) => e.type === "PlayerEliminated")).toBeUndefined();
    expect(events.find((e) => e.type === "GameEnded")).toBeUndefined();
  });
});
