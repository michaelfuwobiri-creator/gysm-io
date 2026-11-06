// The GYSM sign: a "G" ring with the fuchsia node at its centre. At rest it
// is ink with a fuchsia node. While the agent works, the whole G turns
// fuchsia and turns, and the node pulses. `onFuchsia` draws it white for use
// on a fuchsia button. Styles live in builder.css.
export default function GysmMark({ size = 24, working = false, onFuchsia = false, title }: { size?: number; working?: boolean; onFuchsia?: boolean; title?: string }) {
  return (
    <svg
      className={`gm${working ? " working" : ""}${onFuchsia ? " on-fuchsia" : ""}`}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <g className="gm-spin" strokeWidth="3.6" strokeLinecap="round">
        <circle className="gm-ring" cx="16" cy="16" r="11" strokeDasharray="52 17.1" />
        <path className="gm-bar" d="M16 16h11" />
      </g>
      <circle className="gm-node" cx="16" cy="16" r="2.6" />
    </svg>
  );
}
