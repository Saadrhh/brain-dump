# Brain Dump

Private chat inbox for your thoughts. Type or speak a dump; automation turns it into calendar events, email drafts, inbox scout results, and weekly digests.

## Stack

- **Frontend:** static site (HTML / CSS / JS) on Vercel  
- **API:** Vercel serverless routes (`/api/*`) — hold secrets, proxy to n8n  
- **Automation:** n8n (Gemini + Gmail + Google Calendar)

## Demo script (3 flows)

1. **Brain dump** — Unlock → type “Meeting with Sam Friday 3pm about the launch” → Send → confirm calendar/email reply.  
2. **Follow-up** — When it asks a clarifying question, reply in the same chat (same session).  
3. **Digest** — Tap **Digest** → weekly summary appears in the chat.

## Setup

1. Deploy this repo to Vercel.  
2. In Vercel → Project → Settings → Environment Variables, set:

| Variable | Example |
|----------|---------|
| `ACCESS_CODE` | unlock code for the site |
| `N8N_BRAIN_DUMP_URL` | `https://….app.n8n.cloud/webhook/brain-dump` |
| `N8N_DIGEST_URL` | `https://….app.n8n.cloud/webhook/weekly-digest` |
| `N8N_AUTH_HEADER` | `X-Brain-Dump-Key` (must match n8n Header Auth **Name**) |
| `N8N_AUTH_VALUE` | secret (must match n8n Header Auth **Value**) |

3. In n8n, keep both workflows **Active**.  
4. Redeploy after changing env vars.

Copy `.env.example` for local reference. Secrets belong in Vercel, not in `app.js`.

## Privacy

Messages are sent to your n8n workflow and providers you connected (e.g. Google, Gemini). Nothing is sold or shared with third-party analytics — this app has no trackers.

## Local note

Open the site via the Vercel URL (or `vercel dev`). Plain `index.html` on disk won’t unlock, because auth goes through `/api/auth`.
