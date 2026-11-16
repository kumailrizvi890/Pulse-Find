// Dashboard load timeout (Nov 16, 2026).
//
// On Kumail's phone the signed-in dashboard once sat on the grey pulsing
// skeleton for up to ~a minute on first load before the numbers came in;
// a reload resolved in under 15s, and /demo loads instantly. Before this,
// Dashboard.tsx had no load timeout at all: a hung store.load() showed the
// skeleton forever instead of the error panel with "Try again".
//
// withLoadTimeout races a load against a timer. Whichever settles first
// wins and the other side is ignored: a load that finishes late can never
// overwrite the timeout error, and a load that errors fast keeps its own
// error instead of the timeout one. The timer is cleared the moment the
// load settles, and the load's own settle is always observed, so a late
// rejection after the timeout fired can never surface as an unhandled
// rejection. The timeout message defaults to the tracker's; callers pass
// their own when the load is something else (leads, contacts, openings).
// The load only needs to be a thenable: the jobs query builder has a
// `then` but no `catch` or `finally`, so it is a PromiseLike, not a
// Promise.

export const LOAD_TIMEOUT_MS = 15_000;

export const LOAD_TIMEOUT_MESSAGE =
  "Your tracker is taking longer than usual to load. Check your connection and try again.";

export function withLoadTimeout<T>(
  promise: PromiseLike<T>,
  ms: number = LOAD_TIMEOUT_MS,
  message: string = LOAD_TIMEOUT_MESSAGE,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  const clear = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  // Observe the load's settle either way: the handlers clear the timer
  // and pass the outcome through, so a late settle after the timeout
  // fired is swallowed instead of becoming an unhandled rejection.
  const observed = promise.then(
    (value) => {
      clear();
      return value;
    },
    (error: unknown) => {
      clear();
      throw error;
    },
  );
  return Promise.race([observed, timeout]);
}
