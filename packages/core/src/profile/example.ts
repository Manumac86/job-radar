/** A line only the bundled example CV contains (candidate-profile spec, "Example seed profile"). */
export const EXAMPLE_PROFILE_MARKER = "This is the example profile that ships with Job Radar";

/** True while the CV is still the bundled example. */
export function isExampleCv(cv: string): boolean {
  return cv.includes(EXAMPLE_PROFILE_MARKER);
}
