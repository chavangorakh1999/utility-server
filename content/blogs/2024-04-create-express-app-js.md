---
slug: why-i-built-create-express-app-js
title: Why I built create-express-app-js, and what a good Express skeleton needs
date: 2024-04-02
tags: nodejs, express, open-source, cli
description: Every new backend I started began with the same hour of boilerplate. So I turned it into a CLI, and wrote down the structure decisions behind it.
---

Every new Express project I started began the same way: create folders, wire up `dotenv`, add CORS and body parsing, write an error handler, set up a response format, add a health route, copy last project's logger. An hour later I'd finally write the first line of actual business logic.

[create-express-app-js](https://www.npmjs.com/package/create-express-app-js) is that hour, turned into one command:

```bash
npx create-express-app-js my-api
cd my-api && npm start
```

It cut initial backend setup time by around 70% for the projects I and my teammates started with it, and it's crossed 1K+ downloads on npm. More useful than the tool itself, though, are the decisions baked into the skeleton. They're worth making deliberately, whether or not you use the CLI.

## The layout

```
my-api/
├── index.js            # app wiring only: middleware, routes, error handler
├── routes/             # URL → controller, nothing else
├── controllers/        # request/response handling
├── services/           # business logic, no req/res in sight
├── models/             # data access
├── utils/              # response helpers, small pure functions
└── .env.example
```

The one rule that matters most: **`req` and `res` never leave the controller.** Services take plain arguments and return plain values. That's what makes them testable without spinning up HTTP, and reusable from a queue worker or a cron job later.

## One response shape

Clients shouldn't have to guess what an error looks like. Every response from the skeleton has the same envelope:

```json
{ "status": 200, "message": "Request was success", "data": [], "error": {} }
```

A small helper class builds it, so controllers say `res.status(404).send(rc.dataNotFound())` rather than hand-rolling objects. Boring and consistent is the goal.

## Errors go to one place

Every route handler forwards errors with `next(err)`, and one error-handling middleware at the bottom of `index.js` turns them into that same envelope. You get one place to log, one place to hide stack traces in production, and no forgotten `try/catch` that leaks a 500 with an HTML body.

```js
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).send({
    status: err.status || 500,
    message: err.expose ? err.message : "Something went wrong - Please try again.",
    data: [],
    error: process.env.NODE_ENV === "production" ? {} : { stack: err.stack },
  });
});
```

## Config from the environment, and a template to prove it

The CLI writes a `.env.example` listing every variable the app reads, and `.env` is in `.gitignore` from the first commit. Secrets in git are almost always a "we'll clean it up later" that never happened.

## Things I deliberately left out

- **No ORM by default.** Mongo, Postgres or none at all depends on the project, and ripping one out is worse than adding one.
- **No auth scaffolding.** Auth is too project-specific to generate well, and generated auth is auth nobody reviewed.
- **No TypeScript by default** in the first version, to keep the "running in a minute" promise. It's the most requested addition, and the next thing on the list.

## What I learned from publishing it

Writing a generator forces you to justify every file. If I couldn't explain why something was in the template, it came out. The skeleton got smaller with every release, and that's probably the best sign it was getting better.
