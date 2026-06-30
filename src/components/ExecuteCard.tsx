// src/components/ExecuteCard.tsx
import React, { useState } from "react";
import { motion } from "motion/react";
import {
  Mail, Calendar, MessageSquare, CreditCard, Bell, Clock,
  ExternalLink, Copy, Check, ChevronDown,
} from "lucide-react";
import { Task, Artifact } from "../types";
import { buildDeepLink } from "../services/deeplinks";

interface ExecuteCardProps {
  task: Task;
  artifact: Artifact | undefined;
  onComplete: (taskId: string) => void;
  index?: number;
}

const TYPE_META: Record<string, { Icon: any; action: string; label: string }> = {
  email:    { Icon: Mail,          action: "Open in Gmail",    label: "Email" },
  calendar: { Icon: Calendar,      action: "Add to Calendar",  label: "Calendar" },
  message:  { Icon: MessageSquare, action: "Send on WhatsApp", label: "Message" },
  payment:  { Icon: CreditCard,    action: "Pay now",          label: "Payment" },
  reminder: { Icon: Bell,          action: "Copy reminder",    label: "Reminder" },
  action:   { Icon: Bell,          action: "Open",             label: "Action" },
};

function accent(urgency: number) {
  if (urgency >= 8) return { dot: "bg-rose-400", ring: "shadow-[0_0_0_3px_rgba(251,113,133,0.08)]" };
  if (urgency >= 5) return { dot: "bg-amber-400", ring: "" };
  return { dot: "bg-emerald-400", ring: "" };
}

export default function ExecuteCard({ task, artifact, onComplete, index = 0 }: ExecuteCardProps) {
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const typeKey = (task.type as keyof typeof TYPE_META) || "action";
  const meta = TYPE_META[typeKey] || TYPE_META.action;
  const { Icon } = meta;
  const a = accent(task.urgency);
  const deepLink = buildDeepLink(artifact);
  const isDeferred = task.execution_mode === "deferred";

  let preview = "";
  if (artifact?.type === "email") preview = artifact.body;
  else if (artifact?.type === "calendar") preview = artifact.details;
  else if (artifact?.type === "action") preview = artifact.content;

  const handleExecute = () => {
    if (done) {
      // If it's already done, reset the visual state
      setDone(false);
      return;
    }

    if (deepLink) window.open(deepLink, "_blank");
    else if (preview) {
      navigator.clipboard?.writeText(preview);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
    setDone(true);
    onComplete?.(task.id);
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (preview) {
      navigator.clipboard?.writeText(preview);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.06, ease: [0.21, 0.47, 0.32, 0.98] }}
      className={`group rounded-2xl border bg-white/[0.025] p-5 transition-all duration-200
                  ${done ? "border-emerald-500/30 bg-emerald-500/[0.03]"
                         : "border-white/[0.07] hover:border-white/[0.16] hover:bg-white/[0.04]"} ${a.ring}`}
    >
      {/* Top row */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2 text-zinc-400">
          <div className="w-7 h-7 rounded-lg bg-white/[0.04] flex items-center justify-center">
            <Icon className="w-[15px] h-[15px]" />
          </div>
          <span className="text-[13px] font-medium text-zinc-300">{meta.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${a.dot}`} />
          <span className="text-[11px] text-zinc-500 tabular-nums">{task.urgency}/10</span>
        </div>
      </div>

      {/* Title + context */}
      <h3 className="text-[15px] font-semibold text-zinc-100 leading-snug tracking-[-0.01em]">{task.title}</h3>
      {task.context && (
        <p className="text-[13px] text-zinc-500 mt-1 leading-relaxed">{task.context}</p>
      )}

      {/* Scheduled time */}
      {isDeferred && task.scheduled_time && (
        <div className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-sky-300/90 bg-sky-400/[0.08] rounded-lg px-2.5 py-1.5">
          <Clock className="w-3.5 h-3.5" />
          {new Date(task.scheduled_time).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </div>
      )}

      {/* Collapsible preview */}
      {preview && (
        <div className="mt-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-[12px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
            {expanded ? "Hide draft" : "Preview draft"}
          </button>
          <motion.div
            initial={false}
            animate={{ height: expanded ? "auto" : 0, opacity: expanded ? 1 : 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="mt-2 text-[13px] text-zinc-400 leading-relaxed bg-black/25 rounded-xl p-3 whitespace-pre-wrap border border-white/[0.05]">
              {preview}
            </p>
          </motion.div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-4">
        <button
          onClick={handleExecute}
          className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-[13px] font-medium transition-all duration-150 active:scale-[0.98]
                     ${done
                        ? "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20"
                        : "bg-[#6C63FF] text-white hover:bg-[#5b52e8] shadow-lg shadow-[#6C63FF]/20"}`}
        >
          {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
          {done ? "Done · tap to redo" : meta.action}
          {!done && deepLink && <ExternalLink className="w-3.5 h-3.5 opacity-60" />}
        </button>
        {preview && (
          <button
            onClick={handleCopy}
            className={`shrink-0 rounded-xl px-3 border transition-all duration-150 active:scale-[0.98]
                       ${copied
                          ? "border-emerald-500/30 text-emerald-300 bg-emerald-500/10"
                          : "border-white/[0.08] text-zinc-400 hover:text-zinc-200 hover:border-white/20"}`}
            title="Copy"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
        )}
      </div>
    </motion.div>
  );
}
