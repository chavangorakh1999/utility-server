---
slug: jwt-rbac-across-nodejs-microservices
title: JWT and role-based access across Node.js microservices, without a central bottleneck
date: 2022-06-18
tags: nodejs, security, microservices, jwt
description: How we moved authorization out of a single gateway and into every service, using short-lived JWTs, a shared permission map and one small middleware.
---

When a platform grows from one Express app into a handful of services, authorization is usually the first thing to get messy. At a previous role I worked on a gamified EdTech platform with 15–20K daily users, and every new service started with the same question: *who is allowed to call this, and how do I know?*

The first answer most teams reach for is a central auth service that every request passes through. It works, until it becomes the slowest and most fragile hop in the system. Here's the setup we moved to instead, and the trade-offs that came with it.

## The shape

- One **identity service** issues tokens. It's the only place that knows passwords, OTPs or refresh tokens.
- Every other service **verifies** tokens locally, with a public key. No network call per request.
- Roles live in the token; **permissions** live in code, in one shared package.

```
client ──▶ identity ── issues access (15 min) + refresh (7 days)
client ──▶ courses  ── verifies signature locally, checks permission
client ──▶ rewards  ── verifies signature locally, checks permission
```

## Sign asymmetrically

With HS256 every service needs the shared secret, which means every service can also *mint* tokens. Switching to RS256 (or ES256) means only the identity service holds the private key; everyone else gets the public key and can only verify.

```js
// identity service
const accessToken = jwt.sign(
  { sub: user.id, role: user.role, org: user.orgId },
  privateKey,
  { algorithm: "RS256", expiresIn: "15m", issuer: "identity", audience: "api" }
);
```

```js
// any other service
const claims = jwt.verify(token, publicKey, {
  algorithms: ["RS256"],      // never let the token choose its own algorithm
  issuer: "identity",
  audience: "api",
});
```

Pinning `algorithms`, `issuer` and `audience` closes the classic holes: the `alg: none` trick, and tokens minted for one purpose being replayed against another.

## Roles in the token, permissions in code

Putting fine-grained permissions in the JWT is tempting, but tokens then grow with every feature and go stale the moment you change a rule. We kept the token small (a role and an org) and shipped a tiny shared package that maps roles to permissions:

```js
// @platform/permissions
export const can = {
  student: ["course:read", "quiz:attempt"],
  teacher: ["course:read", "course:write", "quiz:grade"],
  admin:   ["*"],
};

export const hasPermission = (role, perm) =>
  can[role]?.includes("*") || can[role]?.includes(perm);
```

And one middleware every service uses:

```js
export const requirePermission = (perm) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "unauthenticated" });
  if (!hasPermission(req.user.role, perm)) return res.status(403).json({ error: "forbidden" });
  next();
};

router.post("/courses", requirePermission("course:write"), createCourse);
```

Changing a rule became a package bump, reviewed like any other code, instead of a migration of every issued token.

## Scope every query, not just every route

Route checks answer "can a teacher create courses?". They don't answer "can *this* teacher edit *that* course?". That part belongs in the data layer:

```js
const course = await Course.findOne({ _id: req.params.id, orgId: req.user.org });
if (!course) return res.sendStatus(404); // 404, not 403: don't confirm it exists
```

Most of the access bugs we found in review were here, not in the middleware.

## Short access tokens, revocable refresh tokens

Stateless verification means you can't "log out" a JWT. We accepted that for access tokens by keeping them to 15 minutes, and made refresh tokens the revocable part: stored hashed, rotated on every use, and tied to a device. Reusing an already-rotated refresh token revokes the whole family, which catches stolen tokens quickly.

## What it bought us

- Services stopped calling auth on every request, which removed a hop from every API call.
- Access-related bugs dropped noticeably once the permission map was the single source of truth.
- New services got auth "for free" by installing one package.

The trade-off is that a permission change only takes effect as tokens refresh, within 15 minutes. For an EdTech platform that was fine. For something like banking, I'd add a revocation list checked on sensitive routes.
