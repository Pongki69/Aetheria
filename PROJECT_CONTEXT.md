# AI Agent Office — Project Context

## Product and layout

AI Agent Office is a browser-based, dark sci-fi themed 3D office and social/profile prototype. The repository root contains the Vite frontend in `ai-office-ui/` and a small Express/WebSocket server in `backend/`. `start-dev.bat` starts both development servers.

## Stack and commands

- Frontend: React 19, TypeScript 6, Vite 8, React Three Fiber 9, Three.js 0.186, `@react-three/drei`, Dexie 4 (IndexedDB), Zustand 5, Lucide icons. Phaser 4 and EasyStar are also dependencies, used by a separate grid-scene prototype.
- Backend: Node, Express 5, `ws`, `tsx`; CommonJS package.
- Frontend commands (run from `ai-office-ui/`): `npm run dev`, `npm run build` (TypeScript project build then Vite production build), `npm run lint`, `npm run preview`.
- Backend command (run from `backend/`): `npm run dev` (`tsx watch server.ts`).
- `ai-office-ui/.env.example` contains `VITE_GOOGLE_CLIENT_ID`. The frontend AI service currently has API-key fallbacks embedded in source; move credentials to server-side environment configuration and rotate any real keys before production.

## Architecture and important paths

- `ai-office-ui/src/App.tsx`: Main application, state orchestration, primary R3F Canvas, keyboard controls, plane/world settings, decor and agent drag/move, and import dialogs. Many view styles are inline.
- `ai-office-ui/src/components/Agent3D.tsx`: Agent model rendering, autonomous waypoint movement, decor avoidance, dragging, POV walking/jumping/collision and camera look.
- `ai-office-ui/src/components/CharacterModel.tsx`: GLTF scene cloning, mesh/material handling, animation selection/playback.
- `ai-office-ui/src/components/Decor3D.tsx`: Separate decor-rendering component; verify whether a requested change belongs to it or the active `Furniture3D` implementation in `App.tsx`.
- `ai-office-ui/src/components/KeyboardCameraControls.tsx`: Standalone camera keyboard-control component.
- `ai-office-ui/src/components/UserProfilePanel.tsx`: Editable profile, avatar/cover crop and albums, UID visibility, friends/requests/blocks, and profile navigation.
- `ai-office-ui/src/components/CommunityPanel.tsx`: Community feed, groups, posts, comments and sharing; local friend invites.
- `ai-office-ui/src/components/PlayerMessengerModal.tsx`: Player chat UI and temporary randomized player shortlist.
- `ai-office-ui/src/components/AdminDashboardModal.tsx`: Admin session/user controls, IP bans and deleted-message archive.
- `ai-office-ui/src/components/ConfirmModal.tsx`: Promise-based styled confirm dialog.
- `ai-office-ui/src/components/AuthModal.tsx`: Login/registration UI and avatar placeholder helpers.
- `ai-office-ui/src/components/AgentInspector.tsx`, `ChatDrawer.tsx`, `OfficeCanvas.tsx`, `ai-office-ui/src/game/OfficeScene.ts`, and `ai-office-ui/src/store/useAgentStore.ts`: additional/alternate agent and Phaser office implementations; these are not the main scene rendered directly by `App.tsx` unless wired in later.
- `ai-office-ui/src/services/aiService.ts`: Gemini/Groq API calls and model selection for the alternate AI chat path.
- `ai-office-ui/src/db/database.ts`: Dexie schema and migrations (currently through version 8). User-related tables are mostly local IndexedDB. Keep schema changes additive and add a new Dexie version for index/table changes.
- `ai-office-ui/src/types.ts`: Shared profile, agent, social, community and world types.
- `ai-office-ui/src/index.css`: Global theme, responsive breakpoints, scrollbar/cursor styling and modal layout.
- `backend/server.ts`: In-memory sample agent REST endpoints and WebSocket broadcasts; not connected as the persistence/auth backend for the main frontend.

## Implemented behavior

- Authentication/profile records and application data are primarily browser-local. Google OAuth is optional/configured by the frontend environment. Profiles support name/signature/avatar/wallpaper, UID discoverability/display preferences, image albums, local friend requests/accept/cancel/block, and community tabs.
- Local community includes public feed and named groups, joining, friend invites, posts, comments and sharing.
- Agent roster supports GLB/GLTF model import, role/instructions/persona, scale, animation clip choice, terminate/reactivate/delete, local chat/history and admin actions. Main app agent replies are currently a local template/status-response behavior; AI-backed `AgentInspector` uses the separate service.
- Main scene is Three.js through React Three Fiber. Agents wander within bounded plane coordinates and avoid furniture using approximate circular obstacle radii. POV supports WASD, mouse-look, jump with Space, collision against plane bounds/decor, P enter/exit, E edit toggle, F5 fullscreen, and Home/Back to Spawn. World settings include plane origin, render distance and an interior visibility box.
- Decor supports GLB/GLTF upload, category, scale, grouping under a named collection/folder, sorting, collapse/expand, multi-select, move, rotate/tilt, copy/paste, delete, selection outlines, and height adjustment while dragging (Space up, Shift down). Matching furniture imported together can share a collection name; **Select set** selects all its pieces.
- Profile, community, world settings, player chat and donation/admin UI have responsive layouts. Message attachments in agent chat have a 25 MB limit; deleted agent chat messages are copied to the local admin archive.
- Browser-local player messaging stores messages in Dexie and shows a random selection from users in that browser. The “online” list is explicitly a local preview, not real presence.

## Current limitations / 3D movement notes

- Furniture drag uses a raycast against the horizontal world plane at Y=0 and applies X/Z deltas to selected objects. Its collision prevention uses coarse footprint/radius checks; if any selected piece would overlap another item, the move can be rejected. This does not account for arbitrary mesh shape or rotation precisely.
- Agent drag uses a separate raycast plane at Y=1.2 and eases the model toward the pointer; POV uses a separate first-person movement path. Avoid changing axis conventions globally: inspect `Agent3D.tsx` and `App.tsx` movement handlers together.
- Imported GLTF scenes can have unusual pivots, scale, off-center geometry, or large bounds; `Furniture3D` clones and floor-centers the scene, while character setup has its own mesh filtering and animation logic. These transformations can make visual bounds, selection boxes, obstacle radii, drag height, and perceived placement disagree, causing clipping/offsets. When fixing movement, check model root transforms and derive collision/selection bounds from the normalized/scaled model instead of assuming all assets share one origin/shape.
- POV decor collision is approximate and only uses furniture-derived circular radii; it is not a physics engine. Dragging decor does not perform detailed geometry collision.
- `backend/server.ts` stores agents in a process array only. It currently has no user auth, durable database, plane rooms, chat routing, or configured player cap. Frontend local player chat is not global/cross-device. Do not describe either as production multiplayer.
- Multiple planes/plane slots, shared scene persistence, real presence and server-authoritative multiplayer remain unimplemented.

## Roadmap (requested; not yet implemented as full systems)

- **Agent commands and work:** real command/task execution, durable task state, status/progress, and AI-backed responses integrated with the main roster.
- **Gamification/economy:** progression, rewards, tasks and currency; no currency balance/ledger or reward loop exists yet.
- **Multiplayer and planes:** server-backed player discovery/presence/chat, shared plane rooms (target capacity previously discussed: five), avatars exploring together, isolated/user-owned planes, additional plane slots, and robust scene persistence/permissions.
- **Profiles/social:** continue evolving public profiles and privacy-aware UID discovery; current directory/friends/groups are local-only.
- **Admin:** centralized model library and task assignment/management beyond current local session/user/IP controls and per-agent controls.
- **Mini-games:** Phaser prototype exists, but no integrated player-facing mini-game or reward/currency connection is complete.

## Conventions for future work

- Treat the R3F scene in `App.tsx` as the live implementation unless call sites prove otherwise; similarly named standalone components may be prototypes/legacy paths.
- Keep local records scoped to the signed-in user (`ownerId`/`userId`) and avoid leaking IP/UID details into public UI. A server migration needs authentication and authorization rather than trusting client-supplied owner IDs.
- Preserve keyboard behaviors: E edit, P POV, F5 fullscreen, Home spawn, Ctrl/Cmd multi-select and copy/paste decor, Ctrl+R rotate, Space raise/jump depending on whether decor is being dragged or a character is in POV, Shift lowers only during decor drag.
- Prefer existing dark navy/cyan styling, Lucide icons, accessible labels, compact controls, and responsive CSS in `index.css`. Existing UI often uses inline React styles.
- Distinguish shippable server-backed behavior from local preview/prototype behavior in labels and documentation.
