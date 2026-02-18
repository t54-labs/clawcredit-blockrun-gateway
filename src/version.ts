import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const pkg = require(join(__dirname, "..", "package.json")) as { version: string };

export const VERSION = pkg.version;
export const USER_AGENT = `clawcredit-blockrun-gateway/${VERSION}`;
