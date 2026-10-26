export async function mapConcurrently<Item, Result>(
  items: readonly Item[],
  limit: number,
  task: (item: Item, index: number) => Promise<Result>,
): Promise<Result[]> {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError("Concurrency must be a positive safe integer");
  }
  const results = new Array<Result>(items.length);
  const queue = items.entries();
  let failure: { error: unknown } | undefined;
  const worker = async () => {
    for (const [index, item] of queue) {
      if (failure !== undefined) return;
      try {
        results[index] = await task(item, index);
      } catch (error) {
        failure ??= { error };
        return;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  if (failure !== undefined) throw failure.error;
  return results;
}
