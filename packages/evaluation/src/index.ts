/**
 * @twin/evaluation — critique handling, evaluation signals, creative state update.
 * Do not collapse with approval or publication.
 */

export { runCritique } from "./critique.js";
export type { CritiqueInput } from "./critique.js";
export { computeEvaluationSignals } from "./signals.js";
export type { EvaluationInput } from "./signals.js";
export {
  defaultCreativeState,
  snapshotToState,
  updateCreativeState,
  stateToSnapshotRow,
  computeDriveWeights,
  computeSessionMode,
  selectDrive,
} from "./creative-state.js";
export type { CreativeStateFields, CreativeStateSignals } from "./creative-state.js";
