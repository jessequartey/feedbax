import { describe, expect, test } from "vite-plus/test";
import { parsePackedPackage } from "../../scripts/test-package.ts";

describe("npm pack output", () => {
  const metadata = {
    name: "create-feedbax",
    filename: "create-feedbax-0.3.0.tgz",
    files: [{ path: "dist/index.mjs" }, { path: "template/package.json" }],
  };

  test("reads npm 11's package array", () => {
    expect(parsePackedPackage(JSON.stringify([metadata]))).toEqual({
      filename: metadata.filename,
      files: metadata.files,
    });
  });

  test("reads npm 12's package-name map used by release CI", () => {
    expect(parsePackedPackage(JSON.stringify({ "create-feedbax": metadata }))).toEqual({
      filename: metadata.filename,
      files: metadata.files,
    });
  });

  test.each([[], {}, { "create-feedbax": {} }, [{ ...metadata, files: null }]])(
    "rejects incomplete pack metadata: %j",
    (value) => {
      expect(() => parsePackedPackage(JSON.stringify(value))).toThrow();
    },
  );
});
