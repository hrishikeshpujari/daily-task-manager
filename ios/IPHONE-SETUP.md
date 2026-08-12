# iPhone setup — app, Siri voice capture, home-screen widget

Everything on this page is one-time. Total: ~15 minutes. You need two values from
whoever runs the Worker: the **Worker URL** and **your personal secret**.

## 1. Your own private task space (5 min)
Your tasks live in *your* GitHub account — separate from anyone else's.
1. Create a free account at github.com (skip if you have one).
2. Create a token: github.com/settings/tokens → **Generate new token (classic)** →
   tick **only `gist`** → Generate → copy it.
3. Open the app in Safari: `https://hrishikeshpujari.github.io/daily-task-manager/`
   → tap **⚙** → paste your token under sync → under **Claude PA**, paste the
   **Worker URL** + **your personal secret** → Save.
4. Optional but cute: **⚙ → Theme → 🌸 Light & playful.**
5. Migrate: copy your Apple Notes lists → **⚙ → ⇪ Import** → paste → Import.
   Day names ("Thursday") land on the right dates automatically.

## 2. Install the app to your home screen (1 min)
In Safari on the app page: **Share → Add to Home Screen → Add.**
It opens full-screen like a normal app.

## 3. "Hey Siri, add task" (5 min)
Shortcuts app → **+** → name it **Add Task**:
1. Add action **Dictate Text**.
2. Add action **Get Contents of URL**, set:
   - URL: `<WORKER_URL>/capture`
   - Method: **POST**
   - Headers: `x-app-secret` = *your personal secret*
   - Request Body: **JSON** → add field `text` (Text) = **Dictated Text** (the variable)
3. Add action **Show Notification** → text: **Get Contents of URL** result (optional).

Now say **"Hey Siri, Add Task"**, speak naturally — *"uh remind me to pick up the
cake thursday at 5"* — and Claude cleans it into a real task with the right date.
It appears in the app and on the widget. Add the same shortcut to the share sheet
(Shortcut settings → **Show in Share Sheet**, input: Text) to send any selected
text straight to your list.

## 4. The home-screen widget (3 min)
iOS apps can't be sideloaded, so the widget runs in **Scriptable** (free, on the
App Store) — it renders real home-screen widgets from a script:
1. Install **Scriptable** from the App Store.
2. Open it → **+** → paste the whole `TasksPA-widget.js` file → fill in the two
   values at the top (Worker URL + your secret) → name it **Tasks PA**.
3. Long-press the home screen → **+** → **Scriptable** → choose **Medium** (or
   Large for the full week) → Add → long-press it → **Edit Widget** → Script:
   **Tasks PA**.

You get day-by-day cards (Monday 🚗, Thursday 🦋 …) with your tasks, done count,
and overdue flags. It refreshes itself (~every 30 min, iOS decides exactly when)
and works offline from its last snapshot. Tap it to open the app.

### The day-widget grid (your old Reminders home screen, but live)
One script powers per-day cards too. Add a **Small** Scriptable widget for each
day, then long-press it → **Edit Widget** → **Script: Tasks PA** → **Parameter**:
`monday`, `tuesday`, `wednesday`, `thursday`, `friday` (and `saturday`, `sunday`,
`today`, `tomorrow`, or `someday` for a "Holidayyyy"-style ideas card). Arrange
them in a grid — each card shows the colored day name + emoji, the count, and
that day's tasks, with "No Reminders" when it's clear. Tasks you speak to Siri
with a day ("dentist thursday 8:30am") land on the right card automatically.

## Notes
- Your secret identifies *you* to the Worker; your GitHub token never leaves your
  own devices' app settings.
- The widget is read-only by design — completing/editing happens in the app
  (one tap away).
- If the widget ever says "Open the app once": your secret or the Worker URL is
  mistyped in the script, or the Worker hasn't been given your secret yet.
