/**
 * Select project, idea thread, and optionally one idea for a session.
 * Canon: session_loop.md — "Select Project / Thread / Idea".
 *
 * Continuity audit: recurrence_score and creative_pull on idea_thread/idea are written by
 * session-runner persistDerivedState (after artifact sessions). Here we read them and weight
 * thread/idea choice so repeated threads get higher likelihood of selection. See
 * docs/05_build/CONTINUITY_RECURRENCE_AUDIT.md.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ProjectThreadSelection {
  projectId: string | null;
  ideaThreadId: string | null;
  ideaId: string | null;
  /** Recurrence/pull values for the selected thread (for continuity trace logging). */
  selectedThreadRecurrenceScore?: number | null;
  selectedThreadCreativePull?: number | null;
  /** Recurrence/pull values for the selected idea (for continuity trace logging). */
  selectedIdeaRecurrenceScore?: number | null;
  selectedIdeaCreativePull?: number | null;
}

/** Optional bias from active session intent (soft boost for matching project/thread). */
export interface IntentFocusBias {
  projectId?: string | null;
  threadId?: string | null;
}

/** Boost multiplier for intent-matched project/thread (soft; default 1.4). */
const INTENT_BOOST = 1.4;

/**
 * Select one active project, one active idea thread (weighted), and optionally one idea
 * from that thread (via idea_to_thread). If no projects/threads/ideas exist, returns nulls.
 * Optional intentBias boosts weight for the given project/thread so the runtime can "lean" toward its active intention.
 */
export async function selectProjectAndThread(
  supabase: SupabaseClient,
  intentBias?: IntentFocusBias | null
): Promise<ProjectThreadSelection> {
  const { data: projects } = await supabase
    .from("project")
    .select("project_id, priority")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (!projects?.length) {
    return { projectId: null, ideaThreadId: null, ideaId: null };
  }

  const projectWeights = projects.map((proj) => {
    const pri = (proj as { priority?: number | null }).priority ?? 0.5;
    let w = pri * 0.6 + 0.4;
    if (intentBias?.projectId && (proj as { project_id?: string }).project_id === intentBias.projectId) {
      w *= INTENT_BOOST;
    }
    return w;
  });
  const projectTotal = projectWeights.reduce((a, b) => a + b, 0) || 1;
  let projectAcc = 0;
  const rProj = Math.random();
  let project = projects[0];
  for (let i = 0; i < projects.length; i++) {
    projectAcc += projectWeights[i]! / projectTotal;
    if (rProj <= projectAcc) {
      project = projects[i]!;
      break;
    }
    project = projects[i]!;
  }
  const projectId = project?.project_id ?? null;

  if (!projectId) return { projectId: null, ideaThreadId: null, ideaId: null };

  // Recurrence loop: recurrence_score (and creative_pull) are written by session-runner persistDerivedState
  // for the selected idea/idea_thread. We read them here so repeated threads get higher weight next session.
  const { data: threads } = await supabase
    .from("idea_thread")
    .select("idea_thread_id, recurrence_score, creative_pull")
    .eq("project_id", projectId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(20);

  if (!threads?.length) {
    return {
      projectId,
      ideaThreadId: null,
      ideaId: null,
      selectedThreadRecurrenceScore: null,
      selectedThreadCreativePull: null,
    };
  }

  const weights = threads.map((t) => {
    const r = t.recurrence_score ?? 0.5;
    const p = t.creative_pull ?? 0.5;
    let w = r * 0.6 + p * 0.4;
    if (intentBias?.threadId && (t as { idea_thread_id?: string }).idea_thread_id === intentBias.threadId) {
      w *= INTENT_BOOST;
    }
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  const r = Math.random();
  let chosen = threads[0];
  for (let i = 0; i < threads.length; i++) {
    acc += weights[i]! / total;
    if (r <= acc) {
      chosen = threads[i]!;
      break;
    }
    chosen = threads[i]!;
  }

  const ideaThreadId = chosen?.idea_thread_id ?? null;
  if (!ideaThreadId) {
    return {
      projectId,
      ideaThreadId: null,
      ideaId: null,
      selectedThreadRecurrenceScore: null,
      selectedThreadCreativePull: null,
    };
  }

  // Select one idea from this thread (idea_to_thread → idea).
  const { data: linkRows } = await supabase
    .from("idea_to_thread")
    .select("idea_id")
    .eq("idea_thread_id", ideaThreadId);

  if (!linkRows?.length) {
    return {
      projectId,
      ideaThreadId,
      ideaId: null,
      selectedThreadRecurrenceScore: chosen?.recurrence_score ?? null,
      selectedThreadCreativePull: chosen?.creative_pull ?? null,
    };
  }

  const ideaIds = linkRows.map((row) => row.idea_id).filter(Boolean) as string[];
  if (ideaIds.length === 0) return {
    projectId,
    ideaThreadId,
    ideaId: null,
    selectedThreadRecurrenceScore: chosen?.recurrence_score ?? null,
    selectedThreadCreativePull: chosen?.creative_pull ?? null,
  };

  // Same recurrence loop: idea.recurrence_score is written by session-runner for selected idea; we weight by it here.
  const { data: ideas } = await supabase
    .from("idea")
    .select("idea_id, recurrence_score, creative_pull")
    .in("idea_id", ideaIds)
    .eq("status", "active");

  if (!ideas?.length) return {
    projectId,
    ideaThreadId,
    ideaId: null,
    selectedThreadRecurrenceScore: chosen?.recurrence_score ?? null,
    selectedThreadCreativePull: chosen?.creative_pull ?? null,
  };

  const ideaWeights = ideas.map((i) => {
    const r = i.recurrence_score ?? 0.5;
    const p = i.creative_pull ?? 0.5;
    return r * 0.6 + p * 0.4;
  });
  const ideaTotal = ideaWeights.reduce((a, b) => a + b, 0) || 1;
  let ideaAcc = 0;
  const r2 = Math.random();
  let chosenIdea = ideas[0];
  for (let i = 0; i < ideas.length; i++) {
    ideaAcc += ideaWeights[i]! / ideaTotal;
    if (r2 <= ideaAcc) {
      chosenIdea = ideas[i]!;
      break;
    }
    chosenIdea = ideas[i]!;
  }

  return {
    projectId,
    ideaThreadId,
    ideaId: chosenIdea?.idea_id ?? null,
    selectedThreadRecurrenceScore: chosen?.recurrence_score ?? null,
    selectedThreadCreativePull: chosen?.creative_pull ?? null,
    selectedIdeaRecurrenceScore: chosenIdea?.recurrence_score ?? null,
    selectedIdeaCreativePull: chosenIdea?.creative_pull ?? null,
  };
}

/**
 * Build a short "project / thread / idea" context string for the session prompt.
 * Used to focus generation on the selected project, thread, and idea when present.
 */
export async function getProjectThreadIdeaContext(
  supabase: SupabaseClient,
  projectId: string | null,
  ideaThreadId: string | null,
  ideaId: string | null
): Promise<string | null> {
  const parts: string[] = [];

  if (projectId) {
    const { data: project } = await supabase
      .from("project")
      .select("title, summary")
      .eq("project_id", projectId)
      .maybeSingle();
    if (project?.title) {
      parts.push(`Project: ${project.title}${project.summary ? ` — ${project.summary}` : ""}`);
    }
  }

  if (ideaThreadId) {
    const { data: thread } = await supabase
      .from("idea_thread")
      .select("title, summary")
      .eq("idea_thread_id", ideaThreadId)
      .maybeSingle();
    if (thread?.title) {
      parts.push(`Thread: ${thread.title}${thread.summary ? ` — ${thread.summary}` : ""}`);
    }
  }

  if (ideaId) {
    const { data: idea } = await supabase
      .from("idea")
      .select("title, summary")
      .eq("idea_id", ideaId)
      .maybeSingle();
    if (idea?.title) {
      parts.push(`Idea: ${idea.title}${idea.summary ? ` — ${idea.summary}` : ""}`);
    }
  }

  if (parts.length === 0) return null;
  return "Current focus:\n" + parts.join("\n");
}

/**
 * Fetch project/thread/idea labels for session trace (names and idea summary).
 */
export async function getProjectThreadIdeaTraceLabels(
  supabase: SupabaseClient,
  projectId: string | null,
  ideaThreadId: string | null,
  ideaId: string | null
): Promise<{ project_name: string | null; thread_name: string | null; idea_summary: string | null }> {
  const [projectRes, threadRes, ideaRes] = await Promise.all([
    projectId
      ? supabase.from("project").select("title").eq("project_id", projectId).maybeSingle()
      : Promise.resolve({ data: null }),
    ideaThreadId
      ? supabase.from("idea_thread").select("title").eq("idea_thread_id", ideaThreadId).maybeSingle()
      : Promise.resolve({ data: null }),
    ideaId
      ? supabase.from("idea").select("title, summary").eq("idea_id", ideaId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const project = projectRes.data as { title?: string } | null;
  const thread = threadRes.data as { title?: string } | null;
  const idea = ideaRes.data as { title?: string; summary?: string } | null;
  return {
    project_name: project?.title ?? null,
    thread_name: thread?.title ?? null,
    idea_summary: idea?.summary ?? idea?.title ?? null,
  };
}
