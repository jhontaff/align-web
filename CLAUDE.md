# CLAUDE.md

# Align Web

Align Web is the Angular frontend for **Align**, a personal productivity platform (Tasks, Finance, and a chat-based AI agent, with more domains planned). This repo is standalone — it consumes the Align backend (a separate Spring Boot repo) purely over HTTP. There is no shared code, no monorepo, no direct filesystem access between the two repos.

Same learning goal as the backend: understanding architecture over shipping features fast. Incremental development, YAGNI, no premature abstractions.

---

# Your role

Act primarily as a **Software Architect and mentor**, not as an implementation engine — same stance as the backend session.

Your responsibilities:

- Explain architectural decisions (why this layer, why not another).
- Challenge assumptions before they become code.
- Compare alternatives and trade-offs.
- Review code critically — don't assume it's correct just because it's there.
- Help preserve consistency as the app grows.

Do **not** implement complete features unless explicitly requested. Prefer guiding step by step so the developer remains the primary implementer. Learning has priority over code generation.

Preferred workflow for non-trivial work: understand the requirement → discuss architecture → define responsibilities/contracts → explain trade-offs → suggest an implementation order → wait for implementation unless code is explicitly requested.

---

# Development philosophy

Follow YAGNI. Avoid premature abstractions (no state management library, no interface-behind-every-service, until there's a real reason). Prefer evolving an existing pattern over introducing a new one. Consistency across the app matters more than a locally "perfect" solution.

Angular specifics for this project: standalone components (no NgModules — Angular CLI 20 default), routing enabled, Zone.js (not zoneless — deferred, see below), no SSR (Align is an internal, authenticated personal tool; no SEO/crawler need), **PWA (installable shell)** via `@angular/pwa`.

---

# Backend contract

The backend is a separate repo (`align`, Spring Boot 3.5 / Java 21). Everything below reflects its state as of when this file was written — **when in doubt about an exact field name or endpoint, check the live OpenAPI spec** at `http://localhost:1010/v3/api-docs` (or Swagger UI at `/swagger-ui.html`) while the backend is running; it's the authoritative, current source, this file is a snapshot that can drift.

## Auth

- `POST /auth/register` — body `{ email, password, firstName, lastName }` (password min 8 chars) → `ApiResponse<AuthResponse>`.
- `POST /auth/login` — body `{ email, password }` → `ApiResponse<AuthResponse>`.
- `GET /auth/me` — requires auth → `ApiResponse<UserResponse>`. Use this to validate a stored token and hydrate the current user on app bootstrap.
- `AuthResponse` = `{ accessToken, tokenType: "Bearer", expiresAt }`.
- `UserResponse` = `{ id, email, firstName, lastName, role }` (`role`: `USER` | `ADMIN`).
- **No refresh token.** `jwt.expiration=24h` on the backend, single access token, no `/auth/refresh` endpoint. When it expires, the only path forward is logging in again — don't build silent-refresh logic, the backend doesn't support it.
- **Logout is client-side only.** The JWT is stateless (no server-side session/blacklist); "logging out" means deleting the local token, not invalidating it server-side.
- Every route except `/auth/**`, `/swagger-ui/**`, `/v3/api-docs/**` requires `Authorization: Bearer <token>`.

## The `ApiResponse<T>` envelope — and its exceptions

Every REST endpoint wraps its body: `{ timestamp, status, success, message, data, errors }`. The actual resource is in `.data`.

**Exception**: `AgentController` as a whole returns its DTOs directly, unwrapped — both `POST /api/agent/chat` (`AgentResponse`, `{ reply }`) and `GET /api/agent/history` (`ChatHistoryResponse`, `{ turns }`). This is a backend inconsistency scoped to the whole controller, not just `/chat`, and not something to work around per-URL on the frontend — see [Frontend architecture decisions](#frontend-architecture-decisions) for how the unwrap interceptor handles both shapes with one generic check.

## Error shapes — two different paths, don't conflate them

- **Business/validation errors** (404, bad input, bad credentials, etc.) go through the backend's global exception handler and **always** come back as `ApiResponse.error(status, message, errors)` — `data: null`, readable `message`, sometimes an `errors` map (field → message, from validation).
- **401/403 from a missing or invalid JWT do NOT follow that shape.** They're produced by Spring Security's filter chain before the request reaches a controller — there's no custom `AuthenticationEntryPoint` on the backend, so the body is whatever Spring Security's default is, not `ApiResponse`. **Branch on HTTP status code for auth failures, never on `error.error.message`.**

## Task (`/api/tasks`)

- `POST /api/tasks` — `TaskRequest` → `201` + `TaskResponse`
- `GET /api/tasks/{id}` → `TaskResponse`
- `GET /api/tasks?status=` (optional) + standard `page`/`size`/`sort` params → `Page<TaskResponse>`
- `PUT /api/tasks/{id}` — `TaskUpdateRequest` → `TaskResponse`
- `DELETE /api/tasks/{id}` → `204`/`200`, no body data
- `TaskRequest` = `{ title, description?, priority, dueDate?, dueTime? }`
- `TaskUpdateRequest` = `{ title, description?, status, priority, dueDate?, dueTime? }` (full replace, not a patch — send every field)
- `TaskResponse` = `{ id, title, description, status, priority, dueDate, dueTime, createdAt, updatedAt }`
- `status`: `PENDING` | `IN_PROGRESS` | `COMPLETED`. `priority`: `LOW` | `MEDIUM` | `HIGH`.

## Finance (`/api/transactions`)

- `POST /api/transactions` — `TransactionRequest` → `201` + `TransactionResponse`
- `GET /api/transactions/{id}` → `TransactionResponse`
- `GET /api/transactions` — filter params `type?`, `category?`, `from?`, `to?` (all optional, bound as a flat query-param object) + pagination → `Page<TransactionResponse>`
- `PUT /api/transactions/{id}` — `TransactionUpdateRequest` → `TransactionResponse`
- `DELETE /api/transactions/{id}` → no body data
- `GET /api/transactions/summary` — same filter params as the list endpoint, no pagination → `FinancialSummaryResponse`
- `TransactionRequest` / `TransactionUpdateRequest` = `{ amount, category, description?, date? }` — **no `type` field**, it's derived server-side from `category`. Don't add a type selector to any transaction form; category alone determines income vs. expense.
- `TransactionResponse` = `{ id, type, amount, category, description, date, createdAt, updatedAt }`
- `FinancialSummaryResponse` = `{ totalIncome, totalExpense, balance }`
- `type`: `INCOME` | `EXPENSE`. `category`: `FOOD`, `TRANSPORT`, `HOUSING`, `HEALTH`, `ENTERTAINMENT`, `EDUCATION`, `SHOPPING`, `UTILITIES`, `OTHER_EXPENSE` (all `EXPENSE`); `SALARY`, `FREELANCE`, `INVESTMENT`, `GIFT`, `OTHER_INCOME` (all `INCOME`).

## Chat agent (`/api/agent`)

- `POST /api/agent/chat` — body `{ message: string }` → **unwrapped** `{ reply: string }` (see the `ApiResponse` exception above).
- `GET /api/agent/history` — no body/params → **unwrapped** `ChatHistoryResponse` = `{ turns: ChatTurn[] }`, `ChatTurn` = `{ role: "user" | "assistant", content: string }`. Added on the backend 2026-08-19 specifically so the frontend can restore the conversation on load. Call it once when the chat panel mounts, not after every message — it returns the **entire** persisted history each time (no pagination, no `since`/cursor param), so re-polling it on every turn would be wasteful and pointless when the panel already has the latest messages in memory.
- Synchronous request/response — no streaming (no SSE/WebSocket). The UI should show a loading state while waiting, not attempt a token-by-token "typing" effect; that would require backend changes that don't exist yet.
- One conversation per user, persisted server-side, no session/thread concept.

## CORS

The backend has **no CORS configuration** (no `.cors(...)` in `SecurityFilterChain`, no `CorsConfigurationSource` bean). A production deploy will need that fixed on the backend side. For local dev, this repo works around it with `proxy.conf.json` (see below) instead of touching the backend.

---

# Frontend architecture decisions

Decisions already made in discussion with the backend session, before any frontend code was written — treat these as settled unless a real need to revisit shows up:

- **Token storage: `localStorage`.** Chosen over `sessionStorage` or in-memory-only because the token lives 24h and this is a daily-use personal app — persisting across browser restarts matters more than shrinking the XSS exposure window, for a single-user learning project.
- **Chat is a persistent floating panel**, not a routed page. It mounts in the app shell (sibling to `<router-outlet>`, e.g. in the root component), never inside a route component — otherwise Angular would destroy/recreate it on every navigation and it'd lose its in-memory message list.
- **Two interceptors, one pure utility — not three interceptors.** This was a deliberate SRP fix during design:
  - `unwrapInterceptor` — pure response transform, no injected dependencies, no side effects. Checks for the **full `ApiResponse` shape** (`success`, `status`, `timestamp`, `data` all present), not just "does `data` exist" — a weaker check risks misfiring on a future DTO that happens to have its own `data` field. If the shape doesn't match (e.g. `AgentResponse`), it passes the body through unchanged — this is what makes the `/api/agent/chat` exception work with zero URL-specific branching.
  - `authInterceptor` — on a 401, clears the stored token and redirects to `/login`. This is legitimately a global interceptor (not a utility) because there's exactly one correct behavior for every caller, everywhere — unlike generic error display, which is caller-dependent.
  - `extractErrorMessage(err: HttpErrorResponse): string` — a plain function, not an interceptor. Normalizes `.error.message`/`.error.errors` (when present, per the `ApiResponse.error` shape) into something displayable. Deliberately has no side effects and doesn't decide presentation (toast vs. inline field error vs. silent) — that decision belongs to whichever service/component calls it inside its own `catchError`, since only the caller knows whether a given failure should interrupt the user or fail quietly.
- **Conversation history now has a backend endpoint** (`GET /api/agent/history`, added 2026-08-19) — this reverses the earlier "deferred, chat resets on every load" decision that used to be recorded here. When the chat panel gets built, call it once on mount to hydrate the message list, then let the panel keep messages in its own in-memory state for the rest of the session — same "service stateless, component owns state" default as the rest of the app (see [Service pattern](#service-pattern--stateless-is-the-default)). Don't call it again after every message; only the initial load needs it.
- **CORS handled via `proxy.conf.json` in dev**, not backend changes — see below.
- **PWA scope: installable shell only, not offline-first data.** `ng add @angular/pwa` gives an installable app (manifest, icons) and caches static assets (JS/CSS/`index.html`) via the Angular Service Worker. `ngsw-config.json` deliberately has **no `dataGroups`** for `/api/**` or `/auth/**` — those routes always hit the network, never the Service Worker cache. Tasks/Finance data being available offline (IndexedDB, mutation queue, sync/conflict resolution) is a much larger scope that was explicitly deferred — the backend isn't designed for it today, and there's no real need yet. Revisit only if offline usage becomes an actual requirement, not preemptively.
- **No `environment.ts` for the API base URL — relative paths (`/api`, `/auth`) everywhere.** `proxy.conf.json` already resolves these in dev. The plan for a real deployment is to keep the frontend behind a reverse proxy that forwards the same `/api`/`/auth` paths to the backend, so relative paths keep working unchanged across dev and prod and the CORS gap above stays irrelevant. Only introduce `environment.ts` (via `ng generate environments`) if frontend and backend ever end up on genuinely different origins without a shared reverse proxy — don't add it preemptively.
- **Voice input is client-only (Web Speech API), not a backend feature.** `POST /api/agent/chat` stays a plain text endpoint — the mic button in the chat panel just fills the existing message input via the browser's `SpeechRecognition`, the user reviews/edits before hitting Enviar, same flow as typing. No audio ever leaves the browser, no STT/TTS on the backend. Chosen because it needs zero backend changes and covers the common case (Chrome/Edge); `SpeechRecognition` isn't supported in Firefox and is spotty in Safari, so `features/chat/speech-recognition.ts` feature-detects and the mic button hides itself entirely when unsupported, rather than rendering broken. Revisit only if backend-side transcription or spoken replies (TTS) become a real requirement, not preemptively.

---

# Frontend conventions & standards

Patterns established across the app shell, Auth, and Tasks — treat these as the baseline for any new feature (Finance next, then Chat), not just documentation of what already exists. Consistency across features matters more than a locally "nicer" solution — see [Development philosophy](#development-philosophy).

## Naming

- **Components**: kebab-case filename, no type suffix (`login.ts`, `home.ts`, `task-list.ts`) — class name is the PascalCase equivalent (`Login`, `Home`, `TaskList`). Selector is `app-<kebab-name>`.
- **Services**: `<name>.service.ts`, class `<Name>Service`, `@Injectable({ providedIn: 'root' })`.
- **Guards**: `<name>.guard.ts`, camelCase `CanActivateFn` (`authGuard`).
- **Interceptors**: `<name>.interceptor.ts` going forward (`auth.interceptor.ts`). `unwrap-interceptor.ts` predates this convention — not worth renaming just to match, but new interceptors should use the dot form.
- **Models**: `<name>.model.ts`, PascalCase interface/type.
- **Plain utility modules** (no DI, just exported functions): kebab-case, no suffix (`token-storage.ts`, `extract-error-message.ts`, `speech-recognition.ts`).

## Folder placement — `core/` vs `features/`

- `core/` is for things needed **outside a single feature**: auth state/guard/token storage, interceptors, HTTP utilities, and models shared by 2+ features (`ApiResponse<T>`, `Page<T>`). If only one feature touches it, it does not belong in `core/`.
- `features/<name>/` is self-contained: its own `models/` subfolder for feature-specific DTOs, a service at the feature root, and one subfolder per screen (`task-list/`, `task-form/`). Nothing inside a feature folder should be imported by another feature — if that need shows up, the shared piece moves to `core/`, it doesn't get imported cross-feature.

## Component pattern

- Standalone, explicit `imports: [...]` array, split `.ts`/`.html`. Only add a `.scss` file when there are actual styles to put in it — an empty one just to match the shape is noise (see `home.ts`, which has no `styleUrl` at all).
- Anything the template reads reactively is a `signal()`, exposed `protected readonly`.
- Forms: `FormBuilder.nonNullable.group()` + `Validators`, guard `onSubmit()` with `if (form.invalid) { form.markAllAsTouched(); return; }`, track `submitting`/`errorMessage` signals, and on error call `extractErrorMessage(err)` — never hand-parse `err.error.message` inline (see `login.ts`/`register.ts`/`task-form.ts`). Exception: a single free-text field with no validation rules (the chat message box) uses plain `[(ngModel)]`/`FormsModule` instead — spinning up a `FormGroup` for one unvalidated field would be the premature abstraction [Development philosophy](#development-philosophy) warns against.

## Visual design system

- Global tokens and reusable primitives live in `src/styles.scss` — CSS custom properties (`--color-*`, `--radius`, `--shadow`, `--font-sans`) plus shared classes: `.card`/`.card--wide`, `.field`, `.btn`/`.btn-primary`/`.btn-ghost`/`.btn-block`, `.badge`, `.page`/`.page-header`, `.empty-state`, `.form-error`, `.form-footer`, `.auth-shell`. New screens should compose these instead of writing bespoke CSS for cards, buttons, or form fields — component-level `.scss` is for genuinely component-specific layout only (`task-list.scss`'s `.task-item*`/`.badge--*` color variants, `chat-widget.scss`'s fixed-position bubble/panel).
- Palette: neutral/clean — off-white background (`--color-bg: #fafafa`), near-black text, single indigo accent (`--color-accent: #4f46e5`). Picked 2026-08-20 over warmer/dark alternatives for being the safest to keep consistent as more features (Finance) get added.
- `public/manifest.webmanifest`'s `theme_color`/`background_color` and `index.html`'s `<meta name="theme-color">` are kept in sync with `--color-accent`/`--color-bg` — update both together if the palette ever changes. The icon PNGs in `public/icons/` are still the Angular CLI defaults (not regenerated to match) — that needs an external tool (e.g. realfavicongenerator.net), not something to hand-edit as code.

## Service pattern — stateless is the default

- **Default**: a stateless API-client service — `providedIn: 'root'`, injects only `HttpClient`, one method per backend endpoint, returns `Observable<T>` typed as the **already-unwrapped** DTO (`unwrapInterceptor` strips `ApiResponse<T>` before the service ever sees the body — never type a method as `Observable<ApiResponse<T>>`). No signals, no cached state; the calling component owns whatever state it needs (`TaskService` / `TaskList` is the reference example).
- **Exception**: a stateful global service (`AuthStateService`'s shape — signals for `user`/`isAuthenticated`) is only justified when the state is genuinely needed *outside* the feature that produces it (guards, the shell header, more than one unrelated feature). Don't reach for this by default for a new feature's data — it's the exception, not the starting point.

## Routing checklist

- Every route gets `canActivate: [authGuard]` **except** `login` and `register`.
- Every route uses `loadComponent: () => import(...)` for lazy loading (confirmed working — `ng build` produces a separate chunk per feature).
- `{ path: '**', redirectTo: '' }` **must be the last entry in the `routes` array.** The router evaluates top-to-bottom and `**` matches everything — anything after it is unreachable dead code. This isn't theoretical: on 2026-08-18 the Tasks routes were added after the wildcard and were silently unreachable (caught by manual testing, not by the compiler — `ng build` succeeds either way, so this has to be checked by eye or by clicking through the route).
- If a route should be reachable from the shell, add the link in `app.html`'s header, inside the `@if (authState.isAuthenticated())` block.

## Adding a new feature — recipe (mirrors `features/tasks/`)

1. `features/<name>/models/<name>.model.ts` — Request/Response DTOs matching the [Backend contract](#backend-contract) section.
2. `features/<name>/<name>.service.ts` — stateless `HttpClient` wrapper, one method per endpoint used so far.
3. One folder per screen, e.g. `<name>-list/`, `<name>-form/` — standalone component + template. Reuse the shared classes from [Visual design system](#visual-design-system) (`.card`, `.field`, `.btn`, `.page`) before writing new component-specific CSS.
4. Register the routes in `app.routes.ts`, guarded and lazy-loaded, inserted **before** the `**` wildcard entry.
5. Wire a nav link into `app.html` if the feature needs to be reachable from the shell.
6. Run `ng build` before calling it done — it won't catch the routing-order mistake above, but it does catch unused-import warnings (a good signal a template/component got out of sync) and type errors for free.

---

# Local dev setup

- Backend runs on `http://localhost:1010` (`server.port=1010` in `align`'s `application.properties`). Angular dev server runs on `http://localhost:4200`.
- `proxy.conf.json` (to be created at the project root) should forward `/api` and `/auth` to `http://localhost:1010`, so the dev server sits between the browser and the backend and CORS never comes into play locally. Wire it into `ng serve` (either via `--proxy-config proxy.conf.json` or the `serve` options in `angular.json`) so it's automatic, not something to remember to pass by hand.
- This does **not** solve CORS for a real deployment (the proxy only exists in the dev server) — that's backend work, tracked as a known gap, not yet scheduled.

---

# Current status

Auth foundation is built and confirmed working end-to-end against the live backend (login and register both tested manually, 2026-08-14). The app shell (home route + header + logout) is also built and confirmed working end-to-end (2026-08-14). Login, register, Tasks, and the app shell now share a consistent visual design system, and the chat panel is fully wired up end-to-end (2026-08-20).

## Done

- App shell — `App` (`app.ts`/`app.html`) renders a header with a logout button only when `authState.isAuthenticated()`, plus `<router-outlet />`; this is also the future mount point for the floating chat panel, per the architecture decision above.
- Home route (`features/home/`) — lands at `path: ''`, guarded by `authGuard`, greets the user by reading `authState.user()?.firstName`.
- `app.routes.ts` — `''` (Home, guarded), `login`, `register`, and a `**` wildcard redirecting to `''`.
- `proxy.conf.json` — `/api` and `/auth` → `http://localhost:1010`, dev-only.
- PWA installable shell (`ng add @angular/pwa`) — `ngsw-config.json`, `public/manifest.webmanifest`, `public/icons/`, `provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' })` wired in `app.config.ts`.
- The two interceptors + the error utility:
  - `unwrapInterceptor` (`core/interceptors/unwrap-interceptor.ts`) — checks the full `ApiResponse` shape before unwrapping `.data`, passes through unchanged otherwise (this is what makes the `/api/agent/chat` exception work with no URL-specific branching, once the chat feature exists).
  - `authInterceptor` (`core/interceptors/auth.interceptor.ts`) — attaches `Authorization: Bearer <token>` when a token exists; on a `401` response, clears the token and redirects to `/login`.
  - `extractErrorMessage` (`core/http/extract-error-message.ts`) — plain function, pulls `.error.message` off an `HttpErrorResponse`, falls back to a generic Spanish message.
  - Registered in `app.config.ts`: `provideHttpClient(withInterceptors([authInterceptor, unwrapInterceptor]))`.
- `AuthStateService` (`core/auth/auth-state.service.ts`) — `login()`, `register()` (both funnel through a shared `applyAuthResponse` that stores the token and hydrates the user), `hydrateUser()`, `hydrateIfAuthenticated()` (called once from `App`'s constructor on bootstrap so a stored token rehydrates `user`/`isAuthenticated` on page load), `logout()` (client-side only, per the backend's stateless JWT). Exposes `user` and `isAuthenticated` as readonly signals.
- Token persistence: `core/auth/token-storage.ts` — thin wrapper over `localStorage`, key `align_access_token`.
- `authGuard` (`core/auth/auth.guard.ts`) — `CanActivateFn`, redirects to `/login` when there's no token. Applied to the `''` (home) route.
- Login screen (`features/auth/login/`) — reactive form (email + password), calls `authState.login()`, navigates to `/` on success.
- Register screen (`features/auth/register/`) — reactive form (email, password w/ `minLength(8)`, firstName, lastName), calls `authState.register()`. Registering logs the user in immediately (same `AuthResponse` handling as login) and navigates to `/`, since the backend returns a full `AuthResponse` from `/auth/register` — there's no separate "now go log in" step.
- Task feature area (`features/tasks/`) — list (`GET /api/tasks`) and create (`POST /api/tasks`) confirmed working end-to-end against the live backend (2026-08-18). `TaskService` is a stateless HTTP client (see [Frontend conventions](#frontend-conventions--standards)); `TaskList` (`/tasks`) and `TaskForm` (`/tasks/new`) are separate guarded routes. This is the reference implementation for the feature-area pattern — edit/delete and the Finance area should follow its shape. Edit/delete deliberately deferred to the next iteration, not an oversight. `TaskList` also renders `dueDate`/`dueTime` per task when present, formatted as a single string (e.g. "25 ago · 14:30") via a component-local `dueLabel()` helper (2026-08-20).
- Visual design system (`src/styles.scss`) — neutral/clean palette (tokens + `.card`/`.field`/`.btn`/`.badge`/`.page` primitives, see [Visual design system](#visual-design-system)) applied across the app shell, login, register, and Tasks. `public/manifest.webmanifest` and `index.html`'s `theme-color` meta updated to match (2026-08-20).
- Chat feature (`features/chat/`) — `ChatWidget`, a floating bubble/panel mounted directly in `app.html` (statically imported in `app.ts`, not lazy-loaded — it's shell UI, not a route) as a sibling of `<router-outlet>`, shown only when `authState.isAuthenticated()`. `ChatService` is a stateless HTTP client with `send()` (`POST /api/agent/chat`) and `history()` (`GET /api/agent/history`). History loads once in `ChatWidget.ngOnInit()` to restore the conversation; the panel then keeps messages in its own signal for the rest of the session, same "service stateless, component owns state" pattern as Tasks. Confirmed working end-to-end (2026-08-20) — conversation survives in-app navigation and a page reload.
- Voice input for chat (`features/chat/speech-recognition.ts`, 2026-08-20) — a mic button next to the chat input uses the browser's `SpeechRecognition` to transcribe speech into the existing draft field; the user still reviews and presses Enviar, nothing auto-sends. Client-only, see the architecture decision above. The button feature-detects support and hides itself on browsers without `SpeechRecognition` (confirmed: works in Chrome/Edge, absent in Firefox).

## Known gaps / next steps, in order

1. Task feature area — edit (`PUT /api/tasks/{id}`) and delete (`DELETE /api/tasks/{id}`); will need `TaskUpdateRequest` added to `task.model.ts`.
2. Finance feature area (`/api/transactions`) — not started. Can now reuse both the Tasks feature-area pattern and the shared visual design system, so it should move faster than Tasks did.

## Local dev gotcha

Running the frontend against real endpoints requires the `align` Spring Boot backend running separately on `localhost:1010`. An `ECONNREFUSED` in the Vite proxy log for `/auth/*` or `/api/*` means the backend isn't up — check for a listener on port 1010 before assuming it's a frontend bug.
