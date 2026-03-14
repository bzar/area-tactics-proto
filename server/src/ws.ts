import type { IncomingMessage } from "http";
import type { Socket } from "net";
import { WebSocketServer, WebSocket } from "ws";
import type { ActionEvent, GameEvent } from "area-tactics";
import { verifyToken } from "./auth.js";
import type { Db } from "./db.js";
import { GameManager } from "./gameManager.js";

const HANDLED_ACTIONS = new Set(["Move", "EndTurn", "OrderBuild", "CancelBuild"]);

export function setupWsUpgrade(wss: WebSocketServer, db: Db, gameManager: GameManager) {
  return (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const gameId = url.searchParams.get("gameId");
    const token = url.searchParams.get("token");

    if (!gameId || !token) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    let userId: number;
    let gamePlayerSlot: number;
    try {
      const payload = verifyToken(token);
      userId = payload.userId;
    } catch {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    const playerRow = db
      .prepare(
        "SELECT game_player_id FROM game_players WHERE game_id = ? AND user_id = ?"
      )
      .get(gameId, userId) as any;

    if (!playerRow) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    gamePlayerSlot = playerRow.game_player_id;

    wss.handleUpgrade(req, socket, head, (ws) => {
      gameManager.addClient(gameId, { ws, userId, gamePlayerSlot });

      ws.send(JSON.stringify({ type: "Connected", gameId, gamePlayerSlot }));

      ws.on("message", (data) => {
        let msg: any;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          ws.send(JSON.stringify({ type: "Error", message: "Invalid JSON" }));
          return;
        }

        if (msg.type === "GetState") {
          handleGetState(gameId, gamePlayerSlot, ws, gameManager);
          return;
        }

        if (!HANDLED_ACTIONS.has(msg.type)) {
          ws.send(JSON.stringify({ type: "Error", message: `Unknown action: ${msg.type}` }));
          return;
        }

        const processor = gameManager.getProcessor(gameId);
        if (!processor) {
          ws.send(JSON.stringify({ type: "Error", message: "Game not found" }));
          return;
        }

        if (processor.getGame().currentPlayerId !== gamePlayerSlot) {
          ws.send(JSON.stringify({ type: "Error", message: "Not your turn" }));
          return;
        }

        const events: GameEvent[] = [];
        const result = processor.handle(msg as ActionEvent, (e) => events.push(e));

        if (!result.ok) {
          ws.send(JSON.stringify({ type: "Error", message: result.error.message }));
          return;
        }

        gameManager.saveGame(gameId);
        for (const event of events) {
          gameManager.broadcast(gameId, event);
        }
      });

      ws.on("close", () => {
        gameManager.removeClient(gameId, ws);
      });
    });
  };
}

function handleGetState(
  gameId: string,
  gamePlayerSlot: number,
  ws: WebSocket,
  gameManager: GameManager
): void {
  const processor = gameManager.getProcessor(gameId);
  if (!processor) {
    ws.send(JSON.stringify({ type: "Error", message: "Game not found" }));
    return;
  }

  const game = processor.getGame();
  ws.send(
    JSON.stringify({
      type: "GameState",
      myGamePlayerId: gamePlayerSlot,
      currentPlayerId: game.currentPlayerId,
      turn: game.turn,
      features: processor.getFeatures(),
      unitTypes: Array.from(processor.getUnitTypes().entries()),
      players: Array.from(game.players.entries()).map(([id, p]) => [
        id,
        {
          id: p.id,
          type: p.type,
          eliminated: p.eliminated,
          units: Array.from(p.units.entries()).map(([uid, u]) => [uid, u]),
        },
      ]),
      gridTiles: game.map.grid.getTiles(),
      mapTiles: Array.from(game.map.tiles.entries()),
      mapBases: Array.from(game.map.bases.entries()),
      unitCapacity: game.map.unitCapacity
        ? Array.from(game.map.unitCapacity.entries())
        : undefined,
    })
  );
}
