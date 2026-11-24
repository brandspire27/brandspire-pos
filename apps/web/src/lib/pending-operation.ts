/** Keep the same durable ID until the server result is acknowledged. */
export async function runPendingOperation<T>(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, key: string, input: Record<string, unknown>, send: (body: Record<string, unknown>) => Promise<T>): Promise<T> {
  const payload = JSON.stringify(input);
  const previous = storage.getItem(key);
  const pending = previous ? JSON.parse(previous) as { operationId: string; payload: string } : { operationId: crypto.randomUUID(), payload };
  if (pending.payload !== payload) throw new Error(`Previous action is still unconfirmed. Retry these original details first: ${pending.payload}`);
  storage.setItem(key, JSON.stringify(pending)); // Fail closed if persistence is unavailable.
  try {
    const response = await send({ ...input, operationId: pending.operationId });
    try { storage.removeItem(key); } catch { /* Retaining the ID is safer than another write. */ }
    return response;
  } catch (error) {
    // These application responses mean the transaction did not commit. Network/5xx outcomes are unknown.
    const status = (error as { status?: number })?.status;
    if (!previous && status && [400, 401, 403, 404, 422, 429].includes(status)) storage.removeItem(key);
    throw error;
  }
}
