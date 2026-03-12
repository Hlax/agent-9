export type StyleLexicon = Record<string, string[]>;

/**
+ * Platform-default lexical style lexicon.
+ *
+ * This is intentionally lightweight and static in V1. Future work will allow
+ * Twin-specific overrides and extensions without changing call sites that
+ * just need "a lexicon" to reason about style.
+ */
export const PLATFORM_DEFAULT_STYLE_LEXICON: StyleLexicon = {
  minimalist: ["minimal", "minimalist", "clean", "sparse", "simple", "uncluttered"],
  maximalist: ["maximal", "maximalist", "dense", "busy", "ornate", "layered", "complex"],
  playful: ["playful", "whimsical", "fun", "quirky", "cheerful"],
  serious: ["serious", "austere", "formal", "somber", "solemn"],
  retro: ["retro", "vintage", "analog", "nostalgic", "old-school", "old school"],
  futuristic: ["futuristic", "sci-fi", "cyber", "neon", "hi-tech", "high-tech"],
  organic: ["organic", "hand-drawn", "hand drawn", "textured", "imperfect", "warm", "human"],
  geometric: ["geometric", "grid", "modular", "sharp", "angular"],
  warm: ["warm", "sunset", "gold", "amber", "cozy"],
  cool: ["cool", "ice", "icy", "blue", "teal", "calm"],
};

/**
 * Get the effective style lexicon for the platform.
 *
 * For now this simply returns the static platform default. In future, this
 * will merge platform defaults with Twin-specific overrides and any
 * experiment- or project-level adjustments.
 */
export function getEffectiveStyleLexicon(lexicon?: StyleLexicon): StyleLexicon {
  return lexicon ?? PLATFORM_DEFAULT_STYLE_LEXICON;
}

