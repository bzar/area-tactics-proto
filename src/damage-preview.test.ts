import { describe, expect, it } from "vitest";
import {
  createPosition,
  EffectType,
  Game,
  GameFeatures,
  HexGrid,
  PlayerType,
  Unit,
  UnitId,
  UnitType,
} from "area-tactics";
import { buildAttackForecasts, buildUnitDamagePreview } from "./damage-preview";

function createUnitId(id: number): UnitId {
  return id as UnitId;
}

function createUnitTypes(): Map<string, UnitType> {
  return new Map<string, UnitType>([
    [
      "infantry",
      {
        id: "infantry",
        effectType: EffectType.Direct,
        power: 4,
        aoiMin: 0,
        aoiMax: 2,
        maxEnergy: 10,
        maxCondition: 10,
        movement: 3,
        cost: 1,
      },
    ],
  ]);
}

function createGame(p1Units: Unit[], p2Units: Unit[], currentPlayerId = 1): Game {
  return {
    map: { grid: HexGrid.rect(5, 1), tiles: new Map(), bases: new Map() },
    players: new Map([
      [1, { id: 1, type: PlayerType.Human, units: new Map(p1Units.map((u) => [u.id, u])) }],
      [2, { id: 2, type: PlayerType.Human, units: new Map(p2Units.map((u) => [u.id, u])) }],
    ]),
    currentPlayerId,
    turn: 1,
    nextUnitId: 10,
  };
}

describe("damage preview helpers", () => {
  const unitTypes = createUnitTypes();
  const features: GameFeatures = { support: false, flanking: false };

  it("forecasts attack labels using the same split-damage rules as combat", () => {
    const game = createGame(
      [
        {
          id: createUnitId(1),
          position: createPosition(0, 0),
          typeId: "infantry",
          playerId: 1,
          energy: 10,
          condition: 10,
        },
        {
          id: createUnitId(2),
          position: createPosition(1, 0),
          typeId: "infantry",
          playerId: 1,
          energy: 10,
          condition: 10,
        },
      ],
      [
        {
          id: createUnitId(3),
          position: createPosition(2, 0),
          typeId: "infantry",
          playerId: 2,
          energy: 10,
          condition: 10,
        },
      ]
    );

    const forecasts = buildAttackForecasts(game, unitTypes, features).filter(
      (forecast) => forecast.attackerId === createUnitId(3)
    );

    expect(forecasts).toHaveLength(2);
    expect(forecasts.map((forecast) => forecast.power)).toEqual([2, 2]);
    expect(forecasts.map((forecast) => forecast.damageToEnergy)).toEqual([2, 2]);
  });

  it("previews only damage that lands before a unit owner's next turn", () => {
    const game = createGame(
      [
        {
          id: createUnitId(1),
          position: createPosition(0, 0),
          typeId: "infantry",
          playerId: 1,
          energy: 2,
          condition: 10,
        },
      ],
      [
        {
          id: createUnitId(2),
          position: createPosition(2, 0),
          typeId: "infantry",
          playerId: 2,
          energy: 10,
          condition: 10,
        },
      ],
      1
    );

    const previews = buildUnitDamagePreview(game, unitTypes, features);

    expect(previews.get(createUnitId(1))).toEqual({
      damageToEnergy: 2,
      damageToCondition: 2,
      destroysTarget: false,
    });
    expect(previews.get(createUnitId(2))).toEqual({
      damageToEnergy: 0,
      damageToCondition: 0,
      destroysTarget: false,
    });
  });

  it("marks units that would be destroyed before their next turn", () => {
    const game = createGame(
      [
        {
          id: createUnitId(1),
          position: createPosition(0, 0),
          typeId: "infantry",
          playerId: 1,
          energy: 0,
          condition: 3,
        },
      ],
      [
        {
          id: createUnitId(2),
          position: createPosition(2, 0),
          typeId: "infantry",
          playerId: 2,
          energy: 10,
          condition: 10,
        },
      ],
      1
    );

    const previews = buildUnitDamagePreview(game, unitTypes, features);

    expect(previews.get(createUnitId(1))).toEqual({
      damageToEnergy: 0,
      damageToCondition: 3,
      destroysTarget: true,
    });
  });
});
