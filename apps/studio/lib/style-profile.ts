import { getEffectiveStyleLexicon, type StyleLexicon } from "@/lib/style-lexicon";

export type StylePressure = "coherent" | "drifting" | "repetitive";

export interface StyleProfile {
  dominant: string[];
  emerging: string[];
  suppressed: string[];
  pressure: StylePressure;
}

export interface StyleProfileComputationResult {
  profile: StyleProfile;
  repeatedTitles: string[];
  pressureExplanation: string;
}

export interface StyleAnalysisInput {
  title?: string | null;
  summary?: string | null;
  text?: string | null;
}

export type ProposalStyleFit = "aligned" | "exploratory" | "off_profile";
export type ProposalStyleNovelty = "fresh" | "repeated" | "near_duplicate";

export interface ProposalStyleEvaluation {
  style_tags: string[];
  style_fit: ProposalStyleFit;
  style_novelty: ProposalStyleNovelty;
  style_fit_reason: string;
  /** Soft score in [-1, 1] for ranking / recommendation only. */
  style_score: number;
}

function normalize(text: string | null | undefined): string {
  return (text ?? "").toLowerCase();
}

export function computeStyleProfile(
  inputs: StyleAnalysisInput[],
  options?: { lexicon?: StyleLexicon }
): StyleProfileComputationResult {
  const lexicon = getEffectiveStyleLexicon(options?.lexicon);

  const styleCounts: Record<string, number> = {};
  for (const key of Object.keys(lexicon)) {
    styleCounts[key] = 0;
  }

  const titleCounts: Record<string, number> = {};

  for (const item of inputs ?? []) {
    const title = normalize(item.title);
    const summary = normalize(item.summary);
    const body = normalize(item.text);
    const combined = [title, summary, body].filter(Boolean).join(" ");

    if (title) {
      titleCounts[title] = (titleCounts[title] ?? 0) + 1;
    }

    if (!combined) continue;

    for (const [style, keywords] of Object.entries(lexicon)) {
      for (const kw of keywords) {
        if (combined.includes(kw)) {
          styleCounts[style] = (styleCounts[style] ?? 0) + 1;
          break;
        }
      }
    }
  }

  const entries = Object.entries(styleCounts);
  const totalMentions = entries.reduce((sum, [, count]) => sum + count, 0);
  const maxCount = entries.reduce((max, [, count]) => (count > max ? count : max), 0);

  let dominant: string[] = [];
  let emerging: string[] = [];
  const suppressed: string[] = [];

  if (maxCount > 0) {
    dominant = entries
      .filter(([, count]) => count === maxCount && count >= 2)
      .map(([style]) => style)
      .slice(0, 3);

    emerging = entries
      .filter(
        ([style, count]) =>
          count > 0 &&
          !dominant.includes(style)
      )
      .sort((a, b) => b[1] - a[1])
      .map(([style]) => style)
      .slice(0, 3);
  }

  let pressure: StylePressure = "coherent";
  let pressureExplanation = "No clear style signals yet; treating style as open.";

  if (maxCount === 0 || totalMentions === 0) {
    pressure = "coherent";
    pressureExplanation = "No recent artifacts or proposals carried explicit style keywords.";
  } else {
    const share = maxCount / totalMentions;
    const activeStyles = entries.filter(([, count]) => count > 0).length;
    if (share >= 0.6 && maxCount >= 3) {
      pressure = "repetitive";
      const styleLabel = entries.find(([, count]) => count === maxCount)?.[0] ?? "a single style";
      pressureExplanation = `One style (“${styleLabel}”) dominates most recent outputs, suggesting repetition.`;
    } else if (activeStyles >= 3 && share < 0.5) {
      pressure = "drifting";
      pressureExplanation = "Multiple styles are active without a single dominant tendency, suggesting stylistic drift.";
    } else {
      pressure = "coherent";
      const styleLabel = entries.find(([, count]) => count === maxCount)?.[0] ?? "a small set of styles";
      pressureExplanation = `A few styles (notably “${styleLabel}”) appear more often than others, suggesting a coherent taste without hard lock-in.`;
    }
  }

  const repeatedTitles = Object.entries(titleCounts)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([title]) => title)
    .slice(0, 5);

  const profile: StyleProfile = {
    dominant,
    emerging,
    suppressed,
    pressure,
  };

  return {
    profile,
    repeatedTitles,
    pressureExplanation,
  };
}

export function evaluateProposalStyle(input: {
  proposal: StyleAnalysisInput;
  styleProfile: StyleProfile;
  repeatedTitles?: string[];
  lexicon?: StyleLexicon;
}): ProposalStyleEvaluation {
  const lexicon = getEffectiveStyleLexicon(input.lexicon);

  const title = normalize(input.proposal.title);
  const summary = normalize(input.proposal.summary);
  const body = normalize(input.proposal.text);
  const combined = [title, summary, body].filter(Boolean).join(" ");

  const perProposalCounts: Record<string, number> = {};
  for (const key of Object.keys(lexicon)) {
    perProposalCounts[key] = 0;
  }
  if (combined) {
    for (const [style, keywords] of Object.entries(lexicon)) {
      for (const kw of keywords) {
        if (combined.includes(kw)) {
          perProposalCounts[style] = (perProposalCounts[style] ?? 0) + 1;
          break;
        }
      }
    }
  }
  const style_tags = Object.entries(perProposalCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([style]) => style);

  let style_fit: ProposalStyleFit = "exploratory";
  const profile = input.styleProfile;
  const hasProfile =
    (profile.dominant && profile.dominant.length > 0) ||
    (profile.emerging && profile.emerging.length > 0);
  const intersects = (a: string[] | undefined, b: string[]) =>
    (a ?? []).some((x) => b.includes(x));

  if (!hasProfile) {
    style_fit = style_tags.length > 0 ? "aligned" : "exploratory";
  } else if (style_tags.length === 0) {
    style_fit = "off_profile";
  } else if (intersects(profile.dominant, style_tags)) {
    style_fit = "aligned";
  } else if (intersects(profile.emerging, style_tags)) {
    style_fit = "exploratory";
  } else {
    style_fit = "off_profile";
  }

  let style_novelty: ProposalStyleNovelty = "fresh";
  const repeatedTitles = (input.repeatedTitles ?? []).map((t) => t.toLowerCase());
  if (title && repeatedTitles.includes(title)) {
    style_novelty = "repeated";
  } else if (title) {
    for (const rt of repeatedTitles) {
      if (!rt) continue;
      if (title.includes(rt) || rt.includes(title)) {
        style_novelty = "near_duplicate";
        break;
      }
    }
  }

  let score = 0;
  if (style_fit === "aligned") score += 0.5;
  if (style_fit === "exploratory") score += 0.3;
  if (style_fit === "off_profile") score += 0;

  if (style_novelty === "fresh") score += 0.3;
  if (style_novelty === "repeated") score -= 0.3;
  if (style_novelty === "near_duplicate") score -= 0.5;

  score = Math.max(-1, Math.min(1, score));

  const tagsText = style_tags.length > 0 ? style_tags.join(", ") : "no explicit style tags";
  let reason = `This proposal appears with ${tagsText}. `;
  if (!hasProfile) {
    reason += "There is no strong existing style profile yet, so this is treated as establishing taste.";
  } else if (style_fit === "aligned") {
    reason += "It matches the Twin's current dominant style tendencies.";
  } else if (style_fit === "exploratory") {
    reason += "It explores styles that are adjacent to the current profile.";
  } else {
    reason += "It sits outside the Twin's recent stylistic tendencies, which can still be healthy exploration.";
  }
  if (style_novelty === "fresh") {
    reason += " The title looks fresh relative to recent proposals.";
  } else if (style_novelty === "repeated") {
    reason += " The title closely repeats a recent proposal and may need differentiation.";
  } else if (style_novelty === "near_duplicate") {
    reason += " The title is very close to a recent proposal; consider merging or revising.";
  }

  return {
    style_tags,
    style_fit,
    style_novelty,
    style_fit_reason: reason,
    style_score: score,
  };
}

