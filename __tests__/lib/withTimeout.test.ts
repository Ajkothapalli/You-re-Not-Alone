import { withTimeout, TimeoutError } from '@/lib/withTimeout';

describe('withTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.runAllTimers();
    jest.useRealTimers();
  });

  it('resolves with the inner promise value when it settles within the limit', async () => {
    const result = await withTimeout(Promise.resolve(42), 1_000, 'test');
    expect(result).toBe(42);
  });

  it('rejects with TimeoutError when the promise hangs past the limit', async () => {
    const hanging = new Promise<never>(() => {}); // never settles
    const race = withTimeout(hanging, 1_000, 'slow');

    jest.advanceTimersByTime(1_001);

    await expect(race).rejects.toBeInstanceOf(TimeoutError);
  });

  it('TimeoutError carries the label', async () => {
    const race = withTimeout(new Promise<never>(() => {}), 500, 'my-label');
    jest.advanceTimersByTime(501);

    let caught: unknown;
    try { await race; } catch (e) { caught = e; }

    expect(caught).toBeInstanceOf(TimeoutError);
    expect((caught as TimeoutError).label).toBe('my-label');
    expect((caught as TimeoutError).message).toBe('timeout:my-label');
  });

  it('forwards a rejection that arrives before the timeout', async () => {
    const boom = Promise.reject(new Error('network'));
    await expect(withTimeout(boom, 1_000, 'x')).rejects.toThrow('network');
  });

  it('clears the timer on success so there is no open handle', async () => {
    const clearSpy = jest.spyOn(global, 'clearTimeout');
    await withTimeout(Promise.resolve('ok'), 1_000, 'x');
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
