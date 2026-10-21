# 06 · Office → Funnels

**Status: Requirements update — existing design remains approved with changes; new Funnel Strategies capability is proposed and awaiting owner review.**  
**HTML prototype:** `06-funnels.html` is not being updated in this change. Treat it as the existing prototype only; this Markdown file is the source of truth for the revised requirements and future design/implementation work.

## Purpose and boundaries

Office → Funnels is the team's central workspace for reusable funnel strategy inputs and written funnel strategies. It manages customer avatars, offers and products, stories, a singularly labelled Brand Kit section, and one written Funnel Strategy document per funnel.

**Funnel Mapper Pro remains a separate application** for creating and editing visual funnel maps. Office → Funnels should manage the written strategy and provide a clear way to open the associated map in Funnel Mapper Pro when a map is linked. Do not imply that map integration, automatic synchronization, or data mirroring already exists; the relationship and integration must be designed and implemented against the existing architecture.

This document updates requirements for the future app/design phase. It does not authorize application-code changes, live database changes, deployment, or changes to the original Funnel Mapper Pro repository or its infrastructure.

## Navigation

Use these destinations:
- **Home**
- **Avatars**
- **Offers & Products**
- **Stories**
- **Brand Kit** — singular label, as requested
- **Funnel Strategies** — new capability described below

Keep the existing approved shared application shell, organization switcher, permissions, design tokens, and phone navigation patterns. Do not redesign unrelated shared shell patterns as part of this feature.

## Home

Keep the existing concepts:
- Count tiles for the reusable record types and strategy records where supported.
- Recently changed records.
- Useful shortcuts to create or open assets and Funnel Strategies.
- A Funnel Strategies summary or recent-strategies area so the team can find active work quickly.

The old “Funnel maps — Link design pending” placeholder must not be presented as a working integration. Because Funnel Mapper Pro remains separate, Home may show linked map information only when the integration/data model supports it. Until then, label the map connection as pending rather than suggesting maps automatically mirror into Office → Funnels.

## Existing reusable record types

Preserve the current record-management pattern for:
- **Avatars**
- **Offers & Products**
- **Stories**
- **Brand Kit** (singular navigation label)

For each type, retain the existing documented behaviors unless the owner explicitly approves a change:
- List with search and Active / Archived / All filters.
- “New {type}” action according to effective permissions.
- List rows show name and summary, Used in references, sharing state, updated date, and Open / Archive / Restore actions as permitted.
- Read view shows the type's sections, an “Internal notes · never shared” area, and relevant “Shared with clients” and “Used in” references.
- New/edit view includes required name, summary, type-specific fields and internal notes; Save / Cancel; and an unsaved-changes dialog with Save and leave / Discard and leave / Keep editing.
- Share-with-client selections must never expose internal notes. The Client Portal is locked until its separate security/go-live gate passes; saved selections do not imply client visibility.
- Archive is reversible; permanent deletion is limited to archived records and roles authorized by the existing permission catalog.
- Shared no-access/not-found state.
- Viewer is read-only; other actions follow the effective permission catalog, which overrides assumptions in design documentation.

Type-specific sections remain as currently documented:
- **Avatars:** Who they are, Motivations, Objections, Language they use, Evidence.
- **Offers & Products:** Promise, Price and terms, What's included, Who it's for.
- **Stories:** Type, The story, Where to use it.
- **Brand Kit:** Colours, Fonts, Voice and tone, Logo notes.

Do not change the underlying data model, existing records, permission catalog, or sharing behavior just to change the visible “Brand kits” label to singular. Inspect existing implementation and propose a safe migration only if one is actually required.

## New capability: Funnel Strategies

### Core decision

- Strategy creation is **document-first**: a flexible document/editor, not a mandatory structured form.
- There is **one Funnel Strategy document per funnel**.
- The strategy document and visual map are separate artifacts: the strategy lives in Office → Funnels; the visual map is created/edited in Funnel Mapper Pro.
- A strategy may optionally link relevant reusable assets (Avatar, Offer & Product, Story, Brand Kit).
- The team must be able to create a document from a blank page or start from an optional template. The template must not constrain the editor; the user can freely write and organize the strategy.

### Funnel Strategies list

Provide a dedicated **Funnel Strategies** destination with:
- List of strategy documents.
- Search and useful filters, including status where supported.
- “New Funnel Strategy” action for authorized users.
- Each row/card should show at least strategy/funnel name, status, updated date, and map-link state where supported.
- Open/edit, archive/restore and delete actions must follow the effective permission catalog and existing archive/delete patterns.
- Empty state should explain what a Funnel Strategy is and offer “Create your first Funnel Strategy” only to users with permission.
- Do not show fake counts, fake map status, or actions that the backend cannot perform.

### Create a Funnel Strategy

“New Funnel Strategy” starts with:
- Funnel/strategy name (required).
- A choice between **Blank document** and **Use template**.
- Optional summary/description if consistent with the existing data model.
- Save and cancel behavior, including unsaved-change protection.

After creation, open the full-page strategy document editor. Prefer a focused document workspace over a rigid form or a modal containing the entire document.

### Strategy document editor

The editor should support a flexible written plan. The proposed optional starter template may include:
1. Funnel overview — name, purpose and business goal.
2. Target audience — customer avatar, problems, motivations and objections.
3. Offer and value proposition.
4. Customer journey — intended journey from first interaction to conversion.
5. Messaging direction — core message, proof, objections and calls to action.
6. Success criteria — desired outcome and measures of success.

This template is a starting aid only, not a required form or an assertion that these sections are mandatory. Users can start blank, edit the template freely, and add, remove or reorder content as supported by the editor.

Editor requirements:
- Save changes clearly and provide appropriate save state/feedback.
- Protect against losing unsaved work, including when leaving or switching organization.
- Show the strategy name and status.
- Allow authorized users to link relevant existing Avatar, Offer & Product, Story and Brand Kit records. These are references unless a separate copy/snapshot behavior is explicitly approved; do not silently duplicate or sync source records.
- Keep internal notes separate from the actual strategy document if the existing record model supports them; never expose internal notes through client sharing.
- Include loading, empty, error, read-only, no-access and unsaved-change states.
- Do not invent collaboration, version history, autosave, rich-text features or export capabilities unless supported by the current architecture; identify these as proposals if they would be valuable.

### Strategy status

Proposed status labels are **Draft, In Review, Approved, Archived**. These are recommendations, not existing confirmed database values. Claude Code should inspect the current model and permission catalog and recommend a status model before implementation. Do not silently add status values or migrate existing data.

### Funnel Mapper Pro connection

The strategy workspace should have a clearly labelled **Open in Funnel Mapper Pro** action when a valid map association exists. If no map is associated, show a distinct “No map linked yet” state and a proposed “Start mapping in Funnel Mapper Pro” action only if a safe, supported launch/creation flow is available.

Before implementation, determine:
- How a strategy record will persistently identify its associated Funnel Mapper Pro map.
- Whether Funnel Mapper Pro can be opened directly to the correct map using its current routing/authentication.
- Which stable identifier or link should be stored and how access is validated.
- What the user sees if the map is missing, inaccessible, or belongs to another organization.
- Whether any summary metadata can be displayed in Office → Funnels without duplicating the map as a second source of truth.

**Do not assume or implement automatic two-way synchronization or mirroring.** First inspect the existing Funnel Mapper Pro integration and architecture. The existing design notes say this connection is pending and Phase 1 keeps FMP data separate. Do not modify the original FMP repository or its Supabase/Vercel projects. Any cross-app integration or data migration must be proposed and explicitly approved before implementation.

## Sharing, organization boundaries and permissions

- Follow the current permission catalog; it takes precedence over assumptions in this document.
- Preserve existing Office → Funnels internal-note privacy and portal-lock behavior.
- Default-deny cross-organization access.
- Reusable records and Funnel Strategy documents must be scoped to the correct organization. A strategy must not accidentally link to another organization's Avatar, Offer, Story, Brand Kit or map.
- Do not broaden sharing, access, delete permissions, or portal functionality as part of this change.
- Audit sensitive mutations where supported by the approved architecture.
- Do not change live database policies, authentication, deployment, DNS, storage services or paid infrastructure without explicit owner approval.

## Responsive design and states

Retain the approved shared shell and responsive patterns:
- Lists become stacked rows on phones.
- The document editor remains usable on phone and tablet, with a clear editing and save experience.
- Interactive targets should follow the shared accessibility standard (at least 44px where practical).
- Provide visible keyboard focus, appropriate dialog focus handling, reduced-motion support, and accessible labels.
- Design loading, empty, no-results, error, no-access, archived, read-only, unsaved-changes and disabled/pending-map states.
- Do not treat the existing HTML prototype as production code or the complete visual design.

## Claude Design handoff

1. Read this entire Markdown file as the source of truth.
2. Use the existing approved shared shell patterns and current Office → Funnels patterns for existing reusable records.
3. Design the new Funnel Strategies list, create flow, blank/template choice, full-page document editor, linked-asset references and Funnel Mapper Pro connection states.
4. Use **Brand Kit** as the singular navigation label.
5. Treat `06-funnels.html` as the existing prototype only. Do not update it as part of this requirements change; a new visual prototype can be created later if and when requested.
6. Present unresolved integration questions clearly. Do not imply the map integration already works.
7. Return the proposed design for owner review. Do not mark the new capability approved or ask Claude Code to implement its UI before explicit owner approval.

## Claude Code handoff and permission to improve

Claude Code should read this entire file before implementation planning. It has **room to recommend and make additional improvements** where they materially improve usability, maintainability, accessibility, security, or consistency with the existing ecosystem architecture.

This flexibility is not permission to silently change product decisions or locked constraints. Claude Code should:
1. Inspect the existing repository, data model, APIs, permission catalog, Office → Funnels implementation, and Funnel Mapper Pro integration before proposing changes.
2. Preserve the agreed decisions: strategy-first, document-first, one strategy per funnel, blank/template options, Funnel Mapper Pro remains separate, and Brand Kit is labelled singular.
3. Identify any gaps, contradictions, data-model constraints, security risks or usability improvements. Explain why each matters and separate recommendations from already-agreed requirements.
4. Recommend the simplest safe architecture for linking a strategy to a map without assuming mirroring or synchronization.
5. Propose any schema changes, migration, new API contract, permission changes, cross-app integration or dependency before implementing it. Do not silently modify live systems or spend money.
6. Preserve existing data and backward compatibility. Do not modify the original Funnel Mapper Pro repository or its protected infrastructure.
7. Add or update tests for strategy CRUD, permissions, organization isolation, unsaved changes and map-link access as appropriate to the existing test setup.
8. Report what it inspected, what it proposes to change, what it changed, tests run, remaining limitations and decisions requiring owner input.
9. Stop for owner approval before any consequential change that violates a locked rule or requires a decision not covered here.

## Open decisions for implementation planning

- Exact strategy editor technology and supported editing features: inspect existing stack before choosing.
- Exact strategy status model: verify current data model and recommend.
- Strategy-to-map identifier, deep-link behavior, and access checks: inspect current FMP implementation.
- Whether the optional template should be editable/reorderable based on the editor capabilities.
- Whether strategy records can be shared externally later: not part of this scope; Client Portal remains locked.
- Any migration or cross-app synchronization: not approved by this specification.

**Approval gate:** This file records the agreed requirements and proposed direction. It does not approve a new visual design, authorize implementation of unapproved UI, or authorize production/system changes.
