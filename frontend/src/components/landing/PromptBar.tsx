import "./prompt-bar.css";

export interface PromptBarProps {
  placeholder?: string;
}

export default function PromptBar({
  placeholder = "Coming soon — basket idea builder",
}: PromptBarProps) {
  return (
    <div className="kairos-promptbar-wrapper" data-promptbar>
      <div className="kairos-promptbar-container">
        <input
          type="text"
          disabled
          placeholder={placeholder}
          aria-label="Basket idea builder coming soon"
          className="kairos-promptbar-input"
        />
        <div className="kairos-promptbar-actions">
          <span className="kairos-promptbar-status" aria-label="Coming soon">
            Coming soon
          </span>
        </div>
      </div>
    </div>
  );
}
