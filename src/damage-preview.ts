import {
  DamageType,
  EffectType,
  Game,
  GameFeatures,
  GameProcessor,
  Player,
  Unit,
  UnitId,
  UnitType,
} from "area-tactics";

export interface AttackForecast {
  attackerId: UnitId;
  attackerPlayerId: number;
  targetId: UnitId;
  targetPlayerId: number;
  damageType: DamageType;
  power: number;
  damageToEnergy: number;
  damageToCondition: number;
  destroysTarget: boolean;
}

export interface UnitDamagePreview {
  damageToEnergy: number;
  damageToCondition: number;
  destroysTarget: boolean;
}

function cloneGame(game: Game): Game {
  const players = new Map<number, Player>();
  game.players.forEach((player, id) => {
    const units = new Map<UnitId, Unit>();
    player.units.forEach((unit, uid) => units.set(uid, { ...unit }));
    players.set(id, { ...player, units });
  });
  return { ...game, players };
}

function isFlanking(
  game: Game,
  unitTypes: Map<string, UnitType>,
  attacker: Unit,
  target: Unit
): boolean {
  const attackerType = unitTypes.get(attacker.typeId);
  if (!attackerType || attackerType.effectType !== EffectType.Direct) return false;

  const attackerPlayer = game.players.get(attacker.playerId);
  if (!attackerPlayer) return false;

  for (const [, unit] of attackerPlayer.units) {
    if (unit.id === attacker.id) continue;
    const unitType = unitTypes.get(unit.typeId);
    if (!unitType || unitType.effectType === EffectType.Support) continue;

    const distToTarget = game.map.grid.distance(unit.position, target.position);
    if (distToTarget < unitType.aoiMin || distToTarget > unitType.aoiMax) continue;

    const distToAttacker = game.map.grid.distance(unit.position, attacker.position);
    if (distToAttacker >= unitType.aoiMin && distToAttacker <= unitType.aoiMax) continue;

    return true;
  }
  return false;
}

function applyAttackPhase(
  game: Game,
  unitTypes: Map<string, UnitType>,
  features: GameFeatures,
  activePlayerId: number
): AttackForecast[] {
  const processor = new GameProcessor(game, unitTypes, features);
  const influences = processor.getInfluences();
  const activePlayer = game.players.get(activePlayerId);
  if (!activePlayer) return [];

  const forecasts: AttackForecast[] = [];

  activePlayer.units.forEach((attacker) => {
    if (attacker.underConstruction) return;

    const unitType = unitTypes.get(attacker.typeId);
    if (!unitType || unitType.power === 0) return;

    const influencedIds = influences.getUnitsInfluencedBy(attacker.id);
    const targets: Unit[] = [];
    game.players.forEach((player) => {
      if (player.id === activePlayerId) return;
      influencedIds.forEach((targetId) => {
        const target = player.units.get(targetId);
        if (target && !target.underConstruction) targets.push(target);
      });
    });

    if (targets.length === 0) return;

    const isMulti = targets.length > 1;
    targets.forEach((target) => {
      const flanking = features.flanking && isFlanking(game, unitTypes, attacker, target);
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

      const damageToEnergy = Math.min(power, target.energy);
      const damageToCondition = power - damageToEnergy;
      target.energy -= damageToEnergy;
      target.condition -= damageToCondition;

      forecasts.push({
        attackerId: attacker.id,
        attackerPlayerId: attacker.playerId,
        targetId: target.id,
        targetPlayerId: target.playerId,
        damageType,
        power,
        damageToEnergy,
        damageToCondition,
        destroysTarget: target.condition <= 0,
      });

      if (target.condition <= 0) {
        game.players.get(target.playerId)?.units.delete(target.id);
      }
    });
  });

  return forecasts;
}

function upcomingPlayerOrder(game: Game): number[] {
  const playerIds = Array.from(game.players.keys())
    .filter((id) => !game.players.get(id)?.eliminated)
    .sort((a, b) => a - b);
  const currentIndex = playerIds.indexOf(game.currentPlayerId);
  if (currentIndex < 0) return playerIds;
  return [...playerIds.slice(currentIndex + 1), ...playerIds.slice(0, currentIndex + 1)];
}

export function buildAttackForecasts(
  game: Game,
  unitTypes: Map<string, UnitType>,
  features: GameFeatures
): AttackForecast[] {
  const forecasts: AttackForecast[] = [];
  Array.from(game.players.keys())
    .filter((id) => !game.players.get(id)?.eliminated)
    .sort((a, b) => a - b)
    .forEach((playerId) => {
      forecasts.push(...applyAttackPhase(cloneGame(game), unitTypes, features, playerId));
    });
  return forecasts;
}

export function buildUnitDamagePreview(
  game: Game,
  unitTypes: Map<string, UnitType>,
  features: GameFeatures
): Map<UnitId, UnitDamagePreview> {
  const initialStats = new Map<UnitId, { energy: number; condition: number }>();
  game.players.forEach((player) => {
    player.units.forEach((unit) => {
      initialStats.set(unit.id, { energy: unit.energy, condition: unit.condition });
    });
  });

  const simulation = cloneGame(game);
  const previews = new Map<UnitId, UnitDamagePreview>();

  for (const activePlayerId of upcomingPlayerOrder(simulation)) {
    if (activePlayerId === simulation.currentPlayerId) break;

    applyAttackPhase(simulation, unitTypes, features, activePlayerId);
  }

  initialStats.forEach(({ energy, condition }, unitId) => {
    let finalUnit: Unit | undefined;
    simulation.players.forEach((player) => {
      if (!finalUnit) finalUnit = player.units.get(unitId);
    });

    const finalEnergy = finalUnit?.energy ?? 0;
    const finalCondition = finalUnit?.condition ?? 0;
    previews.set(unitId, {
      damageToEnergy: energy - finalEnergy,
      damageToCondition: condition - finalCondition,
      destroysTarget: !finalUnit || finalCondition <= 0,
    });
  });

  return previews;
}
