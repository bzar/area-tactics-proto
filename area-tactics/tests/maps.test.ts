import { describe, it, expect } from "vitest";
import { loadMap, defaultUnitTypes, createGameFromMap, parseMapJson } from "../src/maps";
import type { MapJson } from "../src/maps";

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

describe("removedTiles", () => {
  function makeJson(removedTiles?: Array<{ q: number; r: number }>): MapJson {
    return {
      meta: { name: "test-removed", label: "Test" },
      data: {
        grid: { type: "rect", cols: 3, rows: 3, removedTiles },
        units: [],
        tiles: [],
      },
    };
  }

  it("a 3×3 grid without removedTiles has 9 tiles", () => {
    const def = parseMapJson(makeJson());
    expect(def.grid.tileCount).toBe(9);
  });

  it("removing one tile reduces tile count by 1", () => {
    const def = parseMapJson(makeJson([{ q: 0, r: 0 }]));
    expect(def.grid.tileCount).toBe(8);
  });

  it("removed tile is not in bounds", () => {
    const def = parseMapJson(makeJson([{ q: 0, r: 0 }]));
    expect(def.grid.isInBounds({ q: 0, r: 0 })).toBe(false);
  });

  it("non-removed tiles remain in bounds", () => {
    const def = parseMapJson(makeJson([{ q: 0, r: 0 }]));
    expect(def.grid.isInBounds({ q: 1, r: 0 })).toBe(true);
  });

  it("removing multiple tiles reduces count correctly", () => {
    const def = parseMapJson(makeJson([{ q: 0, r: 0 }, { q: 2, r: -1 }]));
    expect(def.grid.tileCount).toBe(7);
  });
});

describe("spiral map", () => {
  it("loads the spiral map", () => {
    const def = loadMap("spiral");
    expect(def.name).toBe("spiral");
  });

  it("spiral map has fewer tiles than a full 13×12 rectangle due to removed tiles", () => {
    const def = loadMap("spiral");
    expect(def.grid.tileCount).toBe(13 * 12 - 2);
  });

  it("spiral map removed tiles are not in bounds", () => {
    const { grid } = loadMap("spiral");
    // These are the two removed corner tiles
    expect(grid.isInBounds({ q: 0, r: 0 })).toBe(false);
    expect(grid.isInBounds({ q: 12, r: 5 })).toBe(false);
  });

  it("spiral map has unit capacity of 20 per player", () => {
    const def = loadMap("spiral");
    expect(def.unitCapacity).toBeDefined();
    expect(def.unitCapacity![1]).toBe(20);
    expect(def.unitCapacity![2]).toBe(20);
  });

  it("spiral map has one infantry per player", () => {
    const { unitPlacements } = loadMap("spiral");
    for (const playerId of [1, 2]) {
      const count = unitPlacements.filter(
        (p) => p.playerId === playerId && p.typeId === "infantry"
      ).length;
      expect(count).toBe(1);
    }
  });

  it("spiral map unit placements are within grid bounds", () => {
    const def = loadMap("spiral");
    for (const p of def.unitPlacements) {
      expect(def.grid.isInBounds(p.position)).toBe(true);
    }
  });

  it("spiral map has two bases, one per player", () => {
    const def = loadMap("spiral");
    const game = createGameFromMap(def, defaultUnitTypes());
    expect(game.map.bases.get(1)?.length).toBe(1);
    expect(game.map.bases.get(2)?.length).toBe(1);
  });

  it("spiral map bases are at opposite corners", () => {
    const def = loadMap("spiral");
    const p1Base = def.tilePlacements?.find(
      (t) => t.features.includes("Base" as never) && t.baseForPlayerId === 1
    );
    const p2Base = def.tilePlacements?.find(
      (t) => t.features.includes("Base" as never) && t.baseForPlayerId === 2
    );
    expect(p1Base).toBeDefined();
    expect(p2Base).toBeDefined();
    // P1 base is at bottom-left, P2 base is at top-right
    expect(p1Base!.position).toEqual({ q: 0, r: 11 });
    expect(p2Base!.position).toEqual({ q: 12, r: -6 });
  });

  it("spiral map has facilities and depots", () => {
    const { tilePlacements } = loadMap("spiral");
    const facilities = tilePlacements?.filter((t) => t.features.includes("Facility" as never));
    const depots = tilePlacements?.filter((t) => t.features.includes("Depot" as never));
    expect(facilities?.length).toBeGreaterThan(0);
    expect(depots?.length).toBeGreaterThan(0);
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
