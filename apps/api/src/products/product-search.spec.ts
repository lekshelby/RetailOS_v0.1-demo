import { expandedSearchTerms, fuzzyProduct, generatedAliasesForProduct, matchesStructuredProduct, normalizeProductText, parseStructuredHardwareQuery, rankProduct, structuredSearchFieldsForProduct } from './product-search';

const product = (overrides: Partial<Parameters<typeof rankProduct>[0]> = {}) => ({
  sku: 'SKU-1', name: 'REDUCING BUSH', supplierDescription: null, category: 'Fittings', barcodes: [{ barcode: '95550001' }],
  aliases: [{ text: 'r/bush', normalizedToken: 'r bush', normalizedCompact: 'rbush' }], ...overrides,
});
const aliases = (values: string[]) => values.map((text) => ({ text, ...normalizeProductText(text) })).map(({ text, token: normalizedToken, compact: normalizedCompact }) => ({ text, normalizedToken, normalizedCompact }));

describe('product search normalization and ranking', () => {
  it('normalizes punctuation aliases but preserves numeric fractions', () => {
    expect(normalizeProductText(' S.S  ')).toMatchObject({ token: 's s', compact: 'ss' });
    expect(normalizeProductText('1/2').compact).toBe('1fraction2');
    expect(normalizeProductText('1/2').compact).not.toBe(normalizeProductText('12').compact);
  });

  it.each(['ss', 's.s', 's/steel', 'stainless steel'])('expands stainless-steel synonym %s', (query) => {
    expect(expandedSearchTerms(query)).toEqual(expect.arrayContaining(['ss', 's/steel', 'stainless steel']));
  });

  it.each(['ms', 'm.s', 'm/s', 'm steel'])('expands mild-steel synonym %s', (query) => {
    expect(expandedSearchTerms(query)).toEqual(expect.arrayContaining(['ms', 'm/s', 'mild steel']));
  });

  it.each(['reducing', 'r/bush', 'rbush', 'valve socket'])('maps fitting synonym %s', (query) => {
    expect(expandedSearchTerms(query)).toEqual(expect.arrayContaining(['reducing', 'r/bush', 'valve socket']));
  });

  it.each(['p sleeve', 'p/sleeve', 'psleeve', 'pipe sleeve', 'p-slip', 'p slip', 'pslip', 'pipe slip'])('maps pipe-sleeve synonym %s', (query) => {
    expect(expandedSearchTerms(query)).toEqual(expect.arrayContaining(['p sleeve', 'p/sleeve', 'pipe sleeve', 'p-slip', 'pipe slip']));
  });

  it('keeps barcode and SKU ahead of exact aliases', () => {
    expect(rankProduct(product(), '95550001')?.rank).toBe(0);
    expect(rankProduct(product(), 'SKU-1')?.rank).toBe(1);
    expect(rankProduct(product(), 'r/bush')).toEqual({ rank: 3, matchedAlias: 'r/bush' });
  });

  it('generates the complete managed synonym group from punctuated master data', () => {
    expect(generatedAliasesForProduct(['S/STEEL ELBOW'])).toEqual(expect.arrayContaining(['ss', 's.s', 's/steel', 'stainless steel']));
  });

  it('uses fuzzy suggestions only after strong ranking has returned no result', () => {
    expect(rankProduct(product({ name: 'PIPE SLIP', aliases: [] }), 'pipe slip')?.rank).toBe(2);
    expect(fuzzyProduct(product({ name: 'PIPE SLIP', aliases: [] }), 'pipe slpi')?.rank).toBe(7);
    expect(fuzzyProduct(product({ name: 'UNRELATED PRODUCT', aliases: [] }), 'pipe slpi')).toBeNull();
  });

  it.each(['ss', 's.s', 's/steel', 'stainless steel'])('matches stainless-steel alias %s', (query) => {
    expect(rankProduct(product({ name: 'S/STEEL ELBOW', aliases: aliases(generatedAliasesForProduct(['S/STEEL ELBOW'])) }), query)).not.toBeNull();
  });

  it.each(['ms', 'm.s', 'm/s', 'm steel'])('matches mild-steel alias %s', (query) => {
    expect(rankProduct(product({ name: 'MILD STEEL PIPE', aliases: aliases(generatedAliasesForProduct(['MILD STEEL PIPE'])) }), query)).not.toBeNull();
  });

  it.each(['reducing', 'r/bush', 'rbush', 'valve socket'])('matches reducing-bush alias %s', (query) => {
    expect(rankProduct(product({ aliases: aliases(generatedAliasesForProduct(['REDUCING BUSH'])) }), query)).not.toBeNull();
  });

  it.each(['p sleeve', 'p/sleeve', 'psleeve', 'pipe sleeve', 'p-slip', 'p slip', 'pslip', 'pipe slip'])('matches pipe-sleeve alias %s', (query) => {
    expect(rankProduct(product({ name: 'P/SLEEVE', aliases: aliases(generatedAliasesForProduct(['P/SLEEVE'])) }), query)).not.toBeNull();
  });

  it.each(['P/SLEEVE', 'P-SLEEVE', 'PIPE SLEEVE', 'PSLEEVE'])('maps catalogue wording %s to the managed pipe-slip aliases', (name) => {
    expect(structuredSearchFieldsForProduct([name]).searchProductTypes).toContain('PIPE_SLIP');
    expect(generatedAliasesForProduct([name])).toEqual(expect.arrayContaining(['p sleeve', 'p/sleeve', 'psleeve', 'pipe sleeve', 'p-slip', 'pslip', 'pipe slip']));
  });

  it('uses RetailOS canonical labels without changing imported product names', () => {
    expect(parseStructuredHardwareQuery('ss')).toMatchObject({ material: 'STAINLESS_STEEL', materialLabel: 'S/STEEL' });
    expect(parseStructuredHardwareQuery('p/sleeve')).toMatchObject({ productType: 'PIPE_SLIP', productTypeLabel: 'Pipe Sleeve' });
  });

  it('does not match the dimension 1/2 to the integer 12', () => {
    expect(rankProduct(product({ name: '12 MM PIPE', sku: '12', aliases: [] }), '1/2')).toBeNull();
  });

  it.each(['#12 NIPPLE', '12" NIPPLE', '1 1/2" NIPPLE', '2 1/2" NIPPLE'])('treats 1/2 as an atomic dimension and excludes %s', (name) => {
    const query = parseStructuredHardwareQuery('1/2');
    expect(query).toMatchObject({ dimension: '1/2"', structured: true });
    expect(matchesStructuredProduct(product({ name, aliases: [], ...structuredSearchFieldsForProduct([name]) }), query)).toBe(false);
  });

  it.each([
    ['1/2"', '1/2" NIPPLE', true], ['1/2″', '1/2" NIPPLE', true], ["1/2''", '1/2" NIPPLE', true],
    ['1/2"', '1 1/2" NIPPLE', false], ['1/2"', '2 1/2" NIPPLE', false], ['1/2"', '#12 NIPPLE', false], ['1/2"', '12" NIPPLE', false],
    ['2"', '2" PIPE', true], ['2"', '1/2" PIPE', false], ['2"', '1 1/2" PIPE', false], ['2"', '2 1/2" PIPE', false],
    ['3/4"', '3/4" PIPE', true], ['3/4"', '3" PIPE', false], ['3/4"', '4" PIPE', false],
    ['3"', '3" PIPE', true], ['3"', '3/4" PIPE', false], ['4"', '4" PIPE', true], ['4"', '3/4" PIPE', false],
  ])('matches dimension query %s against %s exactly', (queryText, name, expected) => {
    const query = parseStructuredHardwareQuery(queryText);
    expect(matchesStructuredProduct(product({ name, aliases: [], ...structuredSearchFieldsForProduct([name]) }), query)).toBe(expected);
  });

  it('does not generate material aliases from incidental compact substrings', () => {
    expect(generatedAliasesForProduct(['BRASS VALVE'])).toEqual([]);
    expect(generatedAliasesForProduct(['SYSTEMS PRESS CONTROL'])).toEqual([]);
    expect(generatedAliasesForProduct(['PVC PIPE CLASS B'])).toEqual([]);
  });

  it('does not classify reducing nipples as reducing-bush aliases', () => {
    expect(generatedAliasesForProduct(['1/2" S/STEEL REDUCING NIPPLE'])).not.toEqual(expect.arrayContaining(['r/bush', 'rbush', 'valve socket']));
    expect(structuredSearchFieldsForProduct(['1/2" S/STEEL REDUCING NIPPLE']).searchProductTypes).toEqual(['NIPPLE']);
  });

  it.each(['1/2 ss n', '1/2" s.s nipple', '½ s/steel n'])('parses and intersects half-inch stainless nipple query %s', (queryText) => {
    const query = parseStructuredHardwareQuery(queryText);
    expect(query).toMatchObject({ dimension: '1/2"', material: 'STAINLESS_STEEL', productType: 'NIPPLE', structured: true });
    const matching = product({ name: '1/2" S/STEEL NIPPLE', aliases: [], ...structuredSearchFieldsForProduct(['1/2" S/STEEL NIPPLE']) });
    const wrongDimension = product({ name: '12" S/STEEL NIPPLE', aliases: [], ...structuredSearchFieldsForProduct(['12" S/STEEL NIPPLE']) });
    const wrongMaterial = product({ name: '1/2" M/S NIPPLE', aliases: [], ...structuredSearchFieldsForProduct(['1/2" M/S NIPPLE']) });
    expect(matchesStructuredProduct(matching, query)).toBe(true);
    expect(matchesStructuredProduct(wrongDimension, query)).toBe(false);
    expect(matchesStructuredProduct(wrongMaterial, query)).toBe(false);
  });

  it('interprets bare 10 before hardware shorthand as inches and intersects mild-steel bend', () => {
    const query = parseStructuredHardwareQuery('10 ms b');
    expect(query).toMatchObject({ dimension: '10"', dimensionLabel: '10″', material: 'MILD_STEEL', productType: 'BEND', structured: true });
    expect(matchesStructuredProduct(product({ name: '10" MILD STEEL BEND', aliases: [], ...structuredSearchFieldsForProduct(['10" MILD STEEL BEND']) }), query)).toBe(true);
    expect(matchesStructuredProduct(product({ name: '10" MILD STEEL NIPPLE', aliases: [], ...structuredSearchFieldsForProduct(['10" MILD STEEL NIPPLE']) }), query)).toBe(false);
  });

  it('does not interpret an explicit 10 mm query as 10 inch', () => {
    expect(parseStructuredHardwareQuery('10 mm ms b').dimension).toBeNull();
  });

  it.each(['n', 'b'])('marks unsafe one-letter type query %s instead of broadening it', (queryText) => {
    expect(parseStructuredHardwareQuery(queryText)).toMatchObject({ structured: false, unsafeShorthandOnly: true });
  });
});
