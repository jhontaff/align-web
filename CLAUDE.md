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

## The `ApiResponse<T>` envelope — and its one exception

Every REST endpoint wraps its body: `{ timestamp, status, success, message, data, errors }`. The actual resource is in `.data`.

**Exception**: `POST /api/agent/chat` returns `AgentResponse` (`{ reply }`) directly, unwrapped. This is a backend inconsistency, not something to work around per-URL on the frontend — see [Frontend architecture decisions](#frontend-architecture-decisions) for how the unwrap interceptor handles both shapes with one generic check.

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
- Synchronous request/response — no streaming (no SSE/WebSocket). The UI should show a loading state while waiting, not attempt a token-by-token "typing" effect; that would require backend changes that don't exist yet.
- One conversation per user, persisted server-side, no session/thread concept. There is currently **no endpoint to fetch conversation history** — the frontend chat panel starts empty on every page load; this was a deliberate YAGNI call, not an oversight (see decisions below).

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
- **No conversation history endpoint yet** — the chat panel resets on every page load. Adding `GET /api/agent/history` on the backend was considered and explicitly deferred; revisit only if losing history on refresh becomes a real problem, not preemptively.
- **CORS handled via `proxy.conf.json` in dev**, not backend changes — see below.
- **PWA scope: installable shell only, not offline-first data.** `ng add @angular/pwa` gives an installable app (manifest, icons) and caches static assets (JS/CSS/`index.html`) via the Angular Service Worker. `ngsw-config.json` deliberately has **no `dataGroups`** for `/api/**` or `/auth/**` — those routes always hit the network, never the Service Worker cache. Tasks/Finance data being available offline (IndexedDB, mutation queue, sync/conflict resolution) is a much larger scope that was explicitly deferred — the backend isn't designed for it today, and there's no real need yet. Revisit only if offline usage becomes an actual requirement, not preemptively.
- **No `environment.ts` for the API base URL — relative paths (`/api`, `/auth`) everywhere.** `proxy.conf.json` already resolves these in dev. The plan for a real deployment is to keep the frontend behind a reverse proxy that forwards the same `/api`/`/auth` paths to the backend, so relative paths keep working unchanged across dev and prod and the CORS gap above stays irrelevant. Only introduce `environment.ts` (via `ng generate environments`) if frontend and backend ever end up on genuinely different origins without a shared reverse proxy — don't add it preemptively.

---

# Local dev setup

- Backend runs on `http://localhost:1010` (`server.port=1010` in `align`'s `application.properties`). Angular dev server runs on `http://localhost:4200`.
- `proxy.conf.json` (to be created at the project root) should forward `/api` and `/auth` to `http://localhost:1010`, so the dev server sits between the browser and the backend and CORS never comes into play locally. Wire it into `ng serve` (either via `--proxy-config proxy.conf.json` or the `serve` options in `angular.json`) so it's automatic, not something to remember to pass by hand.
- This does **not** solve CORS for a real deployment (the proxy only exists in the dev server) — that's backend work, tracked as a known gap, not yet scheduled.

---

# Current status

Auth foundation is built and confirmed working end-to-end against the live backend (login and register both tested manually, 2026-08-14).

## Done

- `proxy.conf.json` — `/api` and `/auth` → `http://localhost:1010`, dev-only.
- PWA installable shell (`ng add @angular/pwa`) — `ngsw-config.json`, `public/manifest.webmanifest`, `public/icons/`, `provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' })` wired in `app.config.ts`.
- The two interceptors + the error utility:
  - `unwrapInterceptor` (`core/interceptors/unwrap-interceptor.ts`) — checks the full `ApiResponse` shape before unwrapping `.data`, passes through unchanged otherwise (this is what makes the `/api/agent/chat` exception work with no URL-specific branching, once the chat feature exists).
  - `authInterceptor` (`core/interceptors/auth.interceptor.ts`) — attaches `Authorization: Bearer <token>` when a token exists; on a `401` response, clears the token and redirects to `/login`.
  - `extractErrorMessage` (`core/http/extract-error-message.ts`) — plain function, pulls `.error.message` off an `HttpErrorResponse`, falls back to a generic Spanish message.
  - Registered in `app.config.ts`: `provideHttpClient(withInterceptors([authInterceptor, unwrapInterceptor]))`.
- `AuthStateService` (`core/auth/auth-state.service.ts`) — `login()`, `register()` (both funnel through a shared `applyAuthResponse` that stores the token and hydrates the user), `hydrateUser()`, `hydrateIfAuthenticated()` (called once from `App`'s constructor on bootstrap so a stored token rehydrates `user`/`isAuthenticated` on page load), `logout()` (client-side only, per the backend's stateless JWT). Exposes `user` and `isAuthenticated` as readonly signals.
- Token persistence: `core/auth/token-storage.ts` — thin wrapper over `localStorage`, key `align_access_token`.
- `authGuard` (`core/auth/auth.guard.ts`) — `CanActivateFn`, redirects to `/login` when there's no token. **Built but not yet applied to any route** (see gaps below — there's no protected route for it to guard yet).
- Login screen (`features/auth/login/`) — reactive form (email + password), calls `authState.login()`, navigates to `/` on success.
- Register screen (`features/auth/register/`) — reactive form (email, password w/ `minLength(8)`, firstName, lastName), calls `authState.register()`. Registering logs the user in immediately (same `AuthResponse` handling as login) and navigates to `/`, since the backend returns a full `AuthResponse` from `/auth/register` — there's no separate "now go log in" step.

## Known gaps / next steps, in order

1. **`app.routes.ts` only defines `login` and `register`** — there's no root/home route yet, so `authGuard` has nothing to protect. Next: add whatever lands at `/` (even a placeholder shell) and apply `authGuard` to it.
2. **`app.html` still has the untouched Angular CLI default template** (marketing splash content) with a bare `<router-outlet />` appended at the bottom — needs replacing with the real app shell once there's a home route to route into. This is also where the floating chat panel will eventually mount as a `<router-outlet>` sibling, per the architecture decision above.
3. Task feature area (`/api/tasks`) — not started.
4. Finance feature area (`/api/transactions`) — not started.
5. Chat panel — not started (blocked on the app shell replacement in #2).

## Local dev gotcha

Running the frontend against real endpoints requires the `align` Spring Boot backend running separately on `localhost:1010`. An `ECONNREFUSED` in the Vite proxy log for `/auth/*` or `/api/*` means the backend isn't up — check for a listener on port 1010 before assuming it's a frontend bug.
