// Compile-time check (run by `npm run typecheck`): every server function in
// src/server/functions.ts takes `{ data }` of the contract input type and resolves to the
// contract return type. Do not import this file at runtime.
import type { PortalFunctions } from "../../src/contracts/portal.ts";
import * as fns from "../../src/server/functions.ts";

type Awaitable<T> = Promise<T>;
type Expected = {
  [K in keyof PortalFunctions]: Parameters<PortalFunctions[K]> extends []
    ? (opts?: { data?: undefined }) => Awaitable<ReturnType<PortalFunctions[K]>>
    : (opts: {
        data: Parameters<PortalFunctions[K]>[0];
      }) => Awaitable<ReturnType<PortalFunctions[K]>>;
};

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type ReturnsOf<K extends keyof PortalFunctions> = Awaited<ReturnType<(typeof fns)[K]>>;

export type Checks = {
  [K in keyof PortalFunctions]: Equal<ReturnsOf<K>, ReturnType<PortalFunctions[K]>>;
};
export const inputsAssignable: Expected = fns;
export const returnTypesMatch: Checks[keyof Checks] extends true ? true : never = true;
