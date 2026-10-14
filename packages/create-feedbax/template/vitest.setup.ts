import { vi } from "vitest";

vi.mock("./src/feedbax", () => import("./src/feedbax.test-fixture"));
