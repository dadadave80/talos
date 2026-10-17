import { z } from "zod";
import { decide } from "./llm";
import { PROMPT } from "./prompt";

export const VerdictSchema = z.object({
  verdict: z.enum(["PAY", "QUEUE", "REFUSE"]),
  tier: z.enum(["CONTRIBUTOR", "VENDOR", "DISCRETIONARY"]),
  amount_usdc: z.number().min(0).max(1000),
  reason: z.string().min(1).max(1200),
});
export type BrainVerdict = z.infer<typeof VerdictSchema>;

// Hand-written for Groq strict mode: every property required, no extras.
const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "tier", "amount_usdc", "reason"],
  properties: {
    verdict: { type: "string", enum: ["PAY", "QUEUE", "REFUSE"] },
    tier: { type: "string", enum: ["CONTRIBUTOR", "VENDOR", "DISCRETIONARY"] },
    amount_usdc: { type: "number" },
    reason: { type: "string" },
  },
};

const FORMAT = `Reply with JSON only: {"verdict":"PAY|QUEUE|REFUSE","tier":"CONTRIBUTOR|VENDOR|DISCRETIONARY","amount_usdc":number,"reason":"one auditable paragraph"}. The payee is always the requesting wallet; you cannot choose another.`;

const MAX_MESSAGE_CHARS = 2000;

/// Untrusted text in, one verdict out. URLs are stripped from what the model sees (kept in the log by the
/// caller); the model can never name a tool or a payee. Both models failing ends in REFUSE "model_unavailable".
export async function judge(input: { message: string; wallet: string; context: object }) {
  const message = input.message.slice(0, MAX_MESSAGE_CHARS).replace(/https?:\/\/\S+/g, "[url]");
  const user = JSON.stringify({ wallet: input.wallet, context: input.context, message });
  try {
    const r = await decide({ system: `${PROMPT}\n\n${FORMAT}`, user, schema: VerdictSchema, jsonSchema: JSON_SCHEMA });
    return { ...r.data, model: r.model };
  } catch {
    return { verdict: "REFUSE", tier: "DISCRETIONARY", amount_usdc: 0, reason: "model_unavailable", model: "none" } as BrainVerdict & {
      model: string;
    };
  }
}
