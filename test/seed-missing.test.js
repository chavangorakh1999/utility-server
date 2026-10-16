const test = require('node:test');
const assert = require('node:assert');
const { seedMissing, loadPosts } = require('../scripts/seed-blogs');

test('seedMissing only inserts, never overwrites', async () => {
  let ops;
  const Blog = { bulkWrite: async (o) => { ops = o; return { upsertedCount: 2 }; } };
  const added = await seedMissing(Blog);
  assert.strictEqual(added, 2);
  assert.strictEqual(ops.length, loadPosts().length);
  for (const op of ops) {
    assert.ok(op.updateOne.upsert);
    assert.deepStrictEqual(Object.keys(op.updateOne.update), ['$setOnInsert']);
  }
});
