// src/services/deeplinks.ts
import { Artifact } from "../types";

export function buildGmailLink(to: string, subject: string, body: string): string {
  return `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function buildCalendarLink(title: string, startTime: string, durationMinutes: number, details: string): string {
  try {
    const start = new Date(startTime);
    if (isNaN(start.getTime())) {
      throw new Error("Invalid start time");
    }
    const end = new Date(start.getTime() + durationMinutes * 60000);
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    return `https://calendar.google.com/calendar/r/eventedit?text=${encodeURIComponent(title)}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent(details)}`;
  } catch {
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&details=${encodeURIComponent(details)}`;
  }
}

export function buildWhatsAppLink(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function buildPaymentLink(label: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(label + " pay online")}`;
}

export function buildDeepLink(artifact: Artifact | undefined): string | null {
  if (!artifact) return null;
  switch (artifact.type) {
    case "email":
      return buildGmailLink(artifact.to || "", artifact.subject || "", artifact.body || "");
    case "calendar":
      return buildCalendarLink(artifact.title, artifact.start_time, artifact.duration_minutes || 60, artifact.details || "");
    case "action":
      if (artifact.action_type === "message") return buildWhatsAppLink(artifact.content);
      if (artifact.action_type === "payment") return buildPaymentLink(artifact.action_label);
      if (artifact.action_type === "search") return `https://www.google.com/search?q=${encodeURIComponent(artifact.content || artifact.action_label)}`;
      if (artifact.action_url) return artifact.action_url;
      // reminder (and anything else): no external link -> the card will copy the text instead
      return null;
    default:
      return null;
  }
}
