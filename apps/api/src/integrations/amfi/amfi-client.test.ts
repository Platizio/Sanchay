import { request } from 'undici';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AmfiClient, AmfiHttpError, DAILY_TIMEOUTS, HISTORY_TIMEOUTS } from './amfi-client.js';

vi.mock('undici', () => ({ request: vi.fn() }));

const requestMock = vi.mocked(request);
const HISTORY =
  'https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?frmdt=2026-09-01&todt=2026-09-30';

function answer(statusCode: number, text = '') {
  return { statusCode, body: { text: async () => text, dump: vi.fn(async () => {}) } };
}

function headersTimeout(): Error {
  return Object.assign(new Error('Headers Timeout Error'), { code: 'UND_ERR_HEADERS_TIMEOUT' });
}

describe('AmfiClient', () => {
  afterEach(() => {
    requestMock.mockReset();
  });

  it('waits minutes for the history report (a month needs 8-31 s before its first byte)', async () => {
    requestMock.mockResolvedValueOnce(answer(200, 'history') as never);
    await expect(
      new AmfiClient(async () => {}).fetchHistory('2026-09-01', '2026-09-30'),
    ).resolves.toBe('history');
    expect(requestMock).toHaveBeenCalledWith(HISTORY, { method: 'GET', ...HISTORY_TIMEOUTS });
    expect(HISTORY_TIMEOUTS.headersTimeout).toBeGreaterThanOrEqual(120_000);
  });

  it('keeps the daily file on its 10 s header timeout', async () => {
    requestMock.mockResolvedValueOnce(answer(200, 'daily') as never);
    await expect(new AmfiClient(async () => {}).fetchDaily()).resolves.toBe('daily');
    expect(requestMock).toHaveBeenCalledWith('https://portal.amfiindia.com/spages/NAVAll.txt', {
      method: 'GET',
      ...DAILY_TIMEOUTS,
    });
  });

  it('retries a timeout and a 503 after 2 s and 4 s, then returns the third answer', async () => {
    const sleep = vi.fn(async () => {});
    const unavailable = answer(503);
    requestMock
      .mockRejectedValueOnce(headersTimeout())
      .mockResolvedValueOnce(unavailable as never)
      .mockResolvedValueOnce(answer(200, 'history') as never);
    await expect(new AmfiClient(sleep).fetchHistory('2026-09-01', '2026-09-30')).resolves.toBe(
      'history',
    );
    expect(requestMock).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[2_000], [4_000]]);
    expect(unavailable.body.dump).toHaveBeenCalledOnce();
  });

  it('gives up after three attempts with the last error', async () => {
    requestMock.mockRejectedValue(headersTimeout());
    await expect(
      new AmfiClient(async () => {}).fetchHistory('2026-09-01', '2026-09-30'),
    ).rejects.toThrow('Headers Timeout Error');
    expect(requestMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a 404', async () => {
    requestMock.mockResolvedValue(answer(404) as never);
    const failure = new AmfiClient(async () => {}).fetchHistory('2026-09-01', '2026-09-30');
    await expect(failure).rejects.toBeInstanceOf(AmfiHttpError);
    await expect(failure).rejects.toThrow(`AMFI feed ${HISTORY} returned 404`);
    expect(requestMock).toHaveBeenCalledOnce();
  });
});
