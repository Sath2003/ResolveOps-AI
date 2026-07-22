"use client";

import { useState, useRef } from "react";
import { Send, Paperclip, Mic, Square } from "lucide-react";

export default function ChatComposer({
  onSend,
  disabled,
  imageFile,
  setImageFile,
  isRecording,
  onToggleRecording,
  voiceSending,
}) {
  const [input, setInput] = useState("");
  const textareaRef = useRef(null);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    if (file.type.startsWith("image/")) {
      reader.onloadend = () => setImageFile(reader.result);
      reader.readAsDataURL(file);
    } else {
      reader.onloadend = () =>
        setInput(
          (prev) =>
            prev +
            `\n\n--- FILE: ${file.name} ---\n${reader.result}\n---------------------\n`
        );
      reader.readAsText(file);
    }
    e.target.value = "";
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if ((input.trim() || imageFile) && !disabled) {
        onSend(input);
        setInput("");
      }
    }
  };

  const handleSubmit = () => {
    if ((input.trim() || imageFile) && !disabled) {
      onSend(input);
      setInput("");
    }
  };

  return (
    <div className="shrink-0 px-4 sm:px-6 py-4 border-t border-white/5 bg-[#080812]/80 backdrop-blur-md">
      <div className="max-w-4xl mx-auto space-y-2">
        {imageFile && (
          <div className="relative w-14 h-14 border border-indigo-500/50 rounded-xl overflow-hidden group bg-slate-900 flex items-center justify-center">
            <img src={imageFile} alt="Preview" className="object-cover w-full h-full" />
            <button
              onClick={() => setImageFile(null)}
              className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 flex items-center justify-center text-rose-400 text-[10px] font-bold transition-opacity cursor-pointer"
            >
              Remove
            </button>
          </div>
        )}

        <div className="relative flex items-center bg-[#0a0a12] border border-white/10 rounded-xl px-4 py-2.5 focus-within:border-indigo-500/50 transition-all duration-200 gap-3 shadow-inner">
          <label
            className="cursor-pointer text-slate-500 hover:text-slate-300 transition-colors shrink-0"
            title="Attach log or diagram"
            aria-label="Attach file"
          >
            <Paperclip size={17} />
            <input
              type="file"
              accept="image/*,.txt,.log,.json,.csv,.md"
              className="hidden"
              onChange={handleImageChange}
            />
          </label>

          <button
            onClick={onToggleRecording}
            disabled={voiceSending}
            className={`shrink-0 transition-colors ${
              isRecording ? "text-rose-400 animate-pulse" : "text-slate-500 hover:text-slate-300"
            }`}
            title="Voice input"
            aria-label={isRecording ? "Stop recording" : "Start voice input"}
          >
            {isRecording ? <Square size={17} /> : <Mic size={17} />}
          </button>

          <input
            ref={textareaRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              voiceSending
                ? "Transcribing voice..."
                : isRecording
                ? "Recording… press stop when done."
                : "Ask about incidents, AWS resources, EC2, Docker services, pipelines, costs and architecture..."
            }
            disabled={isRecording || voiceSending || disabled}
            aria-label="Chat input query"
            className="flex-1 bg-transparent text-white text-sm focus:outline-none placeholder-slate-600 py-1 min-w-0 font-sans"
          />

          <button
            onClick={handleSubmit}
            disabled={disabled || isRecording || voiceSending || (!input.trim() && !imageFile)}
            aria-label="Send message"
            className="shrink-0 w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all duration-200 shadow-md shadow-indigo-900/40 cursor-pointer"
          >
            <Send size={14} className="text-white" />
          </button>
        </div>

        <p className="text-[10px] text-slate-600 text-center">
          Secrets automatically redacted · Live evidence collected via MCP
        </p>
      </div>
    </div>
  );
}
