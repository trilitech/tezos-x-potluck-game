export function shortAddr(addr: string | null): string {
  if (!addr || addr.length < 12) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

type PotState = "connect" | "wrong-net" | "idle" | "play" | "depositing" | "won";

export function PotButton(props: {
  state: PotState;
  label: string;
  sublabel: string | null;
  progress: number | null;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { state, label, sublabel, progress, onClick, disabled } = props;
  const r = 140;
  const c = 2 * Math.PI * r;
  const offset = progress != null ? c * (1 - progress) : c;

  return (
    <button
      type="button"
      className={`pot-btn pot-${state}`}
      onClick={onClick}
      disabled={disabled}
    >
      <svg className="pot-svg" viewBox="0 0 320 320" aria-hidden>
        <circle
          cx="160"
          cy="160"
          r={r}
          fill="none"
          stroke={state === "play" || state === "depositing" ? "var(--ring-base)" : "var(--green)"}
          strokeWidth="2.5"
          strokeOpacity={state === "play" || state === "depositing" ? 1 : 0.85}
        />
        {progress != null ? (
          <circle
            cx="160"
            cy="160"
            r={r}
            fill="none"
            stroke="var(--ring-active)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            transform="rotate(-90 160 160)"
            style={{
              transition: "stroke-dashoffset 1s linear",
              filter: "drop-shadow(0 0 14px rgba(179,159,251,0.55))",
            }}
          />
        ) : null}
        <circle
          cx="160"
          cy="160"
          r={r + 18}
          fill="none"
          stroke="var(--ring-pulse)"
          strokeWidth="1.5"
          className="pot-pulse"
        />
      </svg>
      <span className="pot-content">
        <span className="pot-label">{label}</span>
        {sublabel ? <span className="pot-sublabel">{sublabel}</span> : null}
      </span>
    </button>
  );
}

export function EventLogStrip(props: { entries: { id: number; msg: string }[] }) {
  const shown = props.entries.slice(-4);
  return (
    <div className="event-log-strip">
      {shown.length === 0 ? (
        <div className="el-empty">[EVENT LOG] waiting for activity…</div>
      ) : (
        shown.map((e, i) => {
          const ageFromBottom = shown.length - 1 - i;
          const cls = ageFromBottom === 0 ? "fresh" : ageFromBottom === 1 ? "recent" : "older";
          return (
            <div key={e.id} className={`el-line ${cls}`}>
              <span className="el-tag">[EVENT LOG]</span>
              <span className="el-msg">{e.msg}</span>
            </div>
          );
        })
      )}
    </div>
  );
}

export function PotFooter(props: {
  faucetUrl: string;
  dashboardUrl: string;
  docsUrl: string;
  gameExplorerUrl: string;
}) {
  const { faucetUrl, dashboardUrl, docsUrl, gameExplorerUrl } = props;
  return (
    <footer className="pl-footer">
      <div className="foot-left">
        <a href="https://twitter.com/tezos" target="_blank" rel="noopener noreferrer">
          Twitter
        </a>
        <a href="https://discord.gg/tezos" target="_blank" rel="noopener noreferrer">
          Discord
        </a>
      </div>
      <div className="foot-right">
        <a href={gameExplorerUrl} target="_blank" rel="noopener noreferrer">
          Tezlink (game)
        </a>
        <a href={docsUrl} target="_blank" rel="noopener noreferrer">
          Docs
        </a>
        <a href={dashboardUrl} target="_blank" rel="noopener noreferrer">
          Network information
        </a>
        <a href={faucetUrl} target="_blank" rel="noopener noreferrer">
          Faucet
        </a>
      </div>
    </footer>
  );
}

export function NetworkHelpPotz(props: { onAdd: () => void }) {
  return (
    <div className="net-help">
      You&apos;re not on the Tezos X network.{" "}
      <button type="button" className="link-btn inline" onClick={props.onAdd}>
        Add the Tezos X network
      </button>{" "}
      to your wallet to play.
    </div>
  );
}
