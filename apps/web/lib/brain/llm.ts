// Adapted from engye (Lepton, pre-Tameion): github.com/dadadave80/engye lib/llm.ts.
// Talos changes: one role; gpt-oss gets a strict JSON schema (constrained decoding), qwen keeps json_object + Zod;
// GROQ key read from LLM_API_KEY; promptHash is the keccak of the versioned prompt, not sha256 of the message.
// One wrapper for every agent call (plan §11): strict JSON, Zod-validated, retry-with-error,
// then fail over across Groq models (no Anthropic key available — failover is model-level).
// GOTCHA (verified): gpt-oss are reasoning models — hidden reasoning consumes
// max_completion_tokens; tight caps yield empty content as `json_validate_failed`.
import { z } from "zod";

export const MODEL = process.env.LLM_MODEL ?? "openai/gpt-oss-120b";
export const FALLBACK_MODEL = process.env.LLM_FALLBACK_MODEL ?? "qwen/qwen3-32b";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const TIMEOUT_MS = 25_000;

export interface LlmResult<T> {
  data: T;
  model: string; // the model that actually answered (persist with every decision)
  latencyMs: number;
  raw: string;
}

class LlmHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function groqCall(
  model: string,
  system: string,
  user: string,
  maxTokens: number,
  jsonSchema: object,
): Promise<string> {
  const key = process.env.LLM_API_KEY;
  if (!key) throw new Error("LLM_API_KEY missing");
  // gpt-oss models take low/medium/high; qwen3 only accepts none|default
  const reasoningEffort = model.startsWith("openai/gpt-oss") ? "low" : "none";
  const res = await fetch(GROQ_URL, {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      // Constrained decoding is limited to the GPT-OSS models on Groq.
      response_format: model.startsWith("openai/gpt-oss")
        ? { type: "json_schema", json_schema: { name: "verdict", strict: true, schema: jsonSchema } }
        : { type: "json_object" },
      reasoning_effort: reasoningEffort,
      max_completion_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new LlmHttpError(
      res.status,
      body?.error?.code ?? "http_error",
      body?.error?.message ?? `groq ${res.status}`,
    );
  }
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new LlmHttpError(200, "empty_content", "model returned no content");
  }
  return content;
}

/**
 * Ask for a structured decision. Attempt order:
 *   primary → primary + validation error appended → fallback → fallback + error appended.
 * HTTP/timeout/empty errors skip straight to the fallback model.
 */
export async function decide<T>(opts: {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  jsonSchema: object;
  maxTokens?: number;
}): Promise<LlmResult<T>> {
  const maxTokens = opts.maxTokens ?? 2048; // includes hidden reasoning — do not shrink
  const start = Date.now();
  let lastError: unknown;

  for (const model of [MODEL, FALLBACK_MODEL]) {
    let errorFeedback: string | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const user = errorFeedback
        ? `${opts.user}\n\nYour previous reply failed validation: ${errorFeedback}\nReturn corrected strict JSON only.`
        : opts.user;
      let raw: string;
      try {
        raw = await groqCall(model, opts.system, user, maxTokens, opts.jsonSchema);
      } catch (e) {
        lastError = e;
        // json_validate_failed = the model flubbed JSON — worth one same-model retry;
        // anything else (429/5xx/timeout/empty) → next model immediately
        if (e instanceof LlmHttpError && e.code === "json_validate_failed" && attempt === 0) {
          errorFeedback = "output was not valid JSON";
          continue;
        }
        break;
      }
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw);
      } catch {
        lastError = new Error(`unparseable JSON from ${model}`);
        errorFeedback = "output was not parseable JSON";
        continue;
      }
      const parsed = opts.schema.safeParse(parsedJson);
      if (parsed.success) {
        return {
          data: parsed.data,
          model,
          latencyMs: Date.now() - start,
          raw,
        };
      }
      lastError = new Error(`schema validation failed: ${parsed.error.message}`);
      errorFeedback = JSON.stringify(parsed.error.issues.slice(0, 3));
    }
  }
  throw new Error(
    `llm failed on ${MODEL} and ${FALLBACK_MODEL}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}
