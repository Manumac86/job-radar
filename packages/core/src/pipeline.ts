/** Capacity warning (application-pipeline spec): committed hours above weekly capacity. */
export function capacityStatus(committedHours: number, capacityHours: number) {
  return {
    committed: committedHours,
    capacity: capacityHours,
    remaining: capacityHours - committedHours,
    over: committedHours > capacityHours,
  };
}

/** Built-in stages that are interviews; custom stages count when their label says so. */
export const INTERVIEW_STAGES = [
  "screening_call",
  "technical_interview",
  "take_home",
  "fit_interview",
  "final_interview",
] as const;

export function isInterviewStage(key: string, label = ""): boolean {
  return (
    (INTERVIEW_STAGES as readonly string[]).includes(key) ||
    /interview|entrevista|call|take[- ]?home|challenge|prueba/i.test(label)
  );
}
