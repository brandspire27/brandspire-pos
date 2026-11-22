export type BarcodeNameSuggestion = {
  barcode: string;
  name: string;
  source: string;
  sourceUrl: string;
};

const sources = [
  { host: 'world.openfoodfacts.org', name: 'Open Food Facts' },
  { host: 'world.openbeautyfacts.org', name: 'Open Beauty Facts' },
  { host: 'world.openproductsfacts.org', name: 'Open Products Facts' },
] as const;
const cache = new Map<string, BarcodeNameSuggestion>();

/** Public catalog data is a suggestion only. Never import its price, tax or stock. */
export function parseBarcodeSuggestion(body: unknown, barcode: string, source: typeof sources[number]): BarcodeNameSuggestion | null {
  if (!body || typeof body !== 'object') return null;
  const data = body as Record<string, unknown>;
  if (data.status !== 1 || !data.product || typeof data.product !== 'object') return null;
  const product = data.product as Record<string, unknown>;
  if (product.code != null && String(product.code) !== barcode) return null;
  const clean = (value: unknown) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 160) : '';
  const productName = clean(product.product_name) || clean(product.product_name_en) || clean(product.generic_name);
  if (!productName) return null;
  const brand = clean(product.brands).split(',')[0].trim();
  const name = brand && !productName.toLocaleLowerCase().includes(brand.toLocaleLowerCase()) ? `${brand} ${productName}`.slice(0, 160) : productName;
  return { barcode, name, source: source.name, sourceUrl: `https://${source.host}/product/${barcode}` };
}

/** Looks up only numeric retail barcodes, never arbitrary SKU text or QR URLs. */
export async function lookupBarcodeName(raw: string, options: { signal?: AbortSignal } = {}): Promise<BarcodeNameSuggestion | null> {
  const barcode = raw.trim();
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(barcode) || options.signal?.aborted) return null;
  const known = cache.get(barcode);
  if (known) return known;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 6000);
  try {
    // Bounded parallel lookups keep an absent item from delaying manual entry.
    const results = await Promise.all(sources.map(async source => {
      try {
        const fields = 'code,product_name,product_name_en,generic_name,brands';
        const response = await fetch(`https://${source.host}/api/v2/product/${barcode}?fields=${fields}`, {
          signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer',
        });
        if (!response.ok) return null;
        return parseBarcodeSuggestion(await response.json(), barcode, source);
      } catch { return null; }
    }));
    if (options.signal?.aborted) return null;
    const found = results.find((value): value is BarcodeNameSuggestion => value !== null) ?? null;
    if (found) {
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      cache.set(barcode, found);
    }
    return found;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}
