/**
 * Medium registry: single source of known mediums at runtime.
 * Canon: docs/architecture/medium_plugin_refactor_plan.md §3.2.
 */

import type { MediumPlugin } from "./types.js";

export class MediumRegistry {
  private plugins = new Map<string, MediumPlugin>();

  register(plugin: MediumPlugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  get(mediumId: string): MediumPlugin | undefined {
    return this.plugins.get(mediumId);
  }

  isRegistered(mediumId: string): boolean {
    return this.plugins.has(mediumId);
  }

  isExecutable(mediumId: string): boolean {
    const plugin = this.plugins.get(mediumId);
    if (!plugin) return false;
    if (plugin.status !== "active") return false;
    return Boolean(plugin.capabilities?.can_generate);
  }

  canPropose(mediumId: string): boolean {
    const plugin = this.plugins.get(mediumId);
    if (!plugin) return false;
    if (plugin.status !== "active") return false;
    return Boolean(plugin.capabilities?.can_propose_surface && plugin.proposalRole);
  }

  list(): MediumPlugin[] {
    return Array.from(this.plugins.values());
  }

  listDerivable(): MediumPlugin[] {
    return this.list().filter(
      (p) => p.status === "active" && p.canDeriveFromState === true
    );
  }
}
