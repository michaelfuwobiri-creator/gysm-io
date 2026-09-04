// Tiny (16px-wide, quality 40) base64 WebP blur-up placeholders for the
// static marketing images under /public, generated once via sharp and
// checked in here so next/image's `placeholder="blur"` doesn't need a
// build-time loader for images referenced by public/ path (see
// app/[locale]/page.tsx APPS grid and app/components/UseCaseLanding.tsx).
// Keyed by the public/ path exactly as passed to <Image src="...">.
// If an image under public/media or public/screenshots is replaced,
// regenerate its entry with:
//   node -e "require('sharp')('public/.../file.webp').resize(16).webp({quality:40}).toBuffer().then(b=>console.log('data:image/webp;base64,'+b.toString('base64')))"
export const IMAGE_BLUR: Record<string, string> = {
  "/media/story-founders.webp":
    "data:image/webp;base64,UklGRnAAAABXRUJQVlA4IGQAAADwAQCdASoQAAsAA4BaJQBOgMWWig4Vp8AA/uX8dh73Eb6UI+z5qzrEVLTGSOWvKpDECq3EabTHo76vtoqsvlzExZJVlHdmYs7FCoPM4epM8Mi4Dl6OOkYdfDbHMZzf6zC98AAA",
  "/media/story-shippers.webp":
    "data:image/webp;base64,UklGRmIAAABXRUJQVlA4IFYAAADwAQCdASoQAAsAA4BaJYgCdAENwVkJugAA+6XIXAeuMw67mXmI6R0R28qCpAPGhVjFo8MiI64kaqpmlsMhsYqWb+hUC8NK0+1BaANkUurCJZNrV7QAAA==",
  "/media/story-agencies.webp":
    "data:image/webp;base64,UklGRnQAAABXRUJQVlA4IGgAAAAwAgCdASoQAAsAA4BaJZwC7AYulgbak6FqwAD+z39umpu027lLIAi8nCs/otbNk0Ul0/eK8XHnlllEc6WiULAP8Hq/phzlLLa26YHl8/mun4O11aesPlplh54V32k1mEIATUZojoAAAA==",
  "/media/story-indie-hackers.webp":
    "data:image/webp;base64,UklGRlwAAABXRUJQVlA4IFAAAADwAQCdASoQAAsAA4BaJZQAAugIoRw0Z0AA/vSZfEDQNhBibI+VhLwYsnaUH9UFDIFhhQyeDMeuCPAWpr5pvtufit6Gh8SxqeaNK1chXocAAA==",
  "/screenshots/builder-live.webp":
    "data:image/webp;base64,UklGRkYAAABXRUJQVlA4IDoAAACwAQCdASoQAAkAA4BaJaQAAuZWtYAAAP75EWy946OrR/cBU+3b45VvuuBes/5nkH8Hzez//ixhAAAA",
  "/screenshots/buildguild.webp":
    "data:image/webp;base64,UklGRkoAAABXRUJQVlA4ID4AAADQAQCdASoQAAkAA4BaJaQAD4AOw4uAAAD+9kYmbpIHvOq8w7ikF2DonD5eoAcAAixMF/cy1ISTqYe75MAAAA==",
  "/screenshots/homepage.webp":
    "data:image/webp;base64,UklGRkQAAABXRUJQVlA4IDgAAADwAQCdASoQAAkAA4BaJaQAAuzXxh1YGAAA/vfwoJBKzLg19ITiL4lb997ku76upPuO5oqKRAAAAA==",
  "/screenshots/social-proof.webp":
    "data:image/webp;base64,UklGRkgAAABXRUJQVlA4IDwAAACwAQCdASoQAAkAA4BaJaQAAujbP78QAP7KrE0nuHkWDKwoJCPvh9pXhmu5is42eUsQspooAkpUxZAAAAA=",
};

// Real intrinsic dimensions (identify -format "%wx%h") for each image
// above -- next/image requires width/height (or fill) to reserve layout
// space and avoid CLS.
export const IMAGE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "/media/story-founders.webp": { width: 1920, height: 1280 },
  "/media/story-shippers.webp": { width: 1920, height: 1280 },
  "/media/story-agencies.webp": { width: 1920, height: 1280 },
  "/media/story-indie-hackers.webp": { width: 1920, height: 1280 },
  "/screenshots/builder-live.webp": { width: 1920, height: 1080 },
  "/screenshots/buildguild.webp": { width: 1920, height: 1080 },
  "/screenshots/homepage.webp": { width: 1920, height: 1080 },
  "/screenshots/social-proof.webp": { width: 1920, height: 1080 },
};
