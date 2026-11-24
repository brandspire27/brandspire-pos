export function normalizeSpeech(text: string) {
  return text
    .replace(/[०-९]/g, digit => String(digit.charCodeAt(0) - 0x0966))
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .trim();
}

export function localProductDraft(text: string) {
  const match = normalizeSpeech(text).match(/^(.+?)\s+(?:@\s*|(?:rs\.?|₹)\s*)(\d+(?:\.\d{1,2})?)$|^(.+?)\s+(\d+(?:\.\d{1,2})?)\s*(?:rupees|rupaye|rupe|रुपये|रुपए|₹)$/i);
  if (!match) return null;
  const name = (match[1] ?? match[3]).trim();
  if (!name || name.length > 160 || /[,;\n]/.test(name)) return null;
  const selling_price = Number(match[2] ?? match[4]);
  return Number.isFinite(selling_price) ? { name, selling_price } : null;
}

const spokenQuantities: Record<string, number> = {
  a: 1, an: 1, one: 1, ek: 1, एक: 1,
  two: 2, do: 2, दो: 2,
  three: 3, teen: 3, तीन: 3,
  four: 4, char: 4, चार: 4,
  five: 5, paanch: 5, पाँच: 5, पांच: 5,
  six: 6, chhe: 6, छह: 6,
  seven: 7, saat: 7, सात: 7,
  eight: 8, aath: 8, आठ: 8,
  nine: 9, nau: 9, नौ: 9,
  ten: 10, das: 10, दस: 10,
  half: 0.5, aadha: 0.5, आधा: 0.5,
  dedh: 1.5, डेढ़: 1.5,
  dhai: 2.5, ढाई: 2.5
};

function quantityValue(value: string) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  return spokenQuantities[value.toLowerCase()];
}

function parseBillLine(text: string) {
  const afterName = text.match(/^(.+?)\s+[x×]\s*(\d+(?:\.\d+)?|[a-z\u0900-\u097f]+)$/i);
  const beforeName = text.match(/^(\d+(?:\.\d+)?|[a-z\u0900-\u097f]+)\s+(.+)$/i);
  const quantity = afterName ? quantityValue(afterName[2]) : beforeName ? quantityValue(beforeName[1]) : NaN;
  const name = (afterName?.[1] ?? beforeName?.[2] ?? '')
    .replace(/^(?:of|for)\s+/i, '')
    .trim();
  if (!name || name.length > 160 || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100000) return null;
  return { name, quantity };
}

function stripBillCommands(text: string) {
  return text
    .replace(/^\s*(?:(?:please|kindly)\s+)?(?:(?:make|create|prepare|generate)\s+(?:me\s+)?(?:a\s+)?(?:bill|invoice)(?:\s+for)?|(?:बिल|इनवॉइस)\s*(?:बनाओ|बना\s*दो|बनाइए))\s*/i, '')
    .replace(/^\s*(?:(?:please|kindly)\s+)?(?:add|include)\s+/i, '')
    .replace(/\s+(?:(?:ka|ki|ke|का|की|के)\s+)?(?:bill|invoice|बिल)\s*(?:banao|bana[o]?|bana\s*do|banaye|बनाओ|बना\s*दो|बनाइए)?\s*$/i, '')
    .trim();
}

export function localBillLines(text: string) {
  const textWithoutCommands = stripBillCommands(normalizeSpeech(text));
  const parts = textWithoutCommands.split(/[,;\n]+/).map(part => part.trim());
  if (!parts.length || parts.length > 100 || parts.some(part => !part)) return null;
  const expanded = parts.flatMap(part => {
    const clauses = part.split(/\s+(?:and|plus|aur|और)\s+/i).map(clause => clause.trim());
    return clauses.length > 1 && clauses.every(clause => parseBillLine(clause)) ? clauses : [part];
  });
  if (expanded.length > 100) return null;
  const lines = [];
  for (const part of expanded) {
    const line = parseBillLine(part);
    if (!line) return null;
    lines.push(line);
  }
  return lines;
}

const independentVowels: Record<string, string> = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ii', 'उ': 'u', 'ऊ': 'uu', 'ऋ': 'ri',
  'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au'
};
const vowelSigns: Record<string, string> = {
  'ा': 'aa', 'ि': 'i', 'ी': 'ii', 'ु': 'u', 'ू': 'uu', 'ृ': 'ri',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au'
};
const consonants: Record<string, string> = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n', 'च': 'ch', 'छ': 'chh',
  'ज': 'j', 'झ': 'jh', 'ञ': 'n', 'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh',
  'ण': 'n', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n', 'प': 'p',
  'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l',
  'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h'
};
const unitWords = new Set([
  'a', 'an', 'and', 'of', 'the', 'for', 'per', 'kg', 'kgs', 'kilo', 'kilos',
  'kilogram', 'kilograms', 'g', 'gm', 'gms', 'gram', 'grams', 'l', 'ltr',
  'liter', 'litre', 'liters', 'litres', 'ml', 'milliliter', 'millilitre',
  'packet', 'packets', 'pack', 'packs', 'bottle', 'bottles', 'piece', 'pieces',
  'pcs', 'box', 'boxes', 'unit', 'units', 'ka', 'ki', 'ke', 'kaa', 'kee',
  'kilo', 'gram'
]);

function transliterateHindi(text: string) {
  const chars = Array.from(text);
  let result = '';
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    if (consonants[char]) {
      result += consonants[char];
      const next = chars[index + 1];
      if (next === '्') {
        index += 1;
      } else if (vowelSigns[next]) {
        result += vowelSigns[next];
        index += 1;
      } else if (next && !/[\s,.;!?।]/.test(next)) {
        result += 'a';
      }
    } else if (independentVowels[char]) {
      result += independentVowels[char];
    } else if (vowelSigns[char]) {
      result += vowelSigns[char];
    } else if (char === 'ं' || char === 'ँ') {
      result += 'n';
    } else if (char === 'ः') {
      result += 'h';
    } else if (char !== '़' && char !== '्' && char !== '‍') {
      result += char;
    }
  }
  return result;
}

function strictProductText(value: string) {
  return transliterateHindi(
    normalizeSpeech(value).normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\u0900-\u097f\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  ).replace(/w/g, 'v').replace(/\s+/g, ' ').trim();
}

function fuzzyProductTokens(value: string) {
  const tokens = strictProductText(value).split(/\s+/).filter(token => token && !unitWords.has(token));
  const normalized = tokens.map(token => token
    .replace(/([aeiou])\1+/g, '$1')
    .replace(/([bcdfghjklmnpqrstvwxyz])\1+/g, '$1'));
  return normalized.length ? normalized : strictProductText(value).split(/\s+/).filter(Boolean);
}

function editSimilarity(left: string, right: string) {
  if (left === right) return 1;
  if (Math.min(left.length, right.length) < 3) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (left[row - 1] === right[column - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

function tokenSimilarity(left: string, right: string) {
  if (left === right) return 1;
  if (left.length >= 4 && right.length >= 4) {
    const consonantKey = (value: string) => value.replace(/[aeiou]/g, '').replace(/(.)\1+/g, '$1');
    const leftKey = consonantKey(left);
    const rightKey = consonantKey(right);
    if (leftKey.length >= 2 && leftKey === rightKey) return 0.9;
    const shorter = Math.min(left.length, right.length);
    const longer = Math.max(left.length, right.length);
    if ((left.startsWith(right) || right.startsWith(left)) && shorter / longer >= 0.65) return 0.84;
  }
  return editSimilarity(left, right);
}

function productScore(query: string[], candidate: string[]) {
  if (!query.length || !candidate.length) return 0;
  const coverage = (source: string[], target: string[]) =>
    source.reduce((sum, token) => sum + Math.max(0, ...target.map(other => tokenSimilarity(token, other))), 0) / source.length;
  return 0.9 * coverage(query, candidate) + 0.1 * coverage(candidate, query);
}

export type CatalogMatch =
  | { status: 'matched'; product: Record<string, unknown> }
  | { status: 'ambiguous'; products: Record<string, unknown>[] }
  | { status: 'unmatched' };

export function matchSpokenProduct(spokenName: string, products: Record<string, unknown>[]): CatalogMatch {
  const strictName = strictProductText(spokenName);
  const exact = products.filter(product =>
    [product.name, product.sku, product.barcode]
      .some(value => typeof value === 'string' && strictProductText(value) === strictName)
  );
  if (exact.length === 1) return { status: 'matched', product: exact[0] };
  if (exact.length > 1) return { status: 'ambiguous', products: exact.slice(0, 3) };

  const query = fuzzyProductTokens(spokenName);
  const ranked = products
    .map(product => ({ product, score: productScore(query, fuzzyProductTokens(String(product.name ?? ''))) }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best || best.score < 0.78) return { status: 'unmatched' };
  const closeMatches = ranked.filter(candidate => best.score - candidate.score < 0.1).slice(0, 3);
  if (closeMatches.length > 1) return { status: 'ambiguous', products: closeMatches.map(candidate => candidate.product) };
  return { status: 'matched', product: best.product };
}
