# ResQ — Complete Build Specification
**Hackathon:** Vibe2Ship (Coding Ninjas × Google for Developers)
**Track:** The Last-Minute Life Saver
**Builder:** Solo · **Window:** 23 Jun → 29 Jun · **Submission:** App link + GitHub repo + Google Doc via BlockseBlock
**Stack:** React PWA → Google Cloud Run · Gemini API · Web Push API · Service Workers

---

## 0. What Is ResQ?

> **ResQ turns a chaotic brain-dump into pre-built, one-tap executable actions — and delivers them exactly when you need them.**

Every other productivity app tells you what to do.
ResQ has already done it. The only question is when you tap.

### The Two Problems ResQ Solves

```
PROBLEM 1 — The Execution Gap (Immediate Tasks)
"I need to apologize to Kartickey and send the deck"
→ Other apps: "Reminder set: Email Kartickey"
→ ResQ: Opens Gmail pre-filled. Subject written. Body written. You just tap Send.

PROBLEM 2 — The Procrastination Loop (Deferred Tasks)
"Remind me to pay electricity bill after 8pm"
→ Other apps: Notification fires → user swipes → forgets → bill unpaid
→ ResQ: Notification fires WITH pre-built payment action inside it
         Tap notification → payment link pre-loaded → one tap → done
         The reminder IS the execution environment.
```

---

## 1. Rubric Alignment

| Criterion | Weight | How ResQ Earns It |
|---|---|---|
| Problem Solving & Impact | 20% | Eliminates execution gap + procrastination loop. Before/After demo is visceral. |
| Agentic Depth | 20% | Multi-step Gemini function-calling chain. Model selects tools autonomously. Reasoning visible in UI. |
| Innovation & Creativity | 20% | Output = executable artifacts + scheduled delivery. Notification IS the action. No other app does this. |
| Usage of Google Technologies | 15% | Gemini API + Cloud Run + Cloud Build + Artifact Registry. All Google. |
| Product Experience & Design | 10% | Two-zone Command Center. Urgency-coded cards. Animated populate reveal. |
| Technical Implementation | 10% | Clean tool architecture. Service Worker. IndexedDB persistence. Edge case handling. |
| Completeness & Usability | 5% | Live public URL. Example inputs. No dead ends. |

**60% of the rubric is captured by the agent loop + executable artifact + scheduled delivery combination.**

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    USER DEVICE                          │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │              ResQ PWA (React)                   │   │
│  │                                                 │   │
│  │  LEFT PANEL          RIGHT PANEL                │   │
│  │  ┌────────────┐      ┌─────────────────────┐   │   │
│  │  │ Chaos Zone │  →   │   Action Zone        │   │   │
│  │  │ Brain dump │      │   Execute Cards      │   │   │
│  │  │ text/voice │      │   Scheduled Cards    │   │   │
│  │  └────────────┘      └─────────────────────┘   │   │
│  │                                                 │   │
│  │  Service Worker (background push handling)      │   │
│  │  IndexedDB (scheduled task persistence)         │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
           │                          │
           │ Gemini API calls         │ Web Push
           ▼                          ▼
┌──────────────────┐      ┌──────────────────────────┐
│   Gemini API     │      │  Google Cloud Run        │
│   (AI Studio)    │      │  Node/Express Backend    │
│                  │      │  - Push subscription     │
│  Function chain: │      │    storage (in-memory    │
│  extract         │      │    or Cloud Storage)     │
│  prioritize      │      │  - Notification          │
│  draft           │      │    scheduler (cron)      │
│  deeplink        │      │  - web-push sender       │
│  flag_blocker    │      └──────────────────────────┘
└──────────────────┘
```

---

## 3. The Agent Loop (Core of Agentic Depth Score)

### 3.1 Tool Definitions (5 Functions)

The model selects and chains these autonomously. This is not one-shot JSON parsing. Each is a real function declaration.

```json
[
  {
    "name": "extract_and_prioritize",
    "description": "Parses chaotic brain-dump into structured atomic tasks. Assigns urgency score (1-10), task type, execution_mode (immediate/deferred), and scheduled_time if deferred.",
    "parameters": {
      "tasks": [
        {
          "id": "string",
          "title": "string",
          "type": "email | calendar | payment | reminder | message",
          "urgency": "number (1-10)",
          "execution_mode": "immediate | deferred",
          "scheduled_time": "ISO 8601 string if deferred, null if immediate",
          "people": ["string"],
          "context": "string"
        }
      ]
    }
  },
  {
    "name": "draft_email_artifact",
    "description": "Drafts complete email artifact for a task. Called for email-type tasks.",
    "parameters": {
      "task_id": "string",
      "to": "string (recipient name or email)",
      "subject": "string",
      "body": "string (full email body, professional tone)"
    }
  },
  {
    "name": "draft_calendar_artifact",
    "description": "Drafts calendar event parameters for a task.",
    "parameters": {
      "task_id": "string",
      "title": "string",
      "start_time": "ISO 8601 or natural language like 'tomorrow 9am'",
      "duration_minutes": "number",
      "details": "string"
    }
  },
  {
    "name": "draft_action_artifact",
    "description": "Drafts a generic action artifact for payments, reminders, or messages. Generates the best available action URL or copyable content.",
    "parameters": {
      "task_id": "string",
      "action_label": "string (e.g. 'Pay Electricity Bill')",
      "action_type": "payment | reminder | message | search",
      "content": "string (message body or search query)",
      "action_url": "string (best available URL, or null)"
    }
  },
  {
    "name": "flag_blocker",
    "description": "Called ONLY when a high-priority task cannot be processed due to missing critical information. Asks one specific clarifying question.",
    "parameters": {
      "task_id": "string",
      "missing_info_prompt": "string (single specific question)"
    }
  }
]
```

### 3.2 Agent Chain Flow

```
User brain-dump submitted
        │
        ▼
[1] extract_and_prioritize()
    → Returns: list of tasks with type, urgency, execution_mode
        │
        ▼
[2] For each task (model decides which tool):
    ├── email task     → draft_email_artifact()
    ├── calendar task  → draft_calendar_artifact()
    ├── payment/other  → draft_action_artifact()
    └── missing info   → flag_blocker()
        │
        ▼
[3] Frontend receives all function call results
    → Builds deep links from artifacts
    → Renders Execute Cards (immediate) or Scheduled Cards (deferred)
```

### 3.3 System Instruction (paste into AI Studio / API call)

```
You are ResQ, an autonomous loop-closing agent.
Your objective: ingest a chaotic brain-dump → output ready-to-execute action artifacts.

Rules:
1. NEVER write to-do lists or plain text summaries.
2. ALWAYS call extract_and_prioritize first. Then immediately call the appropriate draft tool for EACH task without waiting for user input.
3. For deferred tasks (scheduled_time is set), still draft the full artifact now. It will be delivered later.
4. If a task requires an email, produce the complete email body — not a placeholder.
5. Chain all tool calls in one turn. Do not stop and ask the user between tools.
6. Only call flag_blocker if critical information (like a recipient's email) is truly missing and cannot be inferred.
7. After all tools are called, output a single line: "ResQ: [N] loops pre-built." Nothing else.
```

---

## 4. Deep Link Generation (Execution Layer)

### Email → Gmail Compose URL
```javascript
function buildGmailLink(to, subject, body) {
  const base = 'https://mail.google.com/mail/?view=cm';
  return `${base}&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
```

### Calendar → Google Calendar URL
```javascript
function buildCalendarLink(title, startISO, durationMinutes, details) {
  const start = startISO.replace(/[-:]/g, '').split('.')[0] + 'Z';
  const endDate = new Date(new Date(startISO).getTime() + durationMinutes * 60000);
  const end = endDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${start}/${end}&details=${encodeURIComponent(details)}`;
}
```

### WhatsApp Message Link
```javascript
function buildWhatsAppLink(message) {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
```

### Payment / Generic
```javascript
// Use BBPS for Indian bill payments
function buildPaymentLink(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query + ' pay online')}`;
}
```

---

## 5. The Scheduled Delivery System (Anti-Procrastination Layer)

This is the key innovation over all other reminder apps.

### How It Works

```
STEP 1: User says "remind me to pay bill after 8pm"
STEP 2: extract_and_prioritize returns execution_mode: "deferred", scheduled_time: "today 20:00"
STEP 3: draft_action_artifact runs NOW — full artifact pre-built
STEP 4: Frontend stores artifact in IndexedDB with timestamp
STEP 5: Frontend registers Service Worker alarm for 8:00 PM
STEP 6: At 8:00 PM — Service Worker fires
STEP 7: Push notification shows:
         Title: "⚡ ResQ — Action Ready"
         Body:  "Electricity bill pre-filled. One tap."
         Actions: [PAY NOW] [Later]
STEP 8: User taps [PAY NOW]
STEP 9: PWA opens directly to pre-loaded payment card
STEP 10: One tap executes → loop closed ✅
```

### Escalation Logic (Anti-Procrastination)
```javascript
// If user taps "Later" or ignores:
const escalationSchedule = [
  { delay: 0,    message: "Action ready. One tap needed." },
  { delay: 1800, message: "Still pending. Pre-filled and waiting." }, // +30min
  { delay: 3600, message: "Last reminder. Everything's ready." }      // +1hr
];
// After 3rd escalation: card stays persistent in app. Never silently disappears.
```

### Service Worker Push Handler
```javascript
// service-worker.js
self.addEventListener('push', event => {
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/badge.png',
      actions: [
        { action: 'execute', title: '⚡ Do It Now' },
        { action: 'later',   title: 'Later' }
      ],
      data: { taskId: data.taskId, artifactUrl: data.artifactUrl },
      requireInteraction: true  // Does NOT auto-dismiss
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'execute') {
    event.waitUntil(
      clients.openWindow(`/?task=${event.notification.data.taskId}&autoexecute=true`)
    );
  }
});
```

---

## 6. Frontend — Complete UI Spec

### 6.1 Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  ResQ                                          [Install App] ⚡  │
├──────────────────────────┬──────────────────────────────────────┤
│                          │                                      │
│   CHAOS ZONE             │   ACTION ZONE                        │
│                          │                                      │
│   ┌──────────────────┐   │   ┌─────────────────────────────┐   │
│   │                  │   │   │ 🔴 URGENT · Email            │   │
│   │  What's on your  │   │   │ Apologize to Kartickey      │   │
│   │  mind?           │   │   │ "Hi Kartickey, I'm sorry..." │   │
│   │                  │   │   │ [✉️ Open in Gmail]  [Edit]   │   │
│   │                  │   │   └─────────────────────────────┘   │
│   └──────────────────┘   │                                      │
│                          │   ┌─────────────────────────────┐   │
│   [🎙 Voice] [Process →] │   │ 🟡 TODAY · Calendar          │   │
│                          │   │ Deep Work Block · 9AM 2hrs  │   │
│   ── Try these ──        │   │ [📅 Add to Calendar] [Edit]  │   │
│   [Demo 1] [Demo 2]      │   └─────────────────────────────┘   │
│   [Demo 3]               │                                      │
│                          │   ┌─────────────────────────────┐   │
│                          │   │ ⏰ TONIGHT 8PM · Scheduled   │   │
│                          │   │ Electricity Bill Payment     │   │
│                          │   │ Delivers at 8:00 PM          │   │
│                          │   │ [🔔 Scheduled] [Edit Time]   │   │
│                          │   └─────────────────────────────┘   │
│                          │                                      │
│                          │   ── 7 loops closed today ──        │
└──────────────────────────┴──────────────────────────────────────┘
```

### 6.2 Card Types

**Execute Card (Immediate)**
```
┌─────────────────────────────────────┐
│ [URGENCY TAG]  [TASK TYPE ICON]     │
│ Task Title                          │
│ Preview of drafted content...       │
│                                     │
│ [PRIMARY ACTION]        [Edit]      │
└─────────────────────────────────────┘

Urgency colors:
🔴 Urgency 8-10 — #FF4444 border
🟡 Urgency 5-7  — #FFB800 border
🟢 Urgency 1-4  — #00C853 border
```

**Scheduled Card (Deferred)**
```
┌─────────────────────────────────────┐
│ ⏰ SCHEDULED · [TIME]               │
│ Task Title                          │
│ "Pre-built. Delivers at [time]."    │
│                                     │
│ [🔔 Notify at [TIME]]  [Edit Time] │
└─────────────────────────────────────┘
```

**Blocker Card (Missing Info)**
```
┌─────────────────────────────────────┐
│ ⚠️ NEEDS INFO                       │
│ Task Title                          │
│ "Which email should I send to?"     │
│                                     │
│ [Type answer here...    ] [→]       │
└─────────────────────────────────────┘
```

### 6.3 Agent Reasoning Stream
Show the model's work in real time as cards populate. This is your Agentic Depth proof.

```
┌─────────────────────────────────────┐
│ 🤖 ResQ is working...               │
│                                     │
│ ✅ Detected 3 tasks                 │
│ ✅ Ranked by urgency                │
│ ✅ Drafting email to Kartickey...   │
│ ✅ Building calendar event...       │
│ ⏳ Scheduling bill payment...       │
└─────────────────────────────────────┘
```

### 6.4 Visual Design Tokens

```css
:root {
  /* Core palette */
  --bg-primary:     #0A0A0F;   /* near-black */
  --bg-card:        #13131A;   /* card surface */
  --bg-chaos:       #0D0D14;   /* left panel */
  --accent-primary: #6C63FF;   /* electric violet — ResQ brand */
  --accent-execute: #00E5A0;   /* execution green */
  --accent-urgent:  #FF4444;   /* urgent red */
  --accent-medium:  #FFB800;   /* medium amber */
  --accent-low:     #00C853;   /* low green */
  --accent-sched:   #448AFF;   /* scheduled blue */
  --text-primary:   #F0F0F5;
  --text-secondary: #8888AA;
  --border:         #2A2A3A;

  /* Typography */
  --font-display: 'Space Grotesk', sans-serif;  /* headings, card titles */
  --font-body:    'Inter', sans-serif;          /* body, inputs */
  --font-mono:    'JetBrains Mono', monospace;  /* agent reasoning stream */

  /* Spacing */
  --radius-card: 12px;
  --radius-btn:  8px;
}
```

---

## 7. Complete File Structure

```
resq/
├── public/
│   ├── index.html
│   ├── manifest.json          ← PWA manifest
│   ├── service-worker.js      ← Push + offline handling
│   ├── icon-192.png
│   ├── icon-512.png
│   └── badge.png
│
├── src/
│   ├── main.jsx
│   ├── App.jsx                ← Root: two-zone layout
│   │
│   ├── components/
│   │   ├── ChaosZone.jsx      ← Brain dump input + voice
│   │   ├── ActionZone.jsx     ← Card container + counter
│   │   ├── ExecuteCard.jsx    ← Immediate action card
│   │   ├── ScheduledCard.jsx  ← Deferred action card
│   │   ├── BlockerCard.jsx    ← Missing info card
│   │   ├── ReasoningStream.jsx← Agent thinking panel
│   │   └── InstallPrompt.jsx  ← PWA install banner
│   │
│   ├── services/
│   │   ├── gemini.js          ← Gemini API call + tool chain parser
│   │   ├── deeplinks.js       ← All URL builders
│   │   ├── scheduler.js       ← IndexedDB + push scheduling
│   │   └── pushManager.js     ← Service worker registration
│   │
│   └── utils/
│       ├── urgencyColors.js
│       └── timeParser.js      ← "tomorrow 9am" → ISO 8601
│
├── server/
│   ├── index.js               ← Express server
│   ├── routes/
│   │   ├── push.js            ← /subscribe, /send-notification
│   │   └── health.js          ← /health (Cloud Run requirement)
│   └── scheduler.js           ← Cron: check + fire scheduled tasks
│
├── Dockerfile                 ← Cloud Run deployment
├── .env.example
├── package.json
└── vite.config.js
```

---

## 8. Backend — Node/Express on Cloud Run

### 8.1 Key Routes

```javascript
// POST /subscribe
// Saves push subscription for this user session
app.post('/subscribe', (req, res) => {
  const subscription = req.body;
  // Store in memory (Map keyed by endpoint) for hackathon
  // Production: Cloud Datastore / Firestore
  subscriptions.set(subscription.endpoint, subscription);
  res.json({ status: 'subscribed' });
});

// POST /schedule-task
// Stores a task to be notified at a future time
app.post('/schedule-task', (req, res) => {
  const { subscription, task, scheduledTime } = req.body;
  scheduledTasks.push({ subscription, task, scheduledTime: new Date(scheduledTime) });
  res.json({ status: 'scheduled' });
});

// GET /health
// Required by Cloud Run
app.get('/health', (req, res) => res.json({ status: 'ok' }));
```

### 8.2 Notification Scheduler (Cron)

```javascript
// Runs every 60 seconds
setInterval(async () => {
  const now = new Date();
  const due = scheduledTasks.filter(t => new Date(t.scheduledTime) <= now && !t.sent);
  
  for (const task of due) {
    await webpush.sendNotification(task.subscription, JSON.stringify({
      title: `⚡ ResQ — ${task.task.action_label} Ready`,
      body: 'Pre-built. One tap to execute.',
      taskId: task.task.id,
      artifactUrl: task.task.artifact_url
    }));
    task.sent = true;
  }
}, 60000);
```

### 8.3 Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 8080
ENV PORT=8080
CMD ["node", "server/index.js"]
```

---

## 9. PWA Manifest

```json
{
  "name": "ResQ — Loop Closer",
  "short_name": "ResQ",
  "description": "Brain dump to one-tap execution",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0A0A0F",
  "theme_color": "#6C63FF",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

---

## 10. Gemini API Call (Frontend)

```javascript
// src/services/gemini.js

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash-preview-05-20'; // verify in AI Studio picker

export async function processbraindump(text, onStep) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ text }] }],
        tools: [{ function_declarations: TOOL_DEFINITIONS }]
      })
    }
  );

  const data = await response.json();
  const calls = data.candidates[0].content.parts
    .filter(p => p.functionCall)
    .map(p => p.functionCall);

  // Stream steps to UI
  calls.forEach(call => onStep(call.name));

  return parseFunctionCalls(calls);
}

function parseFunctionCalls(calls) {
  const result = { tasks: [], artifacts: [], blockers: [] };

  calls.forEach(call => {
    if (call.name === 'extract_and_prioritize') {
      result.tasks = call.args.tasks;
    } else if (call.name === 'draft_email_artifact') {
      result.artifacts.push({ type: 'email', ...call.args });
    } else if (call.name === 'draft_calendar_artifact') {
      result.artifacts.push({ type: 'calendar', ...call.args });
    } else if (call.name === 'draft_action_artifact') {
      result.artifacts.push({ type: 'action', ...call.args });
    } else if (call.name === 'flag_blocker') {
      result.blockers.push(call.args);
    }
  });

  return result;
}
```

---

## 11. IndexedDB — Scheduled Task Persistence

```javascript
// src/services/scheduler.js

const DB_NAME = 'resq-tasks';
const STORE = 'scheduled';

export async function saveScheduledTask(task) {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put({
    ...task,
    id: task.task_id,
    savedAt: Date.now()
  });
  return tx.complete;
}

export async function getScheduledTasks() {
  const db = await openDB();
  return db.transaction(STORE).objectStore(STORE).getAll();
}

export async function markComplete(taskId) {
  const db = await openDB();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const task = await store.get(taskId);
  if (task) {
    task.completed = true;
    task.completedAt = Date.now();
    store.put(task);
  }
}

// Loops closed counter
export async function getLoopsClosedToday() {
  const tasks = await getScheduledTasks();
  const today = new Date().toDateString();
  return tasks.filter(t => 
    t.completed && 
    new Date(t.completedAt).toDateString() === today
  ).length;
}
```

---

## 12. Deployment — Google Cloud Run

### Step 1: Build & Push to Artifact Registry
```bash
# Set variables
PROJECT_ID=your-project-id
REGION=us-central1
SERVICE_NAME=resq

# Build
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME

# Deploy
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars GEMINI_API_KEY=$GEMINI_API_KEY,VAPID_PUBLIC_KEY=$VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY=$VAPID_PRIVATE_KEY
```

### Step 2: Generate VAPID Keys (for Web Push)
```bash
npx web-push generate-vapid-keys
# Copy public + private keys to env vars
```

### Step 3: Verify
```bash
# Should return {"status":"ok"}
curl https://[YOUR-CLOUD-RUN-URL]/health
```

### Environment Variables Required
```
GEMINI_API_KEY=        ← from AI Studio
VAPID_PUBLIC_KEY=      ← from web-push generate
VAPID_PRIVATE_KEY=     ← from web-push generate
VAPID_EMAIL=           ← your email (web-push requirement)
PORT=8080              ← Cloud Run default
```

---

## 13. Day-by-Day Sprint

| Day | Date | Objective | Done When |
|---|---|---|---|
| 1 | 23 Jun ✅ | Agent loop proven in Playground | extract→draft→draft chain fires autonomously ✅ |
| 2 | 24 Jun | Project scaffold + Gemini API in code | `npm run dev` shows two-zone UI, API call returns parsed function calls |
| 3 | 25 Jun | Execute Cards + deep links working | Gmail + Calendar buttons open pre-filled in browser |
| 4 | 26 Jun | Scheduled Cards + Service Worker + Push | Notification fires on phone, tapping opens pre-loaded card |
| 5 | 27 Jun | Polish + voice + GitHub | Reasoning stream animated, 3 demo inputs locked, repo public |
| 6 | 28 Jun | Google Doc + Cloud Run deploy + submit | Live public URL confirmed, all 3 submission links ready |

---

## 14. Three Locked Demo Inputs

**Never type freehand in front of judges. Always use these.**

```
DEMO 1 — Immediate Multi-Task (showcases full chain):
"I totally overslept today and missed my 10 AM sync with Kartickey.
I need to apologize to him and send over that updated pitch deck ASAP.
Also push my deep work focus block to tomorrow morning instead,
and remind me to pay the electricity bill."

Expected output: Email card + Calendar card + Scheduled card (3 artifacts, 0 blockers)

---

DEMO 2 — Deferred Task (showcases scheduled delivery):
"I need to call my CA back about the GST filing but I'm in back-to-back
meetings until 6pm. Also message Priya that the design review is
pushed to Thursday."

Expected output: Scheduled call reminder card + WhatsApp message card

---

DEMO 3 — Blocker Demo (showcases flag_blocker + agent intelligence):
"Send the contract to the client and follow up on the invoice."

Expected output: flag_blocker card ("Which client? What's their email?")
                 Shows agent detected missing info rather than hallucinating
```

---

## 15. Risks & Mitigations (MURPHY)

| Risk | Likelihood | Mitigation |
|---|---|---|
| Gemini returns prose instead of tool calls | Medium | Verify on Day 2 in code (already works in Playground). Fallback: force JSON mode. |
| Web Push not supported on iOS Safari during demo | Medium | Demo on Android Chrome or desktop Chrome. State iOS support as "v2" in Google Doc. |
| Service worker push doesn't fire from Cloud Run | Medium | Test push end-to-end on Day 4. Have fallback: setTimeout in-app notification if push fails. |
| Cloud Run cold start on demo | Low | Keep service warm with a health check ping before presenting. |
| Scope creep into voice before core is done | High | Voice only after Day 5 core is locked. Web Speech API = 1 line. Don't start earlier. |
| Demo brain-dump fails live | Low | 3 hardcoded demo buttons. Never type live. |
| Judges call it "just a parser" | Medium | Show reasoning stream. Say: "Watch the model decide which tool to use for each task." |

---

## 16. What To Say To Judges

**On the core innovation:**
> "Every reminder app tells you what to do. ResQ has already done it. The only question is when you tap."

**On deferred tasks + procrastination:**
> "The notification isn't a nudge. It IS the execution environment. The email is already written. The payment is already loaded. You're not being asked to do something — you're being asked to confirm something ResQ already did."

**On agentic depth (point at reasoning stream):**
> "Watch the model — it's not returning a JSON blob. It's deciding: this task needs an email, that one needs a calendar event, this one is missing information. Multi-step autonomous tool selection."

**On not sending emails directly:**
> "ResQ doesn't send without your approval. That's a trust decision. The AI does 99% of the work. You confirm."

---

## 17. Google Doc — Rubric Mapping (Submit This)

Structure your Google Doc exactly as follows:

```
1. Problem Statement Alignment
   → Quote the problem statement
   → Explain The Execution Gap + The Procrastination Loop
   → Show Before/After comparison

2. Agentic Depth
   → List all 5 tool definitions
   → Show the chain diagram (extract → draft → deeplink)
   → Screenshot of reasoning stream from live app

3. Innovation
   → "The Reminder IS the Execution Environment"
   → Comparison table: ResQ vs other reminder apps
   → Screenshot of scheduled card + notification

4. Google Technologies Used
   → Gemini API (function calling, structured output)
   → Google Cloud Run (hosting)
   → Google Cloud Build (CI/CD)
   → Artifact Registry
   → Links to each

5. v2 Roadmap (turns limitations into vision)
   → Real Gmail send via OAuth
   → Google Calendar write API
   → Multi-device sync via Cloud Firestore
   → Android native app (Flutter + FCM)
```

---

## 18. Limitations (State Proactively — Turns Weakness Into Vision)

| Limitation | v2 Roadmap Answer |
|---|---|
| Email opens Gmail compose (user still taps Send) | OAuth Gmail send with confirmation step |
| Push notifications require browser permission | Native Android app with FCM |
| Session storage for subscriptions (resets on deploy) | Cloud Datastore / Firestore persistence |
| Single region Cloud Run | Multi-region with Cloud Load Balancing |
| No user accounts | Google Sign-In + personal task history |

---

## 19. Banks (LISA/NAVI)

**IDEA BANK**
- I1: Agent reasoning stream — show tool name + decision rationale as cards populate
- I2: "Loops closed today" counter in app header — gamification tied to Impact score
- I3: WhatsApp deep link as demo moment — judges on phones can actually send the message
- I4: Countdown timer on scheduled cards — visual urgency
- I5: v2 — real OAuth execution as post-hackathon differentiator

**ACTION QUEUE**
- A1: Scaffold React app with two-zone layout in VS Code today
- A2: Wire Gemini API call in code — parse function call responses
- A3: Build ExecuteCard component with Gmail + Calendar deep links
- A4: Register Service Worker + test push notification on phone
- A5: Set up Cloud Run deployment pipeline (Dockerfile + gcloud commands)
- A6: Lock 3 demo inputs, build demo buttons in UI

**KEY DECISIONS (LOCKED)**
- D1: PWA on Google Cloud Run — no Firebase
- D2: Web Push API + Service Worker — no third party notification service
- D3: Deep links (Gmail compose, Calendar render) — no OAuth
- D4: Gemini function-calling chain — not one-shot JSON
- D5: WON'T list: OAuth, user accounts, databases, native app

---

## → Top 5 Next Actions (Do In This Order)

1. **Scaffold the React app** — `npm create vite@latest resq -- --template react`, build two-zone layout, confirm it runs locally.
2. **Wire the Gemini API call in code** — copy the `gemini.js` service from Section 10, test with Demo Input 1, log the parsed function calls to console. Confirm it matches what Playground showed.
3. **Build one ExecuteCard end-to-end** — email type, Gmail compose URL working, opens pre-filled in browser. This single component IS the product.
4. **Register Service Worker + get one test push notification firing on your phone** — this is the highest-risk new component. Know if it works before building around it.
5. **Set up Dockerfile + Cloud Run deploy today** — even an empty shell. Confirm public URL exists. De-risk the mandatory deliverable.
