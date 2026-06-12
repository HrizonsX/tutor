import test from "node:test";
import assert from "node:assert/strict";
import { redactUrlForLog, redactUrlPathForLog } from "../src/shared/redact-util.js";
import { unique, uniqueTruthy } from "../src/shared/collection-util.js";
import { FEEDBACK_EVENT_TYPES, FeedbackEventType, MemoryEventType } from "../src/shared/contracts.js";

test("full-url redaction scrubs secret query params and strips userinfo credentials", () => {
  const redacted = redactUrlForLog("https://user:hunter2@api.example/v1/chat?api_key=sk-secret&page=2");

  assert.match(redacted, /^https:\/\/api\.example\/v1\/chat\?/);
  assert.match(redacted, /api_key=<redacted>/);
  assert.match(redacted, /page=2/);
  assert.doesNotMatch(redacted, /hunter2|user:|sk-secret/);
});

test("path-only redaction never carries the endpoint host", () => {
  const redacted = redactUrlPathForLog("https://api.example/v1/chat?authorization=Bearer%20abc&lane=direct");

  assert.equal(redacted.startsWith("/v1/chat?"), true);
  assert.doesNotMatch(redacted, /api\.example/);
  assert.match(redacted, /authorization=<redacted>/);
  assert.match(redacted, /lane=direct/);
});

test("unparseable values fall back to pattern-based secret scrubbing", () => {
  assert.equal(
    redactUrlForLog("not a url ?pairing_token=abc&x=1"),
    "not a url ?pairing_token=<redacted>&x=1"
  );
  assert.equal(
    redactUrlPathForLog("not a url ?client_secret=abc"),
    "not a url ?client_secret=<redacted>"
  );
});

test("unique keeps falsy entries while uniqueTruthy drops them", () => {
  assert.deepEqual(unique(["a", "", "a", null, "b", null]), ["a", "", null, "b"]);
  assert.deepEqual(uniqueTruthy(["a", "", "a", null, "b"]), ["a", "b"]);
});

test("feedback event type set derives from the FeedbackEventType enum", () => {
  assert.equal(FEEDBACK_EVENT_TYPES.size, Object.values(FeedbackEventType).length);
  for (const value of Object.values(FeedbackEventType)) {
    assert.ok(FEEDBACK_EVENT_TYPES.has(value), `missing ${value}`);
  }
  assert.ok(FEEDBACK_EVENT_TYPES.has(MemoryEventType.MARKED_CONFUSING));
  assert.equal(FEEDBACK_EVENT_TYPES.has(MemoryEventType.EXPLANATION_SHOWN), false);
});
