import type { InterviewPrepContent } from "./index";

/** A valid plan for tests and the UI test mode (never shown to the owner in normal use). */
export const SAMPLE_INTERVIEW_PREP: InterviewPrepContent = {
  focus: "This technical round checks depth on agentic RAG and TypeScript system design.",
  likely_questions: [
    {
      question: "Walk us through a RAG system you built.",
      why_they_ask: "The role owns retrieval quality.",
      answer_outline: ["The agentic RAG analytics platform from your CV", "Evaluation approach"],
    },
    {
      question: "How do you evaluate an LLM feature?",
      why_they_ask: "They ship evals.",
      answer_outline: ["Offline evals plus production feedback"],
    },
    {
      question: "Design a job queue for document ingestion.",
      why_they_ask: "System design round.",
      answer_outline: ["Idempotent workers, backpressure, retries"],
    },
  ],
  strengths_to_highlight: [
    { point: "Agentic RAG", cv_evidence: "Led the frontend of an agentic RAG analytics platform" },
  ],
  gaps_to_prepare: [{ gap: "Python", how_to_prepare: "Review async Python basics" }],
  questions_to_ask: ["How do you measure retrieval quality?", "Who owns evals?"],
  checklist: ["Test camera and screen sharing"],
};
