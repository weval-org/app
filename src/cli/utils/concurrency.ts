import { getConfig } from '../config'

/**
 * Run async operations with concurrency control
 * @param items Items to process
 * @param operation Async operation to run on each item
 * @param concurrency Maximum number of concurrent operations
 * @param delayMs Delay between starting each operation
 */
export async function throttledMap<T, R>(
  items: T[],
  operation: (item: T) => Promise<R>,
  concurrency = 3,
  delayMs = 1000
): Promise<R[]> {
  const { logger } = getConfig()
  const results: R[] = []
  const running = new Set<Promise<void>>()

  for (const item of items) {
    // If we've hit the concurrency limit, wait for one to finish
    if (running.size >= concurrency) {
      await Promise.race(running)
    }

    // Add delay between operations
    if (running.size > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }

    // Start new operation
    const promise = (async () => {
      try {
        const result = await operation(item)
        results.push(result)
      } catch (error) {
        logger.error(`Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        throw error
      }
    })()

    // Track the running operation
    running.add(promise)
    promise.finally(() => running.delete(promise))
  }

  // Wait for remaining operations
  await Promise.all(running)
  return results
} 