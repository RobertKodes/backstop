// The SDK calls `Buffer.from` at runtime (PDA seeds, offer messages); browsers
// have no global Buffer. Import this module before anything that uses the SDK.
import { Buffer } from "buffer";

const g = globalThis as { Buffer?: typeof Buffer };
if (typeof g.Buffer === "undefined") g.Buffer = Buffer;

export {};
