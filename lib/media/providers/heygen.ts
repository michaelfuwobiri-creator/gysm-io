// HeyGen -- talking avatar video. REST docs: https://docs.heygen.com/reference
//
// Async: createAvatarVideo() kicks off generation and returns a
// video_id; getVideoStatus() (wired up via GET /api/media/[id]/status)
// polls until the video is ready.
//
// avatarId here is expected to be one of HeyGen's own stock avatar IDs
// (see their "List Avatars" endpoint) -- the concept prototype's 12
// placeholder avatars (Maya, Jordan, Sam...) are cosmetic names for the
// UI only and don't map to real HeyGen avatar IDs yet; that mapping is
// one of the first things to wire up once a real HEYGEN_API_KEY exists.
export function isHeyGenConfigured(): boolean {
  return !!process.env.HEYGEN_API_KEY;
}

export async function createAvatarVideo(avatarId: string, script: string): Promise<{ videoId: string }> {
  if (!process.env.HEYGEN_API_KEY) {
    throw new Error("HEYGEN_API_KEY is not set.");
  }
  const res = await fetch("https://api.heygen.com/v2/video/generate", {
    method: "POST",
    headers: {
      "X-Api-Key": process.env.HEYGEN_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      video_inputs: [
        {
          character: { type: "avatar", avatar_id: avatarId, avatar_style: "normal" },
          voice: { type: "text", input_text: script },
        },
      ],
      dimension: { width: 1280, height: 720 },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HeyGen request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as any;
  const videoId = data?.data?.video_id;
  if (!videoId) {
    throw new Error("HeyGen response did not include a video_id.");
  }
  return { videoId };
}

export async function getVideoStatus(videoId: string): Promise<{ status: string; url: string | null; error: string | null }> {
  if (!process.env.HEYGEN_API_KEY) {
    throw new Error("HEYGEN_API_KEY is not set.");
  }
  const res = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, {
    headers: { "X-Api-Key": process.env.HEYGEN_API_KEY },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HeyGen status check failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as any;
  const status = data?.data?.status; // "pending" | "processing" | "completed" | "failed"
  return {
    status: status === "completed" ? "succeeded" : status === "failed" ? "failed" : "processing",
    url: data?.data?.video_url ?? null,
    error: data?.data?.error?.message ?? null,
  };
}
