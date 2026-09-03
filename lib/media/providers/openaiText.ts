// OpenAI chat completions -- AI Script Generator (42-tool spec, layer 3,
// item 14: "topic -> structured script/dialogue"). Reuses the existing
// OPENAI_API_KEY already configured for Whisper/TTS (see
// openaiAudio.ts) and for the builder's own generation pipeline (see
// lib/ai/orchestrator.ts) -- no new provider account.
const SCRIPT_MODEL = "gpt-4o-mini";

export function isOpenAiTextConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export async function generateScript(topic: string, style?: string): Promise<{ text: string }> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set.");
  }
  const system =
    "You write short-form video scripts. Given a topic, produce a structured script: a hook line, then numbered " +
    "scenes, each with a one-line VISUAL direction and a VOICEOVER/dialogue line. Keep it tight -- suitable for a " +
    "30-90 second video. Plain text only, no markdown formatting.";
  const userContent = style ? `Topic: ${topic}\nStyle/platform: ${style}` : `Topic: ${topic}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: SCRIPT_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContent },
      ],
      max_tokens: 700,
      temperature: 0.8,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI request failed (${res.status}): ${errText.slice(0, 300)}`);
  }
  const data = (await res.json()) as any;
  const text = data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("OpenAI response did not include script text.");
  }
  return { text };
}
