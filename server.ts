import express from "express";
import path from "path";
import fs from "fs/promises";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type, FunctionDeclaration } from "@google/genai";

dotenv.config();

let aiClient: GoogleGenAI | null = null;
function getAiClient() {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

const SYSTEM_INSTRUCTION = `You are ResQ, an autonomous loop-closing agent.
Your objective: take a chaotic input (typed text, voice, OR an image) and output ready-to-execute action artifacts.

CORE RULES:
1. NEVER write to-do lists or plain text summaries. Always use the tools.
2. ALWAYS call extract_and_prioritize first, then immediately call the right draft tool for EACH task in the same turn. Never stop to ask between tools.
3. If a task needs an email, write the COMPLETE email body, not a placeholder.
4. For deferred tasks (a future time is mentioned), set scheduled_time and still draft the full artifact now.
5.CRITICAL: For scheduled_time, ALWAYS calculate the exact future date based on the CURRENT SYSTEM TIME provided above and output a valid ISO 8601 string (e.g., "2026-06-29T14:00:00Z"). Never output vague words like "tomorrow".
CHOOSING THE RIGHT TASK TYPE (critical — do not default to "reminder"):
- "email": apologies, follow-ups, sending documents, professional replies. -> draft_email_artifact
- "calendar": ANY event, invite, meeting, party, deadline, "fun night", interview, appointment, RSVP. -> draft_calendar_artifact
- "message": casual notes to a person (WhatsApp/Slack/text), "tell X", "let Y know". -> draft_action_artifact with action_type "message"
- "payment": ONLY when money is genuinely owed — a bill, invoice, fee. -> draft_action_artifact with action_type "payment"
- "reminder": a personal to-do with no message/event/payment (e.g. "buy groceries", "form a team", "prepare slides"). -> draft_action_artifact with action_type "reminder"
NEVER use "payment" unless money is actually owed. NEVER collapse a rich input into one generic reminder.

READING IMAGES (handle ANY image robustly):
- When BOTH an image and text are given, the IMAGE is the primary source. The text is just extra context or a note — do NOT simply turn the user's text into an email. Read the image first.
- A BILL / INVOICE / RECEIPT -> a payment task. Put the biller and amount in the title if visible (e.g. "Pay electricity bill - ₹1,240"). Use action_type "payment".
- A CHAT SCREENSHOT (WhatsApp/Slack/SMS) -> figure out what it asks the user to do. If it is an event/invite, make a CALENDAR task. If it asks for a reply, make a MESSAGE task (action_type "message") with the reply drafted. Do NOT make it an email unless the chat is literally about email.
- An EVENT / INVITE / POSTER -> a calendar task to attend, PLUS reminder tasks for any prep mentioned.
- A STICKY NOTE / WHITEBOARD / HANDWRITTEN LIST -> one task per line.
- Extract 2-4 tasks when the image is rich. Use real names, amounts, and dates you can actually see.

IF AN IMAGE IS BLURRY OR UNREADABLE:
- Do NOT guess or produce an empty/vague reminder. Instead call flag_blocker with a clear question like "I couldn't read the bill clearly — what's the amount and biller?" so the user can clarify.

EVERY TASK MUST BE COMPLETE:
- Never produce a task with an empty or one-word title. Never produce an action artifact with empty content. If you cannot fill it meaningfully, use flag_blocker instead.

After all tools are called, output one line: "ResQ: [N] loops pre-built." Nothing else.`;

const extractAndPrioritize: FunctionDeclaration = {
  name: "extract_and_prioritize",
  description: "Parses chaotic brain-dump into structured atomic tasks. Assigns urgency score (1-10), task type, execution_mode (immediate/deferred), and scheduled_time if deferred.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      tasks: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            title: { type: Type.STRING },
            type: { type: Type.STRING, enum: ["email", "calendar", "payment", "reminder", "message"] },
            urgency: { type: Type.INTEGER },
            execution_mode: { type: Type.STRING, enum: ["immediate", "deferred"] },
            scheduled_time: { type: Type.STRING },
            people: { type: Type.ARRAY, items: { type: Type.STRING } },
            context: { type: Type.STRING }
          },
          required: ["id", "title", "type", "urgency", "execution_mode"]
        }
      }
    },
    required: ["tasks"]
  }
};

const draftEmailArtifact: FunctionDeclaration = {
  name: "draft_email_artifact",
  description: "Drafts complete email artifact for a task. Called for email-type tasks.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      task_id: { type: Type.STRING },
      to: { type: Type.STRING },
      subject: { type: Type.STRING },
      body: { type: Type.STRING }
    },
    required: ["task_id", "to", "subject", "body"]
  }
};

const draftCalendarArtifact: FunctionDeclaration = {
  name: "draft_calendar_artifact",
  description: "Drafts calendar event parameters for a task.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      task_id: { type: Type.STRING },
      title: { type: Type.STRING },
      start_time: { type: Type.STRING },
      duration_minutes: { type: Type.NUMBER },
      details: { type: Type.STRING }
    },
    required: ["task_id", "title", "start_time", "duration_minutes", "details"]
  }
};

const draftActionArtifact: FunctionDeclaration = {
  name: "draft_action_artifact",
  description: "Drafts a generic action artifact for payments, reminders, or messages.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      task_id: { type: Type.STRING },
      action_label: { type: Type.STRING },
      action_type: { type: Type.STRING, enum: ["payment", "reminder", "message", "search"] },
      content: { type: Type.STRING },
      action_url: { type: Type.STRING }
    },
    required: ["task_id", "action_label", "action_type", "content", "action_url"]
  }
};

const flagBlocker: FunctionDeclaration = {
  name: "flag_blocker",
  description: "Called ONLY when a high-priority task cannot be processed due to truly missing critical information.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      task_id: { type: Type.STRING },
      missing_info_prompt: { type: Type.STRING }
    },
    required: ["task_id", "missing_info_prompt"]
  }
};

function parseBrainDumpHeuristics(text: string) {
  // HONEST fallback only. No hardcoded names/scenarios.
  // Used ONLY if the Gemini API is unavailable. Does a generic
  // line-by-line extraction so it never invents unrelated tasks.
  const steps = ["extract_and_prioritize"];
  const tasks: any[] = [];
  const artifacts: any[] = [];
  const blockers: any[] = [];

  // Split into candidate task lines (by newline, ", also", " and ", ";")
  const chunks = text
    .split(/\n|,\s*also\s+|;\s*|\s+and\s+/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);

  chunks.forEach((chunk, i) => {
    const lower = chunk.toLowerCase();
    let type: string = "reminder";
    if (/\bemail\b|apolog|send .*(deck|doc|file|report)/.test(lower)) type = "email";
    else if (/\bpay\b|bill|invoice|recharge|due/.test(lower)) type = "payment";
    else if (/\bmessage\b|\btext\b|whatsapp|tell |let .* know|ping /.test(lower)) type = "message";
    else if (/\bmeet|\bcall\b|schedule|event|appointment|block|tomorrow|today|at \d/.test(lower)) type = "calendar";

    const id = `task-${i + 1}`;
    const title = chunk.charAt(0).toUpperCase() + chunk.slice(1);
    const isDeferred = /tomorrow|tonight|later|after|next|on \w+ \d|\d+\s*(am|pm)/i.test(lower);

    tasks.push({
      id,
      title,
      type,
      urgency: 5,
      execution_mode: isDeferred ? "deferred" : "immediate",
      scheduled_time: isDeferred ? new Date(Date.now() + 3600_000).toISOString() : null,
      context: "",
    });

    if (type === "email") {
      steps.push("draft_email_artifact");
      artifacts.push({ type: "email", task_id: id, to: "", subject: title, body: `${title}.` });
    } else if (type === "calendar") {
      steps.push("draft_calendar_artifact");
      artifacts.push({ type: "calendar", task_id: id, title, start_time: new Date(Date.now() + 3600_000).toISOString(), duration_minutes: 30, details: chunk });
    } else {
      steps.push("draft_action_artifact");
      const action_type = type === "payment" ? "payment" : type === "message" ? "message" : "reminder";
      artifacts.push({ type: "action", task_id: id, action_label: title, action_type, content: chunk });
    }
  });

  if (tasks.length === 0) {
    return { steps, tasks: [], artifacts: [], blockers: [], rawText: "" };
  }

  return { steps, tasks, artifacts, blockers, rawText: "" };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const DATA_FILE_PATH = path.join(process.cwd(), "tasks_store.txt");

  app.use(express.json({ limit: "12mb" })); // images are base64, need headroom


  // GET: Fetch the current persisted task text
  app.get("/api/tasks", async (req, res) => {
    try {
      let content = "";
      try {
        content = await fs.readFile(DATA_FILE_PATH, "utf-8");
      } catch (err: any) {
        if (err.code === "ENOENT") {
          // Default initial tasks text if no file exists
          content = [
            "// Welcome to your Task Workspace",
            "// Type your tasks here. Each line can represent a task.",
            "",
            "-[ ] Explore the minimalistic dual-column layout",
            "-[x] Build frontend with React & Tailwind CSS v4",
            "-[ ] Standardize Node.js backend integration",
            "-[ ] Add interactive action cards later",
            "-[ ] Celebrate beautiful typography and dark-theming",
          ].join("\n");
          await fs.writeFile(DATA_FILE_PATH, content, "utf-8");
        } else {
          throw err;
        }
      }
      res.json({ success: true, tasksText: content });
    } catch (error: any) {
      console.error("Error reading tasks:", error);
      res.status(500).json({ success: false, error: "Failed to read tasks" });
    }
  });

  // POST: Persist updated task text
  app.post("/api/tasks", async (req, res) => {
    try {
      const { tasksText } = req.body;
      if (typeof tasksText !== "string") {
        return res.status(400).json({ success: false, error: "Invalid text content" });
      }
      await fs.writeFile(DATA_FILE_PATH, tasksText, "utf-8");
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error saving tasks:", error);
      res.status(500).json({ success: false, error: "Failed to save tasks" });
    }
  });

  // POST: Gemini process-brain-dump intelligent proxy with agentic tools
  app.post("/api/process-brain-dump", async (req, res) => {
    try {
      const { text, image } = req.body;
      // Accept text, image, or both. At least one is required.
      if ((!text || typeof text !== "string") && !image) {
        return res.status(400).json({ error: "Text or image is required" });
      }

      try {
        const ai = getAiClient();

        // Build multimodal contents: image part (if present) + text part
        const parts: any[] = [];
        if (image && image.data && image.mimeType) {
          parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
        }
        const textPrompt = (text && text.trim())
          ? text
          : "Extract every actionable task from this image (messages, bills, invites, notes, screenshots). Identify what the user needs to DO and draft the artifacts.";
        parts.push({ text: textPrompt });

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: [{ role: "user", parts }],
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            tools: [{
              functionDeclarations: [
                extractAndPrioritize,
                draftEmailArtifact,
                draftCalendarArtifact,
                draftActionArtifact,
                flagBlocker
              ]
            }]
          }
        });

        const functionCalls = response.functionCalls;
        const result = {
          tasks: [] as any[],
          artifacts: [] as any[],
          blockers: [] as any[],
          steps: [] as string[],
          rawText: response.text || ""
        };

        if (functionCalls && functionCalls.length > 0) {
          functionCalls.forEach((call) => {
            result.steps.push(call.name);
            if (call.name === "extract_and_prioritize") {
              result.tasks = (call.args as any)?.tasks || [];
            } else if (call.name === "draft_email_artifact") {
              result.artifacts.push({ type: "email", ...call.args });
            } else if (call.name === "draft_calendar_artifact") {
              result.artifacts.push({ type: "calendar", ...call.args });
            } else if (call.name === "draft_action_artifact") {
              result.artifacts.push({ type: "action", ...call.args });
            } else if (call.name === "flag_blocker") {
              result.blockers.push(call.args);
            }
          });
        }

        res.json(result);
      } catch (geminiError: any) {
        console.warn("Gemini API error, falling back to local heuristic processing:", geminiError);
        const fallbackResult = parseBrainDumpHeuristics(text);
        res.json(fallbackResult);
      }
    } catch (err: any) {
      console.error("Endpoint failed:", err);
      res.status(500).json({ error: err.message || "Internal server error." });
    }
  });


  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Server] Running on http://localhost:${PORT}`);
  });
}

startServer();
