import { UnitId, Position, DamageType } from "./domain";

// ============================================================================
// Action Events - User intents that change game state
// ============================================================================

export type ActionEvent = MoveAction | EndTurnAction | UnitSelectedAction | SelectionClearedAction | OrderBuildAction | CancelBuildAction;

export interface MoveAction {
  type: "Move";
  unitId: UnitId;
  position: Position;
}

export interface EndTurnAction {
  type: "EndTurn";
}

export interface UnitSelectedAction {
  type: "UnitSelected";
  unitId: UnitId;
  validDestinations: Position[];
}

export interface SelectionClearedAction {
  type: "SelectionCleared";
}

export interface OrderBuildAction {
  type: "OrderBuild";
  facilityPosition: Position;
  unitTypeId: string;
}

export interface CancelBuildAction {
  type: "CancelBuild";
  facilityPosition: Position;
}

// ============================================================================
// Game Events - Mechanical outcomes ready for visualization
// ============================================================================

// Included on any event that concerns a unit so the UI doesn't need a registry.
export interface UnitRef {
  unitId: UnitId;
  playerId: number;
  typeId: string;
}

export type GameEvent =
  | UnitMovedEvent
  | UnitDamagedEvent
  | EnergyRegeneratedEvent
  | UnitDestroyedEvent
  | TurnStartedEvent
  | GameEndedEvent
  | BuildOrderedEvent
  | UnitBuiltEvent
  | BuildCancelledEvent;

export interface UnitMovedEvent {
  type: "UnitMoved";
  unit: UnitRef;
  position: Position;
}

export interface UnitDamagedEvent {
  type: "UnitDamaged";
  unit: UnitRef;
  attacker: UnitRef;
  damageType: DamageType;
  power: number;
  damageToEnergy: number;
  damageToCondition: number;
}

export interface EnergyRegeneratedEvent {
  type: "EnergyRegenerated";
  unit: UnitRef;
  amount: number;
  supported: boolean;
}

export interface UnitDestroyedEvent {
  type: "UnitDestroyed";
  unit: UnitRef;
  destroyedBy: UnitRef;
}

export interface TurnStartedEvent {
  type: "TurnStarted";
  playerId: number;
  turn: number;
}

export interface GameEndedEvent {
  type: "GameEnded";
  winnerId: number;
}

export interface BuildOrderedEvent {
  type: "BuildOrdered";
  unit: UnitRef;
  facilityPosition: Position;
}

export interface UnitBuiltEvent {
  type: "UnitBuilt";
  unit: UnitRef;
}

export interface BuildCancelledEvent {
  type: "BuildCancelled";
  unit: UnitRef;
  facilityPosition: Position;
}

