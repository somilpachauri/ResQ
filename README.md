# ResQ — Turn the mess into one-tap actions

> Every reminder app tells you what to do. **ResQ has already done it — you just tap.**

ResQ is an AI productivity companion that takes a chaotic brain-dump — typed, spoken, or **photographed** — and turns it into ready-to-execute action cards. Not reminders. Not a to-do list. The actual email, drafted. The calendar event, pre-filled. The payment, one tap away.

**Live demo:** [your-cloud-run-url] · **Built for:** Vibe2Ship (Coding Ninjas × Google for Developers)

---

## The problem

Students, professionals, and entrepreneurs miss deadlines, meetings, bills, and commitments. Existing tools rely on **passive reminders** that are easy to ignore and do nothing to help you actually finish the task. A notification that says "Pay your bill" is just a smaller version of the original problem.

## The wedge

ResQ closes the loop instead of reopening it.

```
Other apps:   "Reminder: email Kartickey"   → you still have to write it
ResQ:          Opens Gmail, subject written, body written → you tap Send
```

The AI does the cognitive work — reading, prioritizing, drafting. You just confirm.

---

## What makes it different

**1. Multimodal chaos in.** Don't just type your mess — photograph it. A bill, a WhatsApp screenshot, a sticky note, an event invite. ResQ reads the image with Gemini vision and extracts the actions.

**2. Executable artifacts out.** Each card isn't a note — it's the finished thing with a one-tap deep link:
- Email → opens Gmail compose, fully pre-filled
- Event → opens Google Calendar, pre-filled
- Message → opens WhatsApp with the text ready
- Bill → opens the payment search

**3. Scheduled tasks become pre-built actions.** "Remind me to pay after 8pm" doesn't just ping you later — at 8pm the action is already built and waiting. The reminder *is* the execution environment.

**4. It knows when it's stuck.** If an image is unreadable or info is missing, ResQ asks one specific question instead of guessing.

---

## How it works

```
[ Brain-dump: text / voice / image ]
            │
            ▼
[ ResQ backend → Gemini 3.5 Flash (function calling + vision) ]
            │
   ┌────────┴─────────────────────────────┐
   │  Multi-step agent loop:               │
   │  1. extract_and_prioritize            │
   │  2. draft_email_artifact              │
   │  3. draft_calendar_artifact           │
   │  4. draft_action_artifact             │
   │  5. flag_blocker (if info missing)    │
   └────────┬─────────────────────────────┘
            │
            ▼
[ Action cards with one-tap deep links ]
```

The model autonomously selects and chains these tools in a single turn — decomposing the chaos, ranking by urgency, and drafting the finished artifacts. This is a real multi-step agent, not a one-shot prompt.

---

## Tech stack

| Layer | Tech |
|---|---|
| AI | **Gemini 3.5 Flash** — function calling, structured output, vision (multimodal) |
| Frontend | React 19, Vite 6, Tailwind CSS 4, Motion (animations), Lucide icons |
| Backend | Node + Express (server-side Gemini proxy, key never exposed to client) |
| Execution | Deep links — Gmail compose, Google Calendar, WhatsApp (zero OAuth) |
| Delivery | PWA — installable, service worker, scheduled in-app notifications |
| Hosting | **Google Cloud Run** |

All AI and hosting run on Google technologies.

---

## Key design decisions

- **Deep links, not OAuth.** ResQ opens pre-filled Gmail/Calendar/WhatsApp instead of sending on your behalf. Zero auth friction, and the human stays in control of every send.
- **Server-side API key.** The Gemini key lives in the backend, never in the browser bundle.
- **Human-in-the-loop by design.** The AI does ~99% of the work; you confirm the final action. That's a trust feature, not a limitation.

---

## Run locally

```bash
# 1. Install
npm install

# 2. Add your Gemini API key
echo "GEMINI_API_KEY=your_key_here" > .env

# 3. Dev
npm run dev

# 4. Build + serve production
npm run build
npm start
```

Get a Gemini API key at [aistudio.google.com](https://aistudio.google.com).

---

## Deploy to Cloud Run

```bash
gcloud run deploy resq \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=your_key
```

---

## Roadmap (v2)

- Real Gmail send + Calendar write via OAuth (with a confirm step)
- Background push notifications (currently fires while the app is open)
- Multi-device sync and personal task history
- Native Android app

---

## License

MIT
