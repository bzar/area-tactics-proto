import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import { initDb } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { gamesRouter } from "./routes/games.js";
import { GameManager } from "./gameManager.js";
import { setupWsUpgrade } from "./ws.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = process.env.STATIC_DIR ?? path.join(__dirname, "../../public");

const app = express();
app.use(express.json());

const db = initDb();
const gameManager = new GameManager(db);

app.use("/auth", authRouter(db));
app.use("/games", gamesRouter(db));

app.get("/health", (_req, res) => res.json({ ok: true }));

// Runtime server-URL injection — overrides the compile-time VITE_SERVER_URL baked
// into the client bundle. Set SERVER_URL env var to point clients at the right host.
// An empty value makes the client fall back to window.location.origin (same-origin).
app.get("/config.js", (_req, res) => {
  const serverUrl = process.env.SERVER_URL ?? "";
  res.type("application/javascript");
  res.send(`window.__AREA_TACTICS_SERVER_URL__=${JSON.stringify(serverUrl)};`);
});

// Serve static files as a fallback (e.g. the built client)
app.use(express.static(STATIC_DIR));

const httpServer = createServer(app);
const wss = new WebSocketServer({ noServer: true });

httpServer.on("upgrade", setupWsUpgrade(wss, db, gameManager) as any);

const PORT = Number(process.env.PORT ?? 3000);
httpServer.listen(PORT, () => {
  console.log(`area-tactics server running on port ${PORT}`);
  console.log(`Static files served from: ${STATIC_DIR}`);
});
