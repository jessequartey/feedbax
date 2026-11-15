import { expect, it, vi } from "vite-plus/test";
import { createSwitchWriter } from "../../src/lib/switch-writer.ts";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup() {
  const requests: { key: string; value: boolean; gate: ReturnType<typeof deferred> }[] = [];
  let values = { email: false, webhook: false };
  let pending: ReadonlySet<keyof typeof values> = new Set();
  const failed = vi.fn();
  const change = createSwitchWriter(
    values,
    (key, value) => {
      const gate = deferred();
      requests.push({ key, value, gate });
      return gate.promise;
    },
    (next, busy) => {
      values = next;
      pending = busy;
    },
    failed,
  );
  return {
    change,
    requests,
    failed,
    get values() {
      return values;
    },
    get pending() {
      return pending;
    },
  };
}

it("keeps the newest optimistic choice and sends same-setting writes in order", async () => {
  const s = setup();
  const old = s.change("email", true);
  await Promise.resolve();
  const latest = s.change("email", false);
  expect(s.values.email).toBe(false);
  expect(s.requests).toHaveLength(1); // Newer write cannot reach D1 before the older write.
  s.requests[0]!.gate.resolve();
  await old;
  expect(s.values.email).toBe(false);
  expect(s.pending.has("email")).toBe(true);
  expect(s.requests[1]).toMatchObject({ key: "email", value: false });
  s.requests[1]!.gate.resolve();
  await latest;
  expect(s.values.email).toBe(false);
  expect(s.pending.size).toBe(0);
});

it("ignores an older failure and still persists the latest choice", async () => {
  const s = setup();
  const old = s.change("email", true);
  await Promise.resolve();
  const latest = s.change("email", false);
  s.requests[0]!.gate.reject(new Error("old failure"));
  await old;
  expect(s.failed).not.toHaveBeenCalled();
  expect(s.values.email).toBe(false);
  expect(s.pending.has("email")).toBe(true);
  s.requests[1]!.gate.resolve();
  await latest;
  expect(s.values.email).toBe(false);
});

it("rolls back only the latest failure, to the last confirmed value", async () => {
  const s = setup();
  const old = s.change("email", true);
  await Promise.resolve();
  const latest = s.change("email", false);
  s.requests[0]!.gate.resolve();
  await old;
  s.requests[1]!.gate.reject(new Error("latest failure"));
  expect(await latest).toBe(false);
  expect(s.values.email).toBe(true);
  expect(s.failed).toHaveBeenCalledOnce();
  expect(s.pending.size).toBe(0);
});

it("allows independent switches to finish out of order without replacing each other", async () => {
  const s = setup();
  const email = s.change("email", true);
  const webhook = s.change("webhook", true);
  await Promise.resolve();
  s.requests[1]!.gate.resolve();
  await webhook;
  expect(s.values).toEqual({ email: true, webhook: true });
  expect([...s.pending]).toEqual(["email"]);
  s.requests[0]!.gate.reject(new Error("email failed"));
  await email;
  expect(s.values).toEqual({ email: false, webhook: true });
});

it("keeps the initial confirmed value when every queued write fails, then accepts a retry", async () => {
  const s = setup();
  const first = s.change("email", true);
  await Promise.resolve();
  const second = s.change("email", true);
  s.requests[0]!.gate.reject(new Error("first failed"));
  await first;
  s.requests[1]!.gate.reject(new Error("second failed"));
  await second;
  expect(s.values.email).toBe(false);
  expect(s.failed).toHaveBeenCalledOnce();
  const retry = s.change("email", true);
  await Promise.resolve();
  s.requests[2]!.gate.resolve();
  expect(await retry).toBe(true);
  expect(s.values.email).toBe(true);
});

it("keeps a third choice pending when a superseded queued write fails", async () => {
  const s = setup();
  const first = s.change("email", true);
  const second = s.change("email", false);
  const latest = s.change("email", true);
  await Promise.resolve();
  s.requests[0]!.gate.resolve();
  await first;
  s.requests[1]!.gate.reject(new Error("superseded failure"));
  await second;
  expect(s.values.email).toBe(true);
  expect(s.pending.has("email")).toBe(true);
  expect(s.failed).not.toHaveBeenCalled();
  s.requests[2]!.gate.resolve();
  expect(await latest).toBe(true);
  expect(s.requests.map(({ value }) => value)).toEqual([true, false, true]);
  expect(s.pending.size).toBe(0);
});
