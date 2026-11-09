// Deliberately limited grammar: never infer prices, units or fuzzy product matches.
export function normalizeSpeech(text: string) {
  return text.replace(/[०-९]/g, digit => String(digit.charCodeAt(0) - 0x0966)).trim();
}

export function localProductDraft(text: string) {
  const match = normalizeSpeech(text).match(/^(.+?)\s+(?:@\s*|(?:rs\.?|₹)\s*)(\d+(?:\.\d{1,2})?)$|^(.+?)\s+(\d+(?:\.\d{1,2})?)\s*(?:rupees|rupaye|rupe|रुपये|रुपए|₹)$/i);
  if (!match) return null;
  const name = (match[1] ?? match[3]).trim();
  if (!name || name.length > 160 || /[,;\n]/.test(name)) return null;
  const selling_price = Number(match[2] ?? match[4]);
  return Number.isFinite(selling_price) ? { name, selling_price } : null;
}

export function localBillLines(text: string) {
  const parts = normalizeSpeech(text).split(/[,;\n]+/).map(part => part.trim());
  if (!parts.length || parts.length > 100 || parts.some(part => !part)) return null;
  const lines: { name: string; quantity: number }[] = [];
  for (const part of parts) {
    const match = part.match(/^(\d+(?:\.\d+)?)\s+(.+)$|^(.+?)\s+[x×]\s*(\d+(?:\.\d+)?)$/i);
    if (!match) return null;
    const quantity = Number(match[1] ?? match[4]);
    const name = (match[2] ?? match[3]).trim();
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) return null;
    lines.push({ name, quantity });
  }
  return lines;
}
