# Layer 2 Agents · user flows and workflows

Each flow names the prototype route or control. "Source" says where the rule is defined. Cross-app flows: `05_STRATEGY_AND_ARCHITECTURE/CROSS_APP_WORKFLOWS.md`.

## 1. Record a meeting (preview)

**Who:** Owner · **Source:** Brief: Layer 2 Agents [F]

1. Agents (#/agents/home) → Meeting Intelligence (#/agents/meeting/new): record/upload, organization, language
2. Session (#/agents/meeting/:meeting): Notes · Transcript · Action items → Tasks Inbox
3. Preview only until a provider is approved (D7)

## 2. Ask about my records (preview)

**Who:** Any user · **Source:** Brief [F]

1. Ask (#/agents/ask): chat answering from records the user can open, with sources

## Navigation graph (generated from the prototype links)

Page → pages it links to (within and outside the app).

- `agents/home` → `agents/ask`, `agents/meetings`, `agents/settings`
- `agents/meeting/new` → `agents/ask`, `agents/home`, `agents/meetings`, `agents/settings`
- `agents/ask` → `agents/home`, `agents/meetings`, `agents/settings`, `office/home`
- `agents/meetings` → `agents/ask`, `agents/home`, `agents/meeting/:meeting`, `agents/meeting/new`, `agents/settings`
- `agents/settings` → `agents/ask`, `agents/home`, `agents/meetings`
- `agents/meeting/:meeting` → `agents/ask`, `agents/home`, `agents/meeting/:meeting/actions`, `agents/meeting/:meeting/notes`, `agents/meeting/:meeting/transcript`, `agents/meetings`, `agents/settings`, `drive/home`
- `agents/meeting/:meeting/notes` → `agents/ask`, `agents/home`, `agents/meeting/:meeting/actions`, `agents/meeting/:meeting/transcript`, `agents/meetings`, `agents/settings`, `drive/home`
- `agents/meeting/:meeting/transcript` → `agents/ask`, `agents/home`, `agents/meeting/:meeting/actions`, `agents/meeting/:meeting/notes`, `agents/meetings`, `agents/settings`, `drive/home`
- `agents/meeting/:meeting/actions` → `agents/ask`, `agents/home`, `agents/meeting/:meeting/notes`, `agents/meeting/:meeting/transcript`, `agents/meetings`, `agents/settings`, `drive/home`
