import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

import type { ChatMessage } from "@/lib/chat/store";

const SYSTEM = [
  "You are the membership chat for The Ordinary.",
  "Speak in short, plain sentences.",
  "Use only the brief and the conversation.",
  "If Bee or WHOOP is missing, say so.",
  "Do not diagnose, prescribe, or invent a score, a sleep, or a conversation.",
].join(" ");

export function bedrockConfig() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!accessKeyId || !secretAccessKey) {
    return null;
  }
  return {
    region: process.env.AWS_REGION?.trim() || "eu-west-2",
    modelId:
      process.env.BEDROCK_MODEL_ID?.trim() || "eu.anthropic.claude-sonnet-5",
    accessKeyId,
    secretAccessKey,
    sessionToken: process.env.AWS_SESSION_TOKEN?.trim() || undefined,
  };
}

export async function askBedrock(input: {
  brief: string;
  history: ChatMessage[];
  message: string;
}) {
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
  const messages = [
    ...input.history.map((message) => ({
      role: message.role,
      content: [{ text: message.body }],
    })),
    { role: "user" as const, content: [{ text: input.message }] },
  ];
  const response = await client.send(
    new ConverseCommand({
      modelId: config.modelId,
      system: [{ text: `${SYSTEM}\n\nBrief:\n${input.brief}` }],
      messages,
      inferenceConfig: { maxTokens: 700, temperature: 0.3 },
    }),
  );
  const text = response.output?.message?.content
    ?.map((block) => ("text" in block ? block.text : ""))
    .join("")
    .trim();
  if (!text) {
    throw new Error("Bedrock returned an empty reply.");
  }
  return text;
}
