// Production entry point: secrets first, because some modules read them as they load.
import { loadSecrets } from "./lib/load-secrets.js";

await loadSecrets();
await import("./server.js");
