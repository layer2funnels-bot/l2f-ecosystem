# 08 · Asset and icon index

All paths are relative to `03_ASSETS/`. Icons are original prototype icons (custom set drawn for this project on a 24 px grid, 1.6 px stroke, round caps/joins, `currentColor`; not from a third-party library). Use the sprite (`<use href="#i-name">`) or the single SVGs.

## 1. Logos

| File | Format | Use |
|---|---|---|
| `logos/l2f-icon.png` | PNG | Layer2Funnels square icon: rail, launcher, org switcher, favicon (in a white tile, 12 % padding) |
| `logos/l2f-wordmark.png` | PNG | Layer2Funnels wordmark (sign-in, exports) |
| `logos/aurj-badge.png` | PNG | Aurj round badge (rail, launcher, switcher; circle) |
| `logos/aurj-cap.png` | PNG | Aurj cap mark |
| `logos/prototype-l2fIcon.png`, `prototype-aurjIcon.png`, `prototype-l2fWord.png`, `prototype-l2fWordDark.png` | PNG | Exact images embedded in the prototype (`logos.js`); `l2fWordDark` = white-text wordmark for dark backgrounds |

## 2. App icons

| App | Launcher plate (3D look reference) | Flat mark (rail, work screens — V8) | Plate colours | Glyph colour | Launcher description |
|---|---|---|---|---|---|
| Office (`office`) | `app-icons/office-launcher-plate.svg` | `app-icons/office-flat-mark.svg` | #454955, #1B1D23, #0A0B0D | #FFC633 | Home, plans, team and admin |
| Projects (`projects`) | `app-icons/projects-launcher-plate.svg` | `app-icons/projects-flat-mark.svg` | #6E98FF, #2B5CF0, #1A3BAE |  | Client and internal projects, end to end |
| Clients (`clients`) | `app-icons/clients-launcher-plate.svg` | `app-icons/clients-flat-mark.svg` | #FF9A7E, #EF5235, #A93220 |  | Pipeline, strategy and delivery |
| Drive (`drive`) | `app-icons/drive-launcher-plate.svg` | `app-icons/drive-flat-mark.svg` | #A898FF, #6B4FF0, #4729B5 |  | Files, SOPs and templates |
| Planner (`planner`) | `app-icons/planner-launcher-plate.svg` | `app-icons/planner-flat-mark.svg` | #D3F38A, #7FBF2A, #4F7F12 | #1E2A06 | Your week, in one view |
| Client Portal (`portal`) | `app-icons/portal-launcher-plate.svg` | `app-icons/portal-flat-mark.svg` | #5FDCCB, #13A592, #0A7064 |  | What your clients see and approve |
| Forms (`forms`) | `app-icons/forms-launcher-plate.svg` | `app-icons/forms-flat-mark.svg` | #FFBE6E, #F07C1A, #AE520A |  | Forms, quizzes, intake and answers |
| Value Ladder (`ladder`) | `app-icons/ladder-launcher-plate.svg` | `app-icons/ladder-flat-mark.svg` | #FFE58F, #EEBB12, #A07A00 | #2A1F00 | Offers from free to premium |
| Social Planner (`social`) | `app-icons/social-launcher-plate.svg` | `app-icons/social-flat-mark.svg` | #FF9CC8, #E9488F, #A82462 |  | Posts, carousels, schedule |
| Whiteboard (`whiteboard`) | `app-icons/whiteboard-launcher-plate.svg` | `app-icons/whiteboard-flat-mark.svg` | #FFFFFC, #E7E4DB, #ACA796 | #1B1D23 | Sketch ideas together |
| Funnel Mapper (`fmp`) | `app-icons/fmp-launcher-plate.svg` | `app-icons/fmp-flat-mark.svg` | #5CE6B2, #10B981, #087850 |  | Map, model and forecast |
| Tasks (`tasks`) | `app-icons/tasks-launcher-plate.svg` | `app-icons/tasks-flat-mark.svg` | #5EEAD4, #0EA5A4, #08706F |  | Lists, folders and mind maps for everyday to-dos |
| Layer 2 Agents (`agents`) | `app-icons/agents-launcher-plate.svg` | `app-icons/agents-flat-mark.svg` | #C3B0FF, #7E5BF2, #5030C0 |  | Meeting notes and an assistant that answers from your work |

The Launcher plates in the prototype are CSS (gradient + inner highlight + shadow, `.plate` in `base.css`); the SVG plates are faithful static exports for reference and favicons.

## 3. Fonts

| File | Family / weight | Use |
|---|---|---|
| `fonts/bricolage-grotesque-latin-500.woff2` | bricolage-grotesque-latin-500 | Launcher hero only |
| `fonts/bricolage-grotesque-latin-700.woff2` | bricolage-grotesque-latin-700 | Launcher hero only |
| `fonts/bricolage-grotesque-latin-800.woff2` | bricolage-grotesque-latin-800 | Launcher hero only |
| `fonts/geist-latin-400.woff2` | geist-latin-400 | All UI text |
| `fonts/geist-latin-500.woff2` | geist-latin-500 | All UI text |
| `fonts/geist-latin-600.woff2` | geist-latin-600 | All UI text |
| `fonts/geist-latin-700.woff2` | geist-latin-700 | All UI text |
| `fonts/geist-mono-latin-400.woff2` | geist-mono-latin-400 | Shortcuts, timers |
| `fonts/geist-mono-latin-500.woff2` | geist-mono-latin-500 | Shortcuts, timers |
| `fonts/noto-nastaliq-urdu-arabic-400.woff2` | noto-nastaliq-urdu-arabic-400 | Urdu text (dir=rtl) |
| `fonts/noto-nastaliq-urdu-arabic-700.woff2` | noto-nastaliq-urdu-arabic-700 | Urdu text (dir=rtl) |

Licences: Geist, Geist Mono, Bricolage Grotesque and Noto Nastaliq Urdu are under the SIL Open Font License 1.1 (same files as the repo `apps/web/fonts/`).

## 4. Icons (145)

| Icon | File | Used in prototype source |
|---|---|---|
| `office` | `icons/svg/office.svg` | avatar5, core5, core6, funnels5, head, misc6 |
| `projects` | `icons/svg/projects.svg` | core5, core6, head, misc6, more5, office5 |
| `clients` | `icons/svg/clients.svg` | clients6, core5, core6, fmp6, head, misc6 |
| `portal` | `icons/svg/portal.svg` | clients6, core5, head, misc6, more5, office5 |
| `drive` | `icons/svg/drive.svg` | core5, core6, drive5, drive6, head, misc6 |
| `planner` | `icons/svg/planner.svg` | core5, core6, head, misc6, more5, office5 |
| `forms` | `icons/svg/forms.svg` | clients6, core5, drive5, drive6, head, misc6 |
| `ladder` | `icons/svg/ladder.svg` | clients6, core5, head, misc6, more5, office6 |
| `social` | `icons/svg/social.svg` | clients6, core5, head, misc6, more5, office5 |
| `whiteboard` | `icons/svg/whiteboard.svg` | clients6, core5, head, misc6, more5, office6 |
| `agents` | `icons/svg/agents.svg` | core5, head, misc6, more5, office5, office6 |
| `fmp` | `icons/svg/fmp.svg` | core5, core6, fmp6, funnels5, head, misc6 |
| `search` | `icons/svg/search.svg` | clients6, core5, core6, drive6, fmp6, more5 |
| `bell` | `icons/svg/bell.svg` | core5, projects5, projects6, reuse |
| `grid` | `icons/svg/grid.svg` | clients6, core5, drive5, drive6, fmp6, misc6 |
| `home` | `icons/svg/home.svg` | drive5, drive6, fmp6, misc6, more5, office5 |
| `check` | `icons/svg/check.svg` | avatar5, clients6, core5, core6, drive5, drive6 |
| `plus` | `icons/svg/plus.svg` | avatar5, clients6, core5, drive5, drive6, fmp6 |
| `upload` | `icons/svg/upload.svg` | clients6, drive5, drive6, funnels5, more5, office6 |
| `down` | `icons/svg/down.svg` | core5, drive6, fmp6, office5, office6, planner6 |
| `right` | `icons/svg/right.svg` | clients6, core5, drive5, drive6, fmp6, misc6 |
| `star` | `icons/svg/star.svg` | avatar5, drive5, drive6, misc6, planner6, projects5 |
| `lock` | `icons/svg/lock.svg` | clients6, core5, drive5, drive6, funnels5, misc6 |
| `clock` | `icons/svg/clock.svg` | drive5, drive6, projects6, reuse |
| `list` | `icons/svg/list.svg` | clients6, drive5, drive6, planner6, projects5, projects6 |
| `tiles` | `icons/svg/tiles.svg` | clients6, drive5, planner6, projects6, reuse |
| `more` | `icons/svg/more.svg` | clients6, core5, drive6, office6, planner6, projects5 |
| `sun` | `icons/svg/sun.svg` | core5, core6, reuse, tasks5, tasks6 |
| `moon` | `icons/svg/moon.svg` | core5, core6, reuse |
| `x` | `icons/svg/x.svg` | avatar5, clients6, core5, drive5, drive6, fmp6 |
| `arrow` | `icons/svg/arrow.svg` | clients6, drive6, misc6, office5, projects5, projects6 |
| `doc` | `icons/svg/doc.svg` | clients6, core5, drive5, drive6, office5, office6 |
| `folder` | `icons/svg/folder.svg` | clients6, drive5, drive6, misc6, office6, portal |
| `filter` | `icons/svg/filter.svg` | avatar5, drive5, drive6, office6, planner6, reuse |
| `share` | `icons/svg/share.svg` | clients6, core5, drive5, drive6, fmp6, misc6 |
| `download` | `icons/svg/download.svg` | avatar5, drive5, drive6, fmp6, misc6, planner6 |
| `trash` | `icons/svg/trash.svg` | clients6, drive5, drive6, fmp6, misc6, more5 |
| `move` | `icons/svg/move.svg` | drive5, drive6, misc6, planner6, projects6, reuse |
| `eye` | `icons/svg/eye.svg` | clients6, drive5, office5, office6, portal, reuse |
| `msg` | `icons/svg/msg.svg` | drive5, drive6, fmp6, misc6, portal, projects5 |
| `alert` | `icons/svg/alert.svg` | avatar5, fmp6, more5, office5, planner6, projects5 |
| `info` | `icons/svg/info.svg` | clients6, core5, drive5, drive6, fmp6, more5 |
| `xcircle` | `icons/svg/xcircle.svg` | avatar5, reuse |
| `wifi` | `icons/svg/wifi.svg` | reuse |
| `shield` | `icons/svg/shield.svg` | avatar5, more5, office5, office6, reuse |
| `team` | `icons/svg/team.svg` | drive5, drive6, fmp6, office5, office6, reuse |
| `apps` | `icons/svg/apps.svg` | office5, reuse |
| `mail` | `icons/svg/mail.svg` | office5, reuse, studio5 |
| `google` | `icons/svg/google.svg` | core6, reuse |
| `logout` | `icons/svg/logout.svg` | core5, reuse |
| `refresh` | `icons/svg/refresh.svg` | fmp6, office6, projects5, projects6, reuse |
| `clip` | `icons/svg/clip.svg` | portal, projects5, reuse |
| `funnels` | `icons/svg/funnels.svg` | avatar5, fmp6, more5, office5 |
| `bold` | `icons/svg/bold.svg` | drive5, drive6, funnels5, office6 |
| `italic` | `icons/svg/italic.svg` | drive5, drive6, funnels5, office6 |
| `under` | `icons/svg/under.svg` | drive5, drive6, funnels5 |
| `h1` | `icons/svg/h1.svg` | studio5 |
| `link` | `icons/svg/link.svg` | drive5, drive6, funnels5, office6, planner6, projects5 |
| `ul` | `icons/svg/ul.svg` | drive5, drive6, funnels5, office6 |
| `crop` | `icons/svg/crop.svg` | drive5, drive6 |
| `rotate` | `icons/svg/rotate.svg` | drive5, drive6 |
| `text` | `icons/svg/text.svg` | core5, drive5, drive6, misc6, office6, projects6 |
| `pen` | `icons/svg/pen.svg` | drive5, drive6, misc6, studio5 |
| `sticky` | `icons/svg/sticky.svg` | misc6, studio5 |
| `shape` | `icons/svg/shape.svg` | drive5, drive6, misc6, studio5 |
| `frame` | `icons/svg/frame.svg` | drive6, studio5 |
| `hand` | `icons/svg/hand.svg` | misc6, studio5 |
| `cursor` | `icons/svg/cursor.svg` | drive5, drive6, misc6, studio5 |
| `undo` | `icons/svg/undo.svg` | drive5, drive6, fmp6, funnels5, misc6, studio5 |
| `redo` | `icons/svg/redo.svg` | drive5, drive6, fmp6, funnels5, misc6, studio5 |
| `zin` | `icons/svg/zin.svg` | misc6, planner6, studio5, v7 |
| `zout` | `icons/svg/zout.svg` | misc6, planner6, studio5, v7 |
| `play` | `icons/svg/play.svg` | drive5, drive6, fmp6, misc6, more5, projects5 |
| `pause` | `icons/svg/pause.svg` | drive6, projects5, projects6, tasks6 |
| `timer` | `icons/svg/timer.svg` | projects5, projects6, tasks6 |
| `cal` | `icons/svg/cal.svg` | drive5, planner6, projects5, projects6, studio5, tasks5 |
| `board` | `icons/svg/board.svg` | clients6, misc6, planner6, projects5, projects6, studio5 |
| `gantt` | `icons/svg/gantt.svg` | drive6, misc6, projects5, projects6, studio5 |
| `table` | `icons/svg/table.svg` | clients6, drive6, office6, projects5, tasks5 |
| `chart` | `icons/svg/chart.svg` | drive5, drive6, fmp6, planner6, projects5, projects6 |
| `plug` | `icons/svg/plug.svg` | studio5 |
| `archive` | `icons/svg/archive.svg` | clients6, core5, planner6, projects5, projects6, tasks5 |
| `restore` | `icons/svg/restore.svg` | drive5, drive6, projects5 |
| `pin` | `icons/svg/pin.svg` | sprite only |
| `tag` | `icons/svg/tag.svg` | projects5, projects6 |
| `flag` | `icons/svg/flag.svg` | pdata5, projects5, projects6, studio5, tasks5, tasks6 |
| `user` | `icons/svg/user.svg` | avatar5, core5, drive5, office6, projects5, projects6 |
| `hist` | `icons/svg/hist.svg` | avatar5, drive5, drive6, fmp6, office5, office6 |
| `globe` | `icons/svg/globe.svg` | avatar5, core5, core6, projects6 |
| `rain` | `icons/svg/rain.svg` | core5 |
| `cloud` | `icons/svg/cloud.svg` | core5 |
| `snow` | `icons/svg/snow.svg` | core5 |
| `heat` | `icons/svg/heat.svg` | core5 |
| `note` | `icons/svg/note.svg` | drive6, fmp6, portal, studio5 |
| `target` | `icons/svg/target.svg` | avatar5, fmp6, misc6, planner6, studio5 |
| `layers` | `icons/svg/layers.svg` | clients6, core5, drive5, drive6, fmp6, planner6 |
| `edit` | `icons/svg/edit.svg` | avatar5, drive5, drive6, misc6, more5, office5 |
| `copy` | `icons/svg/copy.svg` | avatar5, drive6, fmp6, misc6, more5, office5 |
| `send` | `icons/svg/send.svg` | drive5, more5, portal, projects5, projects6, studio5 |
| `heart` | `icons/svg/heart.svg` | avatar5, portal |
| `rocket` | `icons/svg/rocket.svg` | sprite only |
| `star2` | `icons/svg/star2.svg` | sprite only |
| `map` | `icons/svg/map.svg` | fmp6, funnels5, more5, office5, planner6, v7 |
| `phone` | `icons/svg/phone.svg` | studio5 |
| `desk` | `icons/svg/desk.svg` | core6, studio5 |
| `sliders` | `icons/svg/sliders.svg` | core5, drive5, drive6, office6, planner6, projects5 |
| `fplus` | `icons/svg/fplus.svg` | clients6, drive5, misc6, projects6 |
| `inbox` | `icons/svg/inbox.svg` | clients6, portal, studio5, tasks5, tasks6 |
| `dash` | `icons/svg/dash.svg` | projects5, projects6 |
| `mywork` | `icons/svg/mywork.svg` | planner6, projects5, projects6, studio5 |
| `sop` | `icons/svg/sop.svg` | clients6, drive5, office5, office6 |
| `tool` | `icons/svg/tool.svg` | clients6 |
| `gear` | `icons/svg/gear.svg` | clients6, core5, fmp6, more5 |
| `ladder2` | `icons/svg/ladder2.svg` | projects6, studio5 |
| `smile` | `icons/svg/smile.svg` | sprite only |
| `avatar` | `icons/svg/avatar.svg` | clients6, funnels5, office5, office6 |
| `offer` | `icons/svg/offer.svg` | clients6, funnels5, office5, studio5 |
| `story` | `icons/svg/story.svg` | funnels5, office5 |
| `brand` | `icons/svg/brand.svg` | clients6, drive5, drive6, funnels5, office5, office6 |
| `strategy` | `icons/svg/strategy.svg` | clients6, office5 |
| `sheetI` | `icons/svg/sheetI.svg` | drive5, drive6, projects5, projects6, v7 |
| `slideI` | `icons/svg/slideI.svg` | drive5, drive6, v7 |
| `imgI` | `icons/svg/imgI.svg` | core6, drive5, drive6, fmp6, misc6, office5 |
| `tasks` | `icons/svg/tasks.svg` | core5, core6, head, misc6, more5, office5 |
| `mic` | `icons/svg/mic.svg` | core5, drive6, more5, projects5 |
| `wave` | `icons/svg/wave.svg` | more5 |
| `pdfI` | `icons/svg/pdfI.svg` | drive5, drive6, projects6, v7 |
| `mindmap` | `icons/svg/mindmap.svg` | projects5, tasks5 |
| `folderO` | `icons/svg/folderO.svg` | clients6, projects6 |
| `sparkle` | `icons/svg/sparkle.svg` | fmp6, more5, office5, projects5 |
| `eye2` | `icons/svg/eye2.svg` | drive5, drive6, planner6, projects6 |
| `key` | `icons/svg/key.svg` | core6, drive5, drive6, planner6 |
| `users` | `icons/svg/users.svg` | projects5, projects6, tasks5, tasks6 |
| `dollar` | `icons/svg/dollar.svg` | avatar5, projects6 |
| `db` | `icons/svg/db.svg` | drive5, office5 |
| `zoom` | `icons/svg/zoom.svg` | more5, projects6, reuse |
| `quote` | `icons/svg/quote.svg` | office6 |
| `compass` | `icons/svg/compass.svg` | avatar5, planner6 |
| `megaphone` | `icons/svg/megaphone.svg` | avatar5, clients6 |
| `kbd` | `icons/svg/kbd.svg` | drive6, fmp6, projects6 |
| `taskplus` | `icons/svg/taskplus.svg` | projects6 |
| `grip` | `icons/svg/grip.svg` | clients6, office6, projects6, tasks6 |
| `expand` | `icons/svg/expand.svg` | drive6, projects6 |
| `globe2` | `icons/svg/globe2.svg` | sprite only |
| `building` | `icons/svg/building.svg` | projects6 |

## 5. Other visual resources

- Avatar 3D figures, Launcher sky and weather, empty-state illustrations and file thumbnails are drawn in code (SVG/CSS) in `prototype-source/` (`avatar5.js` `figure()`, `base.css` `.thumb`, launcher in `core5.js`). No raster illustrations are used.
- Screenshots: `06_SCREENSHOTS_AND_REFERENCES/`.
- Design tokens: `02_DESIGN_SYSTEM/`.
