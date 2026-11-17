import type { LearningOps } from "./index";

/** Test-mode answer: evidence ids are filtered against the offers actually shown. */
export function SAMPLE_LEARNING_OPS(shownOfferIds: number[]): LearningOps {
  return {
    add: [
      {
        text: "Avoid offers that require US W2 employment or US residency",
        polarity: "avoid",
        evidence: shownOfferIds.slice(0, 5),
      },
    ],
    update: [],
    retire: [],
  };
}
