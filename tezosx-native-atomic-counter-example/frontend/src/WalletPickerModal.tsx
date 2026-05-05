import type { Eip6963ProviderDetail } from "./wallet/discoverEip6963";

type WalletPickerModalProps = {
  open: boolean;
  options: Eip6963ProviderDetail[];
  onSelect: (d: Eip6963ProviderDetail) => void;
  onClose: () => void;
};

export function WalletPickerModal({ open, options, onSelect, onClose }: WalletPickerModalProps) {
  if (!open) return null;

  return (
    <div className="tour-backdrop" onClick={onClose} role="presentation">
      <div
        className="tour-card sm wallet-picker-card"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-picker-title"
      >
        <div className="tour-head">
          <div className="tour-step-pill">
            <b id="wallet-picker-title">Choose a wallet</b>
          </div>
          <button type="button" className="tour-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="tour-body wallet-picker-body">
          <ul className="wallet-picker-list" role="list">
            {options.map((d, i) => (
              <li key={`${d.info.rdns}-${d.info.uuid}-${i}`} className="wallet-picker-item">
                <button
                  type="button"
                  className="wallet-picker-btn"
                  onClick={() => onSelect(d)}
                >
                  {d.info.icon ? (
                    <img src={d.info.icon} alt="" className="wallet-picker-icon" width={36} height={36} />
                  ) : (
                    <span className="wallet-picker-icon-fallback" aria-hidden />
                  )}
                  <span className="wallet-picker-name">{d.info.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="tour-foot">
          <button type="button" className="btn ghost sm" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
