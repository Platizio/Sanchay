import { setTimeout as delay } from 'node:timers/promises';
import { request } from 'undici';

const DAILY_URL = 'https://portal.amfiindia.com/spages/NAVAll.txt';
const HISTORY_URL = 'https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx';
const MAX_ATTEMPTS = 3;
/** "Not now" answers, retried like a network error or a timeout; any other non-2xx status is final. */
const RETRYABLE_STATUS = new Set([408, 429]);

/** How long a request waits for its response headers, and then between two chunks of its body. */
export interface AmfiTimeouts {
  headersTimeout: number;
  bodyTimeout: number;
}

/** NAVAll.txt (about 1.5 MB) starts answering in under a second. */
export const DAILY_TIMEOUTS: AmfiTimeouts = { headersTimeout: 10_000, bodyTimeout: 30_000 };

/**
 * The history report sends nothing until AMFI has built the whole range: one month took 8 to 31 s and
 * three months 66 s before the first byte (2026-10-05), so the backfill asks for one month at a time.
 * 5 minutes also stays under the 350 s after which prod's NAT gateway drops an idle connection.
 */
export const HISTORY_TIMEOUTS: AmfiTimeouts = { headersTimeout: 300_000, bodyTimeout: 60_000 };

/** A non-2xx answer from AMFI. */
export class AmfiHttpError extends Error {
  override name = 'AmfiHttpError';

  constructor(
    readonly statusCode: number,
    url: string,
  ) {
    super(`AMFI feed ${url} returned ${statusCode}`);
  }
}

function retryable(e: unknown): boolean {
  if (!(e instanceof AmfiHttpError)) return true;
  return e.statusCode >= 500 || RETRYABLE_STATUS.has(e.statusCode);
}

function backoffMs(attempt: number): number {
  return Math.min(2_000 * 2 ** (attempt - 2), 16_000);
}

async function fetchOnce(url: string, timeouts: AmfiTimeouts): Promise<string> {
  const res = await request(url, { method: 'GET', ...timeouts });
  if (res.statusCode < 200 || res.statusCode > 299) {
    await res.body.dump();
    throw new AmfiHttpError(res.statusCode, url);
  }
  return res.body.text();
}

export class AmfiClient {
  constructor(private readonly sleep: (ms: number) => Promise<unknown> = (ms) => delay(ms)) {}

  fetchDaily(): Promise<string> {
    return this.fetchWithRetry(DAILY_URL, DAILY_TIMEOUTS);
  }

  /** AMFI's history report for [fromIso, toIso], both inclusive; AMFI accepts ISO dates. */
  fetchHistory(fromIso: string, toIso: string): Promise<string> {
    const params = new URLSearchParams({ frmdt: fromIso, todt: toIso });
    return this.fetchWithRetry(`${HISTORY_URL}?${params.toString()}`, HISTORY_TIMEOUTS);
  }

  /** Up to MAX_ATTEMPTS attempts: a network error, a timeout, a 5xx, 408 or 429 is tried again after 2 s, then 4 s. */
  private async fetchWithRetry(url: string, timeouts: AmfiTimeouts): Promise<string> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fetchOnce(url, timeouts);
      } catch (e) {
        if (attempt >= MAX_ATTEMPTS || !retryable(e)) throw e;
      }
      await this.sleep(backoffMs(attempt + 1));
    }
  }
}
