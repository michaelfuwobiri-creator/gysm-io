const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./i18n/request.js');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // next/image already serves WebP by default; AVIF first when the
    // browser supports it, falling back through the list automatically
    // based on the request's Accept header -- no per-image code needed.
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        // Static marketing/screenshot assets under /public/media and
        // /public/screenshots are content-hashed by filename only when we
        // change them ourselves (no build-time fingerprinting here), so a
        // long immutable cache is safe -- ship a new filename if the
        // image content ever changes. next/image's own /_next/image
        // output already sets long-lived caching on its own; this covers
        // the underlying /media and /screenshots files themselves, which
        // are also linked to directly in a few places (fastlane, docs).
        source: "/media/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/screenshots/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/icons/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

module.exports = withNextIntl(nextConfig);
