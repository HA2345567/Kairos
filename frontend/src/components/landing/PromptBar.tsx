import { useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp } from "lucide-react";
import "./prompt-bar.css";

export interface PromptBarProps {
  placeholder?: string;
  onSend?: (text: string) => void;
}

export default function PromptBar({
  placeholder = "Ask Kairos to build a basket…",
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
      navigate(`/markets?q=${encodeURIComponent(query)}`);
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
      {/* Main Single-Capsule Prompt Input */}
      <div className="kairos-promptbar-container">

        {/* Input Field */}
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label="Prompt Input"
          className="kairos-promptbar-input"
        />

        {/* Trailing Actions */}
        <div className="kairos-promptbar-actions">
          {/* Keyboard Hint */}
          <span className="kairos-promptbar-kbd" title="Press Enter to submit">
            ↵
          </span>

          {/* Submit Button */}
          <button
            type="button"
            aria-label="Submit Prompt"
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
