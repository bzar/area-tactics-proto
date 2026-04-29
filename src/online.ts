import {
  GameProcessor,
  GameFeatures,
  Game,
  GameMap,
  Player,
  Unit,
  UnitId,
  PlayerType,
  HexGrid,
  Tile,
  UnitType,
  Position,
} from "area-tactics";
import type { ActionEvent } from "area-tactics";

// Populated by Vite at build time from the VITE_SERVER_URL env variable.
// Overridden at runtime by the server's /config.js route (SERVER_URL env var).
function resolveDefaultServerUrl(): string {
  if (typeof window !== "undefined") {
    const runtime = (window as any).__AREA_TACTICS_SERVER_URL__;
    if (runtime) return runtime;
  }
  const buildTime = (import.meta.env as Record<string, string | undefined>).VITE_SERVER_URL;
  if (buildTime) return buildTime;
  if (typeof window !== "undefined") {
    // Derive the app base from the current page URL so subdirectory proxy
    // setups (e.g. "location /game/ { proxy_pass ...; }") work correctly.
    const p = window.location.pathname;
    const dir = p.endsWith("/") ? p.slice(0, -1) : p.replace(/\/[^/]*$/, "");
    return window.location.origin + dir;
  }
  return "http://localhost:3000";
}

export const DEFAULT_SERVER_URL: string = resolveDefaultServerUrl();

export interface GameListEntry {
  id: string;
  map_name: string;
  status: string;
  player_count: number;
  my_slot: number | null;
}

export interface MapListEntry {
  name: string;
  label: string;
}

export class OnlineClient {
  private token: string | null = null;
  private ws: WebSocket | null = null;

  constructor(public readonly serverUrl: string = DEFAULT_SERVER_URL) {
    this.serverUrl = serverUrl.replace(/\/$/, "");
  }

  private async post(path: string, body: unknown, auth = false): Promise<any> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (auth && this.token) headers["Authorization"] = `Bearer ${this.token}`;
    const r = await fetch(`${this.serverUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }

  private async get(path: string): Promise<any> {
    const headers: Record<string, string> = {};
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    const r = await fetch(`${this.serverUrl}${path}`, { headers });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }

  async register(username: string, password: string): Promise<void> {
    const { token } = await this.post("/auth/register", { username, password });
    this.token = token;
  }

  async login(username: string, password: string): Promise<void> {
    const { token } = await this.post("/auth/login", { username, password });
    this.token = token;
  }

  async listGames(): Promise<GameListEntry[]> {
    return this.get("/games");
  }

  async listMaps(): Promise<MapListEntry[]> {
    return this.get("/games/maps");
  }

  async createGame(mapName: string, features: GameFeatures): Promise<{ id: string; slot: number }> {
    return this.post("/games", { mapName, features }, true);
  }

  async joinGame(gameId: string): Promise<{ id: string; slot: number }> {
    return this.post(`/games/${gameId}/join`, {}, true);
  }

  async getEvents(gameId: string, after?: number): Promise<{ id: number; turn: number; event: unknown }[]> {
    const qs = after !== undefined ? `?after=${after}` : "";
    return this.get(`/games/${gameId}/events${qs}`);
  }

  connect(gameId: string, onMessage: (msg: unknown) => void, onClose: () => void): void {
    if (this.ws) this.ws.close();
    const wsUrl = this.serverUrl.replace(/^http/, "ws");
    const url = `${wsUrl}/?gameId=${encodeURIComponent(gameId)}&token=${encodeURIComponent(this.token ?? "")}`;
    this.ws = new WebSocket(url);
    this.ws.onmessage = (e) => {
      try {
        onMessage(JSON.parse(e.data as string));
      } catch {}
    };
    this.ws.onclose = onClose;
    this.ws.onerror = () => onClose();
  }

  sendAction(action: ActionEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(action));
    }
  }

  requestState(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "GetState" }));
    }
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.token = null;
  }

  isAuthenticated(): boolean {
    return this.token !== null;
  }
}

export function gameProcessorFromServerState(msg: any): {
  processor: GameProcessor;
  myGamePlayerId: number;
} {
  const grid = new HexGrid(msg.gridTiles as Position[]);
  const tiles = new Map<string, Tile>(msg.mapTiles as [string, Tile][]);
  const bases = new Map<number, Position[]>(msg.mapBases as [number, Position[]][]);
  const unitCapacity = msg.unitCapacity
    ? new Map<number, number>(msg.unitCapacity as [number, number][])
    : undefined;
  const gameMap: GameMap = { grid, tiles, bases, unitCapacity };

  const players = new Map<number, Player>(
    (msg.players as [number, any][]).map(([id, p]) => [
      id,
      {
        id: p.id,
        type: p.type as PlayerType,
        eliminated: p.eliminated,
        units: new Map<UnitId, Unit>(
          (p.units as [number, Unit][]).map(([uid, unit]) => [uid as UnitId, unit])
        ),
      },
    ])
  );

  const game: Game = {
    map: gameMap,
    players,
    currentPlayerId: msg.currentPlayerId as number,
    turn: msg.turn as number,
  };

  const unitTypes = new Map<string, UnitType>(msg.unitTypes as [string, UnitType][]);
  const turnStartPositions = msg.turnStartPositions
    ? new Map<UnitId, Position>(msg.turnStartPositions as [number, Position][])
    : undefined;
  const processor = new GameProcessor(game, unitTypes, msg.features as GameFeatures, turnStartPositions);

  return { processor, myGamePlayerId: msg.myGamePlayerId as number };
}
