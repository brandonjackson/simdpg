"use client";

import { useState } from "react";

export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.querySelector(
        `textarea[data-prompt-id]`,
      ) as HTMLTextAreaElement | null;
      if (textarea) {
        textarea.select();
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  }

  return (
    <div className="govuk-copy-container">
      <textarea readOnly value={text} rows={12} data-prompt-id="true" />
      <button
        type="button"
        className="govuk-copy-button"
        onClick={handleCopy}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
