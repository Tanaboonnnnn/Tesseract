# Google Calendar (two-way sync)

Tesseract keeps its own calendar called **"Tesseract"** in your Google account.
Anything that shows Google calendars, including **Notion Calendar** and your phone, shows it too.

| What | Direction |
|---|---|
| Your events (Schedule page, or `add_event` from an AI) | **Two-way**: edit or delete in Google/Notion Calendar and it comes back. The newer change wins. |
| Events you create directly in the "Tesseract" calendar | Imported into the app |
| Task due dates, exams, assignments, weekly class times | App → Google only (the app is the source of truth). Turn each on/off on the Schedule page. |
| Your other calendars (default: `primary`) | Shown read-only on the Schedule page, never stored or changed |

Sync runs when the app starts, every 15 minutes while it is open, a few seconds after you edit an event, and on **Sync now**.

The app can only change calendars it created (`calendar.app.created` scope) and can only *read* other events (`calendar.events.readonly`).

## One-time setup (about 10 minutes)

Google needs an "OAuth client" that belongs to you. Nothing here is shared with anyone else.

1. Open [Google Cloud Console](https://console.cloud.google.com/) and sign in with the Google account whose calendar you use.
2. **Create a project**: project picker at the top → **New project** → name it `Tesseract` → **Create**, then select it.
3. **Enable the API**: search for **Google Calendar API** → **Enable**.
4. **Consent screen**: go to **Google Auth Platform** (or **APIs & Services → OAuth consent screen**) → **Get started**:
   - App name `Tesseract`, support email = your email → **Next**
   - Audience **External** → **Next** → contact email → **Next** → agree → **Create**
   - **Audience** page → **Publish app** → confirm. Use this rather than "Testing": in Testing mode Google expires the sign-in every 7 days.
5. **Create the client**: **Clients** → **Create client** → type **Desktop app** → name `Tesseract` → **Create** → **Download JSON**.
6. Save the downloaded file as:
   ```
   C:\Users\<you>\.tesseract\google-client.json
   ```
   This folder is outside the repo and is never committed.
7. Open the app → **Schedule** → **Connect Google Calendar**. A Google page opens:
   - It will say **"Google hasn't verified this app"**. That's expected, because you made the app yourself. Click **Advanced → Go to Tesseract (unsafe)**.
   - Allow the two calendar permissions → you see "Google Calendar connected".
8. The first sync creates the **Tesseract** calendar. In Notion Calendar, it appears under your Google account (turn it on there if hidden).

## Files

| File | What |
|---|---|
| `~/.tesseract/google-client.json` | your OAuth client (step 6) |
| `~/.tesseract/google-token.json` | sign-in token (created on connect, removed on Disconnect) |
| `~/.tesseract/google-sync.json` | sync cursor and what was pushed (safe to delete; next sync rebuilds it) |
| `data/schedule/events.yaml` | your events (plain YAML, in your data) |
| `data/schedule/google.yaml` | calendar id and what to push |

## Troubleshooting

- **Connect button missing:** the client file isn't at the path in step 6, or it isn't the *Desktop app* JSON.
- **"invalid_grant" after a week:** the consent screen is still in Testing mode (step 4). Publish it, then Disconnect and Connect again.
- **Deleted the Tesseract calendar in Google:** the next sync creates a new one and pushes everything again.
- **Deleted a task due date in Google:** it comes back on the next sync. Change the task in the app instead, or turn off "Task due dates".
- **Disconnect:** Schedule page → Disconnect. This revokes the token at Google. The "Tesseract" calendar stays in Google until you delete it there.
