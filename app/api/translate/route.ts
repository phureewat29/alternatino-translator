import { SYSTEM_PROMPT } from "@/lib/prompt";

const GENERIC_ERROR = "Something got lost in translation. Try again.";
const MAX_INPUT_LENGTH = 4000;
const DEFAULT_MODEL = "grok-4.5";

export async function POST(req: Request) {
  let text: unknown;
  try {
    ({ text } = await req.json());
  } catch {
    return new Response(GENERIC_ERROR, { status: 400 });
  }

  if (
    typeof text !== "string" ||
    text.trim().length === 0 ||
    text.length > MAX_INPUT_LENGTH
  ) {
    return new Response(GENERIC_ERROR, { status: 400 });
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return new Response(GENERIC_ERROR, { status: 500 });
  }

  const upstream = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.XAI_MODEL || DEFAULT_MODEL,
      stream: true,
      temperature: 0.9,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    }),
  }).catch(() => null);

  if (!upstream || !upstream.ok || !upstream.body) {
    return new Response(GENERIC_ERROR, { status: 502 });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();

  // Re-emit the upstream SSE stream as plain text so the client sees
  // nothing but the translated words.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const data = line.trim();
            if (!data.startsWith("data:")) continue;
            const payload = data.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta.length > 0) {
                controller.enqueue(encoder.encode(delta));
              }
            } catch {
              // Ignore malformed SSE fragments.
            }
          }
        }
      } finally {
        controller.close();
      }
    },
    cancel() {
      reader.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
