export type NormalizedProductText = { token: string; compact: string; tokens: string[] };
export type SearchableProduct = {
  sku: string;
  name: string;
  supplierDescription?: string | null;
  category?: string | null;
  barcodes: Array<{ barcode: string }>;
  aliases: Array<{ text: string; normalizedToken: string; normalizedCompact: string; source?: 'MANUAL' | 'IMPORT' | 'GENERATED' }>;
  searchDimensions?: string[];
  searchMaterials?: string[];
  searchProductTypes?: string[];
};

export type StructuredHardwareQuery = {
  dimension: string | null;
  dimensionLabel: string | null;
  material: 'STAINLESS_STEEL' | 'MILD_STEEL' | null;
  materialLabel: string | null;
  productType: 'NIPPLE' | 'BEND' | 'REDUCING_BUSH' | 'PIPE_SLIP' | null;
  productTypeLabel: string | null;
  familyTerms: string[];
  structured: boolean;
  unsafeShorthandOnly: boolean;
};

const optionalPunctuation = /[\/._\-'’()[\]{}]+/gu;
const otherSeparators = /[^\p{L}\p{N}]+/gu;

export function normalizeProductText(value: string): NormalizedProductText {
  const protectedDimensions = value.normalize('NFKC').toLocaleLowerCase('en')
    .replace(/(\p{N})\s*\/\s*(\p{N})/gu, '$1 fraction $2')
    .replace(/(\p{N})\s*\.\s*(\p{N})/gu, '$1 decimal $2')
    .replace(/(\p{N})\s*["″]/gu, '$1 inch ')
    .replace(/(\p{N})\s*['’′]/gu, '$1 foot ');
  const token = protectedDimensions.replace(optionalPunctuation, ' ').replace(otherSeparators, ' ').trim().replace(/\s+/g, ' ');
  return { token, compact: token.replace(/\s+/g, ''), tokens: token ? token.split(' ') : [] };
}

export const managedSynonymGroups = [
  ['ss', 's.s', 's/steel', 'stainless steel'],
  ['ms', 'm.s', 'm/s', 'm steel', 'mild steel'],
  ['reducing', 'r bush', 'r/bush', 'rbush', 'valve socket'],
  ['p sleeve', 'p/sleeve', 'psleeve', 'pipe sleeve', 'p slip', 'p-slip', 'pslip', 'pipe slip'],
] as const;

const materialDefinitions = [
  { value: 'STAINLESS_STEEL' as const, label: 'S/STEEL', pattern: /(^|[^\p{L}\p{N}])(?:stainless\s+steel|s\s*\/\s*steel|s\s*\.\s*s|ss)(?=$|[^\p{L}\p{N}])/iu },
  { value: 'MILD_STEEL' as const, label: 'Mild steel', pattern: /(^|[^\p{L}\p{N}])(?:mild\s+steel|m\s+steel|m\s*\/\s*s|m\s*\.\s*s|ms)(?=$|[^\p{L}\p{N}])/iu },
];

const productTypeDefinitions = [
  { value: 'REDUCING_BUSH' as const, label: 'Reducing bush', pattern: /(^|[^\p{L}\p{N}])(?:reducing\s+bush|r\s*\/\s*bush|r\s+bush|rbush|valve\s+socket)(?=$|[^\p{L}\p{N}])/iu },
  { value: 'PIPE_SLIP' as const, label: 'Pipe Sleeve', pattern: /(^|[^\p{L}\p{N}])(?:pipe\s+(?:slip|sleeve)|p\s*[-/]\s*(?:slip|sleeve)|p\s+(?:slip|sleeve)|p(?:slip|sleeve))(?=$|[^\p{L}\p{N}])/iu },
  { value: 'NIPPLE' as const, label: 'Nipple', pattern: /(^|[^\p{L}\p{N}])(?:nipple|n)(?=$|[^\p{L}\p{N}])/iu },
  { value: 'BEND' as const, label: 'Bend', pattern: /(^|[^\p{L}\p{N}])(?:bend|b)(?=$|[^\p{L}\p{N}])/iu },
];

const productTypeFieldDefinitions = [
  productTypeDefinitions[0], productTypeDefinitions[1],
  { value: 'NIPPLE' as const, label: 'Nipple', pattern: /(^|[^\p{L}\p{N}])nipple(?=$|[^\p{L}\p{N}])/iu },
  { value: 'BEND' as const, label: 'Bend', pattern: /(^|[^\p{L}\p{N}])bend(?=$|[^\p{L}\p{N}])/iu },
] as const;

function canonicalHardwareText(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('en').replace(/⁄/g, '/').replace(/½/g, '1/2');
}

function canonicalDimension(value: string) {
  return value.trim().replace(/\s+/g, ' ').replace(/\s*\/\s*/g, '/').replace(/\s*(?:["″]|['’′]{1,2}|inch(?:es)?|in)\s*$/iu, '') + '"';
}

function dimensionLabel(value: string) { return `${value.slice(0, -1)}″`; }

function dimensionMatches(value: string) {
  const text = canonicalHardwareText(value);
  const matches: Array<{ raw: string; value: string; index: number; end: number }> = [];
  // Match a mixed fraction as one dimension before considering simple fractions.
  // This is what prevents the `1/2` inside `1 1/2` from becoming a second,
  // false half-inch dimension.
  const fractions = /(^|[^\d])((?:\d+\s+)?\d+\s*\/\s*\d+)(?:\s*(?:["″]|['’′]{1,2}|inch(?:es)?\b|in\b))?/giu;
  for (const match of text.matchAll(fractions)) {
    const boundary = match[1].length; const index = (match.index ?? 0) + boundary;
    const raw = match[0].slice(boundary);
    matches.push({ raw, value: canonicalDimension(match[2]), index, end: index + raw.length });
  }
  const integers = /(^|[^\d])(\d+(?:\.\d+)?)\s*(?:["″]|['’′]{1,2}|inch(?:es)?\b|in\b)/giu;
  for (const match of text.matchAll(integers)) {
    const boundary = match[1].length; const index = (match.index ?? 0) + boundary;
    const raw = match[0].slice(boundary); const end = index + raw.length;
    if (!matches.some((item) => index < item.end && end > item.index)) matches.push({ raw, value: canonicalDimension(match[2]), index, end });
  }
  return matches.sort((left, right) => left.index - right.index);
}

function matchedDefinition<T extends { value: string; label: string; pattern: RegExp }>(value: string, definitions: readonly T[]) {
  return definitions.map((definition) => ({ definition, match: definition.pattern.exec(value) })).filter((entry) => entry.match).sort((left, right) => left.match!.index - right.match!.index)[0] ?? null;
}

function removeMatch(value: string, match: RegExpMatchArray | RegExpExecArray | null | undefined) {
  if (!match || match.index == null) return value;
  return `${value.slice(0, match.index)} ${value.slice(match.index + match[0].length)}`;
}

export function parseStructuredHardwareQuery(query: string): StructuredHardwareQuery {
  const text = canonicalHardwareText(query);
  const materialMatch = matchedDefinition(text, materialDefinitions);
  const typeMatch = matchedDefinition(text, productTypeDefinitions);
  const dimensions = dimensionMatches(text);
  let dimension = dimensions[0]?.value ?? null;
  let dimensionRaw = dimensions[0]?.raw ?? null;
  if (!dimension) {
    const ten = /(^|[^\d])10(?=$|[^\d])/u.exec(text);
    const followingHardwareIndex = Math.min(materialMatch?.match?.index ?? Number.POSITIVE_INFINITY, typeMatch?.match?.index ?? Number.POSITIVE_INFINITY);
    const tenIndex = ten ? (ten.index + ten[1].length) : Number.POSITIVE_INFINITY;
    const followedByMillimetres = ten ? /^\s*mm\b/iu.test(text.slice(tenIndex + 2)) : false;
    if (ten && !followedByMillimetres && tenIndex < followingHardwareIndex) { dimension = '10"'; dimensionRaw = '10'; }
  }
  let remaining = text;
  if (dimensionRaw) {
    const index = remaining.indexOf(dimensionRaw);
    if (index >= 0) remaining = `${remaining.slice(0, index)} ${remaining.slice(index + dimensionRaw.length)}`;
  }
  remaining = removeMatch(remaining, matchedDefinition(remaining, materialDefinitions)?.match);
  remaining = removeMatch(remaining, matchedDefinition(remaining, productTypeDefinitions)?.match);
  const familyTerms = normalizeProductText(remaining).tokens.filter((token) => !['inch', 'in', 'foot'].includes(token));
  const recognizedCount = Number(Boolean(dimension)) + Number(Boolean(materialMatch)) + Number(Boolean(typeMatch));
  const compact = normalizeProductText(query).compact;
  const unsafeShorthandOnly = recognizedCount === 1 && Boolean(typeMatch) && ['n', 'b'].includes(compact);
  return {
    dimension, dimensionLabel: dimension ? dimensionLabel(dimension) : null,
    material: materialMatch?.definition.value ?? null, materialLabel: materialMatch?.definition.label ?? null,
    productType: typeMatch?.definition.value ?? null, productTypeLabel: typeMatch?.definition.label ?? null,
    // An explicit fractional/quoted dimension is safe and useful by itself.
    // Bare integer inference (for example `10 ms b`) still needs another field.
    familyTerms, structured: !unsafeShorthandOnly && (Boolean(dimensions.length) || recognizedCount >= 2), unsafeShorthandOnly,
  };
}

export function structuredSearchFieldsForProduct(values: Array<string | null | undefined>) {
  const text = values.filter(Boolean).join(' ');
  const searchDimensions = [...new Set(dimensionMatches(text).map((match) => match.value))];
  const searchMaterials = materialDefinitions.filter((definition) => definition.pattern.test(canonicalHardwareText(text))).map((definition) => definition.value);
  const searchProductTypes = productTypeFieldDefinitions.filter((definition) => definition.pattern.test(canonicalHardwareText(text))).map((definition) => definition.value);
  return { searchDimensions, searchMaterials, searchProductTypes };
}

function derivedProductFields(product: SearchableProduct) {
  return structuredSearchFieldsForProduct([
    product.name, product.supplierDescription, product.category,
    ...product.aliases.filter((alias) => alias.source !== 'GENERATED').map((alias) => alias.text),
  ]);
}

export function matchesStructuredProduct(product: SearchableProduct, query: StructuredHardwareQuery) {
  const derived = derivedProductFields(product);
  const dimensions = derived.searchDimensions;
  const materials = derived.searchMaterials;
  const productTypes = derived.searchProductTypes;
  if (query.dimension && !dimensions.includes(query.dimension)) return false;
  if (query.material && !materials.includes(query.material)) return false;
  if (query.productType && !productTypes.includes(query.productType)) return false;
  if (query.familyTerms.length) {
    const searchable = normalizeProductText([product.name, product.supplierDescription, product.category, ...product.aliases.map((alias) => alias.text)].filter(Boolean).join(' '));
    if (!query.familyTerms.every((term) => searchable.tokens.some((token) => token.startsWith(term)))) return false;
  }
  return true;
}

export function structuredRelatedScore(product: SearchableProduct, query: StructuredHardwareQuery) {
  const derived = derivedProductFields(product);
  return Number(Boolean(query.dimension && derived.searchDimensions.includes(query.dimension)))
    + Number(Boolean(query.material && derived.searchMaterials.includes(query.material)))
    + Number(Boolean(query.productType && derived.searchProductTypes.includes(query.productType)));
}

export function structuredMatchSpecificity(product: SearchableProduct, query: StructuredHardwareQuery) {
  const derived = derivedProductFields(product);
  const dimensions = derived.searchDimensions;
  const materials = derived.searchMaterials;
  const productTypes = derived.searchProductTypes;
  return Number(query.dimension ? Math.max(0, dimensions.length - 1) : 0) * 100
    + Number(query.material ? Math.max(0, materials.length - 1) : 0) * 10
    + Number(query.productType ? Math.max(0, productTypes.length - 1) : 0);
}

export function structuredVariantPenalty(product: SearchableProduct, query: StructuredHardwareQuery) {
  const name = canonicalHardwareText(product.name);
  let penalty = 0;
  // A generic NIPPLE query must prefer the plain product over specialised
  // hose, KC, and reducing nipples which happen to share the same dimensions.
  if (query.productType === 'NIPPLE' && /(^|[^\p{L}\p{N}])(?:hose|kc|reducing|r)\s*[/\-]?\s*nipple(?=$|[^\p{L}\p{N}])/iu.test(name)) penalty += 10;
  // S/STEEL is RetailOS's canonical display term. Accepted aliases still
  // match, but the canonical catalogue wording wins deterministic ties.
  if (query.material === 'STAINLESS_STEEL' && !/(^|[^\p{L}\p{N}])s\s*\/\s*steel(?=$|[^\p{L}\p{N}])/iu.test(name)) penalty += 1;
  return penalty;
}

export function expandedSearchTerms(query: string) {
  const normalized = normalizeProductText(query);
  const group = managedSynonymGroups.find((entries) => entries.some((entry) => {
    const candidate = normalizeProductText(entry);
    return candidate.token === normalized.token || candidate.compact === normalized.compact;
  }));
  return [...new Set([query.trim(), ...(group ?? [])].filter(Boolean))];
}

export function generatedAliasesForProduct(values: Array<string | null | undefined>) {
  const fields = structuredSearchFieldsForProduct(values);
  const groups = [
    fields.searchMaterials.includes('STAINLESS_STEEL') ? managedSynonymGroups[0] : [],
    fields.searchMaterials.includes('MILD_STEEL') ? managedSynonymGroups[1] : [],
    fields.searchProductTypes.includes('REDUCING_BUSH') ? managedSynonymGroups[2] : [],
    fields.searchProductTypes.includes('PIPE_SLIP') ? managedSynonymGroups[3] : [],
  ];
  const aliases = groups.flatMap((group) => [...group]);
  return [...new Map(aliases.map((text) => [text.normalize('NFKC').trim().toLocaleLowerCase('en'), text])).values()];
}

export function rankProduct(product: SearchableProduct, query: string) {
  const needle = normalizeProductText(query);
  const sku = normalizeProductText(product.sku);
  const name = normalizeProductText(product.name);
  const fields = [name, normalizeProductText(product.supplierDescription ?? ''), normalizeProductText(product.category ?? '')];
  const exactBarcode = product.barcodes.some((item) => item.barcode.trim() === query.trim());
  if (exactBarcode) return { rank: 0, matchedAlias: null as string | null };
  if (sku.token === needle.token) return { rank: 1, matchedAlias: null as string | null };
  if (name.token === needle.token) return { rank: 2, matchedAlias: null as string | null };
  const exactAlias = product.aliases.find((alias) => alias.normalizedToken === needle.token);
  if (exactAlias) return { rank: 3, matchedAlias: exactAlias.text };
  const compactAlias = product.aliases.find((alias) => alias.normalizedCompact === needle.compact);
  if (compactAlias) return { rank: 4, matchedAlias: compactAlias.text };
  const prefixAlias = product.aliases.find((alias) => alias.normalizedToken.startsWith(needle.token) || alias.normalizedCompact.startsWith(needle.compact));
  if (sku.token.startsWith(needle.token) || fields.some((field) => field.token.startsWith(needle.token)) || prefixAlias) return { rank: 5, matchedAlias: prefixAlias?.text ?? null };
  const matchingAlias = product.aliases.find((alias) => needle.tokens.every((part) => alias.normalizedToken.split(' ').some((token) => token.startsWith(part))));
  if (needle.tokens.length && (fields.some((field) => needle.tokens.every((part) => field.tokens.some((token) => token.startsWith(part)))) || matchingAlias)) return { rank: 6, matchedAlias: matchingAlias?.text ?? null };
  return null;
}

export function fuzzyProduct(product: SearchableProduct, query: string) {
  const needle = normalizeProductText(query).compact;
  if (needle.length < 4) return null;
  const candidates = [
    { text: product.name, compact: normalizeProductText(product.name).compact, alias: null as string | null },
    { text: product.sku, compact: normalizeProductText(product.sku).compact, alias: null as string | null },
    ...product.aliases.map((alias) => ({ text: alias.text, compact: alias.normalizedCompact, alias: alias.text })),
  ];
  const best = candidates.map((candidate) => ({ ...candidate, distance: editDistance(needle, candidate.compact) })).sort((a, b) => a.distance - b.distance || a.text.localeCompare(b.text))[0];
  const threshold = Math.max(1, Math.floor(needle.length * 0.25));
  return best && best.distance <= threshold ? { rank: 7, matchedAlias: best.alias, fuzzy: true as const } : null;
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    let diagonal = previous[0]; previous[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[right.length];
}
