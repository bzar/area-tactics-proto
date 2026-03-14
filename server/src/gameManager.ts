import { WebSocket } from "ws";
import { GameProcessor, GameFeatures, defaultUnitTypes, GameEvent } from "area-tactics";
import type { Db } from "./db.js";
import { serializeState, deserializeState } from "./serialization.js";

export interface ClientContext {
  ws: WebSocket;
  userId: number;
  gamePlayerSlot: number;
}

export class GameManager {
  private processors = new Map<string, GameProcessor>();
  private clients = new Map<string, ClientContext[]>();

  constructor(private db: Db) {}

  getProcessor(gameId: string): GameProcessor | null {
    if (this.processors.has(gameId)) return this.processors.get(gameId)!;
    const row = this.db
      .prepare("SELECT state, features FROM games WHERE id = ?")
      .get(gameId) as any;
    if (!row) return null;
    const { game, turnStartPositions } = deserializeState(row.state);
    const features: GameFeatures = JSON.parse(row.features);
    const processor = new GameProcessor(game, defaultUnitTypes(), features, turnStartPositions);
    this.processors.set(gameId, processor);
    return processor;
  }

  saveGame(gameId: string): void {
    const processor = this.processors.get(gameId);
    if (!processor) return;
    const game = processor.getGame();
    const state = serializeState(game, processor.getTurnStartPositions());
    const activePlayers = Array.from(game.players.values()).filter((p) => !p.eliminated);
    const status = activePlayers.length <= 1 ? "ended" : "active";
    this.db
      .prepare("UPDATE games SET state = ?, status = ?, updated_at = unixepoch() WHERE id = ?")
      .run(state, status, gameId);
  }

  addClient(gameId: string, ctx: ClientContext): void {
    if (!this.clients.has(gameId)) this.clients.set(gameId, []);
    this.clients.get(gameId)!.push(ctx);
  }

  removeClient(gameId: string, ws: WebSocket): void {
    const list = this.clients.get(gameId);
    if (!list) return;
    const updated = list.filter((c) => c.ws !== ws);
    if (updated.length === 0) {
      this.clients.delete(gameId);
      this.processors.delete(gameId);
    } else {
      this.clients.set(gameId, updated);
    }
  }

  broadcast(gameId: string, event: GameEvent): void {
    const msg = JSON.stringify(event);
    for (const ctx of this.clients.get(gameId) ?? []) {
      if (ctx.ws.readyState === WebSocket.OPEN) ctx.ws.send(msg);
    }
  }
}
