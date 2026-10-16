---
slug: what-an-agentic-ai-hackathon-taught-me
title: What making the Agentic AI Day finals taught me about building with LLM agents
date: 2025-07-28
tags: ai, agents, llm, hackathon
description: Agents demo beautifully and fail quietly. Five lessons from a weekend of building one under time pressure, and how they changed the way I design AI features.
---

In July I took part in Agentic AI Day and made it to the finals. A hackathon is a strange way to learn engineering, because every shortcut is tempting and every hour counts. But it's also brutally honest: either the demo works in front of the judges or it doesn't. These are the lessons that stuck with me, and they've shaped every AI feature I've built since.

## 1. The model is the easy part

We spent the first two hours debating which model to use. In hindsight that mattered least. What decided whether the agent worked was everything around the model: the tools it could call, how clearly those tools were described, and what we did with its output.

A tool description is a prompt. "Gets data" is useless. Something like "Returns the last 30 days of orders for one customer ID; use this before answering any question about order history" changed the agent's behaviour more than any model switch did.

## 2. Give the agent fewer, sharper tools

Our first version had eleven tools. The agent dithered, called the wrong one, or called three in a row "to be safe". Collapsing them into four well-named tools with tight input schemas made it faster and far more reliable.

```json
{
  "name": "get_customer_orders",
  "description": "Last 30 days of orders for ONE customer. Call before answering anything about order history.",
  "input_schema": {
    "type": "object",
    "properties": { "customer_id": { "type": "string" } },
    "required": ["customer_id"],
    "additionalProperties": false
  }
}
```

## 3. Numbers must come from code, never from the model

The fastest way to lose a judge's trust is an agent that confidently states a wrong total. We made a rule: the model may *choose* a calculation, but the backend *performs* it and returns the result. The model then only phrases it. It's the same rule I later wrote into Pashupaalak's AI tools: every number comes from the product's own calculations.

## 4. Put a human gate where mistakes are expensive

Our agent could draft actions, such as sending a message or updating a record, but not perform them. Every action came back as a proposal that a person approved with one click. Judges loved it, and not because it was cautious: it made the agent *usable* by people who didn't fully trust it yet. That idea grew into the approve/edit/reject gates in ClinFocus AI.

## 5. Log every step, or you can't debug anything

When the agent went wrong mid-demo-rehearsal, we had no idea why. We added structured logs for every turn: the prompt version, each tool call with its inputs, each tool result, and the final answer. After that, debugging took minutes instead of guesswork. In production, the same trace is what you audit later.

## What I'd tell myself before the event

- Build the **evaluation** first: ten real questions with known answers, run after every change. It catches regressions you won't notice by eye.
- Spend the time saved on **failure paths**: what does the user see when a tool errors, when the model refuses, when the network drops?
- **Scope down hard.** One workflow done reliably beats five that work on the happy path.

Agents are genuinely useful when they're treated as one component in a system with checks around it, rather than as the system itself. The hackathon made that concrete for me, and it's the principle I've built on since.
