import { UnitId, Position, positionsEqual } from "area-tactics";
import { ActionEvent } from "area-tactics";
import { GameProcessor } from "area-tactics";

// ============================================================================
// Input Events - Tile-coordinate user input within the game's context
// ============================================================================

export type InputEvent = TileDownEvent | EndTurnInputEvent;

export interface TileDownEvent {
  type: "TileDown";
  position: Position;
}

export interface EndTurnInputEvent {
  type: "EndTurn";
}

export type ActionEmitter = (event: ActionEvent) => void;

export interface InputProcessorError {
  message: string;
}

export class InputProcessor {
  private selectedUnitId: UnitId | null = null;
  private validDestinations: Position[] = [];

  handle(
    input: InputEvent,
    gameProcessor: GameProcessor,
    emit: ActionEmitter
  ): { ok: true } | { ok: false; error: InputProcessorError } {
    switch (input.type) {
      case "TileDown":
        return this.handleTileDown(input.position, gameProcessor, emit);
      case "EndTurn":
        return this.handleEndTurn(emit);
      default: {
        const exhaustive: never = input;
        return exhaustive;
      }
    }
  }

  private handleTileDown(
    position: Position,
    gameProcessor: GameProcessor,
    emit: ActionEmitter
  ): { ok: true } | { ok: false; error: InputProcessorError } {
    const game = gameProcessor.getGame();
    const currentPlayer = game.players.get(game.currentPlayerId);
    if (!currentPlayer) return { ok: false, error: { message: "No current player" } };

    let ownUnitAtTile: UnitId | null = null;
    currentPlayer.units.forEach((unit) => {
      if (positionsEqual(unit.position, position)) ownUnitAtTile = unit.id;
    });

    if (this.selectedUnitId !== null) {
      if (ownUnitAtTile === this.selectedUnitId) {
        // Re-click selected unit → deselect
        this.clearSelection();
        emit({ type: "SelectionCleared" });
      } else if (ownUnitAtTile !== null) {
        // Different own unit → switch selection
        this.selectUnit(ownUnitAtTile, gameProcessor, emit);
      } else if (this.validDestinations.some((p) => positionsEqual(p, position))) {
        // Valid move destination
        emit({ type: "Move", unitId: this.selectedUnitId, position });
        this.clearSelection();
      } else {
        // Invalid tile → deselect
        this.clearSelection();
        emit({ type: "SelectionCleared" });
      }
    } else {
      if (ownUnitAtTile !== null) {
        this.selectUnit(ownUnitAtTile, gameProcessor, emit);
      }
      // Clicking empty tile or opponent unit with nothing selected → no-op
    }

    return { ok: true };
  }

  private handleEndTurn(emit: ActionEmitter): { ok: true } {
    if (this.selectedUnitId !== null) {
      this.clearSelection();
      emit({ type: "SelectionCleared" });
    }
    emit({ type: "EndTurn" });
    return { ok: true };
  }

  private selectUnit(unitId: UnitId, gameProcessor: GameProcessor, emit: ActionEmitter): void {
    const destinations = gameProcessor.getValidMovePositions(unitId);
    this.selectedUnitId = unitId;
    this.validDestinations = destinations;
    emit({ type: "UnitSelected", unitId, validDestinations: destinations });
  }

  private clearSelection(): void {
    this.selectedUnitId = null;
    this.validDestinations = [];
  }

  clearSelection(): void {
    this.selectedUnitId = null;
    this.validDestinations = [];
  }

  getSelectedUnitId(): UnitId | null {
    return this.selectedUnitId;
  }

  getValidDestinations(): Position[] {
    return this.validDestinations;
  }
}
