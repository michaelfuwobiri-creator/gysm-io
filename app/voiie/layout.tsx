import "./voiie.css";

// Scoped wrapper -- .voiie-root carries the dark/fuchsia design system
// (see voiie.css) without touching app/globals.css, which every other
// route in this app still uses as-is.
export default function VoiieLayout({ children }: { children: React.ReactNode }) {
  return <div className="voiie-root">{children}</div>;
}
