// @ts-nocheck
// Shared timeout/cancellation utilities. The key difference from the old
// per-module withTimeout copies: timing out (or a caller abort) actually
// aborts the underlying work via AbortSignal instead of only rejecting and
// letting the provider call keep running.

export class TimeoutError extends Error {
  constructor(reason = "timeout") {
    // message === reason keeps compatibility with existing
    // `error?.message === "agent_timeout"` checks.
    super(reason);
    this.name = "TimeoutError";
    this.reason = reason;
  }
}

export function isTimeoutError(error, reason = null) {
  if (!error) return false;
  if (error instanceof TimeoutError) {
    return reason === null || error.reason === reason;
  }
  return reason !== null && error?.message === reason;
}

// Runs `run(signal)` against a deadline. On timeout the signal is aborted
// first (so fetches and adapter calls stop), then the promise rejects with
// TimeoutError(reason). An already-aborted or later-aborted parentSignal is
// propagated into the same signal.
export async function withAbortTimeout(run, { timeoutMs, reason = "timeout", parentSignal = null } = {}) {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort(parentSignal?.reason);
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort(parentSignal.reason);
    else parentSignal.addEventListener?.("abort", onParentAbort, { once: true });
  }
  let timer = null;
  try {
    return await new Promise((resolve, reject) => {
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        timer = setTimeout(() => {
          controller.abort(new TimeoutError(reason));
          reject(new TimeoutError(reason));
        }, timeoutMs);
      }
      Promise.resolve()
        .then(() => run(controller.signal))
        .then(resolve, reject);
    });
  } finally {
    if (timer) clearTimeout(timer);
    parentSignal?.removeEventListener?.("abort", onParentAbort);
  }
}

// Returns a signal that aborts as soon as any input signal aborts. Null and
// undefined inputs are skipped; with zero usable inputs, returns a signal
// that never aborts.
export function linkAbortSignals(...signals) {
  const usable = signals.filter(Boolean);
  if (usable.length === 1) return usable[0];
  const controller = new AbortController();
  for (const signal of usable) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener?.("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

// Legacy promise-only timeout, kept for call sites that cannot thread a
// signal yet. Prefer withAbortTimeout for new code.
export function withTimeout(promise, timeoutMs, reason) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(reason)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
