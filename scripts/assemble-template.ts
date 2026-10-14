import { resolve } from "node:path";
import {
  assembleFlatTemplate,
  packagedTemplateDirectory,
  verifyPackagedTemplate,
} from "../packages/create-feedbax/src/template";
const root = resolve(import.meta.dirname, "..");
if (process.argv.includes("--check")) await verifyPackagedTemplate(root);
else await assembleFlatTemplate(root, packagedTemplateDirectory);
