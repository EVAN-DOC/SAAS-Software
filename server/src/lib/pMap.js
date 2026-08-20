/**
 * Runs `fn` over `items` with at most `concurrency` in flight at once.
 * Avoids hammering Shopify/Cashfree/iCarry with hundreds of parallel
 * per-order lookups when building the dashboard.
 */
async function pMap(items, fn, concurrency = 5) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

module.exports = { pMap };
