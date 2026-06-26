// src/services/scheduler.ts
import { Task } from "../types";

export function requestNotificationPermission() {
  if ("Notification" in window) {
    if (Notification.permission === "default") {
      Notification.requestPermission().catch((err) => {
        console.warn("Could not request notification permission:", err);
      });
    }
  }
}

export function deliverNotification(task: Task, onActionClick?: () => void) {
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      const notif = new Notification("⚡ ResQ Delivery Ready", {
        body: `Your scheduled action loop is ready to execute: "${task.title}"`,
        icon: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=192&h=192&fit=crop&q=80",
        requireInteraction: true,
      });

      notif.onclick = () => {
        window.focus();
        onActionClick?.();
        notif.close();
      };
    } catch (e) {
      console.warn("Standard notification failed, falling back to local action.", e);
    }
  }
}
