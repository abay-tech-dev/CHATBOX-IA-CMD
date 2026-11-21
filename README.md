# CHATBOX-IA — CMD

Terminal / Linux themed Twitch chat overlay for OBS and StreamElements.

## Features

- Terminal window look: title bar, `[SYS]` lines, decorative prompt with a blinking cursor
- Themes: Dark, Light, AMOLED + custom accent color
- Chat width and alignment (left / right / center)
- Entry animations: typewriter, slide, fade, none
- Role badges as terminal tags (`[MOD]` `[VIP]` `[SUB]` `[LIVE]`) or icons, with custom role colors
- Optional timestamps and avatars, max messages, message lifetime
- Terminal pop-up **alerts**: follow, sub, gift subs, bits, donations, raids, hosts
- **Goal bar** (ASCII): followers, subs, bits or donations — horizontal (top) or vertical (right side),
  custom color, auto-counts stream events, confetti when reached
- Deleted / timed-out messages are removed from the overlay

## How to connect

### Option A — OBS only, no account needed

1. Open `index.html` (the configurator) in your browser.
2. Type your Twitch channel at the top and click **Connect** — the preview shows your live chat.
3. Adjust the settings, then click **Copy the OBS link**.
4. In OBS: **+** → **Browser** → paste the link in **URL** → set the width/height shown in the configurator.

The link looks like `…/widget/index.html?channel=yourchannel&theme=amoled&showGoal=true…`:
every setting is stored in it. The direct connection is read-only and anonymous, so it sees chat,
subs, gift subs, bits and raids. Follows and donations need StreamElements (option B).

> Tip: host the repo with GitHub Pages (Settings → Pages) to get an `https://` link that works on any PC.

### Option B — StreamElements

1. StreamElements → **Overlays** → your overlay → **+** → **Static / Custom** → **Custom widget** → **Open editor**.
2. Paste each file from the `streamelements/` folder into its tab:
   `se-html` → HTML, `se-css` → CSS, `se-js` → JS, `se-fields` → FIELDS.
3. Leave **Twitch channel** empty in the widget settings: StreamElements feeds the chat and all events.

## Editing

The source lives in `widget/`. After a change, sync the StreamElements copies:

```bash
python3 build-streamelements.py
```
