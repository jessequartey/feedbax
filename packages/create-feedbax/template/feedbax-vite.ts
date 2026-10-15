import { build } from "esbuild";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";

// Only the server receives provider identifiers and operational configuration.
// The client gets a fixed allowlist, even when copied configuration is customized.
export function publicFeedbaxConfiguration(): Plugin {
  let configuration: ResolvedConfig;
  return {
    name: "feedbax-public-configuration",
    enforce: "pre",
    configResolved(value) {
      configuration = value;
    },
    async transform(code, id) {
      const root = configuration.root;
      if (
        this.environment.name !== "client" ||
        id.split("?")[0] !== resolve(root, "src/feedbax.ts")
      )
        return;
      const localConfig = resolve(root, "src/feedbax/config/index.ts");
      const result = await build({
        stdin: {
          contents: code,
          loader: "ts",
          resolveDir: resolve(root, "src"),
        },
        bundle: true,
        write: false,
        platform: "node",
        format: "esm",
        alias: {
          "@feedbax/config": existsSync(localConfig)
            ? localConfig
            : resolve(root, "../../packages/config/src/index.ts"),
        },
        define: { "import.meta.env": JSON.stringify(configuration.env) },
      });
      const full = (
        await import(
          `data:text/javascript;base64,${Buffer.from(result.outputFiles[0]!.text).toString("base64")}`
        )
      ).default;
      const publicConfiguration = {
        product: full.product,
        theme: full.theme,
        features: full.features,
        submissions: full.submissions,
        turnstile: full.turnstile,
        history: full.history,
        ...(full.connected
          ? {
              connected: {
                issuer: full.connected.issuer,
                loginUrl: full.connected.loginUrl,
                images: full.connected.images,
                ...(full.connected.email
                  ? { email: { provider: full.connected.email.provider } }
                  : {}),
              },
            }
          : {}),
      };
      const publicCode = `export default ${JSON.stringify(publicConfiguration)};`;
      return {
        code: publicCode,
        map: {
          version: 3,
          sources: ["feedbax-public-configuration.ts"],
          sourcesContent: [publicCode],
          names: [],
          mappings: "",
        },
      };
    },
  };
}
