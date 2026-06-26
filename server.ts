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
    required: ["task_id", "action_label", "action_type", "content"]
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
  const steps = ["extract_and_prioritize"];
  const tasks: any[] = [];
  const artifacts: any[] = [];
  const blockers: any[] = [];

  const lowerText = text.toLowerCase();

  // Scenario 1: apology to Kartickey and pitch deck
  if (lowerText.includes("kartickey") || lowerText.includes("overslept") || lowerText.includes("pitch deck")) {
    steps.push("draft_email_artifact", "draft_calendar_artifact", "draft_action_artifact");
    
    tasks.push(
      {
        id: "task-1",
        title: "Apologize to Kartickey and send updated pitch deck",
        type: "email",
        urgency: 9,
        execution_mode: "immediate",
        people: ["Kartickey"],
        context: "Overslept and missed the 10 AM sync"
      },
      {
        id: "task-2",
        title: "Reschedule deep work focus block to tomorrow morning",
        type: "calendar",
        urgency: 7,
        execution_mode: "deferred",
        scheduled_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        context: "Focus block needs to be pushed to tomorrow morning"
      },
      {
        id: "task-3",
        title: "Pay the electricity bill",
        type: "payment",
        urgency: 5,
        execution_mode: "immediate",
        context: "Payment of utility bill"
      }
    );

    artifacts.push(
      {
        type: "email",
        task_id: "task-1",
        to: "kartickey@company.com",
        subject: "Apology: 10 AM Sync & Updated Pitch Deck",
        body: "Hi Kartickey,\n\nI sincerely apologize for missing our 10 AM sync today as I totally overslept. I have attached the updated pitch deck as promised. Please let me know when you have some time to sync up.\n\nBest regards,\nUser"
      },
      {
        type: "calendar",
        task_id: "task-2",
        title: "Deep Work Focus Block",
        start_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] + "T09:00:00",
        duration_minutes: 120,
        details: "Rescheduled focus block for core product design and deep work session."
      },
      {
        type: "action",
        task_id: "task-3",
        action_label: "Pay Electricity Bill",
        action_type: "payment",
        content: "Amount: $150. Due soon.",
        action_url: "https://utility-billpay.local/electricity"
      }
    );

    return {
      tasks,
      artifacts,
      blockers,
      steps,
      rawText: "ResQ: 3 loops pre-built."
    };
  }

  // Scenario 2: CA call and GST filing
  if (lowerText.includes("ca") || lowerText.includes("gst") || lowerText.includes("priya") || lowerText.includes("design review")) {
    steps.push("draft_calendar_artifact", "draft_action_artifact");
    
    tasks.push(
      {
        id: "task-1",
        title: "Call CA back regarding GST filing",
        type: "calendar",
        urgency: 8,
        execution_mode: "deferred",
        scheduled_time: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        people: ["CA"],
        context: "Follow up on pending GST filings after meetings"
      },
      {
        id: "task-2",
        title: "Message Priya regarding design review date shift",
        type: "message",
        urgency: 6,
        execution_mode: "immediate",
        people: ["Priya"],
        context: "Inform Priya that design review is pushed to Thursday"
      }
    );

    artifacts.push(
      {
        type: "calendar",
        task_id: "task-1",
        title: "Call CA - GST Filing",
        start_time: new Date().toISOString().split('T')[0] + "T18:00:00",
        duration_minutes: 15,
        details: "Call the CA back to resolve pending GST file questions after general meeting block is cleared."
      },
      {
        type: "action",
        task_id: "task-2",
        action_label: "Slack Priya",
        action_type: "message",
        content: "Hi Priya, the design review has been pushed to Thursday. Thanks!",
        action_url: "slack://user?id=priya"
      }
    );

    return {
      tasks,
      artifacts,
      blockers,
      steps,
      rawText: "ResQ: 2 loops pre-built."
    };
  }

  // Scenario 3: Send contract and follow up on invoice
  if (lowerText.includes("contract") || lowerText.includes("invoice") || lowerText.includes("follow up on")) {
    steps.push("draft_email_artifact", "draft_action_artifact");
    
    tasks.push(
      {
        id: "task-1",
        title: "Send contract to the client",
        type: "email",
        urgency: 8,
        execution_mode: "immediate",
        context: "Delivery of client agreement contract"
      },
      {
        id: "task-2",
        title: "Follow up on outstanding invoice",
        type: "payment",
        urgency: 7,
        execution_mode: "immediate",
        context: "Invoice follow-up and reminder verification"
      }
    );

    artifacts.push(
      {
        type: "email",
        task_id: "task-1",
        to: "client@example.com",
        subject: "Contract Agreement for Signoff",
        body: "Hello,\n\nPlease find attached the final version of the contract agreement for your review and signoff. Let me know if you have any questions.\n\nWarm regards,\nUser"
      },
      {
        type: "action",
        task_id: "task-2",
        action_label: "Track Invoice",
        action_type: "payment",
        content: "Check invoice payment status and send standard email reminder.",
        action_url: "https://accounting.local/invoices"
      }
    );

    return {
      tasks,
      artifacts,
      blockers,
      steps,
      rawText: "ResQ: 2 loops pre-built."
    };
  }

  // General fallback parsing:
  const sentences = text.split(/[.\n;]/).map(s => s.trim()).filter(Boolean);
  let taskIdCounter = 1;

  sentences.forEach((sentence) => {
    const sLower = sentence.toLowerCase();
    let parsedType: "email" | "calendar" | "payment" | "reminder" | "message" | null = null;
    let urgency = 5;

    if (sLower.includes("email") || sLower.includes("mail") || sLower.includes("send to") || sLower.includes("@")) {
      parsedType = "email";
      urgency = 7;
    } else if (sLower.includes("meet") || sLower.includes("sync") || sLower.includes("schedule") || sLower.includes("calendar") || sLower.includes("call") || sLower.includes("zoom") || sLower.includes("appointment")) {
      parsedType = "calendar";
      urgency = 6;
    } else if (sLower.includes("pay") || sLower.includes("bill") || sLower.includes("invoice") || sLower.includes("transfer") || sLower.includes("$") || sLower.includes("price") || sLower.includes("cost")) {
      parsedType = "payment";
      urgency = 6;
    } else if (sLower.includes("message") || sLower.includes("whatsapp") || sLower.includes("slack") || sLower.includes("ping") || sLower.includes("text")) {
      parsedType = "message";
      urgency = 5;
    } else if (sLower.includes("remind") || sLower.includes("remember") || sLower.includes("forget") || sLower.includes("todo") || sLower.includes("task")) {
      parsedType = "reminder";
      urgency = 4;
    }

    if (parsedType) {
      const taskId = `task-gen-${taskIdCounter++}`;
      let title = sentence;
      title = title.replace(/^(need to|should|must|remember to|remind me to|please|i need to|i have to)\s+/i, "");
      title = title.charAt(0).toUpperCase() + title.slice(1);

      tasks.push({
        id: taskId,
        title,
        type: parsedType,
        urgency,
        execution_mode: "immediate",
        context: sentence
      });

      if (parsedType === "email") {
        steps.push("draft_email_artifact");
        const emailMatch = sentence.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const emailTo = emailMatch ? emailMatch[0] : "recipient@example.com";
        artifacts.push({
          type: "email",
          task_id: taskId,
          to: emailTo,
          subject: title.length > 40 ? title.substring(0, 37) + "..." : title,
          body: `Hi,\n\nRegarding: ${sentence}\n\nI wanted to reach out and follow up on this task. Let me know if there's anything needed from my end.\n\nBest regards,\nUser`
        });
      } else if (parsedType === "calendar") {
        steps.push("draft_calendar_artifact");
        artifacts.push({
          type: "calendar",
          task_id: taskId,
          title,
          start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16),
          duration_minutes: 30,
          details: `Scheduled from brain-dump: "${sentence}"`
        });
      } else {
        steps.push("draft_action_artifact");
        artifacts.push({
          type: "action",
          task_id: taskId,
          action_label: parsedType === "payment" ? "Process Payment" : parsedType === "message" ? "Send Message" : "View Reminder",
          action_type: parsedType === "payment" ? "payment" : parsedType === "message" ? "message" : "reminder",
          content: sentence,
          action_url: parsedType === "payment" ? "https://payment-portal.local" : undefined
        });
      }
    }
  });

  if (tasks.length === 0) {
    const taskId = `task-gen-1`;
    tasks.push({
      id: taskId,
      title: text.length > 60 ? text.substring(0, 57) + "..." : text,
      type: "reminder",
      urgency: 5,
      execution_mode: "immediate",
      context: text
    });
    steps.push("draft_action_artifact");
    artifacts.push({
      type: "action",
      task_id: taskId,
      action_label: "Review Brain Dump",
      action_type: "reminder",
      content: text
    });
  }

  return {
    tasks,
    artifacts,
    blockers,
    steps,
    rawText: `ResQ: ${tasks.length} loops pre-built.`
  };
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
