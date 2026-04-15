"use client";

import { useState } from "react";
import { TEE_API_URL } from "@/lib/near/config";

interface AddCriteriaModalProps {
  onAdd: (mainCriteria: string, subCriteria: string[]) => void;
  onClose: () => void;
}

export default function AddCriteriaModal({ onAdd, onClose }: AddCriteriaModalProps) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string[] | null>(null);

  async function handleStructurize() {
    if (input.length < 10) {
      setError("Please enter at least 10 characters.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${TEE_API_URL}/v1/structurize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ natural_language: input }),
      });
      if (!res.ok) throw new Error(`Error: ${res.status}`);
      const data = await res.json();
      setPreview(data.criteria);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to structurize");
    } finally {
      setLoading(false);
    }
  }

  function handleConfirm() {
    if (preview) {
      onAdd(input, preview);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-0/60 backdrop-blur-sm">
      <div className="w-full max-w-[560px] rounded-2xl border border-alpha-12 bg-gray-100 p-xl">
        <h2 className="text-lg font-medium text-gray-1000">Add Criteria</h2>
        <p className="mt-xs text-sm text-alpha-40">
          Describe your criteria in natural language. The LLM will generate specific evaluation items.
        </p>

        <textarea
          value={input}
          onChange={(e) => { setInput(e.target.value); setPreview(null); }}
          placeholder="e.g. Long-term holders with active governance participation..."
          rows={3}
          className="mt-lg w-full rounded-[10px] border border-alpha-12 bg-gray-150 px-md py-sm text-sm text-gray-1000 placeholder:text-alpha-20 focus:border-neon-glow/40 focus:outline-none"
        />

        {error && <p className="mt-sm text-sm text-status-refund">{error}</p>}

        {!preview ? (
          <button
            onClick={handleStructurize}
            disabled={loading || input.length < 10}
            className="mt-md w-full rounded-[10px] bg-neon-glow py-sm text-sm font-medium text-gray-0 hover:bg-neon-soft transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Generating..." : "Generate Sub-Criteria"}
          </button>
        ) : (
          <>
            <div className="mt-md rounded-[10px] border border-alpha-12 bg-gray-150 p-md">
              <p className="text-xs font-medium text-alpha-40 uppercase tracking-wider">Generated Sub-Criteria</p>
              <ul className="mt-sm space-y-xs">
                {preview.map((c, i) => (
                  <li key={i} className="flex items-start gap-xs text-sm text-gray-1000">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-neon-glow" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>

            <button
              onClick={handleConfirm}
              className="mt-md w-full rounded-[10px] bg-neon-glow py-sm text-sm font-medium text-gray-0 hover:bg-neon-soft transition-colors"
            >
              Add to Criteria
            </button>
          </>
        )}

        <button
          onClick={onClose}
          className="mt-sm w-full rounded-[10px] border border-alpha-12 py-sm text-sm font-medium text-alpha-60 hover:bg-alpha-8 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
