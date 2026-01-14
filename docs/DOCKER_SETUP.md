## Docker Quickstart

### Prerequisites

- Docker 24+
- Docker Compose v2

### 1) Build and run

```bash
# From repo root
docker compose up -d --build
```

### 2) Verify containers

```bash
docker compose ps
```

You should see `template-mongo` (healthy) and `template-app` (running).

### 3) Check logs

```bash
docker compose logs -f app
```

You should see lines like:

- `Connected to the database successfully.`
- `Server is running on port 3000`

### 4) Test the API

- Open http://localhost:3000 in your browser.
- If you have a health route: http://localhost:3000/health
- Or via curl:

```bash
curl -i http://localhost:3000
```

---

### Services

- app: Node.js API built from `Dockerfile`
- mongo: MongoDB 7 with persistent volume `mongodata`

### Environment variables

The app sets both `MONGODB_URI` and `DATABASE_URL` to the same Mongo connection string for compatibility (e.g., Prisma or custom drivers):

```
MONGODB_URI=mongodb://template:template@mongo:27017/template?authSource=admin
DATABASE_URL=mongodb://template:template@mongo:27017/template?authSource=admin
```

Override or extend via `.env` if needed.

### Updating the stack

```bash
# Rebuild app after code changes
docker compose build app

# Restart only the app
docker compose restart app
```

### Stopping and cleanup

```bash
# Stop containers (keep volumes)
docker compose down

# Stop and delete volumes (resets MongoDB data)
docker compose down -v
```

### Troubleshooting

- App container unhealthy: ensure the server listens on `PORT` (default 3000).
- Database connection errors: verify the URI and that `template-mongo` is healthy.
- See recent logs:

```bash
docker compose logs --tail=200 app
```

- Recreate from scratch:

```bash
docker compose down -v && docker compose up -d --build
```
