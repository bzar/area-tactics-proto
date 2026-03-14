import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import {
  defaultUnitTypes,
  createGameFromMap,
  loadMap,
  listMaps,
  GameFeatures,
  GameProcessor,
} from "area-tactics";
import { requireAuth, type AuthRequest } from "../auth.js";
import type { Db } from "../db.js";
import { serializeState } from "../serialization.js";

export function gamesRouter(db: Db) {
  const router = Router();
  router.use(requireAuth as any);

  // List available maps
  router.get("/maps", (_req, res) => {
    res.json(listMaps());
  });

  // List games: games I'm in, plus open games I can join
  router.get("/", (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    const rows = db
      .prepare(
        `SELECT g.id, g.map_name, g.status, g.created_at, g.updated_at,
                (SELECT COUNT(*) FROM game_players WHERE game_id = g.id) AS player_count,
                gp.game_player_id AS my_slot
         FROM games g
         LEFT JOIN game_players gp ON g.id = gp.game_id AND gp.user_id = ?
         WHERE gp.game_id IS NOT NULL OR g.status = 'waiting'
         ORDER BY g.updated_at DESC
         LIMIT 50`
      )
      .all(userId);
    res.json(rows);
  });

  // Get a specific game's metadata
  router.get("/:id", (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    const row = db
      .prepare(
        `SELECT g.id, g.map_name, g.status, g.features, g.created_at, g.updated_at,
                gp.game_player_id AS my_slot
         FROM games g
         LEFT JOIN game_players gp ON g.id = gp.game_id AND gp.user_id = ?
         WHERE g.id = ?`
      )
      .get(userId, req.params.id) as any;
    if (!row) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    res.json(row);
  });

  // Create a new game (creator becomes player 1)
  router.post("/", (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    const {
      mapName = "small",
      features = { support: true, flanking: false },
    } = (req.body as any) ?? {};

    let mapDef;
    try {
      mapDef = loadMap(mapName as string);
    } catch {
      res.status(400).json({ error: `Unknown map: ${mapName}` });
      return;
    }

    const unitTypes = defaultUnitTypes();
    const game = createGameFromMap(mapDef, unitTypes);
    const gameFeatures = features as GameFeatures;
    const processor = new GameProcessor(game, unitTypes, gameFeatures);
    const state = serializeState(processor.getGame(), processor.getTurnStartPositions());
    const gameId = uuidv4();

    db.prepare(
      "INSERT INTO games (id, map_name, features, state, status) VALUES (?, ?, ?, ?, 'waiting')"
    ).run(gameId, mapName, JSON.stringify(gameFeatures), state);
    db.prepare(
      "INSERT INTO game_players (game_id, user_id, game_player_id) VALUES (?, ?, 1)"
    ).run(gameId, userId);

    res.status(201).json({ id: gameId, mapName, features: gameFeatures, slot: 1 });
  });

  // Join an open game (joiner becomes player 2)
  router.post("/:id/join", (req: AuthRequest, res) => {
    const userId = req.user!.userId;
    const gameRow = db
      .prepare("SELECT id, status FROM games WHERE id = ?")
      .get(req.params.id) as any;
    if (!gameRow) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    if (gameRow.status !== "waiting") {
      res.status(409).json({ error: "Game is not open for joining" });
      return;
    }

    const existing = db
      .prepare("SELECT game_player_id FROM game_players WHERE game_id = ? AND user_id = ?")
      .get(req.params.id, userId) as any;
    if (existing) {
      res.json({ id: req.params.id, slot: existing.game_player_id });
      return;
    }

    const { cnt } = db
      .prepare("SELECT COUNT(*) AS cnt FROM game_players WHERE game_id = ?")
      .get(req.params.id) as any;
    if (cnt >= 2) {
      res.status(409).json({ error: "Game is full" });
      return;
    }

    const slot = cnt + 1;
    db.prepare(
      "INSERT INTO game_players (game_id, user_id, game_player_id) VALUES (?, ?, ?)"
    ).run(req.params.id, userId, slot);
    db.prepare(
      "UPDATE games SET status = 'active', updated_at = unixepoch() WHERE id = ?"
    ).run(req.params.id);

    res.json({ id: req.params.id, slot });
  });

  return router;
}
