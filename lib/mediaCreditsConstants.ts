// Plain media-generation credit costs, no database dependency -- same
// split rationale as lib/credits-constants.ts (client components need to
// show "this costs 75 credits" without pulling lib/db.ts into the browser
// bundle). Kept in its own file rather than added to credits-constants.ts
// so the two pricing tables (builds vs. media) stay easy to read
// independently.
//
// Priced at a 2x margin over real provider cost (confirmed 2026-09-02 --
// builds use a much higher margin, but media generation runs on thinner
// margins by design). Real costs researched at the time these were set;
// re-check provider pricing pages before changing providers or if a
// provider changes its pricing model.
export const MEDIA_KINDS = [
  "image",
  "video",
  "avatar",
  "captions",
  "tts",
  "voice-clone",
  "music",
  "edit",
  "reframe",
  "video-upscale",
  "script",
  "sound-effect",
  "voice-enhance",
  "video-bg-remove",
] as const;

export type MediaKind = (typeof MEDIA_KINDS)[number];

// credits, real-cost basis (USD), note
export const MEDIA_CREDIT_COST: Record<MediaKind, number> = {
  image: 75, // ~$0.05/image (Fal.ai FLUX/Recraft-class model)
  video: 2400, // ~$1.80 for a 12s 1080p clip (Replicate, ~$0.15/sec)
  avatar: 1300, // ~$1.00/min talking avatar (HeyGen standard)
  captions: 25, // ~$0.01 for a few minutes of audio (OpenAI Whisper)
  tts: 25, // ~$0.01 for a short narration (OpenAI TTS)
  "voice-clone": 75, // ~$0.05 per ~500 chars (ElevenLabs multilingual)
  music: 400, // ~$0.30 for a 30s background track (Replicate audio model)
  edit: 50, // ~$0.03 per op -- background remove / upscale (Replicate)
  reframe: 800, // ~$0.60 for a 10s clip (Replicate, Luma Reframe Video @ $0.06/sec output, 10s input cap)
  "video-upscale": 550, // ~$0.40/run (Replicate, lucataco/real-esrgan-video, community model, A100 GPU-time billed -- varies with clip length)
  script: 40, // ~$0.01-0.02 per script (OpenAI gpt-4o-mini chat completion, ~700 output tokens)
  // ElevenLabs bills sound-generation/audio-isolation against the account's
  // character/credit quota rather than a clean per-request USD price --
  // these two are rougher estimates than the other real-cost comments in
  // this file, priced in the same ballpark as voice-clone/edit rather than
  // a precise 2x-margin calculation.
  "sound-effect": 60,
  "voice-enhance": 60,
  "video-bg-remove": 60, // ~$0.044/run (Replicate, arielreplicate/robust_video_matting, community model)
};

// Which env var must be set for a kind to actually run. Every route
// checks this and returns a clear "not configured yet" response instead
// of crashing when the key is missing -- same pattern lib/stripe.ts and
// lib/db.ts already use for their own required env vars.
export const MEDIA_KIND_ENV_VAR: Record<MediaKind, string> = {
  image: "FAL_API_KEY",
  video: "REPLICATE_API_TOKEN",
  avatar: "HEYGEN_API_KEY",
  captions: "OPENAI_API_KEY",
  tts: "OPENAI_API_KEY",
  "voice-clone": "ELEVENLABS_API_KEY",
  music: "REPLICATE_API_TOKEN",
  edit: "REPLICATE_API_TOKEN",
  reframe: "REPLICATE_API_TOKEN",
  "video-upscale": "REPLICATE_API_TOKEN",
  script: "OPENAI_API_KEY",
  "sound-effect": "ELEVENLABS_API_KEY",
  "voice-enhance": "ELEVENLABS_API_KEY",
  "video-bg-remove": "REPLICATE_API_TOKEN",
};

// Kinds whose provider call is a single request/response (fast, no job
// polling needed). Everything else (video, avatar, music) returns a
// provider_job_id immediately and the client polls
// GET /api/media/[id]/status until status is "done" or "failed".
export const SYNCHRONOUS_MEDIA_KINDS: readonly MediaKind[] = ["image", "captions", "tts", "voice-clone", "edit", "script", "sound-effect", "voice-enhance"];
// reframe and video-upscale are intentionally NOT in this list -- both
// run on the same async prediction lifecycle as video/avatar/music (up
// to several minutes for video-upscale), so the client polls
// GET /api/media/[id]/status rather than getting a same-request result.
