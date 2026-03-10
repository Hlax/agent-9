/**
 * Select project, idea thread, and optionally one idea for a session.
 * Canon: session_loop.md — "Select Project / Thread / Idea".
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ProjectThreadSelection {
  projectId: string | null;
  ideaThreadId: string | null;
  ideaId: string | null;
}

/**
 * Select one active project, one active idea thread (weighted), and optionally one idea
 * from that thread (via idea_to_thread). If no projects/threads/ideas exist, returns nulls.
 */
export async function selectProjectAndThread(
  supabase: SupabaseClient
): Promise<ProjectThreadSelection> {
  const { data: projects } = await supabase
    .from("project")
    .select("project_id")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(50);

  if (!projects?.length) {
    return { projectId: null, ideaThreadId: null, ideaId: null };
  }

  const project = projects[Math.floor(Math.random() * projects.length)];
  const projectId = project?.project_id ?? null;

  if (!projectId) return { projectId: null, ideaThreadId: null, ideaId: null };

  const { data: threads } = await supabase
    .from("idea_thread")
    .select("idea_thread_id, recurrence_score, creative_pull")
    .eq("project_id", projectId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(20);

  if (!threads?.length) {
    return { projectId, ideaThreadId: null, ideaId: null };
  }

  const weights = threads.map((t) => {
    const r = t.recurrence_score ?? 0.5;
    const p = t.creative_pull ?? 0.5;
    return r * 0.6 + p * 0.4;
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
    return { projectId, ideaThreadId: null, ideaId: null };
  }

  // Select one idea from this thread (idea_to_thread → idea).
  const { data: linkRows } = await supabase
    .from("idea_to_thread")
    .select("idea_id")
    .eq("idea_thread_id", ideaThreadId);

  if (!linkRows?.length) {
    return { projectId, ideaThreadId, ideaId: null };
  }

  const ideaIds = linkRows.map((row) => row.idea_id).filter(Boolean) as string[];
  if (ideaIds.length === 0) return { projectId, ideaThreadId, ideaId: null };

  const { data: ideas } = await supabase
    .from("idea")
    .select("idea_id, recurrence_score, creative_pull")
    .in("idea_id", ideaIds)
    .eq("status", "active");

  if (!ideas?.length) return { projectId, ideaThreadId, ideaId: null };

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
