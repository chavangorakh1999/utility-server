# utility-server

Small Express API behind [grcsr.in](https://grcsr.in). Deployed on Vercel.

## Blog API

| Route | What it does |
|---|---|
| `GET /api/blogs` | Posts stored in MongoDB, newest first (without the Markdown body). |
| `GET /api/blogs/:slug` | One stored post, with Markdown `content`. |
| `POST/PUT/DELETE /api/blogs[/:slug]` | Manage stored posts. Send `X-Api-Key: $BLOG_WRITE_KEY`. |
| `GET /health` | Liveness check. |

## Posts in `content/blogs/`

Markdown files with front matter (`slug`, `title`, `date`, `tags`, `description`).

- **On deploy:** the first MongoDB connection inserts any post the database doesn't have yet.
  Existing posts are never overwritten, so edits made through the API survive redeploys.
  Set `SEED_BLOGS_ON_START=false` to turn this off.
- **Manually:** `npm run seed:blogs` upserts every file, overwriting the stored copy
  (`-- --dry-run` lists what it would write).

## Environment

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string. Required; routes return 503 without it. |
| `BLOG_WRITE_KEY` | Required header value for write routes. |
| `CORS_ORIGINS` | Comma-separated allowed origins (e.g. `https://grcsr.in`). |
| `SITE_BLOG_BASE_URL` | Base URL where stored posts are read, e.g. `https://grcsr.in/blogs`. |
| `SEED_BLOGS_ON_START` | `false` disables seeding on deploy. |

```sh
npm install
npm run dev     # http://localhost:3000
npm test
```
