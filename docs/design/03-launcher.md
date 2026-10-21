# 03 · Launcher
File: `03-launcher.html` · Status: approved with changes, applied

12 tiles in a responsive grid (auto-fill, min 230px; one column on phones): Office, Projects, Clients, Client Portal, Drive, Planner, Form Builder, Value Ladder, Social Planner, Whiteboard, Layer 2 Agents, Funnel Mapper Pro. Header + switcher as in 01. Title "Your apps in {organization}" with the plate-stack accent.

**Funnel Mapper Pro is a normal tile.** Opens in the same tab under the same header and switcher. No "new tab" icon, no own sign-in.

| Tile state | Look | Click does |
|---|---|---|
| Available | White card, icon, name, one line | Opens the app in the same tab |
| Locked (Client Portal) | Grey, "Locked" pill | Dialog "Client Portal is locked": clients can't sign in until the security tests pass. Owner sees a disabled "Turn on (unavailable)"; admin sees "An owner switches it on when it's ready." |
| Coming soon (Layer 2 Agents) | Grey, pill | Dialog: nothing runs yet and nothing will without your approval of provider, cost and data rules |
| Not set up here (e.g. Funnel Mapper Pro in Aurj) | Grey, "Not set up here" | Dialog with Switch to Layer2Funnels · Ask an admin (message only, "needs backend later") · Close |

Who sees what: **Owner and Admin** see all 12 (including the locked Client Portal tile). **Editor** sees 8: Office, Projects, Clients, Drive, Planner, Whiteboard, Layer 2 Agents, Funnel Mapper Pro. Apps a level doesn't include are not shown at all. Switching organization on the Launcher re-checks which apps that organization has; it stays on the Launcher.

Behaviour: tiles are buttons, 132px min height, Enter/Space opens, focus ring 3px `--primary`; hover lifts 2px; tiles fade in with a 25ms stagger (off under reduced motion). Dialogs trap focus, Esc closes.

Tokens: `--panel --line --shadow-1/2 --tint --primary --warn-tint --muted`.

Open assumptions: A7, A8, A16.

With 13 or more apps the Launcher adds search, Pinned, Recent and groups (see 10-shell-patterns §B). Client-scoped users see only the apps where they hold something (see §D).
