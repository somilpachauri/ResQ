// src/components/ActionZone.tsx
import React, { useState } from "react";
import { Inbox, Sparkles, HelpCircle } from "lucide-react";
import ExecuteCard from "./ExecuteCard";
import { Task, Artifact, Blocker } from "../types";

interface ActionZoneProps {
  tasks: Task[];
  artifacts: Artifact[];
  blockers: Blocker[];
  reasoningSteps: string[];
  isProcessing: boolean;
  hasProcessed?: boolean;
  onResolveBlocker: (taskId: string, answer: string) => void;
  onCompleteTask: (taskId: string) => void;
}

export default function ActionZone({
  tasks,
  artifacts,
  blockers = [],
  isProcessing = false,
  hasProcessed = false,
  onResolveBlocker,
  onCompleteTask,
}: ActionZoneProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const getArtifact = (taskId: string) => artifacts.find((a) => a.task_id === taskId);
  // Drop empty/garbage tasks: must have a real title.
  const validTasks = tasks.filter((t) => t.title && t.title.trim().length > 1);
  const immediate = validTasks.filter((t) => t.execution_mode === "immediate");
  const deferred = validTasks.filter((t) => t.execution_mode === "deferred");

  const submitBlocker = (taskId: string) => {
    const ans = answers[taskId]?.trim();
    if (ans) {
      onResolveBlocker(taskId, ans);
      setAnswers((p) => ({ ...p, [taskId]: "" }));
    }
  };

  const hasContent = validTasks.length > 0 || blockers.length > 0;

  return (
    <div className="w-full h-full flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 sticky top-0 bg-[#09090b]/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-2 text-zinc-300">
          <Inbox className="w-[18px] h-[18px] text-zinc-500" />
          <h2 className="text-[15px] font-medium">Your actions</h2>
        </div>
        {tasks.length > 0 && (
          <span className="text-[13px] text-[#a39dff]">
            {tasks.length} ready
          </span>
        )}
      </div>

      <div className="px-6 pb-8 flex flex-col gap-6">

        {/* Processing state */}
        {isProcessing && (
          <div className="flex items-center gap-3 text-sm text-zinc-400 py-4">
            <span className="w-4 h-4 border-2 border-[#6C63FF]/30 border-t-[#6C63FF] rounded-full animate-spin" />
            Reading your dump and drafting actions…
          </div>
        )}

        {/* Blockers — a gentle question, no alarm styling */}
        {blockers.map((b, i) => (
          <div key={i} className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-5">
            <div className="flex items-center gap-2 text-amber-300/90 mb-2">
              <HelpCircle className="w-4 h-4" />
              <span className="text-sm font-medium">One quick question</span>
            </div>
            <p className="text-[14px] text-zinc-300 leading-relaxed mb-3">{b.missing_info_prompt}</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Type your answer…"
                value={answers[b.task_id] || ""}
                onChange={(e) => setAnswers((p) => ({ ...p, [b.task_id]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && submitBlocker(b.task_id)}
                className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-400/40"
              />
              <button
                onClick={() => submitBlocker(b.task_id)}
                disabled={!(answers[b.task_id] || "").trim()}
                className="px-4 rounded-xl bg-amber-400/15 hover:bg-amber-400/25 text-amber-200 text-sm font-medium transition-colors disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
        ))}

        {/* Empty state — not processed yet */}
        {!hasContent && !isProcessing && !hasProcessed && (
          <div className="flex flex-col items-center justify-center text-center py-24">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/8 flex items-center justify-center mb-4">
              <Sparkles className="w-5 h-5 text-zinc-600" />
            </div>
            <p className="text-[15px] text-zinc-300 font-medium">Nothing here yet</p>
            <p className="text-[13px] text-zinc-600 mt-1.5 max-w-[260px] leading-relaxed">
              Type, speak, or snap a photo on the left, then hit Process. Ready-to-act cards appear here.
            </p>
          </div>
        )}

        {/* Processed but found nothing actionable */}
        {!hasContent && !isProcessing && hasProcessed && (
          <div className="flex flex-col items-center justify-center text-center py-24">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.03] border border-white/8 flex items-center justify-center mb-4">
              <HelpCircle className="w-5 h-5 text-zinc-600" />
            </div>
            <p className="text-[15px] text-zinc-300 font-medium">No clear actions found</p>
            <p className="text-[13px] text-zinc-600 mt-1.5 max-w-[280px] leading-relaxed">
              ResQ didn't find anything to do here. Try adding a bit of context, or a clearer photo of a bill, chat, or note.
            </p>
          </div>
        )}

        {/* Immediate */}
        {immediate.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[#6C63FF]" /><p className="text-[13px] text-zinc-400 font-medium">Do now</p></div>
            {immediate.map((task, i) => (
              <ExecuteCard key={task.id} task={task} artifact={getArtifact(task.id)} onComplete={onCompleteTask} index={i} />
            ))}
          </div>
        )}

        {/* Deferred */}
        {deferred.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-sky-400" /><p className="text-[13px] text-zinc-400 font-medium">Scheduled for later</p></div>
            {deferred.map((task, i) => (
              <ExecuteCard key={task.id} task={task} artifact={getArtifact(task.id)} onComplete={onCompleteTask} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
