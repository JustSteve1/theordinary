import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";

export const NOVA_MODEL_ID =
  process.env.BEDROCK_MODEL_ID?.trim() || "amazon.nova-lite-v1:0";

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION?.trim() || process.env.AWS_DEFAULT_REGION?.trim() || "us-east-1",
});

export async function askNova(input: {
  system: string;
  messages: { role: "user" | "assistant"; text: string }[];
}) {
  const turns = alternate(input.messages.filter((message) => message.text.trim()).slice(-16));
  if (turns.length === 0 || turns[0]?.role !== "user") {
    throw new Error("Nova needs a message to answer.");
  }
  const messages = turns.map((message) => ({
    role: message.role,
    content: [{ text: message.text }],
  }));

  const response = await client.send(
    new ConverseCommand({
      modelId: NOVA_MODEL_ID,
      system: [{ text: input.system }],
      messages,
      inferenceConfig: { maxTokens: 700, temperature: 0.3 },
    }),
    { abortSignal: AbortSignal.timeout(20000) },
  );
  const text = response.output?.message?.content
    ?.map((block) => ("text" in block ? block.text : ""))
    .join("")
    .trim();
  if (!text) {
    throw new Error("Nova returned an empty reply.");
  }
  return text;
}

function alternate(messages: { role: "user" | "assistant"; text: string }[]) {
  const turns: { role: "user" | "assistant"; text: string }[] = [];
  for (const message of messages) {
    const last = turns.at(-1);
    if (last && last.role === message.role) {
      last.text = `${last.text}\n${message.text}`;
      continue;
    }
    turns.push({ role: message.role, text: message.text });
  }
  while (turns[0]?.role === "assistant") {
    turns.shift();
  }
  return turns;
}

export function novaFailure(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : "";
  if (
    name === "CredentialsProviderError" ||
    /Could not load credentials/i.test(message) ||
    /security token/i.test(message)
  ) {
    return "Nova needs AWS credentials on this server before it can answer.";
  }
  if (name === "AccessDeniedException" || /access denied/i.test(message)) {
    return `This server is not allowed to call ${NOVA_MODEL_ID}.`;
  }
  if (name === "TimeoutError" || /timeout/i.test(message)) {
    return "Nova took too long. Try again.";
  }
  return "Nova could not answer just now.";
}
