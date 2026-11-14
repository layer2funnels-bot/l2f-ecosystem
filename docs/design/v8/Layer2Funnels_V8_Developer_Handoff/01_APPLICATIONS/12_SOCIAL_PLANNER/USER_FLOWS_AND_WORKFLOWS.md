# Social Planner · user flows and workflows

Each flow names the prototype route or control. "Source" says where the rule is defined. Cross-app flows: `05_STRATEGY_AND_ARCHITECTURE/CROSS_APP_WORKFLOWS.md`.

## 1. Plan and approve a post

**Who:** Teammate · **Source:** Brief: Social Planner

1. Calendar (#/social/calendar) → New post
2. Pipeline (#/social/board): Idea → Draft → In review → Approved → Scheduled in GHL → Posted
3. Approvals (#/social/approvals); "Send approved to GHL" exports CSV (API later)

## Navigation graph (generated from the prototype links)

Page → pages it links to (within and outside the app).

- `social/calendar` → `social/approvals`, `social/board`, `social/campaigns`, `social/channels`, `social/posts`, `social/queue`
- `social/board` → `social/approvals`, `social/calendar`, `social/campaigns`, `social/channels`, `social/posts`, `social/queue`
- `social/approvals` → `social/board`, `social/calendar`, `social/campaigns`, `social/channels`, `social/posts`, `social/queue`
- `social/posts` → `social/approvals`, `social/board`, `social/calendar`, `social/campaigns`, `social/channels`, `social/queue`
- `social/campaigns` → `social/approvals`, `social/board`, `social/calendar`, `social/channels`, `social/posts`, `social/queue`
- `social/queue` → `social/approvals`, `social/board`, `social/calendar`, `social/campaigns`, `social/channels`, `social/posts`
- `social/channels` → `social/approvals`, `social/board`, `social/calendar`, `social/campaigns`, `social/posts`, `social/queue`
