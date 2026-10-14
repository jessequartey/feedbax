import { mkdir, readFile, writeFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const registry = JSON.parse(
  await readFile(new URL("registry.json", root), "utf8"),
);
for (const item of registry.items) {
  const files = await Promise.all(
    item.files.map(async (file) => ({
      ...file,
      content: await readFile(new URL(file.path, root), "utf8"),
    })),
  );
  const output =
    JSON.stringify(
      {
        $schema: "https://ui.shadcn.com/schema/registry-item.json",
        ...item,
        files,
      },
      null,
      2,
    ) + "\n";
  for (const target of ["public/r/", "apps/docs/public/r/"]) {
    await mkdir(new URL(target, root), { recursive: true });
    await writeFile(new URL(`${target}${item.name}.json`, root), output);
  }
}
console.log(`Built ${registry.items.length} copied-source registry item.`);
