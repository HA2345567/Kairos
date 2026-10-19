import { useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp } from "lucide-react";
import "./prompt-bar.css";

export interface PromptBarProps {
  placeholder?: string;
  onSend?: (text: string) => void;
}

export default function PromptBar({
  placeholder = "Describe a basket idea to build with Kairos agents...",
  onSend,
}: PromptBarProps) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const canSend = draft.trim().length > 0;

  const handleSend = () => {
    if (!canSend) return;
    const query = draft.trim();
    if (onSend) {
      onSend(query);
    } else {
      navigate(`/labs/create?idea=${encodeURIComponent(query)}`);
    }
    setDraft("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="kairos-promptbar-wrapper" data-promptbar>
      <div className="kairos-promptbar-container">
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label="Describe a basket idea"
          className="kairos-promptbar-input"
        />
        <div className="kairos-promptbar-actions">
          <span className="kairos-promptbar-kbd" title="Press Enter to submit">
            Enter
          </span>
          <button
            type="button"
            aria-label="Build basket from idea"
            disabled={!canSend}
            onClick={handleSend}
            className="kairos-promptbar-button"
          >
            <ArrowUp className="size-4 stroke-[2.5]" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
