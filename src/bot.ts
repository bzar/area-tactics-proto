import { GameProcessor } from "./game";
import { GameEvent } from "./events";
import { Game, Unit, UnitId, UnitType, Player, Position, positionKey, positionsEqual } from "./domain";

// Number of random plans sampled per bot turn.
const SIMULATIONS = 150;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cloneGame(game: Game): Game {
  const players = new Map<number, Player>();
  game.players.forEach((player, id) => {
    const units = new Map<UnitId, Unit>();
    player.units.forEach((unit, uid) => units.set(uid, { ...unit }));
    players.set(id, { ...player, units });
  });
  return { ...game, players };
}

/**
 * Score = Σ(own units) cost*(energy+condition)/(maxEnergy+maxCondition)
 *       - Σ(opponent units) same
 *
 * Higher is better for `playerId`.
 */
function computeScore(
  game: Game,
  unitTypes: Map<string, UnitType>,
  playerId: number
): number {
  let score = 0;
  game.players.forEach((player) => {
    const sign = player.id === playerId ? 1 : -1;
    player.units.forEach((unit) => {
      if (unit.underConstruction) return;
      const ut = unitTypes.get(unit.typeId);
      if (!ut) return;
      score += sign * ut.cost * (unit.energy + unit.condition) / (ut.maxEnergy + ut.maxCondition);
    });
  });
  return score;
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Bot entry point
// ---------------------------------------------------------------------------

/**
 * Plays the current player's full turn on `processor` using a shallow Monte
 * Carlo search and then ends the turn.  All GameEvents are forwarded via
 * `emit`.
 *
 * Algorithm:
 *   1. Sample SIMULATIONS random move plans (random position per unit, respecting
 *      movement range and mutual occupancy).
 *   2. Evaluate each plan by simulating it on a game clone and calling EndTurn,
 *      which triggers start-of-next-turn damage (opponent units attack ours at
 *      our new positions).  The score metric is evaluated on the resulting state.
 *   3. Execute the best plan on the real processor, then end the turn.
 */
export function runBot(
  processor: GameProcessor,
  emit: (event: GameEvent) => void
): void {
  const game = processor.getGame();
  const unitTypes = processor.getUnitTypes();
  const features = processor.getFeatures();
  const playerId = game.currentPlayerId;
  const player = game.players.get(playerId)!;

  // Only consider fully-built units.
  const units = Array.from(player.units.values()).filter((u) => !u.underConstruction);

  if (units.length === 0) {
    processor.handle({ type: "EndTurn" }, emit);
    return;
  }

  // Pre-compute valid destinations for each unit (movement range + current occupancy).
  const validMoves = new Map<UnitId, Position[]>();
  for (const unit of units) {
    validMoves.set(unit.id, processor.getValidMovePositions(unit.id));
  }

  // Baseline occupied set: opponent positions (constant during our turn).
  const opponentOccupied = new Set<string>();
  game.players.forEach((p) => {
    if (p.id !== playerId) {
      p.units.forEach((u) => opponentOccupied.add(positionKey(u.position)));
    }
  });

  let bestPlan: Map<UnitId, Position> | null = null;
  let bestScore = -Infinity;

  for (let sim = 0; sim < SIMULATIONS; sim++) {
    const plan = new Map<UnitId, Position>();
    // Track positions claimed by this plan (starts with opponent positions).
    const occupied = new Set<string>(opponentOccupied);

    for (const unit of shuffled(units)) {
      // Free the unit's current position so it can "stay put" or let others through.
      occupied.delete(positionKey(unit.position));

      const candidates = (validMoves.get(unit.id) ?? []).filter(
        (pos) => !occupied.has(positionKey(pos))
      );

      const chosen =
        candidates.length > 0
          ? candidates[Math.floor(Math.random() * candidates.length)]
          : unit.position;

      plan.set(unit.id, chosen);
      occupied.add(positionKey(chosen));
    }

    // Simulate this plan: clone the game, apply moves, call EndTurn (which
    // triggers damage from opponent units at their current positions).
    const clone = cloneGame(game);
    const sim_proc = new GameProcessor(clone, unitTypes, features);
    const noop = () => {};

    for (const unit of units) {
      const dest = plan.get(unit.id)!;
      sim_proc.handle({ type: "Move", unitId: unit.id, position: dest }, noop);
    }
    sim_proc.handle({ type: "EndTurn" }, noop);

    const score = computeScore(sim_proc.getGame(), unitTypes, playerId);
    if (score > bestScore) {
      bestScore = score;
      bestPlan = new Map(plan);
    }
  }

  // Apply the best plan to the real processor.
  if (bestPlan) {
    for (const unit of units) {
      const dest = bestPlan.get(unit.id)!;
      if (!positionsEqual(dest, unit.position)) {
        processor.handle({ type: "Move", unitId: unit.id, position: dest }, emit);
      }
    }
  }

  processor.handle({ type: "EndTurn" }, emit);
}
