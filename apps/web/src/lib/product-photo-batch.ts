export type PhotoProductRow = {
  id: string; name: string; selling_price: number | null; stock: number; unit: string;
  tax_rate: number; tax_inclusive: boolean; selected: boolean; state: 'draft' | 'pending' | 'saved';
};
export type PhotoProductBatch = { rows: PhotoProductRow[]; unresolved: string[] };
export const photoBatchKey = (uid: string, organizationId: string) => `brandspire.product-photo-batch:${uid}:${organizationId}`;

export function validPhotoProduct(row: PhotoProductRow) {
  return !!row.name.trim() && row.name.length <= 160 && row.selling_price !== null
    && Number.isFinite(row.selling_price) && row.selling_price >= 0
    && Number.isFinite(row.stock) && row.stock >= 0 && Number.isFinite(row.tax_rate)
    && row.tax_rate >= 0 && row.tax_rate <= 100 && !!row.unit.trim() && row.unit.length <= 30;
}

export function readPhotoBatch(raw: string): PhotoProductBatch {
  const value = JSON.parse(raw) as PhotoProductBatch;
  if (!value || !Array.isArray(value.rows) || !value.rows.length || value.rows.length > 30
    || !Array.isArray(value.unresolved) || value.unresolved.some(message => typeof message !== 'string')
    || value.rows.some(row => !row || !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(row.id)
      || typeof row.name !== 'string' || typeof row.unit !== 'string' || typeof row.selected !== 'boolean'
      || typeof row.tax_inclusive !== 'boolean' || !['draft', 'pending', 'saved'].includes(row.state)
      || (row.selling_price !== null && !Number.isFinite(row.selling_price))
      || !Number.isFinite(row.stock) || !Number.isFinite(row.tax_rate))
    || new Set(value.rows.map(row => row.id)).size !== value.rows.length) {
    throw new Error('Saved photo import could not be read. Keep device data and check your product history before importing again.');
  }
  return value;
}

// Persist BEFORE sending; an interrupted request must retry precisely the same product ID and values.
export async function savePhotoBatch(
  initial: PhotoProductBatch,
  persist: (next: PhotoProductBatch) => void,
  send: (input: Record<string, unknown>) => Promise<unknown>,
  checkSession: () => void = () => {},
) {
  let batch = initial;
  const selected = batch.rows.filter(row => row.selected && row.state !== 'saved');
  if (selected.some(row => !validPhotoProduct(row))) throw new Error('Enter a name, price, valid stock, unit and GST for every selected row.');
  for (const row of selected) {
    checkSession();
    const pending = { ...batch, rows: batch.rows.map(item => item.id === row.id ? { ...item, state: 'pending' as const } : item) };
    persist(pending); batch = pending;
    try {
      await send({ id: row.id, name: row.name.trim(), selling_price: row.selling_price, stock: row.stock,
        unit: row.unit.trim(), tax_rate: row.tax_rate, tax_inclusive: row.tax_inclusive });
    } catch (error) {
      // Only a first-attempt, definite rejection permits editing. A retry may follow a lost successful response.
      const status = (error as { status?: number })?.status;
      if (row.state === 'draft' && [400, 403, 422].includes(status ?? 0)) {
        batch = { ...batch, rows: batch.rows.map(item => item.id === row.id ? { ...item, state: 'draft' as const } : item) };
        persist(batch);
      }
      throw error;
    }
    batch = { ...batch, rows: batch.rows.map(item => item.id === row.id ? { ...item, state: 'saved' as const } : item) };
    persist(batch);
  }
  return batch;
}
