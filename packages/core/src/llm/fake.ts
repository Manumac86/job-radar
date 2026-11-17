import {
  READ_PAGE_TOOL,
  type ResearchClient,
  type ResearchResponse,
  type ResearchToolCall,
  type ResearchTools,
} from "./research-client";
import type { LlmClient, LlmRequest, LlmResponse } from "./client";

type Responder = (req: LlmRequest<unknown>) => unknown;

/** Scripted client for tests: each call takes the next response (a value, an Error, or a function). */
export class FakeLlmClient implements LlmClient {
  readonly requests: LlmRequest<unknown>[] = [];
  private readonly queue: (unknown | Error | Responder)[];

  constructor(
    responses: (unknown | Error | Responder)[] = [],
    private readonly fallback?: Responder,
  ) {
    this.queue = [...responses];
  }

  push(...responses: (unknown | Error | Responder)[]): void {
    this.queue.push(...responses);
  }

  async generate<T>(req: LlmRequest<T>): Promise<LlmResponse> {
    this.requests.push(req as LlmRequest<unknown>);
    const next = this.queue.length ? this.queue.shift() : this.fallback;
    if (next === undefined) throw new Error("FakeLlmClient: no scripted response left");
    if (next instanceof Error) throw next;
    const object =
      typeof next === "function" ? (next as Responder)(req as LlmRequest<unknown>) : next;
    return { object, model: req.model, inputTokens: 100, outputTokens: 50, durationMs: 1 };
  }
}

type ResearchResponder = (
  req: LlmRequest<unknown>,
  tools: ResearchTools,
) => unknown | Promise<unknown>;

/**
 * Scripted research agent for tests: each run takes the next responder, which may call
 * `tools.readPage` like the real agent would, then returns the profile object.
 */
export class FakeResearchClient implements ResearchClient {
  readonly requests: LlmRequest<unknown>[] = [];
  private readonly queue: (ResearchResponder | Error)[];

  constructor(
    responses: (ResearchResponder | Error)[] = [],
    private readonly fallback?: ResearchResponder,
  ) {
    this.queue = [...responses];
  }

  push(...responses: (ResearchResponder | Error)[]): void {
    this.queue.push(...responses);
  }

  async research<T>(req: LlmRequest<T>, tools: ResearchTools): Promise<ResearchResponse> {
    this.requests.push(req as LlmRequest<unknown>);
    const next = this.queue.length ? this.queue.shift() : this.fallback;
    if (next === undefined) throw new Error("FakeResearchClient: no scripted response left");
    if (next instanceof Error) throw next;
    const toolCalls: ResearchToolCall[] = [];
    const tracked: ResearchTools = {
      readPage: async (url) => {
        try {
          const text = await tools.readPage(url);
          toolCalls.push({ name: READ_PAGE_TOOL, error: false });
          return text;
        } catch (err) {
          toolCalls.push({ name: READ_PAGE_TOOL, error: true });
          throw err;
        }
      },
    };
    const object = await next(req as LlmRequest<unknown>, tracked);
    return {
      object,
      model: req.model,
      inputTokens: 100,
      outputTokens: 50,
      durationMs: 1,
      toolCalls,
    };
  }
}
