# Area Tactics

A turn-based hex strategy game playable in the browser, with an AI opponent.

![Screenshot](screenshot.png)

## About

Two players compete on a hex grid, claiming territory, capturing depots and facilities, and building units to overwhelm the opponent. See [MANUAL.md](MANUAL.md) for full rules and gameplay details.

## Getting started

```bash
npm install
npm run dev      # start dev server at http://localhost:5173
```

## Build

```bash
npm run build    # output to dist/
```

## Other commands

| Command | Description |
|---|---|
| `npm test` | Run unit tests |
| `npm run lint` | Lint with ESLint |
| `npm run format` | Format source with Prettier |

## Running with Docker

A pre-built image is published to the GitHub Container Registry on every push to `main`.

```bash
docker run -p 3000:3000 \
  -e SERVER_URL=https://your-domain.com \
  -v /data/area-tactics.db:/app/area-tactics.db \
  ghcr.io/bzar/area-tactics-proto:latest
```

Open `http://localhost:3000` (or your domain) in a browser.

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the server listens on |
| `SERVER_URL` | *(empty — same origin)* | URL clients use to reach the server. Set this when the server is behind a reverse proxy or running on a custom domain. |
| `STATIC_DIR` | `/app/public` | Directory to serve the client from |
| `DB_PATH` | `/app/area-tactics.db` | Path to the SQLite database file |

The database file is the only persistent state — mount a volume at `/app/area-tactics.db` (or the path set by `DB_PATH`) to keep game data across container restarts.
