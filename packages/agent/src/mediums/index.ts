import { MediumRegistry } from "@twin/mediums";
import { writingPlugin } from "./writing-plugin.js";
import { conceptPlugin } from "./concept-plugin.js";
import { imagePlugin } from "./image-plugin.js";

/**
 * Default registry with built-in writing, concept, and image plugins.
 * Used by the session runner and pipeline for Phase 1.
 */
export function createDefaultMediumRegistry(): MediumRegistry {
  const registry = new MediumRegistry();
  registry.register(writingPlugin);
  registry.register(conceptPlugin);
  registry.register(imagePlugin);
  return registry;
}

export { writingPlugin, conceptPlugin, imagePlugin };
