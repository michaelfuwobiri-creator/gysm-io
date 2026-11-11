"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics/track";

export default function TrackUseCaseViewed({ slug }: { slug: string }) {
  useEffect(() => {
    trackEvent("usecase_viewed", { use_case: slug });
  }, [slug]);
  return null;
}
