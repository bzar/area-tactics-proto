import { GameProcessor } from "./game";
import { GameEvent } from "./events";
import {
  Game,
  Unit,
  UnitId,
  UnitType,
  Player,
  Position,
  TileFeature,
  ClaimType,
  positionKey,
  positionsEqual,
} from "./domain";

// Number of random plans sampled per bot turn.
const SIMULATIONS = 40;
// Number of random opponent responses to simulate per bot plan (minimax depth 1).
const OPP_SIMS = 8;

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
 *       + 1000 per enemy base occupied by own unit
 *       - 1000 per own base occupied by enemy unit
 *
 * Higher is better for `playerId`.
 */
function computeScore(game: Game, unitTypes: Map<string, UnitType>, playerId: number): number {
  let score = 0;
  game.players.forEach((player) => {
    const sign = player.id === playerId ? 1 : -1;
    player.units.forEach((unit) => {
      if (unit.underConstruction) return;
      const ut = unitTypes.get(unit.typeId);
      if (!ut) return;
      score += (sign * ut.cost * (unit.energy + unit.condition)) / (ut.maxEnergy + ut.maxCondition);
    });
  });

  // Base capture scoring
  const unitAtPos = new Map<string, number>(); // posKey → playerId
  game.players.forEach((player) => {
    player.units.forEach((unit) => {
      if (!unit.underConstruction) unitAtPos.set(positionKey(unit.position), player.id);
    });
  });
  game.map.bases.forEach((basePosArr, baseOwnerId) => {
    for (const basePos of basePosArr) {
      const occupantId = unitAtPos.get(positionKey(basePos));
      if (occupantId === undefined || occupantId === baseOwnerId) continue;
      score += occupantId === playerId ? 1000 : -1000;
    }
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

/**
 * Issue OrderBuild at every facility the current player has a Direct+Unique
 * claim on, choosing a random affordable unit type.
 */
function issueBuildOrders(processor: GameProcessor, emit: (event: GameEvent) => void): void {
  const game = processor.getGame();
  const unitTypes = processor.getUnitTypes();
  const playerId = game.currentPlayerId;

  const capacity = processor.getUnitCapacity(playerId);
  if (capacity === undefined) return;

  const claims = processor.getClaims();
  const allTypes = Array.from(unitTypes.values());

  game.map.tiles.forEach((tile, key) => {
    if (!tile.features.includes(TileFeature.Facility)) return;
    const tileClaims = claims.get(key) ?? [];
    const myClaim = tileClaims.find((c) => c.playerId === playerId);
    const contested = tileClaims.some((c) => c.playerId !== playerId && !c.supportOnly);
    const isDirectUnique =
      !!myClaim && myClaim.claimType === ClaimType.Direct && !myClaim.supportOnly && !contested;
    if (!isDirectUnique) return;

    const load = processor.getUnitLoad(playerId);
    const affordable = allTypes.filter((ut) => load + ut.cost <= capacity);
    if (affordable.length === 0) return;

    const chosen = affordable[Math.floor(Math.random() * affordable.length)];
    processor.handle(
      { type: "OrderBuild", facilityPosition: tile.position, unitTypeId: chosen.id },
      emit
    );
  });
}

// ---------------------------------------------------------------------------
// Bot entry point
// ---------------------------------------------------------------------------

/**
 * Plays the current player's full turn on `processor` using a one-level
 * minimax Monte Carlo search and then ends the turn.  All GameEvents are
 * forwarded via `emit`.
 *
 * Algorithm:
 *   1. Sample SIMULATIONS random move plans (random position per unit,
 *      respecting movement range and mutual occupancy).
 *   2. Evaluate each plan by simulating it on a game clone and calling EndTurn.
 *      Then, for each plan, run OPP_SIMS random opponent responses and take the
 *      minimum (worst-case for us) score — this is the minimax depth-1 lookahead.
 *   3. Execute the plan with the best worst-case score on the real processor,
 *      then end the turn.
 */
export function runBot(processor: GameProcessor, emit: (event: GameEvent) => void): void {
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

  // Keys of enemy base tiles — always included in the bot's own candidate pool so that
  // base captures are never missed by random sampling.
  const enemyBaseKeys = new Set<string>();
  game.map.bases.forEach((positions, ownerId) => {
    if (ownerId !== playerId) positions.forEach((p) => enemyBaseKeys.add(positionKey(p)));
  });

  // Build a candidate destination list for a unit.  Always includes:
  //   • current position    (staying put is always valid)
  //   • reachable base tiles from `priorityKeys`  (base moves are never skipped)
  //   • all other valid moves  (for random exploration)
  // Base tiles appear twice when they're also in validMoves, giving them higher
  // selection probability without being fully deterministic.
  function makeCandidates(
    unit: Unit,
    moves: Position[],
    priorityKeys: Set<string>,
    occupied: Set<string>
  ): Position[] {
    const priority = moves.filter((p) => priorityKeys.has(positionKey(p)));
    return [unit.position, ...priority, ...moves].filter((p) => !occupied.has(positionKey(p)));
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

      const candidates = makeCandidates(
        unit,
        validMoves.get(unit.id) ?? [],
        enemyBaseKeys,
        occupied
      );

      const chosen = candidates[Math.floor(Math.random() * candidates.length)];

      plan.set(unit.id, chosen);
      occupied.add(positionKey(chosen));
    }

    // Simulate this plan on a clone: apply moves then EndTurn.
    const clone = cloneGame(game);
    const sim_proc = new GameProcessor(clone, unitTypes, features);
    const noop = () => {};

    for (const unit of units) {
      const dest = plan.get(unit.id)!;
      sim_proc.handle({ type: "Move", unitId: unit.id, position: dest }, noop);
    }
    sim_proc.handle({ type: "EndTurn" }, noop);

    // Minimax depth-1: simulate OPP_SIMS random opponent responses and take
    // the worst-case score (minimum for us = best for the opponent).
    const midGame = sim_proc.getGame();
    const oppId = midGame.currentPlayerId;
    const oppPlayer = midGame.players.get(oppId);
    const oppUnits = oppPlayer
      ? Array.from(oppPlayer.units.values()).filter((u) => !u.underConstruction)
      : [];

    // Pre-compute opponent valid moves from this mid-game state.
    const oppValidMoves = new Map<UnitId, Position[]>();
    for (const u of oppUnits) {
      oppValidMoves.set(u.id, sim_proc.getValidMovePositions(u.id));
    }

    // Keys of bot's own base tiles — always included in opponent candidate pool so that
    // base-capture threats are never missed by random sampling.
    const botBaseKeys = new Set<string>();
    midGame.map.bases.forEach((positions, ownerId) => {
      if (ownerId !== oppId) positions.forEach((p) => botBaseKeys.add(positionKey(p)));
    });

    // Positions held by our (bot) units after our moves — opponent can't step there.
    const botOccupied = new Set<string>();
    midGame.players.forEach((p) => {
      if (p.id !== oppId) p.units.forEach((u) => botOccupied.add(positionKey(u.position)));
    });

    let worstScore = Infinity;
    for (let oppSim = 0; oppSim < OPP_SIMS; oppSim++) {
      const oppOccupied = new Set<string>(botOccupied);
      const oppClone = cloneGame(midGame);
      const oppProc = new GameProcessor(oppClone, unitTypes, features);

      for (const unit of shuffled(oppUnits)) {
        oppOccupied.delete(positionKey(unit.position));
        const candidates = makeCandidates(
          unit,
          oppValidMoves.get(unit.id) ?? [],
          botBaseKeys,
          oppOccupied
        );
        const dest = candidates[Math.floor(Math.random() * candidates.length)];
        oppOccupied.add(positionKey(dest));
        if (!positionsEqual(dest, unit.position)) {
          oppProc.handle({ type: "Move", unitId: unit.id, position: dest }, noop);
        }
      }
      oppProc.handle({ type: "EndTurn" }, noop);

      const s = computeScore(oppProc.getGame(), unitTypes, playerId);
      if (s < worstScore) worstScore = s;
    }

    const score = oppUnits.length > 0 ? worstScore : computeScore(midGame, unitTypes, playerId);
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

  issueBuildOrders(processor, emit);
  processor.handle({ type: "EndTurn" }, emit);
}
