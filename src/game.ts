import {
  Game,
  Unit,
  UnitType,
  UnitId,
  Position,
  InfluenceMap,
  EffectType,
  DamageType,
  ClaimMap,
  ClaimType,
  TileFeature,
  positionsEqual,
  positionKey,
} from "./domain";
import { ActionEvent, GameEvent, UnitRef } from "./events";

export interface GameFeatures {
  support: boolean;
  flanking: boolean;
}

export type GameEmitter = (event: GameEvent) => void;

export interface GameProcessorError {
  message: string;
}

function unitRef(unit: Unit): UnitRef {
  return { unitId: unit.id, playerId: unit.playerId, typeId: unit.typeId };
}

export class GameProcessor {
  private game: Game;
  private unitTypes: Map<string, UnitType>;
  private influences: InfluenceMap;
  private features: GameFeatures;
  // Tracks each unit's position at the start of the current turn for movement range calculation.
  private turnStartPositions: Map<UnitId, Position> = new Map();

  constructor(
    game: Game,
    unitTypes: Map<string, UnitType>,
    features: GameFeatures = { support: false, flanking: false }
  ) {
    this.game = game;
    this.unitTypes = unitTypes;
    this.features = features;
    this.influences = new InfluenceMap();
    this.recordTurnStartPositions();
    this.recalculateInfluences();
  }

  private recordTurnStartPositions(): void {
    this.turnStartPositions.clear();
    const player = this.game.players.get(this.game.currentPlayerId);
    if (!player) return;
    player.units.forEach((unit) => {
      this.turnStartPositions.set(unit.id, unit.position);
    });
  }

  private recalculateInfluences(): void {
    this.influences.clear();
    const allUnits: Unit[] = [];
    this.game.players.forEach((player) => player.units.forEach((unit) => allUnits.push(unit)));

    for (const influencer of allUnits) {
      const unitType = this.unitTypes.get(influencer.typeId);
      if (!unitType) continue;
      for (const influencee of allUnits) {
        if (influencer.playerId === influencee.playerId) continue;
        const dist = this.game.map.grid.distance(influencer.position, influencee.position);
        if (dist >= unitType.aoiMin && dist <= unitType.aoiMax) {
          this.influences.addInfluence({
            influencerId: influencer.id,
            influenceeId: influencee.id,
          });
        }
      }
    }
  }

  private getAllUnits(): Map<UnitId, Position> {
    const occupied = new Map<UnitId, Position>();
    this.game.players.forEach((player) => {
      player.units.forEach((unit) => {
        occupied.set(unit.id, unit.position);
      });
    });
    return occupied;
  }

  handle(
    action: ActionEvent,
    emit: GameEmitter
  ): { ok: true } | { ok: false; error: GameProcessorError } {
    switch (action.type) {
      case "Move":
        return this.handleMove(action, emit);
      case "EndTurn":
        return this.handleEndTurn(action, emit);
      case "OrderBuild":
        return this.handleOrderBuild(action, emit);
      case "CancelBuild":
        return this.handleCancelBuild(action, emit);
      default: {
        const exhaustive: never = action;
        return exhaustive;
      }
    }
  }

  private handleMove(
    action: { type: "Move"; unitId: UnitId; position: Position },
    emit: GameEmitter
  ): { ok: true } | { ok: false; error: GameProcessorError } {
    const unitId: UnitId = action.unitId;
    const destination: Position = action.position;
    const player = this.game.players.get(this.game.currentPlayerId);

    if (!player) {
      return { ok: false, error: { message: "Current player not found" } };
    }

    const unit = player.units.get(unitId);
    if (!unit) {
      return {
        ok: false,
        error: { message: "Unit not found or does not belong to current player" },
      };
    }

    const unitType = this.unitTypes.get(unit.typeId);
    if (!unitType) {
      return { ok: false, error: { message: `Unknown unit type: ${unit.typeId}` } };
    }

    if (!this.game.map.grid.isInBounds(destination)) {
      return { ok: false, error: { message: "Destination is out of bounds" } };
    }

    const originForThisTurn = this.turnStartPositions.get(unitId) ?? unit.position;
    const distanceFromOrigin = this.game.map.grid.distance(originForThisTurn, destination);
    if (distanceFromOrigin > unitType.movement) {
      return { ok: false, error: { message: "Destination is out of movement range" } };
    }

    const allUnits = this.getAllUnits();
    for (const [occupantId, occupantPos] of allUnits) {
      if (occupantId !== unitId && positionsEqual(occupantPos, destination)) {
        return { ok: false, error: { message: "Destination tile is occupied" } };
      }
    }

    unit.position = destination;
    emit({ type: "UnitMoved", unit: unitRef(unit), position: destination });
    this.recalculateInfluences();
    return { ok: true };
  }

  private handleEndTurn(
    action: { type: "EndTurn" },
    emit: GameEmitter
  ): { ok: true } | { ok: false; error: GameProcessorError } {
    const playerIds = Array.from(this.game.players.keys())
      .filter((id) => !this.game.players.get(id)!.eliminated)
      .sort((a, b) => a - b);
    const currentIndex = playerIds.indexOf(this.game.currentPlayerId);
    const nextIndex = (currentIndex + 1) % playerIds.length;
    const nextPlayerId = playerIds[nextIndex];
    const isNewRound = nextIndex === 0;

    this.game.currentPlayerId = nextPlayerId;
    if (isNewRound) this.game.turn += 1;
    this.recordTurnStartPositions();
    this.recalculateInfluences();

    emit({ type: "TurnStarted", playerId: nextPlayerId, turn: this.game.turn });

    let gameEnded = false;
    const trackingEmit: GameEmitter = (e) => {
      if (e.type === "GameEnded") gameEnded = true;
      emit(e);
    };
    this.resolveConstructionForPlayer(nextPlayerId, trackingEmit);
    this.applyStartOfTurnDamage(nextPlayerId, trackingEmit);
    this.applyStartOfTurnRegen(nextPlayerId, trackingEmit);
    if (!gameEnded) this.checkBaseCapture(trackingEmit);

    return { ok: true };
  }

  private handleOrderBuild(
    action: { type: "OrderBuild"; facilityPosition: Position; unitTypeId: string },
    emit: GameEmitter
  ): { ok: true } | { ok: false; error: GameProcessorError } {
    const player = this.game.players.get(this.game.currentPlayerId);
    if (!player) return { ok: false, error: { message: "Current player not found" } };

    const pos = action.facilityPosition;
    const key = positionKey(pos);
    const tile = this.game.map.tiles.get(key);
    if (!tile || !tile.features.includes(TileFeature.Facility)) {
      return { ok: false, error: { message: "No facility at the given position" } };
    }

    const claims = this.calculateClaims();
    const claimList = claims.get(key);
    const myClaim = claimList?.find((c) => c.playerId === this.game.currentPlayerId);
    const nonSupportContestors =
      claimList?.filter((c) => c.playerId !== this.game.currentPlayerId && !c.supportOnly) ?? [];
    if (!myClaim || myClaim.claimType !== ClaimType.Direct || nonSupportContestors.length > 0) {
      return {
        ok: false,
        error: { message: "Facility is not directly and uniquely claimed by current player" },
      };
    }

    const unitType = this.unitTypes.get(action.unitTypeId);
    if (!unitType)
      return { ok: false, error: { message: `Unknown unit type: ${action.unitTypeId}` } };

    // Cancel any existing build order at this facility first.
    for (const [id, u] of player.units) {
      if (u.underConstruction && positionsEqual(u.position, pos)) {
        const ref = unitRef(u);
        player.units.delete(id);
        emit({ type: "BuildCancelled", unit: ref, facilityPosition: pos });
        break;
      }
    }

    // Check capacity (after cancelling existing order at this tile).
    const capacity = this.getUnitCapacity(this.game.currentPlayerId);
    const load = this.getUnitLoad(this.game.currentPlayerId);
    if (capacity !== undefined && load + unitType.cost > capacity) {
      return { ok: false, error: { message: "Building this unit would exceed unit capacity" } };
    }

    // Check tile is unoccupied.
    for (const [, u] of this.getAllUnits()) {
      if (positionsEqual(u, pos)) {
        return { ok: false, error: { message: "Facility tile is occupied" } };
      }
    }

    const newId = (Math.max(
      0,
      ...Array.from(this.game.players.values()).flatMap((p) => Array.from(p.units.keys()))
    ) + 1) as UnitId;
    const newUnit: Unit = {
      id: newId,
      position: pos,
      typeId: action.unitTypeId,
      playerId: this.game.currentPlayerId,
      energy: unitType.maxEnergy,
      condition: unitType.maxCondition,
      underConstruction: true,
    };
    player.units.set(newId, newUnit);
    emit({ type: "BuildOrdered", unit: unitRef(newUnit), facilityPosition: pos });
    return { ok: true };
  }

  private handleCancelBuild(
    action: { type: "CancelBuild"; facilityPosition: Position },
    emit: GameEmitter
  ): { ok: true } | { ok: false; error: GameProcessorError } {
    const player = this.game.players.get(this.game.currentPlayerId);
    if (!player) return { ok: false, error: { message: "Current player not found" } };

    for (const [id, u] of player.units) {
      if (u.underConstruction && positionsEqual(u.position, action.facilityPosition)) {
        const ref = unitRef(u);
        player.units.delete(id);
        emit({ type: "BuildCancelled", unit: ref, facilityPosition: action.facilityPosition });
        return { ok: true };
      }
    }
    return { ok: false, error: { message: "No build order at the given position" } };
  }

  private resolveConstructionForPlayer(playerId: number, emit: GameEmitter): void {
    const player = this.game.players.get(playerId);
    if (!player) return;

    // Skip if no player has any underConstruction units (fast path for most turns).
    const hasConstruction = Array.from(player.units.values()).some((u) => u.underConstruction);
    if (!hasConstruction) return;

    const claims = this.calculateClaims();
    const toRemove: UnitId[] = [];

    player.units.forEach((unit, id) => {
      if (!unit.underConstruction) return;
      const key = positionKey(unit.position);
      const tile = this.game.map.tiles.get(key);
      const claimList = claims.get(key);
      const myClaim = claimList?.find((c) => c.playerId === playerId);
      const contested = claimList?.some((c) => c.playerId !== playerId && !c.supportOnly) ?? false;
      const stillValid =
        tile?.features.includes(TileFeature.Facility) &&
        myClaim?.claimType === ClaimType.Direct &&
        !myClaim.supportOnly &&
        !contested;

      if (stillValid) {
        unit.underConstruction = false;
        emit({ type: "UnitBuilt", unit: unitRef(unit) });
      } else {
        toRemove.push(id);
        emit({ type: "BuildCancelled", unit: unitRef(unit), facilityPosition: unit.position });
      }
    });

    toRemove.forEach((id) => player.units.delete(id));
  }

  private calculateSupportedTiles(playerId: number): Set<string> {
    const supported = new Set<string>();
    const player = this.game.players.get(playerId);
    if (!player) return supported;

    const basePosArr = this.game.map.bases.get(playerId) ?? [];
    if (basePosArr.length === 0) return supported;

    // Base seeds a 3-tile radius.
    for (const basePos of basePosArr) {
      this.game.map.grid
        .tilesInRange(basePos, 0, 3)
        .forEach((pos) => supported.add(positionKey(pos)));
    }

    // Build convoy AoI lookup once.
    const convoys: Array<{ posKey: string; aoiKeys: string[] }> = [];
    player.units.forEach((unit) => {
      const ut = this.unitTypes.get(unit.typeId);
      if (!ut || ut.effectType !== EffectType.Support) return;
      convoys.push({
        posKey: positionKey(unit.position),
        aoiKeys: this.game.map.grid
          .tilesInRange(unit.position, ut.aoiMin, ut.aoiMax)
          .map(positionKey),
      });
    });

    // Iterative expansion: a convoy on a supported tile propagates support
    // to its entire AoI. Repeat until stable (handles chained convoys).
    let changed = true;
    while (changed) {
      changed = false;
      for (const convoy of convoys) {
        if (!supported.has(convoy.posKey)) continue;
        for (const key of convoy.aoiKeys) {
          if (!supported.has(key)) {
            supported.add(key);
            changed = true;
          }
        }
      }
    }

    return supported;
  }

  private applyStartOfTurnRegen(activePlayerId: number, emit: GameEmitter): void {
    const activePlayer = this.game.players.get(activePlayerId);
    if (!activePlayer) return;

    const supportedTiles = this.features.support
      ? this.calculateSupportedTiles(activePlayerId)
      : new Set<string>();

    activePlayer.units.forEach((unit) => {
      const unitType = this.unitTypes.get(unit.typeId);
      if (!unitType) return;

      const underOpponentInfluence = Array.from(this.influences.getUnitsInfluencing(unit.id)).some(
        (influencerId) => {
          for (const [playerId, player] of this.game.players) {
            if (playerId !== activePlayerId && player.units.has(influencerId)) return true;
          }
          return false;
        }
      );

      const isSupported = supportedTiles.has(positionKey(unit.position));
      const regenAmount = (isSupported ? 1 : 0) + (!underOpponentInfluence ? 1 : 0);
      if (regenAmount > 0) {
        const newEnergy = Math.min(unit.energy + regenAmount, unitType.maxEnergy);
        const actualRegen = newEnergy - unit.energy;
        if (actualRegen > 0) {
          unit.energy = newEnergy;
          emit({
            type: "EnergyRegenerated",
            unit: unitRef(unit),
            amount: actualRegen,
            supported: isSupported,
          });
        }
      }
    });
  }

  private isFlanking(attacker: Unit, target: Unit): boolean {
    const attackerType = this.unitTypes.get(attacker.typeId);
    if (!attackerType || attackerType.effectType !== EffectType.Direct) return false;

    const attackerPlayer = this.game.players.get(attacker.playerId);
    if (!attackerPlayer) return false;

    for (const [, unit] of attackerPlayer.units) {
      if (unit.id === attacker.id) continue;
      const unitType = this.unitTypes.get(unit.typeId);
      if (!unitType || unitType.effectType === EffectType.Support) continue;

      const distToTarget = this.game.map.grid.distance(unit.position, target.position);
      if (distToTarget < unitType.aoiMin || distToTarget > unitType.aoiMax) continue;

      const distToAttacker = this.game.map.grid.distance(unit.position, attacker.position);
      if (distToAttacker >= unitType.aoiMin && distToAttacker <= unitType.aoiMax) continue;

      return true;
    }
    return false;
  }

  private applyStartOfTurnDamage(activePlayerId: number, emit: GameEmitter): void {
    const activePlayer = this.game.players.get(activePlayerId);
    if (!activePlayer) return;

    activePlayer.units.forEach((attacker) => {
      const unitType = this.unitTypes.get(attacker.typeId);
      if (!unitType || unitType.power === 0) return;

      const influencedIds = this.influences.getUnitsInfluencedBy(attacker.id);
      const targets: Unit[] = [];
      this.game.players.forEach((player) => {
        if (player.id === activePlayerId) return;
        influencedIds.forEach((id) => {
          const unit = player.units.get(id);
          if (unit) targets.push(unit);
        });
      });

      if (targets.length === 0) return;

      const isMulti = targets.length > 1;

      targets.forEach((target) => {
        const flanking = this.features.flanking && this.isFlanking(attacker, target);
        const damageType =
          isMulti && flanking
            ? DamageType.SplitAndFlanked
            : isMulti
              ? DamageType.Split
              : flanking
                ? DamageType.Flanked
                : DamageType.Normal;
        const power =
          damageType === DamageType.SplitAndFlanked
            ? unitType.power
            : damageType === DamageType.Split
              ? Math.floor(unitType.power / 2)
              : damageType === DamageType.Flanked
                ? Math.floor((unitType.power * 3) / 2)
                : unitType.power;

        const opponentPlayer = this.game.players.get(target.playerId)!;
        const damageToEnergy = Math.min(power, target.energy);
        const damageToCondition = power - damageToEnergy;
        target.energy -= damageToEnergy;
        target.condition -= damageToCondition;
        emit({
          type: "UnitDamaged",
          unit: unitRef(target),
          attacker: unitRef(attacker),
          damageType,
          power,
          damageToEnergy,
          damageToCondition,
        });
        if (target.condition <= 0) {
          opponentPlayer.units.delete(target.id);
          emit({ type: "UnitDestroyed", unit: unitRef(target), destroyedBy: unitRef(attacker) });
          if (opponentPlayer.units.size === 0) {
            this.eliminatePlayer(opponentPlayer.id, emit);
          }
        }
      });
    });
  }

  getSupportedTiles(playerId: number): Set<string> {
    if (!this.features.support) return new Set();
    return this.calculateSupportedTiles(playerId);
  }

  getUnitLoad(playerId: number): number {
    const player = this.game.players.get(playerId);
    if (!player) return 0;
    let load = 0;
    player.units.forEach((unit) => {
      load += this.unitTypes.get(unit.typeId)?.cost ?? 0;
    });
    return load;
  }

  getUnitCapacity(playerId: number): number | undefined {
    const base = this.game.map.unitCapacity?.get(playerId);
    if (base === undefined) return undefined;

    const claims = this.calculateClaims();
    let depotBonus = 0;
    this.game.map.tiles.forEach((tile, key) => {
      if (!tile.features.includes(TileFeature.Depot)) return;
      const claimList = claims.get(key);
      if (!claimList) return;
      const myClaim = claimList.find((c) => c.playerId === playerId);
      if (!myClaim || myClaim.claimType !== ClaimType.Direct) return;
      // Contested = another player has a non-support-only Direct claim on this tile
      const contested = claimList.some((c) => c.playerId !== playerId && !c.supportOnly);
      depotBonus += contested ? 1 : 2;
    });

    return base + depotBonus;
  }

  getGame(): Game {
    return this.game;
  }

  getUnitTypes(): Map<string, UnitType> {
    return this.unitTypes;
  }

  getFeatures(): GameFeatures {
    return this.features;
  }

  getInfluences(): InfluenceMap {
    return this.influences;
  }

  getValidMovePositions(unitId: UnitId): Position[] {
    const player = this.game.players.get(this.game.currentPlayerId);
    if (!player) return [];
    const unit = player.units.get(unitId);
    if (!unit) return [];
    const unitType = this.unitTypes.get(unit.typeId);
    if (!unitType) return [];
    const origin = this.turnStartPositions.get(unitId) ?? unit.position;
    const occupied = this.getAllUnits();
    return this.game.map.grid.tilesInRange(origin, 0, unitType.movement).filter((pos) => {
      for (const [occupantId, occupantPos] of occupied) {
        if (occupantId !== unitId && positionsEqual(occupantPos, pos)) return false;
      }
      return true;
    });
  }

  getClaims(): ClaimMap {
    return this.calculateClaims();
  }

  private calculateClaims(): ClaimMap {
    const claims: ClaimMap = new Map();

    this.game.players.forEach((player) => {
      const playerId = player.id;
      const basePosArr = this.game.map.bases.get(playerId) ?? [];
      if (basePosArr.length === 0) return;
      const baseKeys = new Set(basePosArr.map(positionKey));

      // Collect tiles influenced by this player's units.
      // All unit types (including Support) contribute to territory claims via the BFS.
      // Non-Support units additionally populate nonSupportInfluencedTiles, which is used
      // to flag whether a claim is support-only (and thus excluded from uniqueness checks).
      const ownInfluencedTiles = new Set<string>();
      const directInfluencedTiles = new Set<string>();
      const nonSupportInfluencedTiles = new Set<string>();
      player.units.forEach((unit) => {
        const ut = this.unitTypes.get(unit.typeId);
        if (!ut) return;
        this.game.map.grid.tilesInRange(unit.position, ut.aoiMin, ut.aoiMax).forEach((pos) => {
          const key = positionKey(pos);
          ownInfluencedTiles.add(key);
          if (ut.effectType !== EffectType.Support) nonSupportInfluencedTiles.add(key);
          if (ut.effectType === EffectType.Direct) directInfluencedTiles.add(key);
        });
      });

      // BFS flood-fill from base; each reachable tile is claimed.
      const visited = new Set<string>();
      const queue: Position[] = [...basePosArr];
      basePosArr.forEach((bp) => visited.add(positionKey(bp)));

      while (queue.length > 0) {
        const pos = queue.shift()!;
        const key = positionKey(pos);

        const isBase = baseKeys.has(key);
        const claimType =
          isBase || directInfluencedTiles.has(key) ? ClaimType.Direct : ClaimType.Indirect;
        const supportOnly = !isBase && !nonSupportInfluencedTiles.has(key);

        if (!claims.has(key)) claims.set(key, []);
        claims.get(key)!.push({ playerId, claimType, supportOnly: supportOnly || undefined });

        for (const nb of this.game.map.grid.neighbors(pos)) {
          const nbKey = positionKey(nb);
          if (!visited.has(nbKey) && ownInfluencedTiles.has(nbKey)) {
            visited.add(nbKey);
            queue.push(nb);
          }
        }
      }
    });

    return claims;
  }

  private eliminatePlayer(playerId: number, emit: GameEmitter): void {
    const player = this.game.players.get(playerId);
    if (!player || player.eliminated) return;
    player.eliminated = true;
    emit({ type: "PlayerEliminated", playerId });
    this.checkForWinner(emit);
  }

  private checkForWinner(emit: GameEmitter): void {
    const remaining = Array.from(this.game.players.values()).filter((p) => !p.eliminated);
    if (remaining.length === 1) {
      emit({ type: "GameEnded", winnerId: remaining[0].id });
    }
  }

  private checkBaseCapture(emit: GameEmitter): void {
    for (const [playerId, basePosArr] of this.game.map.bases) {
      if (basePosArr.length === 0) continue;
      const player = this.game.players.get(playerId);
      if (!player || player.eliminated) continue;
      const allOccupied = basePosArr.every((basePos) => {
        const baseKey = positionKey(basePos);
        for (const [otherPlayerId, otherPlayer] of this.game.players) {
          if (otherPlayerId === playerId) continue;
          for (const [, unit] of otherPlayer.units) {
            if (positionKey(unit.position) === baseKey) return true;
          }
        }
        return false;
      });
      if (allOccupied) {
        this.eliminatePlayer(playerId, emit);
        return;
      }
    }
  }
}
