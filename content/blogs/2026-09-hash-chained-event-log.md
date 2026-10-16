---
slug: tamper-evident-records-with-a-hash-chain
title: Tamper-evident records with a hash-chained event log in PostgreSQL
date: 2026-09-27
tags: postgresql, architecture, event-sourcing, nodejs
description: How Pashupaalak makes every milk, feed and health entry provably unaltered, using an append-only log where each event carries the hash of the one before it.
---

Pashupaalak is a dairy farm app. Workers log milk, feed and health events on the shed floor; owners see the numbers on their phone. Talking to farm owners, the same worry came up again and again: *can I trust what my workers record?* An easy-to-use app wasn't enough. The records had to be **provably unaltered** after the fact.

The answer was an old idea, borrowed from ledgers and blockchains but without the blockchain: a per-farm, append-only event log where each event includes the hash of the previous one.

## The idea in one picture

```
event 1: { payload, prevHash: GENESIS }       → hash1 = sha256(...)
event 2: { payload, prevHash: hash1 }         → hash2 = sha256(...)
event 3: { payload, prevHash: hash2 }         → hash3 = sha256(...)
```

Change anything in event 2, its payload, its time or who recorded it, and `hash2` changes. Event 3 still points at the old `hash2`, so the chain breaks at exactly the point of tampering. Deleting an event breaks it too.

## The table

```sql
CREATE TABLE events (
  id               uuid PRIMARY KEY,
  farm_id          uuid NOT NULL,
  server_sequence  bigint NOT NULL,          -- order of arrival, per farm
  type             text NOT NULL,            -- MILK, FEED, HEALTH, ...
  payload          jsonb NOT NULL,
  recorded_by      uuid NOT NULL,
  device_timestamp timestamptz NOT NULL,     -- when it happened
  synced_at        timestamptz NOT NULL DEFAULT now(), -- when it reached us
  previous_hash    text NOT NULL,
  hash             text NOT NULL,
  UNIQUE (farm_id, server_sequence)
);
```

Two clocks matter here. The worker app is offline-first, so an event recorded at 5 a.m. might reach the server at noon. Keeping `device_timestamp` (truth for reporting) separate from `server_sequence` (truth for the chain) means late syncs never rewrite history.

## Hashing deterministically

The hash has to be reproducible years later, so the input must be canonical. JSON key order isn't guaranteed, which means hashing `JSON.stringify(payload)` directly is a bug waiting to happen. We serialise with sorted keys:

```js
import { createHash } from "node:crypto";

const canonical = (v) =>
  Array.isArray(v) ? `[${v.map(canonical).join(",")}]`
  : v && typeof v === "object"
    ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`
    : JSON.stringify(v);

export const hashEvent = (e, previousHash) =>
  createHash("sha256")
    .update(canonical({ farmId: e.farmId, seq: e.serverSequence, type: e.type,
                        payload: e.payload, by: e.recordedBy,
                        at: e.deviceTimestamp, previousHash }))
    .digest("hex");
```

## Appending safely under concurrency

Two workers syncing at once must not both chain onto the same previous event. We take a per-farm advisory lock inside the transaction, read the last event, and append:

```sql
BEGIN;
SELECT pg_advisory_xact_lock(hashtext($farm_id));
SELECT server_sequence, hash FROM events
  WHERE farm_id = $farm_id ORDER BY server_sequence DESC LIMIT 1;
-- compute next sequence + hash in the app, then:
INSERT INTO events (...) VALUES (...);
COMMIT;
```

The lock is per farm, so farms never wait on each other, and the `UNIQUE (farm_id, server_sequence)` constraint is a second line of defence.

## Verifying

`GET /events/farm/:id/verify` walks the chain in sequence order, recomputes each hash, and reports the first break if there is one. Owners see the result in the app's Integrity tab. Verification is read-only and cheap enough to run on demand.

## Corrections are events, not edits

Because history can't change, a wrong entry is fixed by appending a `CORRECTION` event that references the original. Reports apply corrections; the audit trail keeps both. This is more work in the UI than an edit button, but it's the whole point: the record can be trusted *because* nobody can quietly change it.

## What a hash chain doesn't do

It proves records weren't altered **after** they were written. It can't prove they were true when written. That's why it's paired with on-device timestamps, per-worker PIN sign-in and per-animal anomaly checks, which flag a cow whose "recorded" milk suddenly doesn't match her own history. Integrity is a system property, not a single feature.
