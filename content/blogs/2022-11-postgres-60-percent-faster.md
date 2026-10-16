---
slug: making-postgres-apis-60-percent-faster
title: How we made our PostgreSQL-backed APIs ~60% faster without new hardware
date: 2022-11-09
tags: postgresql, performance, nodejs, caching
description: Reading query plans, choosing the right indexes, killing N+1 queries and caching what's hot, on a platform handling 1–2 lakh transactions a day.
---

An EdTech backend I worked on handled between one and two lakh PostgreSQL transactions a day. As usage grew, the leaderboard and progress endpoints crept past a second at peak. Over a few weeks we brought average response times down by roughly 60%, and none of it needed a bigger database. This is the order we worked in, because the order matters.

## 1. Measure before touching anything

Guessing is how you end up adding indexes nobody uses. We turned on `pg_stat_statements` and sorted by *total* time, not mean time. A 5 ms query that runs 200,000 times a day costs more than a 2-second report that runs twice.

```sql
SELECT query, calls, round(total_exec_time) AS total_ms, round(mean_exec_time, 1) AS mean_ms
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 15;
```

Three queries accounted for more than half of all database time.

## 2. Read the plan

For each one, `EXPLAIN (ANALYZE, BUFFERS)` told us what Postgres was actually doing:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM attempts
WHERE student_id = $1 AND course_id = $2
ORDER BY created_at DESC
LIMIT 20;
```

The answer was a sequential scan over millions of rows, followed by a sort. Two signs to watch for are `Seq Scan` on a big table and `Sort` with `external merge` (the sort spilled to disk).

## 3. Index for the query you actually run

A composite index in the same order as the filter, and then the sort, turned that into an index scan with no sort step at all:

```sql
CREATE INDEX CONCURRENTLY idx_attempts_student_course_created
  ON attempts (student_id, course_id, created_at DESC);
```

A few rules we settled on:

- **Equality columns first, range or sort columns last.**
- **`CONCURRENTLY`** in production, so the table isn't locked while the index builds.
- **Partial indexes** for hot subsets, for example `WHERE status = 'active'`, are smaller and faster than indexing everything.
- **Drop indexes nobody uses.** `pg_stat_user_indexes` shows `idx_scan = 0` candidates. Every index slows writes.

## 4. Kill the N+1s

The progress endpoint loaded a course, then ran one query per module, then one per lesson. With an ORM this is easy to write and hard to see. Replacing it with one query, using a join and `json_agg`, went from dozens of round trips to one:

```sql
SELECT m.id, m.title,
       json_agg(json_build_object('id', l.id, 'done', p.completed_at IS NOT NULL)
                ORDER BY l.position) AS lessons
FROM modules m
JOIN lessons l ON l.module_id = m.id
LEFT JOIN progress p ON p.lesson_id = l.id AND p.student_id = $1
WHERE m.course_id = $2
GROUP BY m.id
ORDER BY m.position;
```

## 5. Only then, cache

Caching first hides slow queries instead of fixing them. Once the queries were healthy, we cached the few responses that were both hot and tolerant of being slightly stale. The leaderboard was the obvious one:

```js
const key = `leaderboard:${courseId}`;
let board = await redis.get(key);
if (!board) {
  board = JSON.stringify(await db.leaderboard(courseId));
  await redis.set(key, board, "EX", 60); // a minute old is fine for a leaderboard
}
res.type("json").send(board);
```

Two things kept the cache honest. Each key had a **short TTL**, rather than clever invalidation everywhere. And we **invalidated explicitly** on the few writes where staleness was visible, such as finishing a quiz.

## 6. Mind the connection pool

Node makes it easy to fire many queries at once, and Postgres hates thousands of connections. A modest pool per instance, with PgBouncer in transaction mode in front, stopped the "too many connections" spikes during peak quiz hours.

## Results

- Average API response time dropped by about 60%.
- Database CPU at peak fell enough that the planned instance upgrade was cancelled.
- The leaderboard went from the slowest endpoint to one of the fastest.

The lesson I keep coming back to: **profile, plan, index, restructure, then cache.** Skipping straight to the last step works for a week.
