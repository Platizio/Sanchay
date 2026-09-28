const DOT = '•';

/** '••••••3210' (six U+2022, then the last four digits). */
export function maskMobile(mobile: string): string {
  return `${DOT.repeat(6)}${mobile.trim().slice(-4)}`;
}

/** 'r•••@gmail.com': first character, three U+2022, then '@domain', all lower-cased. */
export function maskEmail(email: string): string {
  const normalised = email.trim().toLowerCase();
  const at = normalised.lastIndexOf('@');
  return `${normalised.slice(0, 1)}${DOT.repeat(3)}${normalised.slice(at)}`;
}
