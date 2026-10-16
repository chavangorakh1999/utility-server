---
slug: sns-sqs-fan-out-for-decoupled-services
title: SNS + SQS fan-out on AWS, the patterns that kept our services decoupled
date: 2024-09-21
tags: aws, sns, sqs, lambda, architecture
description: Publish once, let every consumer get its own queue. Notes on idempotency, dead-letter queues, filtering and ordering from running this in production.
---

On an enterprise platform I worked on, a lot of the backend work was moving synchronous chains of HTTP calls ("create the order, then call billing, then call notifications, then call analytics") into events. The pattern we used everywhere was SNS fan-out to SQS, with Lambda consumers. It's simple, cheap and very hard to break, as long as you respect a few rules.

## The pattern

```
order-service ──publish──▶ SNS topic "order-events"
                              ├──▶ SQS billing-queue       ──▶ billing Lambda
                              ├──▶ SQS notifications-queue ──▶ notify Lambda
                              └──▶ SQS analytics-queue     ──▶ analytics Lambda
```

The producer publishes once and doesn't know who's listening. Each consumer owns a queue, which gives it three things a direct SNS→Lambda subscription doesn't:

- **Buffering.** If billing is slow or down, messages wait in its queue; nobody else is affected.
- **Retries with backoff**, through the queue's visibility timeout.
- **Its own dead-letter queue**, so one consumer's poison message doesn't block the rest.

## Rule 1: every consumer is idempotent

SQS standard queues deliver *at least once*. You will see duplicates. Every handler has to be safe to run twice with the same message. We put an idempotency key on every event, and record processed keys with a conditional write:

```js
await ddb.send(new PutCommand({
  TableName: "processed_events",
  Item: { pk: `${consumer}#${event.id}`, ttl: nowSeconds() + 7 * 86400 },
  ConditionExpression: "attribute_not_exists(pk)",
})); // throws ConditionalCheckFailed on a duplicate → skip it
```

## Rule 2: report partial batch failures

A Lambda receiving a batch of 10 messages shouldn't retry all 10 because one failed. Turn on `ReportBatchItemFailures` and return only the failures:

```js
export const handler = async (event) => {
  const batchItemFailures = [];
  for (const record of event.Records) {
    try {
      await processOne(JSON.parse(JSON.parse(record.body).Message));
    } catch (err) {
      console.error({ messageId: record.messageId, err: err.message });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
};
```

(The double `JSON.parse` is real: SQS wraps the SNS envelope, which wraps your message. Enabling *raw message delivery* on the subscription removes one layer.)

## Rule 3: every queue gets a DLQ and an alarm

`maxReceiveCount: 5` on a redrive policy sends a message to the dead-letter queue after five failed attempts. A DLQ nobody watches is just a slower way to lose data, so each one gets a CloudWatch alarm on `ApproximateNumberOfMessagesVisible > 0`. Redriving from the DLQ after a fix is then a button in the console.

## Rule 4: filter at the subscription, not in code

Analytics wants every event; notifications only cares about `order.shipped`. SNS subscription filter policies drop the rest before they ever reach the queue, so you don't pay for it:

```json
{ "type": ["order.shipped", "order.delivered"] }
```

## Rule 5: decide if you really need ordering

FIFO topics and queues give ordering per message group, at lower throughput and higher cost. Most of the time you don't need global order; you need *per-entity* order, or simply a handler that tolerates out-of-order events by checking a version number. We used FIFO only where order truly mattered (ledger-style updates), keyed by account ID.

## Rule 6: version your events

Events outlive the code that produced them. Every message carried `type`, `version`, `id` and `occurredAt`, and consumers ignored versions they didn't understand rather than crashing. Adding fields was always safe; removing or renaming them meant a new version.

## What changed

Moving the order flow to fan-out made the user-facing request fast again (it only had to write and publish) and let teams ship consumers independently. The biggest win was quieter than that, though: an outage in one downstream service stopped being an outage everywhere.
