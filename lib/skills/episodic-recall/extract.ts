import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

import { bedrockConfig } from "@/lib/chat/bedrock";
import { validateFacts, type GroundTruth, type RecallDoc } from "./score";

import { groundTruthPrompt, recallFactPrompt } from "./fact-prompt";

export { groundTruthPrompt, recallFactPrompt };

export function parseModelJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(trimmed) as unknown;
}

export function asGroundTruth(
  value: unknown,
  date: string,
  window: string,
): GroundTruth {
  const doc = record(value);
  const errors = validateFacts(doc, "truth");
  if (errors.length) {
    throw new Error(errors[0]);
  }
  return {
    date,
    window,
    facts: doc.facts as GroundTruth["facts"],
  };
}

export function asRecall(
  value: unknown,
  date: string,
  window: string,
): RecallDoc {
  const doc = record(value);
  const errors = validateFacts(doc, "recall");
  if (errors.length) {
    throw new Error(errors[0]);
  }
  return {
    date,
    window,
    facts: (doc.facts as RecallDoc["facts"]).map((fact) => ({
      ...fact,
      confidence: fact.confidence ?? "certain",
    })),
  };
}

export async function extractDocument(prompt: string) {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const user =
      attempt === 0
        ? prompt
        : `${prompt}\nReturn one JSON object. facts must be a non-empty list.`;
    try {
      return await completeJson(
        "You extract atomic facts as JSON. You never speak to the person and you never include a preamble.",
        user,
      );
    } catch (error) {
      last = error;
      if (
        error instanceof Error &&
        error.message === "Chat is not configured on this server."
      ) {
        throw error;
      }
    }
  }
  throw last instanceof Error
    ? last
    : new Error("The facts could not be read.");
}

export async function completeJson(system: string, user: string) {
  const config = bedrockConfig();
  if (!config) {
    throw new Error("Chat is not configured on this server.");
  }
  const client = new BedrockRuntimeClient({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      sessionToken: config.sessionToken,
    },
  });
  const response = await client.send(
    new ConverseCommand({
      modelId: config.modelId,
      system: [{ text: system }],
      messages: [{ role: "user", content: [{ text: user }] }],
      inferenceConfig: { maxTokens: 2000, temperature: 0 },
    }),
  );
  const text = response.output?.message?.content
    ?.map((block) => ("text" in block ? block.text : ""))
    .join("")
    .trim();
  if (!text) {
    throw new Error("Bedrock returned an empty reply.");
  }
  return parseModelJson(text);
}

function record(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { facts: undefined };
  }
  return value as { facts?: unknown };
}
