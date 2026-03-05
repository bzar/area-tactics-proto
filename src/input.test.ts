import { describe, it, expect, beforeEach } from "vitest";
import { InputProcessor } from "../src/input";
import { GameProcessor } from "../src/game";
import {
  Game,
  Unit,
  UnitId,
  UnitType,
  HexGrid,
  EffectType,
  PlayerType,
  createPosition,
} from "../src/domain";

function makeUnitId(id: number): UnitId {
  return id as unknown as UnitId;
}

function makeUnitTypes(): Map<string, UnitType> {
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
  return types;
}

// 5-wide 1-row grid; P1 unit at (0,0), P2 unit at (4,0) (out of each other's AoI)
function makeGame(): { game: Game; p1Unit: Unit; p2Unit: Unit } {
  const grid = HexGrid.rect(5, 1);
  const p1Unit: Unit = {
    id: makeUnitId(1),
    position: createPosition(0, 0),
    typeId: "infantry",
    playerId: 1,
    energy: 10,
    condition: 10,
  };
  const p2Unit: Unit = {
    id: makeUnitId(2),
    position: createPosition(4, 0),
    typeId: "infantry",
    playerId: 2,
    energy: 10,
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
    p1Unit,
    p2Unit,
  };
}

describe("InputProcessor", () => {
  let input: InputProcessor;
  let gameProcessor: GameProcessor;
  let emitted: any[];

  beforeEach(() => {
    const { game } = makeGame();
    input = new InputProcessor();
    gameProcessor = new GameProcessor(game, makeUnitTypes());
    emitted = [];
  });

  it("clicking own unit selects it and emits UnitSelected with valid destinations", () => {
    input.handle({ type: "TileDown", position: createPosition(0, 0) }, gameProcessor, (e) =>
      emitted.push(e)
    );

    expect(emitted.length).toBe(1);
    expect(emitted[0].type).toBe("UnitSelected");
    expect(emitted[0].unitId).toBe(makeUnitId(1));
    // Infantry movement 3 from (0,0) on a 5-wide 1-row grid: reachable tiles are (0,0),(1,0),(2,0),(3,0)
    expect(emitted[0].validDestinations).toHaveLength(4);
    expect(input.getSelectedUnitId()).toBe(makeUnitId(1));
  });

  it("clicking an opponent's unit with nothing selected does nothing", () => {
    input.handle({ type: "TileDown", position: createPosition(4, 0) }, gameProcessor, (e) =>
      emitted.push(e)
    );

    expect(emitted.length).toBe(0);
    expect(input.getSelectedUnitId()).toBeNull();
  });

  it("clicking an empty tile with nothing selected does nothing", () => {
    input.handle({ type: "TileDown", position: createPosition(2, 0) }, gameProcessor, (e) =>
      emitted.push(e)
    );

    expect(emitted.length).toBe(0);
    expect(input.getSelectedUnitId()).toBeNull();
  });

  it("after selecting, clicking a valid destination emits Move and clears selection", () => {
    input.handle({ type: "TileDown", position: createPosition(0, 0) }, gameProcessor, () => {});
    emitted = [];

    input.handle({ type: "TileDown", position: createPosition(2, 0) }, gameProcessor, (e) =>
      emitted.push(e)
    );

    expect(emitted.length).toBe(1);
    expect(emitted[0].type).toBe("Move");
    expect(emitted[0].unitId).toBe(makeUnitId(1));
    expect(emitted[0].position).toEqual(createPosition(2, 0));
    expect(input.getSelectedUnitId()).toBeNull();
  });

  it("after selecting, clicking an invalid tile emits SelectionCleared and deselects", () => {
    // (4,0) is occupied by P2 and beyond movement range — invalid destination
    input.handle({ type: "TileDown", position: createPosition(0, 0) }, gameProcessor, () => {});
    emitted = [];

    input.handle({ type: "TileDown", position: createPosition(4, 0) }, gameProcessor, (e) =>
      emitted.push(e)
    );

    expect(emitted.length).toBe(1);
    expect(emitted[0].type).toBe("SelectionCleared");
    expect(input.getSelectedUnitId()).toBeNull();
  });

  it("clicking the already-selected unit again deselects it", () => {
    input.handle({ type: "TileDown", position: createPosition(0, 0) }, gameProcessor, () => {});
    emitted = [];

    input.handle({ type: "TileDown", position: createPosition(0, 0) }, gameProcessor, (e) =>
      emitted.push(e)
    );

    expect(emitted.length).toBe(1);
    expect(emitted[0].type).toBe("SelectionCleared");
    expect(input.getSelectedUnitId()).toBeNull();
  });

  it("clicking a different own unit switches the selection", () => {
    // Give P1 a second unit at (3,0)
    const { game } = makeGame();
    const extraUnit: Unit = {
      id: makeUnitId(3),
      position: createPosition(3, 0),
      typeId: "infantry",
      playerId: 1,
      energy: 10,
      condition: 10,
    };
    game.players.get(1)!.units.set(extraUnit.id, extraUnit);
    const gp = new GameProcessor(game, makeUnitTypes());
    const ip = new InputProcessor();
    const events: any[] = [];

    ip.handle({ type: "TileDown", position: createPosition(0, 0) }, gp, () => {}); // select unit 1
    ip.handle({ type: "TileDown", position: createPosition(3, 0) }, gp, (e) => events.push(e)); // switch to unit 3

    expect(events.length).toBe(1);
    expect(events[0].type).toBe("UnitSelected");
    expect(events[0].unitId).toBe(makeUnitId(3));
    expect(ip.getSelectedUnitId()).toBe(makeUnitId(3));
  });

  it("EndTurn with an active selection emits SelectionCleared then EndTurn", () => {
    input.handle({ type: "TileDown", position: createPosition(0, 0) }, gameProcessor, () => {});
    emitted = [];

    input.handle({ type: "EndTurn" }, gameProcessor, (e) => emitted.push(e));

    expect(emitted.length).toBe(2);
    expect(emitted[0].type).toBe("SelectionCleared");
    expect(emitted[1].type).toBe("EndTurn");
    expect(input.getSelectedUnitId()).toBeNull();
  });

  it("EndTurn with no selection emits only EndTurn", () => {
    input.handle({ type: "EndTurn" }, gameProcessor, (e) => emitted.push(e));

    expect(emitted.length).toBe(1);
    expect(emitted[0].type).toBe("EndTurn");
  });
});
