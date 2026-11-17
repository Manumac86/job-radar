export type LlmKind = "scoring" | "drafting" | "extraction" | "research";

/** The Claude Code CLI is missing or not logged in. Work should wait as "awaiting score". */
export class LlmUnavailableError extends Error {
  override readonly name = "LlmUnavailableError";
  constructor(
    message: string,
    readonly reason: "not_authenticated" | "cli_missing" | "unavailable",
  ) {
    super(message);
  }
}

/** The daily cap for this kind of call is used up. Work resumes after midnight in the app time zone. */
export class LlmCapReachedError extends Error {
  override readonly name = "LlmCapReachedError";
  constructor(
    readonly kind: LlmKind,
    readonly cap: number,
    readonly day: string,
  ) {
    super(`Daily ${kind} cap of ${cap} reached for ${day}`);
  }
}

/** The model's answer failed schema validation, after the retry. */
export class LlmOutputError extends Error {
  override readonly name = "LlmOutputError";
  constructor(
    message: string,
    readonly attempts: number,
  ) {
    super(message);
  }
}

export const NOT_AUTHENTICATED_HELP =
  "Claude Code CLI is not authenticated. Run `claude` and log in with your subscription " +
  "(natively), or run `claude setup-token` and save the token to secrets/claude_oauth_token (Docker).";
