---
slug: human-in-the-loop-ai-for-healthcare
title: Human-in-the-loop by design, building AI clinical handovers with Bedrock
date: 2026-02-12
tags: ai, aws, bedrock, healthcare, serverless
description: In healthcare an unreviewed AI output is a liability. How ClinFocus AI makes every draft go through an approve, edit or reject gate, and why that made the product faster, not slower.
---

ClinFocus AI is a serverless clinical decision-support platform I built on AWS. Its headline feature is AI-drafted clinical handovers: the model reads a patient's scattered notes and documents and drafts a structured summary for the next clinician. In most domains you'd ship that and iterate. In healthcare, a wrong summary that someone trusts can hurt a patient. So the design started from one constraint: **no AI output counts until a human has acted on it.**

## The pipeline

```
Clinician dashboard (React, CloudFront)
  → API Gateway (HTTP API)
  → Lambda: workflow orchestrator
      → Textract (OCR for scanned documents and prescriptions)
      → Bedrock (multi-document synthesis, with Guardrails)
  → Review queue: Approve · Edit · Reject
  → DynamoDB: final record + append-only audit log
```

Everything is defined in AWS CDK, so the whole stack, from 42 REST endpoints down to the DynamoDB tables, can be rebuilt from code.

## Drafts are a separate state, not a flag

The tempting implementation is a `reviewed: false` column on the handover. The problem is that any code path that forgets to check it shows an unreviewed draft as if it were real. Instead, drafts and approved records are **different item types**. A draft can only become a record through the review endpoint, which requires a clinician's identity and an explicit decision:

```js
// POST /handovers/:id/review  { decision: "approve" | "edit" | "reject", text? }
if (!["approve", "edit", "reject"].includes(decision)) return badRequest();
await audit.append({ actor: user.id, action: `handover.${decision}`, draftId, at: now });
if (decision === "reject") return markRejected(draftId);
return finalize(draftId, decision === "edit" ? text : draft.text, user.id);
```

There's no code path from model output to a final record that skips a person.

## Make the draft easy to check

A review gate only works if reviewing is fast. So the draft isn't just text:

- Each section shows **where it came from**, which notes and pages it was drawn from, so the clinician can verify without hunting.
- A **confidence score** per section, computed from how consistent the sources were, tells the reviewer where to look hardest.
- **Red flags** (allergy mentions, abnormal values, conflicting notes) are pulled to the top rather than buried in prose.

Clinicians told us this mattered more than the summary's wording. They trust what they can verify quickly.

## Guardrails before and after the model

Bedrock Guardrails filter both the input and the output, Textract does the OCR before the model ever sees an image, and the model only **pre-fills** forms (for example, a prescription read from a photo) for a person to confirm. The model is never the last step.

## Append-only audit, single-table DynamoDB

Every human and system action, from upload to draft to approval, is written to an append-only log. Nothing is updated in place, so you can always answer *who approved what, when, and what the AI originally said*. A single-table DynamoDB design keeps org-scoped reads fast and predictable, at the cost of deciding access patterns up front.

## Did the gate slow people down?

The opposite. A clinician reviewing and lightly editing a draft is much faster than writing a handover from scratch, and the gate is what made them willing to use it at all. The speed comes from the draft; the safety comes from the approval.

## What I'd measure next

The most valuable signal is the **edit rate per section type**. If clinicians always rewrite the medication section, that's where the prompt or the source extraction needs work, and where the confidence threshold should be stricter. Human review isn't just a safety net; it's the best feedback loop an AI feature can have.
