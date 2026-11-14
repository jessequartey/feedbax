// Clean-host install check (opt-in: it needs the network and takes a few minutes).
//
//   node tests/block/clean-host.ts [--base base|radix] [--aliases default|custom] [--dir <empty parent dir>]
//
// 1. Creates a fresh Vite + React + Tailwind app outside the repo and runs `shadcn init`.
// 2. Serves public/r over local HTTP and runs `npx shadcn@4.23.0 add <url>`.
// 3. Writes a host page that uses <FeedbaxDialog> and <FeedbaxLink>, a server route that uses mintFeedbaxToken,
//    then typechecks and builds the host and checks the client bundle holds no token.server code.
// With --aliases custom, components.json points the block at ~/kit/components and ~/kit/lib instead of @/….
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const base = flag("base", "base");
const aliases = flag("aliases", "default");
const SHADCN = "shadcn@4.23.0";
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const parent = flag("dir", "") || tmpdir();
mkdirSync(parent, { recursive: true });
const root = mkdtempSync(join(parent, `feedbax-host-${base}-${aliases}-`));
const host = join(root, "host");

function run(cmd: string, cmdArgs: string[], cwd = root, allowFailure = false) {
  console.log(`\n$ ${cmd} ${cmdArgs.join(" ")}`);
  const result = spawnSync(cmd, cmdArgs, {
    cwd,
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, CI: "1" },
  });
  if (result.status !== 0 && !allowFailure)
    throw new Error(`${cmd} ${cmdArgs.join(" ")} exited with ${result.status}`);
  return result.status === 0;
}
const write = (path: string, text: string) => {
  mkdirSync(dirname(join(host, path)), { recursive: true });
  writeFileSync(join(host, path), text);
};

const kit = aliases === "custom";
run("npm", ["create", "vite@latest", "host", "--", "--template", "react-ts", "--no-interactive"]);
run("npm", ["install"], host);
run("npm", ["install", "tailwindcss", "@tailwindcss/vite"], host);
write("src/index.css", '@import "tailwindcss";\n');
write(
  "vite.config.ts",
  `import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src'), '~': path.resolve(__dirname, './src') } },
})
`,
);
write(
  "tsconfig.json",
  JSON.stringify(
    {
      files: [],
      references: [{ path: "./tsconfig.app.json" }, { path: "./tsconfig.node.json" }],
      compilerOptions: { paths: { "@/*": ["./src/*"], "~/*": ["./src/*"] } },
    },
    null,
    2,
  ),
);
const appConfig = readFileSync(join(host, "tsconfig.app.json"), "utf8").replace(
  '"jsx": "react-jsx",',
  '"jsx": "react-jsx",\n    "paths": { "@/*": ["./src/*"], "~/*": ["./src/*"] },',
);
write("tsconfig.app.json", appConfig);

run(
  "npx",
  [SHADCN, "init", "-b", base, "-p", base === "base" ? "buFyyzw" : "nova", "-t", "vite", "-y"],
  host,
);
if (kit) {
  const file = join(host, "components.json");
  const json = JSON.parse(readFileSync(file, "utf8"));
  json.aliases = {
    components: "~/kit/components",
    ui: "~/kit/components/ui",
    lib: "~/kit/lib",
    utils: "~/kit/lib/utils",
    hooks: "~/kit/hooks",
  };
  writeFileSync(file, JSON.stringify(json, null, 2));
  // Move what init created so the host really uses the custom layout.
  run(
    "sh",
    [
      "-c",
      "mkdir -p src/kit/components src/kit/lib && mv src/components/ui src/kit/components/ui && mv src/lib/utils.ts src/kit/lib/utils.ts && sed -i.bak 's#@/lib/utils#~/kit/lib/utils#g' src/kit/components/ui/*.tsx && rm -f src/kit/components/ui/*.bak",
    ],
    host,
  );
}

// Serve public/r like the raw GitHub URL would.
const server = createServer((req, res) => {
  const file = join(repo, "public/r", (req.url ?? "").split("?")[0]);
  if (!existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { "Content-Type": "application/json" }).end(readFileSync(file));
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/feedbax-feedback.json`;
try {
  // Async on purpose: spawnSync would block this process's event loop and with it the server above.
  console.log(`\n$ npx ${SHADCN} add ${url} -y`);
  const code = await new Promise<number | null>((done) =>
    spawn("npx", [SHADCN, "add", url, "-y"], {
      cwd: host,
      stdio: ["ignore", "inherit", "inherit"],
      env: { ...process.env, CI: "1" },
    }).on("close", done),
  );
  if (code !== 0) throw new Error(`shadcn add exited with ${code}`);
} finally {
  server.close();
}

const componentsDir = kit ? "src/kit/components/feedbax" : "src/components/feedbax";
const libDir = kit ? "src/kit/lib/feedbax" : "src/lib/feedbax";
for (const file of ["feedback-dialog.tsx", "annotation-editor.tsx", "feedbax-link.tsx"])
  if (!existsSync(join(host, componentsDir, file)))
    throw new Error(`missing ${componentsDir}/${file}`);
for (const file of ["annotation.ts", "client.ts", "token.server.ts", "types.ts"])
  if (!existsSync(join(host, libDir, file))) throw new Error(`missing ${libDir}/${file}`);

const alias = kit ? "~/kit" : "@";
write(
  "src/App.tsx",
  `import { FeedbaxDialog } from '${alias}/components/feedbax/feedback-dialog'
import { FeedbaxLink } from '${alias}/components/feedbax/feedbax-link'

export default function App() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Host app</h1>
      <FeedbaxDialog portalUrl="https://feedback.example.com" />
      <FeedbaxLink portalUrl="https://feedback.example.com" target="_blank">Go to feedback</FeedbaxLink>
    </main>
  )
}
`,
);
// A server-only route. It is never imported by the client entry, so it must not reach the browser bundle.
write(
  "server/feedbax-token.ts",
  `import { mintFeedbaxToken } from '../src/${kit ? "kit/" : ""}lib/feedbax/token.server'

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return new Response(null, { status: 403 })
  const token = await mintFeedbaxToken({ secret: process.env.FEEDBAX_HOST_SECRET ?? '', user: { id: 'u1', name: 'Ada' } })
  return Response.json({ token }, { headers: { 'Cache-Control': 'no-store' } })
}
`,
);
write(
  "tsconfig.server.json",
  JSON.stringify(
    {
      compilerOptions: {
        target: "es2023",
        module: "esnext",
        moduleResolution: "bundler",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        lib: ["ES2023", "DOM"],
        types: ["node"],
      },
      include: ["server"],
    },
    null,
    2,
  ),
);

run("npm", ["run", "build"], host);
run("npx", ["tsc", "-p", "tsconfig.server.json"], host);

const assets = join(host, "dist/assets");
const bundle = readdirSync(assets)
  .filter((f) => f.endsWith(".js"))
  .map((f) => readFileSync(join(assets, f), "utf8"))
  .join("\n");
if (bundle.includes("FEEDBAX_HOST_SECRET") || bundle.includes("mintFeedbaxToken"))
  throw new Error("token.server code reached the client bundle");
if (!bundle.includes("Send feedback")) throw new Error("dialog is missing from the client bundle");
console.log(
  `\nOK: ${base} host with ${aliases} aliases installed, typechecked and built (${host})`,
);
