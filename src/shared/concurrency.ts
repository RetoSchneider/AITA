export async function mapConcurrently<Item, Result>(
  items: readonly Item[],
  limit: number,
  task: (item: Item, index: number) => Promise<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(items.length);
  const queue = items.entries();
  const worker = async () => {
    for (const [index, item] of queue) {
      results[index] = await task(item, index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}
