import type { Metadata } from "next";
import LinearBuilderApp from "./LinearBuilder";

export const metadata: Metadata = {
  title: "Builder — GYSM.IO",
  description: "Describe an app, get a real one.",
  robots: { index: false, follow: false },
};

export default function BuilderV2Page() {
  return <LinearBuilderApp />;
}
