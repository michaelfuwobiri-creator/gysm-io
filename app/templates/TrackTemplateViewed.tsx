"use client";
import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics/track";
export default function TrackTemplateViewed({ id, title }: { id: string; title: string }) {
  useEffect(() => { trackEvent("template_viewed", { templateId: id, title }); }, [id, title]);
  return null;
}
