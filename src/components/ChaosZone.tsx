// src/components/ChaosZone.tsx
import React, { useState, useEffect } from "react";
import { Mic, MicOff, Sparkles, AlertCircle } from "lucide-react";

interface ChaosZoneProps {
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  onProcess: () => void;
  isProcessing: boolean;
  demoInputs: string[];
}

export default function ChaosZone({
  input,
  setInput,
  onProcess,
  isProcessing,
  demoInputs = [],
}: ChaosZoneProps) {
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);

  useEffect(() => {
    // Check Speech Recognition support
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      setSpeechSupported(true);
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onresult = (event: any) => {
        let interimTranscript = "";
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
          setInput((prev) => (prev ? prev + " " + finalTranscript : finalTranscript));
        }
      };

      rec.onerror = (e: any) => {
        console.error("Speech Recognition Error:", e);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      setRecognition(rec);
    }
  }, [setInput]);

  const toggleListening = () => {
    if (!recognition) return;
    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      try {
        recognition.start();
        setIsListening(true);
      } catch (err) {
        console.error("Failed to start speech recognition:", err);
      }
    }
  };

  return (
    <div className="w-full md:w-1/2 h-full flex flex-col border-b md:border-b-0 md:border-r border-zinc-850 p-4 md:p-6 relative z-10 bg-zinc-950/20 backdrop-blur-md">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="p-1.5 bg-[#6C63FF]/10 text-[#6C63FF] rounded-lg">
            <Sparkles className="w-4 h-4" />
          </span>
          <h2 className="text-xs font-mono text-zinc-400 uppercase tracking-widest font-semibold">
            Chaos Zone
          </h2>
        </div>
        {isListening && (
          <span className="flex items-center gap-1.5 text-xs text-red-400 font-mono animate-pulse">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            Listening...
          </span>
        )}
      </div>

      <div className="relative flex-1 flex flex-col min-h-[220px]">
        <textarea
          id="brain_dump_textarea"
          className="flex-1 w-full bg-zinc-900/40 border border-zinc-800/80 hover:border-zinc-700/60 rounded-xl p-4 text-zinc-200 font-mono text-sm resize-none focus:outline-none focus:border-[#6C63FF] focus:ring-1 focus:ring-[#6C63FF] transition-all min-h-[200px]"
          placeholder="Dump everything here — what's on your mind, what you missed, what needs to happen..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              onProcess();
            }
          }}
        />

        {speechSupported && (
          <button
            onClick={toggleListening}
            className={`absolute bottom-3 right-3 p-3 rounded-xl transition-all duration-150 ${
              isListening
                ? "bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30"
                : "bg-zinc-800/70 text-zinc-400 border border-zinc-700 hover:text-zinc-200 hover:border-zinc-600"
            }`}
            title={isListening ? "Stop voice input" : "Start voice input"}
          >
            {isListening ? <MicOff className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Demo input buttons */}
      {demoInputs.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-xs font-mono text-zinc-500">Or use a real-world scenario:</p>
          <div className="grid grid-cols-1 gap-2">
            {demoInputs.map((demo, i) => (
              <button
                key={i}
                onClick={() => setInput(demo)}
                className="text-left text-xs font-mono text-zinc-400 hover:text-zinc-200 bg-zinc-900/30 hover:bg-zinc-900/60 border border-zinc-800/60 hover:border-zinc-700 p-2.5 rounded-xl transition-all truncate"
                title={demo}
              >
                📝 <span className="text-zinc-500">Scenario {i + 1}:</span> {demo}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-3">
        <button
          onClick={onProcess}
          disabled={isProcessing || !input.trim()}
          className="flex-1 bg-[#6C63FF] hover:bg-[#5A52D5] active:bg-[#4A42C5] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3.5 px-4 rounded-xl transition-all duration-150 text-sm flex items-center justify-center gap-2 shadow-lg shadow-[#6C63FF]/10 hover:shadow-[#6C63FF]/20 cursor-pointer"
        >
          {isProcessing ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Ingesting Chaos...
            </span>
          ) : (
            <>Ingest & Process →</>
          )}
        </button>
      </div>

      <p className="text-[10px] font-mono text-zinc-600 text-center mt-2.5">
        Press <kbd className="px-1.5 py-0.5 bg-zinc-900 rounded border border-zinc-800 text-zinc-500">Ctrl + Enter</kbd> to execute
      </p>
    </div>
  );
}
