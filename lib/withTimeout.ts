export class TimeoutError extends Error {
  constructor(public label: string) {
    super(`timeout:${label}`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> {
  let timerId: ReturnType<typeof setTimeout>;
  const race = Promise.race<T>([
    Promise.resolve(p),
    new Promise<never>((_, reject) => {
      timerId = setTimeout(() => reject(new TimeoutError(label)), ms);
    }),
  ]);
  // Always clear the timer — no leak whether p resolves, rejects, or times out.
  return race.finally(() => clearTimeout(timerId));
}
