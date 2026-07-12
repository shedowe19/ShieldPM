import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const backendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const backendSourcePath = (...segments) => resolve(backendDirectory, ...segments);
