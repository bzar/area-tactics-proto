import { describe, it, expect } from "vitest";
import { runBot } from "../src/bot";
import { GameProcessor } from "area-tactics";
import { GameEvent } from "area-tactics";
import { loadMap, createGameFromMap, defaultUnitTypes } from "area-tactics";

describe("runBot", () => {
  it("smoke test: both sides play 10 rounds without throwing", { timeout: 30000 }, () => {
    const unitTypes = defaultUnitTypes();
    const mapDef = loadMap("test");
    const game = createGameFromMap(mapDef, unitTypes);
    const processor = new GameProcessor(game, unitTypes, { support: true, flanking: false });

    let gameEnded = false;
    const events: GameEvent[] = [];
    const emit = (e: GameEvent) => {
      events.push(e);
      if (e.type === "GameEnded") gameEnded = true;
    };

    // 20 individual turns = up to 10 full rounds (P1 + P2 each).
    for (let turn = 0; turn < 20 && !gameEnded; turn++) {
      runBot(processor, emit);
    }

    // At least some turns ran and no exception was thrown.
    const turnStarted = events.filter((e) => e.type === "TurnStarted");
    expect(turnStarted.length).toBeGreaterThan(0);

    // All moves should reference valid players.
    const validPlayerIds = new Set(Array.from(game.players.keys()));
    for (const e of events) {
      if (e.type === "UnitMoved" || e.type === "UnitDamaged" || e.type === "UnitDestroyed") {
        expect(validPlayerIds.has((e as any).unit.playerId)).toBe(true);
      }
    }
  });

  it("bot always ends the current player's turn", () => {
    const unitTypes = defaultUnitTypes();
    const game = createGameFromMap(loadMap("test"), unitTypes);
    const processor = new GameProcessor(game, unitTypes, { support: false, flanking: false });

    const initialPlayer = game.currentPlayerId;
    const events: GameEvent[] = [];
    runBot(processor, (e) => events.push(e));

    // Current player must have changed after bot runs.
    expect(game.currentPlayerId).not.toBe(initialPlayer);
    expect(events.some((e) => e.type === "TurnStarted")).toBe(true);
  });
});
