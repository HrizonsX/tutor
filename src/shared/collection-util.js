// @ts-nocheck
// Shared dedupe helpers. The two variants are intentionally distinct: the
// historical per-module copies had split semantics (two filtered falsy
// values, two did not), so merging them into one function would silently
// change one set of call sites. Pick by intent.

export function unique(values = []) {
  return Array.from(new Set(values));
}

export function uniqueTruthy(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}
