const DEFAULT_MINIMAX_BASE_URL = "https://api.minimaxi.com/anthropic";
const DEFAULT_MINIMAX_MODEL = "MiniMax-M2.7";

type MiniMaxContentBlock = {
  type: string;
  text?: string;
};

type MiniMaxMessageResponse = {
  content?: MiniMaxContentBlock[];
};

export async function generateMiniMaxText({
  prompt,
  system,
  maxTokens = 1800,
  temperature = 0.2
}: {
  prompt: string;
  system: string;
  maxTokens?: number;
  temperature?: number;
}) {
  const apiKey = process.env.MINIMAX_API_KEY ?? process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("MINIMAX_API_KEY is not configured.");
  }

  const baseUrl = process.env.MINIMAX_BASE_URL ?? DEFAULT_MINIMAX_BASE_URL;
  const model = process.env.MINIMAX_MODEL ?? DEFAULT_MINIMAX_MODEL;
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`MiniMax request failed with ${response.status}: ${await response.text()}`);
  }

  const payload = (await response.json()) as MiniMaxMessageResponse;
  return (payload.content ?? [])
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n")
    .trim();
}
