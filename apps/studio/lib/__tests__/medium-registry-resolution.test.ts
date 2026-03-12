/**
 * Phase 1 medium registry and resolution tests.
 *
 * Covered here:
 * - Registry semantics (isRegistered, isExecutable, canPropose, list, listDerivable; proposal_only).
 * - Resolution matrix (requested → executed, fallback_reason, resolution_source; manual_override vs derivation).
 * - Trace invariants (executed_medium set; fallback_reason when requested !== executed; resolution_source enum).
 * - Proposal metadata (concept/image have proposal role, writing does not).
 *
 * Best covered elsewhere (integration/E2E or full session with mocks):
 * - A. No-op behavior parity: same inputs → writing/concept/image artifact shapes unchanged.
 * - C. Full trace integrity: every run has requested_medium, executed_medium; trace object includes all four fields.
 * - E. Existing proposal behavior: concept → habitat only, image → avatar only, writing → no new branches.
 *
 * Backlog (see docs/architecture/medium_plugin_refactor_plan.md Phase 1 Test backlog):
 * - Full session trace integration test: verify a real session run persists requested_medium, executed_medium,
 *   fallback_reason (when needed), resolution_source to the session/trace store.
 */

import { createDefaultMediumRegistry } from "@twin/agent";
import { MediumRegistry } from "@twin/mediums";
import type { MediumPlugin } from "@twin/mediums";
import { resolveExecutedMedium } from "../session-runner";

describe("Medium registry semantics", () => {
  const registry = createDefaultMediumRegistry();

  describe("isRegistered", () => {
    it("returns true for writing, concept, image", () => {
      expect(registry.isRegistered("writing")).toBe(true);
      expect(registry.isRegistered("concept")).toBe(true);
      expect(registry.isRegistered("image")).toBe(true);
    });
    it("returns false for unknown medium", () => {
      expect(registry.isRegistered("interactive_surface")).toBe(false);
      expect(registry.isRegistered("unknown")).toBe(false);
    });
  });

  describe("isExecutable", () => {
    it("returns true for writing, concept, image (all active + can_generate)", () => {
      expect(registry.isExecutable("writing")).toBe(true);
      expect(registry.isExecutable("concept")).toBe(true);
      expect(registry.isExecutable("image")).toBe(true);
    });
    it("returns false for unregistered medium", () => {
      expect(registry.isExecutable("interactive_surface")).toBe(false);
    });
  });

  describe("canPropose", () => {
    it("returns false for writing (no proposal role)", () => {
      expect(registry.canPropose("writing")).toBe(false);
    });
    it("returns true for concept and image (have proposalRole + can_propose_surface)", () => {
      expect(registry.canPropose("concept")).toBe(true);
      expect(registry.canPropose("image")).toBe(true);
    });
    it("returns false for unregistered medium", () => {
      expect(registry.canPropose("interactive_surface")).toBe(false);
    });
  });

  describe("list and listDerivable", () => {
    it("list returns all three plugins", () => {
      const list = registry.list();
      expect(list).toHaveLength(3);
      const ids = list.map((p) => p.id).sort();
      expect(ids).toEqual(["concept", "image", "writing"]);
    });
    it("listDerivable returns only active plugins with canDeriveFromState", () => {
      const derivable = registry.listDerivable();
      expect(derivable.length).toBe(3);
      expect(derivable.every((p) => p.status === "active" && p.canDeriveFromState)).toBe(true);
    });
  });

  describe("proposal_only behavior (future)", () => {
    it("isExecutable is false for proposal_only plugin when added", () => {
      const reg = new MediumRegistry();
      const proposalOnlyPlugin: MediumPlugin = {
        id: "interactive_surface",
        label: "Interactive surface",
        status: "proposal_only",
        capabilities: {
          can_generate: false,
          can_propose_surface: true,
          can_postprocess: false,
          can_upload: false,
          supports_staging_target: true,
        },
        canDeriveFromState: false,
      };
      reg.register(proposalOnlyPlugin);
      expect(reg.isRegistered("interactive_surface")).toBe(true);
      expect(reg.isExecutable("interactive_surface")).toBe(false);
      expect(reg.canPropose("interactive_surface")).toBe(false); // status !== active
    });
  });
});

describe("Resolution behavior", () => {
  const registry = createDefaultMediumRegistry();

  it("requested writing → executed writing, no fallback, derivation when not explicit", () => {
    const r = resolveExecutedMedium(registry, "writing", false);
    expect(r.executed_medium).toBe("writing");
    expect(r.fallback_reason).toBeNull();
    expect(r.resolution_source).toBe("derivation");
  });

  it("requested writing → executed writing, manual_override when explicit", () => {
    const r = resolveExecutedMedium(registry, "writing", true);
    expect(r.executed_medium).toBe("writing");
    expect(r.fallback_reason).toBeNull();
    expect(r.resolution_source).toBe("manual_override");
  });

  it("requested concept → executed concept", () => {
    const r = resolveExecutedMedium(registry, "concept", false);
    expect(r.executed_medium).toBe("concept");
    expect(r.fallback_reason).toBeNull();
  });

  it("requested image → executed image", () => {
    const r = resolveExecutedMedium(registry, "image", false);
    expect(r.executed_medium).toBe("image");
    expect(r.fallback_reason).toBeNull();
  });

  it("requested null → executed writing (effective requested = writing), derivation", () => {
    const r = resolveExecutedMedium(registry, null, false);
    expect(r.executed_medium).toBe("writing");
    expect(r.fallback_reason).toBeNull();
    expect(r.resolution_source).toBe("derivation");
  });

  it("requested unknown medium → executed writing, fallback_reason unregistered", () => {
    const r = resolveExecutedMedium(registry, "interactive_surface", false);
    expect(r.executed_medium).toBe("writing");
    expect(r.fallback_reason).toBe("unregistered");
    expect(r.resolution_source).toBe("registry_constraint");
  });

  it("requested unknown medium with explicit flag → same fallback, registry_constraint", () => {
    const r = resolveExecutedMedium(registry, "unknown_medium", true);
    expect(r.executed_medium).toBe("writing");
    expect(r.fallback_reason).toBe("unregistered");
    expect(r.resolution_source).toBe("registry_constraint");
  });
});

describe("Proposal metadata (Phase 1: reserved; runner still branches on artifact.medium)", () => {
  const registry = createDefaultMediumRegistry();

  it("concept and image have canPropose true; writing does not", () => {
    expect(registry.canPropose("writing")).toBe(false);
    expect(registry.canPropose("concept")).toBe(true);
    expect(registry.canPropose("image")).toBe(true);
  });

  it("concept plugin has proposalRole habitat_layout, image has avatar_candidate", () => {
    const conceptPlugin = registry.get("concept");
    const imagePlugin = registry.get("image");
    expect(conceptPlugin?.proposalRole).toBe("habitat_layout");
    expect(imagePlugin?.proposalRole).toBe("avatar_candidate");
  });

  it("writing plugin has no proposalRole", () => {
    const writingPlugin = registry.get("writing");
    expect(writingPlugin?.proposalRole).toBeUndefined();
  });
});

describe("Trace invariants (resolution contract)", () => {
  const registry = createDefaultMediumRegistry();

  it("every resolution has executed_medium set", () => {
    const cases: Array<[string | null, boolean]> = [
      ["writing", false],
      ["concept", true],
      [null, false],
      ["interactive_surface", false],
    ];
    for (const [requested, explicit] of cases) {
      const r = resolveExecutedMedium(registry, requested, explicit);
      expect(r.executed_medium).toBeDefined();
      expect(typeof r.executed_medium).toBe("string");
      expect(r.executed_medium.length).toBeGreaterThan(0);
    }
  });

  it("when requested !== executed, fallback_reason is present", () => {
    const r = resolveExecutedMedium(registry, "interactive_surface", false);
    expect(r.executed_medium).toBe("writing");
    expect(r.fallback_reason).toBe("unregistered");
  });

  it("resolution_source is always one of derivation | manual_override | registry_constraint", () => {
    const sources = new Set<string>();
    const cases: Array<[string | null, boolean]> = [
      ["writing", false],
      ["writing", true],
      ["interactive_surface", false],
    ];
    for (const [requested, explicit] of cases) {
      const r = resolveExecutedMedium(registry, requested, explicit);
      sources.add(r.resolution_source);
    }
    expect(sources.has("derivation")).toBe(true);
    expect(sources.has("manual_override")).toBe(true);
    expect(sources.has("registry_constraint")).toBe(true);
  });
});
