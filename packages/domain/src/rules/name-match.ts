const HONORIFICS: ReadonlySet<string> = new Set([
  'MR',
  'MRS',
  'MS',
  'MISS',
  'DR',
  'SHRI',
  'SMT',
  'KUM',
  'MASTER',
]);

/** Upper-cases, drops honorific tokens and removes all whitespace, so "Mr Rajesh Sharma" and "RAJESH
 * SHARMA" compare identically. */
function normalize(raw: string): string {
  return raw
    .toUpperCase()
    .split(/\s+/)
    .filter((token) => token.length > 0 && !HONORIFICS.has(token))
    .join('');
}

/** Standard Jaro similarity, 0..1. */
function jaro(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  const matchDistance = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatched = new Array<boolean>(a.length).fill(false);
  const bMatched = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i += 1) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(b.length - 1, i + matchDistance);
    for (let j = start; j <= end; j += 1) {
      if (bMatched[j] || a[i] !== b[j]) continue;
      aMatched[i] = true;
      bMatched[j] = true;
      matches += 1;
      break;
    }
  }
  if (matches === 0) return 0;
  let transpositions = 0;
  let bIndex = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (!aMatched[i]) continue;
    while (!bMatched[bIndex]) bIndex += 1;
    if (a[i] !== b[bIndex]) transpositions += 1;
    bIndex += 1;
  }
  // Integer half, as in Winkler's strcmp95: 5 out-of-order matches count as 2 transpositions, not 2.5.
  const t = Math.floor(transpositions / 2);
  return (matches / a.length + matches / b.length + (matches - t) / matches) / 3;
}

/** Jaro-Winkler: boosts `jaro` by a shared prefix (max 4 chars, standard scaling factor 0.1). */
function jaroWinkler(a: string, b: string): number {
  const j = jaro(a, b);
  let prefix = 0;
  while (prefix < 4 && prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
    prefix += 1;
  }
  return j + prefix * 0.1 * (1 - j);
}

/** Name-match score 0..100 (spec row 69: Jaro-Winkler on normalised names; >= 80 -> VERIFIED). */
export function nameMatchScore(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na.length === 0 || nb.length === 0) return 0;
  return Math.round(jaroWinkler(na, nb) * 100);
}
