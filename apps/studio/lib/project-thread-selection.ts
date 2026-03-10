/**
 * Select project and optionally idea thread for a session.
 * Canon: session_loop.md — "Select Project / Thread / Idea".
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ProjectThreadSelection {
  projectId: string | null;
  ideaThreadId: string | null;
}

/**
 * Select one active project and optionally one active idea thread.
 * Uses simple weighted selection: projects with recent activity or higher recurrence/pull
 * get higher effective weight. If no projects exist, returns nulls.
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
    return { projectId: null, ideaThreadId: null };
  }

  // Pick one project: for V1 use random among active (could later weight by recurrence/pull).
  const project = projects[Math.floor(Math.random() * projects.length)];
  const projectId = project?.project_id ?? null;

  if (!projectId) return { projectId: null, ideaThreadId: null };

  const { data: threads } = await supabase
    .from("idea_thread")
    .select("idea_thread_id, recurrence_score, creative_pull")
    .eq("project_id", projectId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(20);

  if (!threads?.length) {
    return { projectId, ideaThreadId: null };
  }

  // Weight by recurrence_score and creative_pull (default 0.5 if null); pick one.
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

  return {
    projectId,
    ideaThreadId: chosen?.idea_thread_id ?? null,
  };
}
