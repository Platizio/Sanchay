export type EnumValue<T extends readonly string[]> = T[number];

/** Freezes a literal list; duplicate values are a programming error. */
export function defineEnum<const T extends readonly string[]>(values: T): T {
  if (new Set(values).size !== values.length) {
    throw new Error(`defineEnum: duplicate value in [${values.join(', ')}]`);
  }
  return Object.freeze(values) as T;
}

export function isOneOf<T extends readonly string[]>(
  values: T,
  input: unknown,
): input is T[number] {
  return typeof input === 'string' && values.includes(input);
}
