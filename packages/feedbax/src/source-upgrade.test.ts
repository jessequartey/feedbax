import { afterEach, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  chmod,
} from "node:fs/promises";
import { join } from "node:path";
import { watch, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  previewSourceUpgrade,
  applySourceUpgrade,
  rollbackSourceUpgrade,
  resumeSourceUpgrade,
} from "./source-upgrade";

let directory: string | undefined;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

it("resumes interrupted source writes without losing the original rollback snapshot", async () => {
  directory = await mkdtemp(join(tmpdir(), "feedbax-upgrade-resume-"));
  const baseline = join(directory, "baseline"),
    target = join(directory, "target"),
    installation = join(directory, "installation");
  for (const root of [baseline, target, installation]) {
    await mkdir(join(root, "src/nested"), { recursive: true });
    for (const file of ["src/a.ts", "src/nested/b.ts"])
      await writeFile(
        join(root, file),
        root === target
          ? "export const updated = true;\n"
          : "export const updated = false;\n",
      );
  }
  const plan = await previewSourceUpgrade({
    installation,
    baseline,
    target,
    fromVersion: "0.2.1",
    toVersion: "0.2.2",
  });
  await chmod(join(installation, "src/nested"), 0o500);
  try {
    await expect(applySourceUpgrade(installation, plan)).rejects.toThrow();
  } finally {
    await chmod(join(installation, "src/nested"), 0o700);
  }
  expect(await readFile(join(installation, "src/a.ts"), "utf8")).toContain(
    "true",
  );
  await resumeSourceUpgrade(installation);
  expect(
    await readFile(join(installation, "src/nested/b.ts"), "utf8"),
  ).toContain("true");
  await rollbackSourceUpgrade(installation);
  expect(await readFile(join(installation, "src/a.ts"), "utf8")).toContain(
    "false",
  );
  expect(
    await readFile(join(installation, "src/nested/b.ts"), "utf8"),
  ).toContain("false");
});

it("keeps the private recovery journal ignored after rollback", async () => {
  directory = await mkdtemp(join(tmpdir(), "feedbax-upgrade-ignore-"));
  const baseline = join(directory, "baseline"),
    target = join(directory, "target"),
    installation = join(directory, "installation");
  for (const path of [baseline, target, installation]) await mkdir(path);
  await writeFile(join(baseline, "app.ts"), "old");
  await writeFile(join(installation, "app.ts"), "old");
  await writeFile(join(target, "app.ts"), "new");
  const plan = await previewSourceUpgrade({
    installation,
    baseline,
    target,
    fromVersion: "0.2.1",
    toVersion: "0.2.2",
  });
  await applySourceUpgrade(installation, plan);
  await rollbackSourceUpgrade(installation);
  expect(await readFile(join(installation, ".gitignore"), "utf8")).toContain(
    ".feedbax/",
  );
  expect(await readFile(join(installation, "app.ts"), "utf8")).toBe("old");
});

it("refuses another source operation while an upgrade lock exists", async () => {
  directory = await mkdtemp(join(tmpdir(), "feedbax-upgrade-lock-"));
  const baseline = join(directory, "baseline"),
    target = join(directory, "target"),
    installation = join(directory, "installation");
  for (const path of [baseline, target, installation]) await mkdir(path);
  await writeFile(join(baseline, "app.ts"), "old");
  await writeFile(join(installation, "app.ts"), "old");
  await writeFile(join(target, "app.ts"), "new");
  const plan = await previewSourceUpgrade({
    installation,
    baseline,
    target,
    fromVersion: "0.2.1",
    toVersion: "0.2.2",
  });
  await mkdir(join(installation, ".feedbax"));
  await writeFile(
    join(installation, ".feedbax/source-upgrade.lock"),
    JSON.stringify({ pid: process.pid }),
    { mode: 0o600 },
  );
  await expect(applySourceUpgrade(installation, plan)).rejects.toThrow("lock");
  expect(await readFile(join(installation, "app.ts"), "utf8")).toBe("old");
});

it("upgrades source through a three-way preview while preserving local edits and supports guarded rollback", async () => {
  directory = await mkdtemp(join(tmpdir(), "feedbax-upgrade-test-"));
  const baseline = join(directory, "baseline"),
    target = join(directory, "target"),
    installation = join(directory, "installation");
  for (const path of [baseline, target, installation])
    await mkdir(join(path, "src"), { recursive: true });
  await writeFile(
    join(baseline, "src/app.ts"),
    'const product = "Default";\n\nexport const version = "0.2.1";\n',
  );
  await writeFile(
    join(installation, "src/app.ts"),
    'const product = "My product";\n\nexport const version = "0.2.1";\n',
  );
  await writeFile(
    join(target, "src/app.ts"),
    'const product = "Default";\n\nexport const version = "0.2.2";\n',
  );
  await writeFile(
    join(installation, "src/feedbax.ts"),
    "private-owned-configuration",
  );
  await writeFile(join(target, "src/feedbax.ts"), "template-placeholder");
  const plan = await previewSourceUpgrade({
    installation,
    baseline,
    target,
    fromVersion: "0.2.1",
    toVersion: "0.2.2",
  });
  expect(plan.conflicts).toEqual([]);
  expect(await readFile(join(installation, "src/app.ts"), "utf8")).toContain(
    'version = "0.2.1"',
  );
  await applySourceUpgrade(installation, plan);
  expect(await readFile(join(installation, "src/app.ts"), "utf8")).toBe(
    'const product = "My product";\n\nexport const version = "0.2.2";\n',
  );
  expect(await readFile(join(installation, "src/feedbax.ts"), "utf8")).toBe(
    "private-owned-configuration",
  );
  await rollbackSourceUpgrade(installation);
  expect(await readFile(join(installation, "src/app.ts"), "utf8")).toContain(
    'version = "0.2.1"',
  );
});

it("resumes an interrupted rollback and preserves the original source", async () => {
  directory = await mkdtemp(join(tmpdir(), "feedbax-rollback-resume-"));
  const baseline = join(directory, "baseline"),
    target = join(directory, "target"),
    installation = join(directory, "installation");
  for (const root of [baseline, target, installation]) {
    await mkdir(join(root, "src/nested"), { recursive: true });
    for (const file of ["src/a.ts", "src/nested/b.ts"])
      await writeFile(join(root, file), root === target ? "new\n" : "old\n");
  }
  const plan = await previewSourceUpgrade({
    installation,
    baseline,
    target,
    fromVersion: "0.2.1",
    toVersion: "0.2.2",
  });
  await applySourceUpgrade(installation, plan);
  await chmod(join(installation, "src"), 0o500);
  try {
    await expect(rollbackSourceUpgrade(installation)).rejects.toThrow();
  } finally {
    await chmod(join(installation, "src"), 0o700);
  }
  expect(await readFile(join(installation, "src/nested/b.ts"), "utf8")).toBe(
    "old\n",
  );
  await resumeSourceUpgrade(installation);
  expect(await readFile(join(installation, "src/a.ts"), "utf8")).toBe("old\n");
  expect(await readFile(join(installation, "src/nested/b.ts"), "utf8")).toBe(
    "old\n",
  );
});

it("rejects a modified plan that targets credentials or case-variant configuration", async () => {
  directory = await mkdtemp(join(tmpdir(), "feedbax-upgrade-protected-"));
  const baseline = join(directory, "baseline"),
    target = join(directory, "target"),
    installation = join(directory, "installation");
  for (const root of [baseline, target, installation]) await mkdir(root);
  await writeFile(join(baseline, "app.ts"), "old");
  await writeFile(join(installation, "app.ts"), "old");
  await writeFile(join(target, "app.ts"), "new");
  const plan = await previewSourceUpgrade({
    installation,
    baseline,
    target,
    fromVersion: "0.2.1",
    toVersion: "0.2.2",
  });
  const source = plan.changes.find((change) => change.path === "app.ts")!;
  for (const path of [
    ".env",
    ".dev.vars.production",
    "private.pem",
    "src/Feedbax.ts",
    "WRANGLER.JSONC",
    "node_modules/x.ts",
    "../outside",
  ]) {
    await writeFile(join(installation, ".env"), "old");
    await expect(
      applySourceUpgrade(installation, {
        ...plan,
        changes: [{ ...source, path }],
      }),
    ).rejects.toThrow();
    expect(await readFile(join(installation, ".env"), "utf8")).toBe("old");
  }
});

it("previews a source conflict and refuses all source writes", async () => {
  directory = await mkdtemp(join(tmpdir(), "feedbax-upgrade-conflict-"));
  const baseline = join(directory, "baseline"),
    target = join(directory, "target"),
    installation = join(directory, "installation");
  for (const root of [baseline, target, installation]) await mkdir(root);
  await writeFile(
    join(baseline, "app.ts"),
    "export const theme = 'default';\n",
  );
  await writeFile(
    join(installation, "app.ts"),
    "export const theme = 'custom';\n",
  );
  await writeFile(join(target, "app.ts"), "export const theme = 'updated';\n");
  await writeFile(join(target, "new.ts"), "must not be written");
  const plan = await previewSourceUpgrade({
    installation,
    baseline,
    target,
    fromVersion: "0.2.1",
    toVersion: "0.2.2",
  });
  expect(plan.conflicts.map((conflict) => conflict.path)).toEqual(["app.ts"]);
  await expect(applySourceUpgrade(installation, plan)).rejects.toThrow(
    "conflicts",
  );
  expect(await readFile(join(installation, "app.ts"), "utf8")).toBe(
    "export const theme = 'custom';\n",
  );
  await expect(readFile(join(installation, "new.ts"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});

it.each(["apply", "rollback"] as const)(
  "preserves an edit made while source %s is writing files",
  async (operation) => {
    directory = await mkdtemp(join(tmpdir(), "feedbax-upgrade-interleaving-"));
    const baseline = join(directory, "baseline"),
      target = join(directory, "target"),
      installation = join(directory, "installation");
    for (const root of [baseline, target, installation]) {
      await mkdir(root);
      for (const name of ["a.ts", "b.ts", "c.ts", "z.ts"])
        await writeFile(
          join(root, name),
          root === target ? "new source" : "old source",
        );
    }
    const plan = await previewSourceUpgrade({
      installation,
      baseline,
      target,
      fromVersion: "0.2.1",
      toVersion: "0.2.2",
    });
    if (operation === "rollback") await applySourceUpgrade(installation, plan);
    const observedPath = operation === "apply" ? "a.ts" : "z.ts";
    const editedPath = operation === "apply" ? "z.ts" : "a.ts";
    let edited = false;
    const watcher = watch(join(installation, observedPath), () => {
      if (!edited) {
        edited = true;
        writeFileSync(
          join(installation, editedPath),
          "New Product Team edit during upgrade",
        );
      }
    });
    try {
      await expect(
        operation === "apply"
          ? applySourceUpgrade(installation, plan)
          : rollbackSourceUpgrade(installation),
      ).rejects.toThrow("Source changed");
    } finally {
      watcher.close();
    }
    expect(edited).toBe(true);
    expect(await readFile(join(installation, editedPath), "utf8")).toBe(
      "New Product Team edit during upgrade",
    );
    await expect(resumeSourceUpgrade(installation)).rejects.toThrow(
      "Source changed",
    );
  },
);
