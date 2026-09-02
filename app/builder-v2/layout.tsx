import type { ReactNode } from "react";

export default function BuilderV2Layout({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif" }}>
      {children}
    </div>
  );
}
