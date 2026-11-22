type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const KEY = 'bsp.sc03.pending-print';

export function saveSc03PrintIntent(store: Store, invoiceId: string, token: string, now = Date.now()) {
  if (!invoiceId || !token) throw new Error('Saved invoice is required for printing');
  store.setItem(KEY, JSON.stringify({invoiceId, token, createdAt:now}));
}

/** Remove before transmitting: refresh/back/strict effects must not duplicate paper output. */
export function takeSc03PrintIntent(store: Store, invoiceId: string, token: string, now = Date.now()): boolean {
  const raw = store.getItem(KEY);
  if (!raw) return false;
  const intent = JSON.parse(raw);
  if (intent.invoiceId !== invoiceId || intent.token !== token) return false;
  store.removeItem(KEY);
  return Number.isFinite(intent.createdAt) && now >= intent.createdAt && now - intent.createdAt < 10 * 60_000;
}
