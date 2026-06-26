// src/App.tsx
import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, Loader2, X, ExternalLink, Zap, Mic, MicOff, Paperclip, Camera, Image as ImageIcon } from "lucide-react";
import ActionZone from "./components/ActionZone";
import { processBrainDump, fileToImagePayload, ImagePayload } from "./services/gemini";
import { Task, Artifact, Blocker } from "./types";
import { requestNotificationPermission, deliverNotification } from "./services/scheduler";
import { buildDeepLink } from "./services/deeplinks";

function useVoiceInput(onAppend: (finalChunk: string) => void) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const lastIndexRef = useRef(0);

  const toggle = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input isn't supported here. Use Chrome on desktop or Android.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false; // only final results -> no lag, no re-render storm
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;
    lastIndexRef.current = 0;

    recognition.onresult = (e: any) => {
      // Only append NEW finalized results, never rebuild the whole string
      let chunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          chunk += e.results[i][0].transcript;
        }
      }
      if (chunk.trim()) onAppend(chunk.trim() + " ");
    };

    recognition.onerror = (ev: any) => {
      if (ev.error !== "no-speech" && ev.error !== "aborted") {
        console.error("Speech error:", ev.error);
      }
    };

    // Auto-restart so it doesn't silently die mid-sentence
    recognition.onend = () => {
      if (recognitionRef.current === recognition && listeningRef.current) {
        try { recognition.start(); } catch {}
      } else {
        setListening(false);
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
    listeningRef.current = true;
    setListening(true);
  };

  // keep a ref mirror of listening for the onend closure
  const listeningRef = useRef(false);
  useEffect(() => { listeningRef.current = listening; }, [listening]);

  return { listening, toggle };
}

const DEMO_INPUTS = [
  "I overslept and missed my 10 AM sync with Kartickey. Need to apologize and send the updated pitch deck. Also push my deep work block to tomorrow morning, and remind me to pay the electricity bill.",
  "Need to call my CA back about the GST filing but I'm in meetings until 6pm. Also message Priya that the design review is pushed to Thursday.",
  "Send the contract to the client and follow up on the invoice.",
];

export default function App() {
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [blockers, setBlockers] = useState<Blocker[]>([]);
  const [reasoningSteps, setReasoningSteps] = useState<string[]>([]);
  const [activeNotification, setActiveNotification] = useState<Task | null>(null);
  const [hasProcessed, setHasProcessed] = useState(false);
  const [image, setImage] = useState<ImagePayload | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const { listening, toggle } = useVoiceInput((chunk) => setInput((prev) => prev + chunk));

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Background clock — fire scheduled deliveries while app is open
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTasks((prev) => {
        let changed = false;
        const next = prev.map((t) => {
          if (t.execution_mode === "deferred" && t.scheduled_time && !t.completed &&
              new Date(t.scheduled_time).getTime() <= now) {
            deliverNotification(t, () => triggerNotification(t));
            setActiveNotification(t);
            changed = true;
            return { ...t, execution_mode: "immediate" as const };
          }
          return t;
        });
        return changed ? next : prev;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [artifacts]);

  const triggerNotification = (task: Task) => {
    setActiveNotification(null);
    const link = buildDeepLink(artifacts.find((a) => a.task_id === task.id));
    if (link) window.open(link, "_blank");
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const payload = await fileToImagePayload(file);
      setImage(payload);
      setImagePreview(URL.createObjectURL(file));
    } catch (err) {
      console.error("Image read failed:", err);
    }
    e.target.value = "";
  };

  const clearImage = () => {
    setImage(null);
    setImagePreview(null);
  };

  const handleProcess = async () => {
    if ((!input.trim() && !image) || isProcessing) return;
    setIsProcessing(true);
    setTasks([]); setArtifacts([]); setBlockers([]); setReasoningSteps([]);
    try {
      const result = await processBrainDump(input, (s) => setReasoningSteps((p) => [...p, s]), image);
      setTasks(result.tasks || []);
      setArtifacts(result.artifacts || []);
      setBlockers(result.blockers || []);
      setHasProcessed(true);
    } catch (e) {
      console.error("Process failed:", e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResolveBlocker = async (taskId: string, answer: string) => {
    const updated = `${input}\n\n(${taskId}: ${answer})`;
    setInput(updated);
    setBlockers((prev) => prev.filter((b) => b.task_id !== taskId));
    setIsProcessing(true);
    try {
      const result = await processBrainDump(updated, (s) => setReasoningSteps((p) => [...p, s]));
      setTasks(result.tasks || []);
      setArtifacts(result.artifacts || []);
      setBlockers(result.blockers || []);
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCompleteTask = (taskId: string) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, completed: true } : t)));
  };

  return (
    <div className="h-screen w-screen bg-[#09090b] text-zinc-200 flex flex-col font-sans antialiased overflow-hidden">
      {/* Header — clean, real, no fake labels */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#6C63FF] flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" fill="white" />
          </div>
          <div>
            <h1 className="text-[15px] font-semibold text-white leading-none">ResQ</h1>
            <p className="text-[11px] text-zinc-500 mt-1">Turn the mess into one-tap actions</p>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

        {/* Left — input */}
        <section className="w-full md:w-1/2 h-1/2 md:h-full flex flex-col border-b md:border-b-0 md:border-r border-white/5">
          <div className="flex-1 flex flex-col px-6 pt-5 overflow-hidden">
            <label className="text-[15px] font-medium text-zinc-300 mb-1">What's on your mind?</label>
            <p className="text-[12px] text-zinc-600 mb-3">Type it, say it, or snap a photo of the chaos — a bill, a chat, a sticky note.</p>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && handleProcess()}
              placeholder={image ? "Add a note about the photo (optional)…" : "Dump it all here — what you missed, who to message, what's due. Don't worry about structure."}
              className="flex-1 w-full bg-transparent text-[15px] text-zinc-200 leading-relaxed placeholder:text-zinc-600 resize-none focus:outline-none min-h-[80px]"
              spellCheck={false}
            />

            {/* Compact image chip — sits ABOVE the composer, never hides text */}
            {imagePreview && (
              <div className="mt-2 inline-flex items-center gap-2.5 w-fit bg-white/[0.04] border border-white/[0.08] rounded-xl pl-2 pr-3 py-2">
                <img src={imagePreview} alt="attached" className="w-9 h-9 rounded-lg border border-white/10 object-cover shrink-0" />
                <span className="text-[12px] text-zinc-400">Image attached</span>
                <button
                  onClick={clearImage}
                  className="w-5 h-5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          {/* Hidden file inputs */}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleImageSelect} className="hidden" />

          <div className="px-6 py-4 border-t border-white/5 flex flex-col gap-3">
            {/* Example chips */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[12px] text-zinc-600">Try:</span>
              {DEMO_INPUTS.map((d, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(d); clearImage(); }}
                  className="text-[12px] text-zinc-400 hover:text-zinc-200 border border-white/8 hover:border-white/20 rounded-lg px-2.5 py-1 transition-colors"
                >
                  Example {i + 1}
                </button>
              ))}
            </div>

            {/* Unified composer action bar — all inputs equal weight */}
            <div className="flex items-center gap-1.5 bg-white/[0.03] border border-white/[0.08] rounded-2xl p-2 focus-within:border-white/20 transition-colors">
              {/* Attach (upload) */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="group inline-flex items-center gap-1.5 h-10 px-3 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors"
              >
                <Paperclip className="w-[17px] h-[17px]" />
                <span className="text-[13px] hidden sm:inline">Upload</span>
              </button>

              {/* Camera */}
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="group inline-flex items-center gap-1.5 h-10 px-3 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors"
              >
                <Camera className="w-[17px] h-[17px]" />
                <span className="text-[13px] hidden sm:inline">Photo</span>
              </button>

              {/* Voice */}
              <button
                onClick={() => toggle()}
                className={`group inline-flex items-center gap-1.5 h-10 px-3 rounded-xl transition-colors ${
                  listening
                    ? "bg-rose-500/15 text-rose-300"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06]"
                }`}
              >
                {listening ? <MicOff className="w-[17px] h-[17px]" /> : <Mic className="w-[17px] h-[17px]" />}
                <span className="text-[13px] hidden sm:inline">{listening ? "Stop" : "Speak"}</span>
              </button>

              <div className="flex-1" />

              {/* Process */}
              <button
                onClick={handleProcess}
                disabled={isProcessing || (!input.trim() && !image)}
                className="inline-flex items-center gap-2 bg-[#6C63FF] hover:bg-[#5b52e8] text-white text-[13px] font-medium rounded-xl px-5 h-10 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-[#6C63FF]/20 disabled:shadow-none"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isProcessing ? "Working…" : "Process"}
              </button>
            </div>

            {listening && (
              <p className="text-[12px] text-rose-300/80 text-center">Listening — speak now</p>
            )}
          </div>
        </section>

        {/* Right — actions */}
        <section className="w-full md:w-1/2 h-1/2 md:h-full">
          <ActionZone
            tasks={tasks}
            artifacts={artifacts}
            blockers={blockers}
            reasoningSteps={reasoningSteps}
            isProcessing={isProcessing}
            hasProcessed={hasProcessed}
            onResolveBlocker={handleResolveBlocker}
            onCompleteTask={handleCompleteTask}
          />
        </section>
      </div>

      {/* Scheduled delivery toast */}
      <AnimatePresence>
        {activeNotification && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 left-6 md:left-auto md:w-[360px] bg-zinc-900 border border-[#6C63FF]/30 rounded-2xl p-4 shadow-2xl z-50"
          >
            <div className="flex items-start justify-between mb-2">
              <span className="text-[13px] font-medium text-[#a39dff]">Reminder ready</span>
              <button onClick={() => setActiveNotification(null)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-zinc-200 mb-3">{activeNotification.title}</p>
            <button
              onClick={() => triggerNotification(activeNotification)}
              className="w-full inline-flex items-center justify-center gap-2 bg-[#6C63FF] hover:bg-[#5b52e8] text-white text-sm font-medium rounded-xl py-2.5 transition-colors"
            >
              <ExternalLink className="w-4 h-4" /> Open it now
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
