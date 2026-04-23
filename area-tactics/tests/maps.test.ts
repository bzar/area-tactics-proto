import { describe, it, expect } from "vitest";
import { loadMap, defaultUnitTypes, createGameFromMap } from "../src/maps";

describe("loadMap", () => {
  it("throws for an unknown map name", () => {
    expect(() => loadMap("unknown")).toThrow();
  });

  it("returns the 'test' map with name 'test'", () => {
    const def = loadMap("test");
    expect(def.name).toBe("test");
  });

  it("'test' map has 600 tiles (30 columns × 20 rows)", () => {
    const { grid } = loadMap("test");
    expect(grid.tileCount).toBe(600);
  });

  it("'test' map has 5 infantry per player", () => {
    const { unitPlacements } = loadMap("test");
    for (const playerId of [1, 2]) {
      const count = unitPlacements.filter(
        (p) => p.playerId === playerId && p.typeId === "infantry"
      ).length;
      expect(count).toBe(5);
    }
  });

  it("'test' map has 5 mortars per player", () => {
    const { unitPlacements } = loadMap("test");
    for (const playerId of [1, 2]) {
      const count = unitPlacements.filter(
        (p) => p.playerId === playerId && p.typeId === "mortar"
      ).length;
      expect(count).toBe(5);
    }
  });

  it("'test' map has 5 scouts per player", () => {
    const { unitPlacements } = loadMap("test");
    for (const playerId of [1, 2]) {
      const count = unitPlacements.filter(
        (p) => p.playerId === playerId && p.typeId === "scout"
      ).length;
      expect(count).toBe(5);
    }
  });

  it("'test' map has 5 convoys per player", () => {
    const { unitPlacements } = loadMap("test");
    for (const playerId of [1, 2]) {
      const count = unitPlacements.filter(
        (p) => p.playerId === playerId && p.typeId === "convoy"
      ).length;
      expect(count).toBe(5);
    }
  });

  it("all unit placements are within grid bounds", () => {
    const def = loadMap("test");
    for (const p of def.unitPlacements) {
      expect(def.grid.isInBounds(p.position)).toBe(true);
    }
  });

  it("no two units share a starting position", () => {
    const { unitPlacements } = loadMap("test");
    const seen = new Set<string>();
    for (const p of unitPlacements) {
      const key = `${p.position.q},${p.position.r}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

describe("defaultUnitTypes", () => {
  it("provides all five unit types", () => {
    const types = defaultUnitTypes();
    expect(types.has("infantry")).toBe(true);
    expect(types.has("mortar")).toBe(true);
    expect(types.has("scout")).toBe(true);
    expect(types.has("tank")).toBe(true);
    expect(types.has("convoy")).toBe(true);
  });
});

describe("createGameFromMap", () => {
  it("creates a game with the correct unit counts and full energy/condition", () => {
    const def = loadMap("test");
    const unitTypes = defaultUnitTypes();
    const game = createGameFromMap(def, unitTypes);

    expect(game.players.size).toBe(2);
    expect(game.players.get(1)!.units.size).toBe(20);
    expect(game.players.get(2)!.units.size).toBe(20);
    expect(game.currentPlayerId).toBe(1);
    expect(game.turn).toBe(1);

    game.players.forEach((player) => {
      player.units.forEach((unit) => {
        const unitType = unitTypes.get(unit.typeId)!;
        expect(unit.energy).toBe(unitType.maxEnergy);
        expect(unit.condition).toBe(unitType.maxCondition);
      });
    });
  });
});
