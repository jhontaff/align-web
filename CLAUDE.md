# CLAUDE.md

# Align Web

Align Web is the Angular frontend for **Align**, a personal productivity platform (Tasks, Finance, Habits, and a chat-based AI agent, with more domains planned). This repo is standalone — it consumes the Align backend (a separate Spring Boot repo) purely over HTTP. There is no shared code, no monorepo, no direct filesystem access between the two repos.

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

- `POST /api/transactions` — `TransactionRequest` → `200` + `TransactionResponse` (la spec viva dice `200`, no `201` como Task)
- `GET /api/transactions/{id}` → `TransactionResponse`
- `GET /api/transactions` — filter params `type?`, `category?`, `from?`, `to?` (all optional, bound as a flat query-param object) + pagination → `Page<TransactionResponse>`
- `PUT /api/transactions/{id}` — `TransactionUpdateRequest` → `TransactionResponse`
- `DELETE /api/transactions/{id}` → no body data
- `GET /api/transactions/summary` — same filter params as the list endpoint, no pagination → `FinancialSummaryResponse`
- `TransactionRequest` = `{ amount, category, description?, date? }`
- `TransactionUpdateRequest` = `{ amount, category, description?, date }` — **`date` es obligatorio aquí y opcional en el alta.** No son el mismo DTO, aunque este archivo lo diera por idéntico hasta el 2026-08-28; verificado contra `/v3/api-docs`, que lo lista en su `required`.
- Ninguno de los dos tiene **campo `type`**: lo deriva el servidor a partir de `category`. No añadir un selector de tipo a ningún formulario de transacción; la categoría sola determina ingreso vs. gasto. `description` tiene `maxLength: 255`.
- `TransactionResponse` = `{ id, type, amount, category, description, date, createdAt, updatedAt }` — `id` es **UUID `string`**, igual que `TaskResponse.id`. No convertirlo con `numberAttribute` al leerlo de la URL: devuelve `NaN` sin fallar.
- `FinancialSummaryResponse` = `{ totalIncome, totalExpense, balance }`
- `type`: `INCOME` | `EXPENSE`. `category`: `FOOD`, `TRANSPORT`, `HOUSING`, `HEALTH`, `ENTERTAINMENT`, `EDUCATION`, `SHOPPING`, `UTILITIES`, `OTHER_EXPENSE` (all `EXPENSE`); `SALARY`, `FREELANCE`, `INVESTMENT`, `GIFT`, `OTHER_INCOME` (all `INCOME`).

## Habit (`/api/habits`)

- `POST /api/habits` — `HabitRequest` → `201` + `HabitResponse`
- `GET /api/habits/{id}` → `HabitResponse`
- `GET /api/habits` → `HabitResponse[]` — **no pagination**, unlike Task/Finance; returns the full list. Small N expected (a personal habit list) — don't build a `Page<HabitResponse>` type or pagination UI for this endpoint.
- `PUT /api/habits/{id}` — `HabitRequest` → `HabitResponse`
- `DELETE /api/habits/{id}` → no body data
- `POST /api/habits/{id}/completions` — no body → `200` + `HabitResponse`. Marks the habit done for today. **Idempotent** — calling it again the same day is a safe no-op, not an error; fine to wire to a button without disabling it after the first click.
- `HabitRequest` = `{ name }` — same DTO for create and update, there's no `HabitUpdateRequest` (the domain only has one editable field today).
- `HabitResponse` = `{ id, name, currentStreak, createdAt, updatedAt }` — `currentStreak` is computed server-side on every read; don't recompute it client-side.
- No AI tools yet — the chat agent can't create/list/complete habits through conversation. REST only, for now.

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
- **Revalidación tras una respuesta del agente: un evento en `core/`, no un import cruzado.** `POST /api/agent/chat` puede crear o modificar tareas y transacciones como efecto secundario, pero devuelve `{ reply: string }` — prosa, sin parte de cambios. `DataRefreshService` (`core/data/data-refresh.service.ts`) expone `changes: Observable<void>` e `invalidate()`; `ChatStore.send()` invalida al recibir la respuesta y cada pantalla montada vuelve a pedir lo suyo. Tres decisiones dentro de esta:
  - **Va en `core/` porque quien emite y quien escucha son features distintas** (`chat` → `tasks`, mañana `finance`), y las features no se importan entre sí. Es exactamente el caso que la regla de [Folder placement](#folder-placement--core-layout-shared-features) contempla: la pieza compartida sube, no se importa de lado.
  - **Es un `Subject<void>`, no un `signal` contador.** Esto es un evento, no un valor. Un contador obligaría a cada consumidor a montar un `effect()` para reaccionar y disparar una petición — el uso de `effect` que [Angular 20.3](#angular-203--apis-disponibles-y-límites-de-versión) descarta. Con un stream el consumidor se suscribe igual que ya se suscribe a su servicio. Corolario: **hace falta `takeUntilDestroyed(destroyRef)`**, porque un Subject no completa nunca (un observable de `HttpClient` sí, y por eso las llamadas normales no lo llevan).
  - **Se invalida en toda respuesta, no solo en las que escriben.** No hay forma de distinguirlas sin parsear el `reply`, que es lo mismo que ya se rechazó para fabricar cards. El precio es un GET de más por pregunta que no modifica nada, pagado solo por las pantallas montadas. La solución real es del backend: que `AgentResponse` diga qué tocó. Ver [Bloqueado por el backend](#bloqueado-por-el-backend-no-por-el-frontend).
- **CORS handled via `proxy.conf.json` in dev**, not backend changes — see below.
- **PWA scope: installable shell only, not offline-first data.** `ng add @angular/pwa` gives an installable app (manifest, icons) and caches static assets (JS/CSS/`index.html`) via the Angular Service Worker. `ngsw-config.json` deliberately has **no `dataGroups`** for `/api/**` or `/auth/**` — those routes always hit the network, never the Service Worker cache. Tasks/Finance data being available offline (IndexedDB, mutation queue, sync/conflict resolution) is a much larger scope that was explicitly deferred — the backend isn't designed for it today, and there's no real need yet. Revisit only if offline usage becomes an actual requirement, not preemptively.
- **No `environment.ts` for the API base URL — relative paths (`/api`, `/auth`) everywhere.** `proxy.conf.json` already resolves these in dev. The plan for a real deployment is to keep the frontend behind a reverse proxy that forwards the same `/api`/`/auth` paths to the backend, so relative paths keep working unchanged across dev and prod and the CORS gap above stays irrelevant. Only introduce `environment.ts` (via `ng generate environments`) if frontend and backend ever end up on genuinely different origins without a shared reverse proxy — don't add it preemptively.
- **Locale `es-ES` y moneda `EUR` se proveen una vez en `app.config.ts`, no por plantilla** (2026-08-28). Angular solo trae `en-US` compilado; sin `registerLocaleData(localeEs)` + `{ provide: LOCALE_ID, useValue: 'es-ES' }`, `CurrencyPipe` y `DatePipe` formatean a la inglesa (`$1,234.56`) por muy en español que esté el texto. No es una elección nueva: `task-list.ts` ya formateaba con `toLocaleDateString('es-ES', ...)`; esto solo lo sube de cadena suelta a configuración.
  **La moneda la decide el frontend porque el backend no la manda**: `amount` es un número pelado, no hay campo de divisa ni preferencias de usuario. Va en `DEFAULT_CURRENCY_CODE` y no repetida en cada `| currency:'EUR'` para que cambiarla sea una línea. Si algún día el backend guarda la divisa por usuario, este proveedor es el punto que se sustituye.
- **Voice input is client-only (Web Speech API), not a backend feature.** `POST /api/agent/chat` stays a plain text endpoint — el botón de micrófono del panel transcribe con el `SpeechRecognition` del navegador y **al soltarlo envía el mensaje**; la revisión se hace durante el gesto, viendo la transcripción en vivo, y deslizar a la papelera la descarta (revisado 2026-08-29 — antes rellenaba el campo y esperaba a que el usuario pulsara Enviar). No audio ever leaves the browser, no STT/TTS on the backend. Chosen because it needs zero backend changes and covers the common case (Chrome/Edge); `SpeechRecognition` isn't supported in Firefox and is spotty in Safari, so `features/chat/speech-recognition.ts` feature-detects and the mic button hides itself entirely when unsupported, rather than rendering broken. Revisit only if backend-side transcription or spoken replies (TTS) become a real requirement, not preemptively.

---

# El panel de Finanzas: rejilla arrastrable (angular-gridster2)

Añadido 2026-09-05 en `finance-body-update`. La pantalla de resumen deja de ser una columna de 720px con cinco secciones apiladas y pasa a ser una rejilla de 12 columnas que el usuario recoloca y redimensiona. Es la primera —y por ahora única— dependencia de UI de terceros del repo, así que conviene que el porqué y el precio queden escritos.

**La pantalla ancha y la rejilla son dos cambios distintos.** El ancho es `class="page page--wide"` (1280px), que es lo que Inicio y Hábitos ya usaban; Finanzas era el único dashboard que se pintaba en columna de lectura. Eso se arregla con una línea y no necesita ninguna librería.

## Por qué gridster2 y no CSS grid

Para colocar bien cinco tarjetas, CSS grid sobra y es lo que este repo haría por defecto. Gridster resuelve **una** cosa que CSS no: que el usuario final mueva y redimensione las tarjetas con el ratón y eso se recuerde. Esa era la petición, y es la única justificación válida para la dependencia. Si algún día la personalización se retira, la librería se va con ella — no se queda "para maquetar".

Versión **20.2.4**, fijada. Standalone (`GridsterComponent` / `GridsterItemComponent` entran por el array `imports`, no hay `GridsterModule`), MIT, sin dependencias más allá de `tslib`. Ver la nota de versionado en [Angular 20.3](#angular-203--apis-disponibles-y-límites-de-versión).

## Lo que costó, y cómo se pagó

Cada uno de estos puntos es una fricción real entre la librería y las reglas del repo. Están resueltos; se anotan para que no se "arreglen" de vuelta.

- **`ViewEncapsulation.None` con colores literales.** `gridster { background: gray }`, `gridster-item { background: #fff }`, `#ccc` en el tirador. En oscuro son rectángulos blancos. Se corrigen por especificidad desde `overview.scss` —los elementos escritos en nuestra plantilla llevan nuestro atributo de encapsulación, así que `.dashboard` pesa (0,1,1) contra el (0,0,1) de la librería—, **no por orden de inyección**, que con un chunk lazy no está garantizado. Lo que la librería renderiza en su propia plantilla no se alcanza así y vive en `styles/_gridster.scss`. **`::ng-deep` no se usa**, sigue descartado.
- **El scroll.** `gridType: 'verticalFixed'` + `setGridSize: true` es la **única** combinación que deja el scroll en la ventana: `fit` recorta al alto del contenedor y `scrollVertical` le da a la rejilla su propio `overflow-y`, y las dos dejarían `withInMemoryScrolling` sin efecto. Precio: `setGridSize` fija también el **ancho** en línea y la rejilla no vuelve a encogerse — se compensa con `width: 100% !important` en `.dashboard`, que es de los pocos `!important` legítimos que hay (ganarle a un estilo en línea no tiene otra vía).
- **El breakpoint, y el bug que causó** (corregido 2026-09-05). Gridster decide si está en "modo móvil" comparando `mobileBreakpoint` contra un ancho que mide él, y **en modo móvil `canBeDragged()` devuelve `false` pase lo que pase**. La primera versión usaba `useBodyForBreakpoint: true` + 1024, o sea `document.body.clientWidth` — que **excluye la barra de scroll**— contra el mismo número que la media query de `_layout.scss`, que compara contra el viewport y **la incluye**. Dos varas de medir para el mismo umbral: había una franja en la que el CSS pintaba el escritorio, con su botón de "Personalizar", y el arrastre estaba muerto sin ningún aviso. Cualquier ventana por debajo de 1024 lo mataba también.
  **La solución no es afinar el número, es quitarle la decisión a gridster**: `useBodyForBreakpoint: false` y `mobileBreakpoint` escrito desde fuera con dos centinelas (`0` = nunca móvil, `MAX_SAFE_INTEGER` = siempre), gobernados por un `effect` sobre `BreakpointService.isDesktop()` — el **mismo** `matchMedia` que usa el SCSS. Así CSS y librería no pueden discrepar. Es uno de los pocos `effect` legítimos del repo: signal → API imperativa de terceros, la categoría del de `ThemeService`.
  Por debajo del umbral, gridster apila en orden de DOM y el CSS le devuelve el alto automático (`height: auto !important`): la pantalla en móvil es **idéntica** a la de antes de la rejilla.
- **Alto automático de dos tarjetas.** "Gastos por categoría" y "Últimos movimientos" crecen con su contenido; las otras tres tienen alto determinista y su alto es del usuario. Tres cosas que no se ven en el código:
  - Se observa la `<section>`, **nunca el `<gridster-item>`**: el item tiene el alto que le impone la rejilla, así que observarlo se realimenta (crece → se mide más alto → crece) y es el bucle infinito clásico de `ResizeObserver`.
  - El `ResizeObserver` se crea **fuera de la zona**: al redimensionar en horizontal el texto se remaqueta y dispara decenas de veces por segundo. Solo se vuelve a entrar en la zona cuando el número de filas cambia de verdad.
  - Crecer **empuja hacia abajo** con `GridsterPush`. `compactType: 'compactUp'` solo tapa huecos hacia arriba: no resuelve solapamientos, así que sin el empujón una tarjeta que crece se mete por debajo de su vecina.
  - Y por eso una tarjeta automática **no se redimensiona en vertical** (`handlesFor()`): si pudiera, el usuario la estiraría, llegarían datos y el observador la devolvería a su tamaño. Dos fuerzas escribiendo el mismo número.
- **Una tarjeta de contenido elige una de dos relaciones con su celda, y se declara.** O **alto automático** (`byCategory`, `recent`): manda el contenido y la celda se ajusta. O **`.dashboard__card--fill`** (hoy solo `pace`): manda la celda y el contenido se reparte ese alto — dentro de la tarjeta, lo único que se estira es el área de trazado (`flex: 1 1 $plot-height` en vez de `block-size` fijo), porque todo lo demás mide lo que mide su texto y estirarlo solo haría huecos. Es lo que hace que redimensionar la tarjeta sirva para algo. Dos precisiones:
  - Las dos formas se separan con `:not(.dashboard__card--fill)`, no confiando en el orden del archivo: un empate de especificidad se resolvería por orden de aparición, que es la fragilidad que ya documentan `.card-metric` y las media queries de `app-header.scss`.
  - **`--fill` no lleva `overflow`, y no se pone nunca sobre una tarjeta de alto automático.** Lo primero porque `monthly-flow` deja su área de trazado en `overflow: visible` para que el emergente de cada columna se salga por arriba, y un contenedor de scroll lo cortaría — por eso `flow` no lo lleva todavía. Lo segundo porque `block-size: 100%` haría que el `ResizeObserver` midiera el alto que la rejilla acaba de imponer: el bucle de realimentación.
  - Las cuatro declaraciones que ponen al host de `spending-pace` en columna flexible viven en `overview.scss`, no en un `:host` del componente: dónde está montado no es una propiedad del componente. Fuera del panel se comporta igual que siempre.
- **`cards` es un campo plano, no un `signal`.** Gridster muta esos objetos en su sitio y nunca cambia su identidad; un signal no emitiría jamás. Es una excepción consciente a la regla general, y el corolario es que escribir en ellos desde nuestro código exige sincronizar también el `$item` del componente (`syncEngine()`), que es la copia contra la que el motor calcula.
- **Persistencia en `localStorage`** (`align_finance_layout`), porque **no hay endpoint de preferencias** en el backend. Lleva `version` y se valida contra los ids conocidos: un layout de otra versión se descarta entero en vez de dejar tarjetas sin colocar. El alto de las automáticas no se guarda.
- **Accesibilidad: el contenido sí, la personalización no.** `useTransformPositioning` coloca solo visualmente, así que el orden del DOM —y con él la tabulación y el lector de pantalla— sigue siendo el de la plantilla aunque el usuario mueva las tarjetas. Lo que es solo-puntero es el gesto de recolocar: gridster no trae equivalente de teclado. El recambio es **"Restablecer disposición"**, que por eso no es un botón de comodidad sino el único camino accesible para salir de un layout roto. El modo edición se anuncia con `aria-pressed`, que los lectores sí reannuncian con el foco encima (al revés que un nombre accesible que cambia — el problema que en el botón de tema obligó a una región `aria-live`).
- **Se arrastra desde CUALQUIER punto de la tarjeta** (`ignoreContent: false` + `ignoreContentClass: 'dashboard__no-drag'`), revisado 2026-09-05. La primera versión ponía una franja con un tirador y `ignoreContent: true`, y eso convertía la franja en el **único** punto de agarre: quien lo intentaba desde otro sitio no veía pasar nada ni por qué. Con siete tarjetas pequeñas la franja se comía además media tarjeta. No hay conflicto con seleccionar texto ni con pulsar enlaces porque **el arrastre solo existe en modo edición**; lo que sigue siendo pulsable ahí dentro (el "Ver todo (83)", la lista de movimientos, el enlace del estado vacío) lleva `dashboard__no-drag`, que es la clase que gridster mira para dejar pasar el evento. La señal visual es `cursor: move` sobre la celda más el borde discontinuo.
- **Las tres cifras son tres tarjetas, no una** (2026-09-05). Nacieron agrupadas en un `<ul>` dentro de una sola tarjeta, y así no se podían recolocar por separado — que es exactamente para lo que está la rejilla. Cada una es ahora una `<section class="card metric">` con su propio `h2`, que es la etiqueta ("Ingresos") y le da nombre accesible: el elemento marca la estructura y el CSS marca la jerarquía visual, así que se pinta pequeño y apagado mientras la cifra es lo grande. El precio es que se pueden separar y dejan de compararse de un vistazo; a cambio la disposición de fábrica las deja en fila y del mismo tamaño, y volver a ella es un botón. Con el `<ul>` se fue también el encabezado "Resumen · septiembre": el periodo ya se lee en el botón del selector, que muestra el rango.
- **La retícula de fondo de gridster no se enciende nunca** (`displayGrid: 'none'`): son doce guías verticales que ensucian más de lo que orientan, y las pinta la librería con bordes blancos literales fuera del alcance de la encapsulación. El borde discontinuo por celda en modo edición dice lo mismo y es nuestro.
- **Coste medido** (`ng build`): el chunk lazy `overview` pasa de 8.71 kB a 24.36 kB transferidos; el bundle inicial sube 2.5 kB (iconos nuevos y `_gridster.scss` — gridster **no** entra en ningún chunk inicial, comprobado sobre `dist/`).
- **`anyComponentStyle` subió de 4 kB a 6 kB** en `angular.json` (2026-09-05). No es para tapar nada: `spending-pace.scss` ya estaba en ~3,98 kB **antes** de tocarlo, o sea al 99,5% del umbral, y habría saltado con cualquier edición siguiente. 4 kB es el default genérico del CLI, nunca ajustado a este repo, y un componente con tres sistemas de coordenadas no es un estilo desbocado. El tope de **error** se queda en 8 kB, que es el guardián de verdad.
- **Eventos de ratón y táctiles, no Pointer Events.** La librería no ofrece alternativa. Es la única inconsistencia con el resto de la app (el dictado del chat sí es Pointer Events) y no tiene arreglo desde fuera.

## `gridster-drag.spec.ts`, y por qué existe

Seis pruebas en `features/finance/overview/gridster-drag.spec.ts`, escritas **después** de que las tarjetas no se dejaran mover y ni el build ni el tipado dijeran nada. Fijan el contrato con la librería, no la implementación de la pantalla: que la rejilla no se crea móvil aunque la ventana sea estrecha, que `options.api` existe (sin ella, mutar las opciones no hace nada), que el arrastre está apagado fuera del modo edición y encendido dentro, que arranca desde el **cuerpo** de la tarjeta, y que un elemento con `dashboard__no-drag` no se convierte en arrastre.

El banco de pruebas es un componente mínimo con la misma configuración, no `Overview`: así no depende de servicios, rutas ni peticiones, y si mañana una opción de gridster rompe el arrastre, falla por eso y solo por eso. El iframe de Karma mide ~732px, que es además el escenario exacto que destapó el fallo original.

## Sin verificar todavía

`ng build` limpio, `tsc --noEmit` limpio y la suite en 122/123 (el fallo es previo: falta el proveedor de `SwPush` en `app.spec.ts`). El arrastre sí está verificado en un navegador real por las pruebas de arriba. **Lo que sigue sin verse a mano**: el resultado contra el backend vivo, el crecimiento de la tarjeta de categorías con datos reales, el tema oscuro y el apilado al cruzar 1024px.

---

# Design system

Built 2026-08-19 from a written brand spec + light/dark reference boards. Lives in `src/styles/`, wired through `src/styles.scss` (the only file listed in `angular.json` → `styles`).

```
src/styles.scss          @use tokens → base → components (orden obligatorio)
src/styles/_tokens.scss  paleta + semántica + tema oscuro
src/styles/_base.scss    reset y defaults de elementos HTML (sin clases)
src/styles/_components.scss  primitivas globales (.btn, .card, .field, .badge…)
src/styles/_layout.scss  variables/mixins del shell — NO emite CSS, NO va en styles.scss
src/styles/_gridster.scss  correcciones a angular-gridster2 — el ÚLTIMO @use
```

`_gridster.scss` es la única excepción a "aquí solo vive lo nuestro", y tiene su motivo escrito en la cabecera del archivo: gridster declara sus componentes con `ViewEncapsulation.None`, así que sus estilos son globales y traen colores literales. Los elementos que escribe **nuestra** plantilla (`<gridster>`, `<gridster-item>`) se corrigen desde `overview.scss`, que gana por especificidad; los que renderiza **la librería** en su propia plantilla no llevan nuestro atributo de encapsulación y ningún `.scss` de componente los alcanza. Solo eso vive aquí, y va el último porque solo puede pisar, nunca definir.

## Tokens: dos niveles, y la separación es la regla

- **Nivel 1** — paleta cruda (`--blue-600`, `--slate-200`, `--navy-950`, `--emerald-500`…). **Nunca se usa fuera de `_tokens.scss`.** Existe solo para que el nivel 2 tenga de dónde elegir.
- **Nivel 2** — intención semántica (`--color-primary`, `--color-surface`, `--color-text-muted`, `--color-danger-soft`…). **Es lo único que puede aparecer en un `.scss` de componente o en `_components.scss`.**

Un hex literal en un `.scss` de feature es un bug de diseño, no una decisión estética: significa que ese color no existe en el sistema, o que se saltó el nivel 2. Los únicos hex fuera de `_tokens.scss` son `#ffffff` sobre fondos de marca (`.btn-danger`), donde el blanco no depende del tema.

## Tema oscuro

Todo el tema oscuro está en el mixin `dark-tokens` de `_tokens.scss`, aplicado en dos sitios:

```scss
@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { @include dark-tokens; } }
:root[data-theme='dark'] { @include dark-tokens; }
```

**Consecuencia práctica: no debe existir ni una sola `@media (prefers-color-scheme)` fuera de `_tokens.scss`.** Si un componente necesita una, el token que le falta no está en el nivel 2 — la solución es añadir el token, no la media query. El doble bloque (media query + `[data-theme]`) es lo que permite que el botón de tema del header conviva con la preferencia del sistema — ver [Cambio de tema](#cambio-de-tema-botón-del-header).

`color-scheme` se declara en ambos temas, así que scrollbars y controles nativos siguen el tema sin CSS extra.

## Cambio de tema (botón del header)

`ThemeService` (`core/theme/theme.service.ts`) + `ThemeToggle` (`layout/theme-toggle/`), montado en la nav de `app.html`. Botón cíclico de tres posiciones: **sistema → claro → oscuro → sistema**.

**`system` es un estado de primera clase, no la ausencia de elección.** `ThemePreference = 'light' | 'dark' | 'system'`, y `'system'` se persiste explícitamente en `localStorage` bajo `align_theme`. La distinción importa: si `system` fuera solo "todavía no eligió nada", el usuario no podría *volver* a delegar en el SO después de haber probado los otros dos, y quien tiene auto-dark perdería esa función por haber tocado un botón una vez.

`theme` (computed) resuelve la preferencia contra `systemTheme` (un signal alimentado por el listener de `matchMedia`), así que la app reacciona a que el SO cambie de tema en vivo mientras la preferencia sea `system`.

La regla que hace que todo lo demás funcione: **`data-theme` en `<html>` existe solo cuando la preferencia es `light` o `dark`.** Con `system` el atributo se borra, no se escribe el valor resuelto. Escribir el valor resuelto clavaría la app al tema que hubiera en el arranque y `system` dejaría de significar nada. Ese es exactamente el escenario para el que `_tokens.scss` usa `:root:not([data-theme='light'])` dentro de la media query.

Detalles que no son obvios al leer el código:

- **Un solo escritor del atributo**: el `effect()` del servicio. Hay dos fuentes que mueven el tema (el botón y el SO), así que la escritura al DOM se centraliza en vez de repetirse en cada una. Este es el caso de uso legítimo de `effect` — manipulación de DOM fuera del render de Angular — no propagación de estado entre signals.
- **Script inline en `index.html`** para evitar el flash de tema contrario al recargar. Corre antes del primer pintado y solo escribe el atributo si lo guardado es `light` o `dark`. Duplica la constante `'align_theme'` a propósito: tiene que ejecutarse antes de que exista ningún bundle, así que no puede importarla del servicio. Si la clave cambia, hay que cambiarla en los dos sitios.
- **El icono muestra el estado actual, no el destino** (sol / luna / monitor). Con dos estados anunciar el destino funcionaba; con tres, el usuario perdería de vista en cuál está. La acción se movió a la etiqueta: `"Tema: sistema. Cambiar a claro"`, usada a la vez como `aria-label` y `title`.
- **Región `aria-live` fuera del botón.** El `aria-label` cambia al hacer click, pero los lectores de pantalla no reannuncian de forma fiable el nombre de un elemento que ya tiene el foco. El `<span class="visually-hidden" role="status">` lo dice en voz alta, y va fuera del `<button>` para no interferir con el cálculo de su nombre accesible.
- **`ThemeToggle` tiene dos presentaciones**, elegidas con `variant = input<'icon' | 'menu'>('icon')`: suelto en el header de escritorio y como fila del desplegable de móvil. Es la variante ganada al segundo uso, no una API adivinada. Ninguna de las dos define pintura propia: `icon` reutiliza `.btn .btn-ghost .btn-icon` y `menu` reutiliza `.menu-item`; su `.scss` solo lleva `:host { display: contents }` para no romper el layout del contenedor.
- **En la variante `menu` NO se pone `aria-label`.** Con el texto ya en pantalla, un `aria-label` lo sustituiría por otro distinto y el nombre accesible dejaría de contener la etiqueta visible — que es lo que rompe "label in name" (WCAG 2.5.3) y deja tirado a quien navega por control de voz diciendo lo que lee. El nombre se compone del texto visible más un `<span class="visually-hidden">` con la acción.

**Hueco conocido**: las metas `theme-color` de `index.html` siguen a `prefers-color-scheme`, no a `data-theme`. Si el usuario fuerza claro con el SO en oscuro, la barra de estado del PWA instalado se queda del color contrario. Arreglarlo exige manipular las metas imperativamente desde el servicio; no se hizo por ahora.

## Escalas

- **Tipografía**: Inter (Google Fonts, cargada en `index.html`), fallback a `system-ui`. `--text-xs/sm/base/lg/h2/h1` = 12/14/16/18/20/24px. Pesos `--weight-regular/medium/semibold/bold`.
- **Espaciado**: base 4px, `--space-1` … `--space-16`. No usar rem sueltos en valores nuevos.
- **Radios**: `--radius-sm` 6px, `--radius-md` 8px (controles), `--radius-lg` 12px (cards), `--radius-full`.
- **Velo de modales**: `--color-scrim`, usado por `::backdrop`. Es un token y no un negro translúcido literal porque el valor del tema claro no sirve en oscuro: sobre un fondo ya oscuro apenas separa el panel del resto y hay que subir la opacidad.
- **Elevación**: `--shadow-sm/md/lg`, con valores distintos por tema — en oscuro la sombra casi no se lee y el borde es lo que separa la superficie del fondo, por eso `.card` lleva borde **y** sombra.
- **Contenedores**: `--container-max` 1280px (dashboard), `--container-md` 720px (listas), `--container-sm` 420px (formularios de auth).

## Iconos: Bootstrap Icons via Iconify, y nada mas (2026-08-29)

**Regla: todo icono de la plataforma es `<app-icon name="bi:..." />`. No se escribe SVG a mano en una plantilla y no se usan emojis como iconos.** Los emojis los dibuja el sistema operativo, asi que el mismo caracter sale plano en Windows, con degradado en macOS y de otro color en Android; ademas no heredan `currentColor`, no responden al tema y no se alinean con la linea base. Eso es exactamente el "no se unifica" que motivo la regla: la app tenia un microfono, una equis y un bocadillo en emoji sueltos junto a siete plantillas con SVG dibujados a mano, cada uno con su propio `stroke-width` y su propio viewBox.

La familia es **Bootstrap Icons** (`bi:`), servida por el set oficial de Iconify. Un icono de otra familia (`mdi:`, `lucide:`) no entra sin decidir antes si la app cambia de familia entera: mezclar dos familias es la misma incoherencia que se acaba de quitar, solo que mas dificil de ver.

**Como esta montado, y por que no es el web component de Iconify.** `iconify-icon` resuelve los iconos contra `api.iconify.design` en tiempo de ejecucion. Eso mete un tercero en el arranque de una app que es un shell PWA detras de login, y sus iconos no pintan sin red: `ngsw-config.json` no cachea esa API a proposito (no tiene `dataGroups`). En su lugar:

```
tools/generate-icons.mjs            lee @iconify-json/bi (devDependency) -> escribe el registro
src/app/shared/ui/icon/icon-set.ts  GENERADO. No editar. `ICONS` + el tipo `IconName`
src/app/shared/ui/icon/icon.ts      la primitiva `<app-icon>`
```

**Anadir un icono**: buscar el nombre en iconify.design (familia `bi`), anadirlo al array `ICON_NAMES` de `tools/generate-icons.mjs`, y `npm run icons`. El archivo generado **si se versiona**: el build no depende de ejecutar el script, solo de tenerlo actualizado.

Detalles que no son obvios leyendo el codigo:

- **`name` es del tipo `IconName`, no `string`.** Es una union cerrada derivada del registro, asi que una errata en el nombre de un icono es un error de compilacion con `strictTemplates` en vez de un hueco vacio en pantalla. Es la misma idea que `@default never;` en un `@switch`.
- **El tamano se fija con `font-size`, nunca con `width`.** El SVG mide `1em`, asi que hereda del contenedor igual que el texto. `.btn-icon app-icon` centraliza el tamano de todos los botones de icono en `_components.scss`; una clase propia (`.bottom-nav__icon`) solo hace falta cuando ese sitio quiere otro tamano.
- **El color se hereda con `currentColor`.** Un icono nunca declara color propio: lo toma del texto al que acompana, y por eso el tema oscuro sale gratis.
- **`aria-hidden` es fijo y no configurable.** El nombre accesible lo pone siempre el consumidor (texto visible, `aria-label` o un `visually-hidden`), nunca el icono. Dejar que un icono aporte el nombre accesible es como se acaba con botones que un lector de pantalla anuncia como "imagen".
- **`bypassSecurityTrustHtml` es necesario** porque el sanitizador de Angular borra los elementos SVG de un `innerHTML` y el icono saldria vacio. Es seguro porque el cuerpo no es dato de usuario ni respuesta del backend: es una constante compilada desde un paquete npm. La regla que lo mantiene seguro es que `name` sea `IconName` y no `string`.

## Foco

Un solo anillo (`--focus-ring`) aplicado globalmente vía `:focus-visible` en `_base.scss`. No se redefine `outline` por componente y **no se usa `outline: none` sin sustituto**.

## Clase global vs. componente en `shared/ui/`

El criterio de corte, para que `_components.scss` no se convierta en un framework:

- **Clase global** si es solo pintura sobre un elemento que el consumidor ya escribe (`.btn`, `.badge`, `.field`, `.card`, `.menu-item`).

`.menu-item` / `.menu-divider` (2026-08-20) son el caso de libro y además ilustran la segunda razón para subir algo a global: la usan dos componentes con **encapsulación distinta** (`session-menu` y la variante `menu` de `theme-toggle`), y la alternativa era perforar la encapsulación con `::ng-deep` —deprecado— para compartir cuatro declaraciones.
`.card-metric` / `.card-note` / `.card-list` / `.card-row` (+ `__label` y `__meta`, 2026-09-04) son el mismo caso con tres consumidores: las tres tarjetas de Inicio, cada una con su propia encapsulación. Son la anatomía del cuerpo de una tarjeta de resumen — cifra grande, subtítulo, lista de filas en cajas.

  **`.card-metric` no declara `color` a propósito.** Finanzas tiñe el balance según su signo desde su propia hoja, y si la clase global pusiera un `color` las dos reglas empatarían en especificidad (0,1,0): quién gana dependería del orden de inyección de los estilos, que no está garantizado. Misma trampa que el orden de las media queries, con otro disfraz.

- **Componente en `shared/ui/`** si tiene estructura interna, estado o variantes que se expresarían mejor con inputs (`stat-card`, `section-header`, `empty-state` con acción).

Y la regla anti-abstracción-prematura: `shared/ui/` se puebla **al segundo uso**, no al primero. Con un solo caso de uso la API del componente se adivina; con dos se deduce.

## Mapeo dominio → semántica

Los estados de negocio no definen colores propios: apuntan a un token semántico. Ejemplo ya implementado en `task-list.scss` — `PENDING`/`MEDIUM` → `warning`, `IN_PROGRESS` → `primary`, `COMPLETED` → `success`, `HIGH` → `danger`, `LOW` → neutro de `.badge`. Así el tema oscuro sale gratis. Cualquier feature nueva (Finance: ingreso → `success`, gasto → `danger`) sigue el mismo patrón.

## Discrepancia conocida en la referencia

Los dos boards de referencia no coinciden en el color **Tertiary**: el claro usa emerald `#10B981`, el oscuro usa naranja `#D16900`. La spec escrita solo nombra `Success #10B981`. Resolución tomada: **emerald es `--color-success` en ambos temas** (ajustado a `#34D399` en oscuro por contraste), y el naranja del board oscuro se interpretó como el `warning` que la app ya necesitaba y la spec no nombraba — implementado como ámbar (`--color-warning`). Si el naranja era en realidad un tercer color de marca para distinguir dominios (Tareas / Finanzas / Chat), esa decisión está pendiente y añadiría un `--color-tertiary` al nivel 2.

---

# Frontend conventions & standards

Patterns established across the app shell, Auth, and Tasks — treat these as the baseline for any new feature (Finance next, then Chat), not just documentation of what already exists. Consistency across features matters more than a locally "nicer" solution — see [Development philosophy](#development-philosophy).

## Naming

- **Components**: kebab-case filename, no type suffix (`login.ts`, `home.ts`, `task-list.ts`) — class name is the PascalCase equivalent (`Login`, `Home`, `TaskList`). Selector is `app-<kebab-name>`.
- **Services**: `<name>.service.ts`, class `<Name>Service`, `@Injectable({ providedIn: 'root' })`.
- **Guards**: `<name>.guard.ts`, camelCase `CanActivateFn` (`authGuard`).
- **Interceptors**: `<name>.interceptor.ts` going forward (`auth.interceptor.ts`). `unwrap-interceptor.ts` predates this convention — not worth renaming just to match, but new interceptors should use the dot form.
- **Models**: `<name>.model.ts`, PascalCase interface/type. Es la única excepción a "sin sufijo": el sufijo declara que el archivo es un contrato de tipos, no código ejecutable.
- **Pipes**: kebab-case sin sufijo (`currency-short.ts`, clase `CurrencyShort`), en `shared/pipes/`. `name:` del pipe en camelCase (`currencyShort`).
- **Directivas**: kebab-case sin sufijo (`autofocus.ts`, clase `Autofocus`).
- **Tests**: mismo nombre base + `.spec.ts` (`task-list.spec.ts`).
- **Plain utility modules** (no DI, just exported functions): kebab-case, no suffix (`token-storage.ts`, `extract-error-message.ts`, `speech-recognition.ts`).

**Prohibido el sufijo `.component.ts` / clase `…Component`.** Angular 20 (`^20.1.0` en este repo) adopta "intent over role" en su guía de estilo: el rol lo da la carpeta (`features/`, `layout/`, `shared/ui/`), no el nombre del archivo. Todo el código existente ya es suffixless (`login.ts` → `Login`, `chat-widget.ts` → `ChatWidget`), y mezclar los dos estilos es peor que cualquiera de los dos por separado. Si un árbol, diseño o snippet propone `x.component.ts`, se traduce a `x.ts` antes de escribir nada — no se "respeta la propuesta original".

Colisión a evitar al no tener sufijos: `user.ts` (componente) y `user.model.ts` (interfaz `User`) chocan conceptualmente. Se resuelve dando al componente un nombre de intención (`user-profile.ts` → `UserProfile`) y dejando el nombre de dominio limpio para el modelo.

## Folder placement — `core/`, `layout/`, `shared/`, `features/`

- `core/` is **lógica sin UI**: auth state/guard/token storage, interceptors, HTTP utilities, `ThemeService`, and models shared by 2+ features (`ApiResponse<T>`, `Page<T>`). If only one feature touches it, it does not belong in `core/`. **No van componentes aquí** — esa es la línea que lo separa de `layout/`.
- `layout/` is **UI del shell**: cromo persistente que sobrevive a la navegación y no pertenece a ningún dominio (`theme-toggle/`, y en su momento `app-header/` y la nav). Puede inyectar servicios de `core/`.
- `shared/ui/` is for **primitivas tontas reutilizadas por 2+ features** — solo inputs, sin inyección (`stat-card`, `section-header`, `progress-bar`). Se puebla al segundo uso, nunca al primero; ver [Design system](#design-system) para el criterio de clase global vs. componente. Todavía vacío. **Se llama `ui/`, no `components/`**: el nombre acota qué puede vivir ahí (presentación pura) — `shared/components/` invita a meter cualquier componente y se convierte en un segundo `features/` sin dueño.
- `shared/pipes/` para formateo puro reutilizado por 2+ features. Misma regla del segundo uso.
- **No existe `shared/models/`.** Un DTO o es de una feature (`features/tasks/models/`) o es un contrato transversal de transporte (`core/models/`: `ApiResponse<T>`, `Page<T>`). Un `shared/models/` sería el tercer sitio donde buscar el mismo tipo. Corolario que mantiene honesto a `shared/ui/`: **una primitiva de `shared/ui/` nunca recibe un DTO de dominio como input** — recibe primitivos (`label: string`, `value: number`, `tone: 'success' | 'danger'`). En cuanto un componente de `shared/ui/` necesita importar `Task` o `TransactionResponse`, deja de ser primitiva y pertenece a la feature.
- `features/<name>/` is self-contained: its own `models/` subfolder for feature-specific DTOs, a service at the feature root, and one subfolder per screen (`task-list/`, `task-form/`). Nothing inside a feature folder should be imported by another feature — if that need shows up, the shared piece moves to `core/`, it doesn't get imported cross-feature. **Excepción única y direccional: `features/home/`** (el dashboard) puede importar **servicios y modelos** de otras features, nunca sus componentes, y nunca al revés. Un dashboard existe justamente para agregar dominios; la alternativa (subir `TaskService` y `TransactionService` a `core/`) convertiría `core/` en el vertedero de toda la lógica de negocio solo para satisfacer la regla. La flecha va siempre `home → feature`; si alguna vez una feature necesita algo de `home`, eso significa que la pieza no era de `home`.
- **Sub-componentes dentro de una feature**: `features/<name>/components/<sub>/` cuando una pantalla se parte en piezas que solo esa feature usa (`features/home/components/priority-tasks/`). El `components/` bucket se crea **al partir una pantalla que ya duele**, no de entrada: la primera versión de cada pantalla es un solo componente. Las carpetas hermanas de `components/` siguen siendo una por pantalla ruteada (`task-list/`, `task-form/`).
- **No hay buckets por tipo dentro de `core/`** (`core/services/`, `core/guards/`). `core/` se agrupa por dominio: `core/auth/` contiene `auth-state.service.ts`, `auth.guard.ts` y `token-storage.ts` juntos porque se leen juntos y cambian juntos. `core/interceptors/` y `core/models/` son la excepción aceptada: no son un dominio, son un punto de registro (`app.config.ts`) y un conjunto de contratos de transporte.

## Árbol canónico

Estado real + destino acordado (2026-08-20, revisado tras la propuesta responsive), consolidando propuestas de árbol externas contra las convenciones de arriba. `[hoy]` existe; `[luego]` es el sitio donde va cuando se construya — no se crea la carpeta vacía por adelantado.

```
src/app/
├── app.ts / app.html / app.scss / app.config.ts / app.routes.ts   [hoy]
│
├── core/                        lógica sin UI, sin componentes
│   ├── auth/                    auth-state.service.ts, auth.guard.ts, token-storage.ts   [hoy]
│   ├── http/                    extract-error-message.ts                                 [hoy]
│   ├── interceptors/            auth.interceptor.ts, unwrap-interceptor.ts               [hoy]
│   ├── models/                  api-response, page, auth-response, user-response         [hoy]
│   ├── theme/                   theme.service.ts                                         [hoy]
│   ├── data/                    data-refresh.service.ts  ← revalidar tras el agente      [hoy]
│   ├── layout/                  breakpoint.service.ts  ← matchMedia, NO CDK              [hoy]
│   └── notifications/           notification.service.ts  ← solo con UI de toast real     [luego]
│
├── layout/                      cromo del shell, persiste entre navegaciones
│   ├── theme-toggle/            [hoy]
│   ├── app-header/              marca + acciones de sesión; sin enlaces                  [hoy]
│   ├── chat-panel/              burbuja en desktop, sección a pantalla completa          [hoy]
│   ├── nav-links.ts             NAV_LINKS: los destinos, declarados UNA vez              [hoy]
│   ├── sidebar-nav/             visible ≥ desktop, lista vertical (3 rutas)              [hoy]
│   ├── bottom-nav/              visible < desktop, 4 pestañas (incl. chat)               [hoy]
│   └── session-menu/            cajón deslizante móvil/tablet: tema + salir      [hoy]
│
├── shared/                      se puebla al SEGUNDO uso, nunca al primero
│   ├── ui/                      icon/  <- <app-icon>, Bootstrap Icons via Iconify        [hoy]
│   │                            stat-card/, section-header/, progress-bar/               [luego]
│   └── pipes/                   currency-short.ts                                        [luego]
│
└── features/
    ├── auth/                    login/, register/                                        [hoy]
    ├── home/                    home.ts + components/ (financial-overview/, priority-tasks/,
    │                            assistant-widget/ ← mini-chat, mismo store que el panel)
    ├── tasks/                   task.service.ts, models/, task-list/, task-form/         [hoy]
    │                            + components/ (task-filter-tabs/, task-section/, task-item/)
    ├── finance/                 transaction.service.ts, models/, transaction-labels.ts,
    │                            date-ranges.ts, money.ts, spending-pace.ts,
    │                            dashboard-layout.ts ← posiciones de la rejilla    [hoy]
    │                            overview/, transaction-history/, transaction-form/,
    │                            transaction-detail/                               [hoy]
    │                            + components/ (expense-by-category/, monthly-flow/,
    │                            spending-pace/, transaction-row/)                 [hoy]
    │                            finance.ts + .routes.ts                           [luego]
    └── chat/                    chat.service.ts (HTTP), chat.store.ts (signals),         [hoy]
                                 models/, speech-recognition.ts
                                 + components/ (chat-thread/, chat-composer/)  [hoy]
                                 + quick-actions/  ← sin consumidor todavía    [luego]
```

Nombres que quedaron fijados al consolidar, para no volver a discutirlos: la carpeta de feature va en plural cuando el dominio es una colección (`tasks/`, no `task/`) y el servicio en singular siguiendo el recurso del backend (`task.service.ts`, `transaction.service.ts`). La feature del agente se llama `chat/`, no `ai-chat/` — ya está construida y renombrar no compra nada.

## Responsive: un solo shell, un solo `<router-outlet>`

**No existen `mobile-shell` y `desktop-shell` como componentes hermanos que se intercambian.** Es la decisión más importante de la capa responsive y la más fácil de equivocar.

Si `<router-outlet />` vive dentro de cada shell y un `@if (isMobile())` elige cuál renderizar, cruzar el breakpoint (rotar el móvil, redimensionar la ventana, abrir devtools) **destruye y recrea el subárbol entero**: el componente ruteado se reconstruye desde cero, y con él se pierde el formulario a medio llenar, el scroll, la página cargada de la lista y el estado del panel de chat. Angular no "mueve" un componente de un sitio del árbol a otro; lo mata y lo instancia de nuevo.

La regla, entonces:

- Hay **un** `app.html` con **un** `<router-outlet />` que nunca se desmonta.
- La forma (sidebar a la izquierda vs. contenido a ancho completo con barra abajo) se resuelve **en CSS**, con media queries sobre el grid del shell. El layout es un problema de layout.
- `sidebar-nav` y `bottom-nav` son dos componentes distintos porque su marcado y su semántica accesible son distintos, pero **consumen la misma lista de enlaces** — esa lista se declara una vez (constante exportada en `layout/`) y no se duplica en dos plantillas. Ambos se montan siempre; CSS decide cuál se ve. Un `@if` sobre ellos también es aceptable porque no contienen el outlet, pero CSS es preferible: no hay parpadeo en la primera pintura.
- El signal de breakpoint es para lo que CSS **no** puede hacer: cambiar `aria-*`, decidir si un menú abre como drawer o como popover, o no renderizar un árbol caro en móvil. No para elegir el shell.

### Estado construido (2026-08-20)

- **`layout/nav-links.ts`** exporta `NAV_LINKS` (Inicio `/`, Tareas `/tasks`, Finanzas `/finance`). Es la única declaración de los destinos; `sidebar-nav` y `bottom-nav` la consumen. El icono viaja dentro del `NavLink` como nombre de Iconify tipado (`icon: IconName`): un `id` propio más un `@switch` por componente reintroduciría en dos sitios justo la duplicación que la constante viene a eliminar. Hasta el 2026-08-29 era el `d` de un `<path>` 24×24 dibujado a mano; ver la sección de Iconos del design system.
- **`exact: boolean` por enlace.** `routerLinkActive` marca activo cualquier prefijo y `/` es prefijo de todo, así que sin match exacto "Inicio" se queda encendido también en `/tasks`. Es el bug por defecto de esta directiva, no un detalle.
- **`aria-current="page"` se pone a mano** leyendo la directiva por su nombre exportado (`#active="routerLinkActive"`). `routerLinkActive` solo aporta una clase, que es pintura; sin `aria-current` un lector de pantalla no sabe cuál de los tres es la página actual.
- **`styles/_layout.scss`** declara `$breakpoint-desktop: 1024px`, `$bottom-nav-height: 56px` y `$header-height: 60px` más los mixins `desktop` / `below-desktop`. No emite CSS (solo variables y mixins), así que **no se añade a `styles.scss`**: se consume con `@use` desde las cinco hojas que necesitan esos números (`app.scss`, `app-header.scss`, las dos navs y `chat-panel.scss`). Duplicar el número es cómo la burbuja del chat acaba medio tapada por la barra tras tocar un solo archivo.
- **`$header-height` es un número fijo a propósito**: el sidebar se pega con `position: sticky; top: $header-height` y sticky no puede medir a un hermano. Si cambia el alto del header, cambia en `_layout.scss` y ambos se enteran.
- **El scroll sigue siendo el de la ventana.** El header es `sticky`, no un `main { overflow-y: auto }`: `withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })` restaura la posición del *viewport*, no la de un contenedor interno, así que mover el scroll a `main` dejaría esa opción del router silenciosamente sin efecto.
- **`bottom-nav` es `position: fixed`, no `sticky`.** Un sticky en la última fila del grid no tiene recorrido dentro de su propia área y se comporta como estático. Al ser fixed no ocupa sitio en el flujo, así que el shell le reserva el hueco con `padding-bottom` — sin eso el último ítem de una lista queda debajo de la barra e inalcanzable.
- **Orden de `z-index` del cromo, de menor a mayor**: header 30, `session-menu` 40 (dentro del header), `chat-panel` 50, `bottom-nav` 60. La barra va por encima del chat a propósito: con el panel abierto a pantalla completa, las pestañas son la forma de salir de la conversación.
- **El chat es la cuarta pestaña en móvil, y sigue siendo el MISMO componente.** Por debajo del breakpoint la burbuja es `display: none` y `.chat-panel` pasa a `inset` completo apoyado sobre la barra; en escritorio, burbuja y panel anclado. Ocultar la burbuja con CSS y no con `@if` es lo que permite cruzar el breakpoint sin reconstruir el panel ni perder la conversación en pantalla.
- **El chat NO entra en `NAV_LINKS`.** Esa constante son rutas, y la consume también `sidebar-nav`. El chat no navega: alterna un panel. Meterlo dentro obligaría a convertir `NavLink` en una unión discriminada y a que el sidebar filtrase la variante que no sabe pintar, todo por un elemento que solo existe en un sitio. Se declara en la plantilla de `bottom-nav`, que es ese sitio.
- **La pestaña de chat es un `<button>` con `aria-expanded` + `aria-controls`, no un `<a>` con `aria-current`.** No es una página; es un disparador de algo desplegable, y esos son los atributos que lo describen.
- **`open` del panel es un `model()` cuyo dueño es `App`.** Hay dos disparadores en dos ramas del árbol (la burbuja del propio panel y la pestaña de la barra), y `App` es el padre común de ambos. Un servicio global para coordinar a dos hermanos que ya tienen padre sería un singleton inventado; duplicar el signal en los dos daría dos verdades para la misma pregunta.
- **Navegar cierra el chat, y no hace falta consultar el breakpoint para saberlo.** Los enlaces de `bottom-nav` emiten `chatClose` porque en escritorio esa barra es `display: none` y sus enlaces no se pueden pulsar: el clic es móvil por construcción. Sin esto, en móvil el usuario cambia de sección detrás de un panel que la tapa entera y no ve cambiar nada.
- **Una media query no añade especificidad; decide el orden de aparición.** `.x { display: flex }` y `@media (...) { .x { display: none } }` pesan lo mismo (0,1,0), así que el override tiene que ir **después** en el archivo. Esto no es teoría: `app-header.scss` tuvo el bloque `below-desktop` arriba y el `display: flex` de más abajo lo pisaba, dejando tema y cerrar sesión visibles en móvil al lado del botón del cajón que ya los contiene. Convención del repo: **los bloques de media query van al final de la hoja**, nunca junto a la regla que modifican. Se comprueba mirando el CSS emitido, no el fuente — el orden es lo único que importa y `ng build` no avisa.
- **`BreakpointService` se construyó el 2026-08-20**, y no para elegir el layout —eso sigue siendo CSS— sino para el primer caso que CSS de verdad no podía: **cerrar el `<dialog>` de `session-menu` al cruzar a escritorio**. Ocultarlo con `display: none` lo dejaría abierto con el foco atrapado y `body:has(dialog[open])` bloqueando el scroll: la app parecería congelada. Y no es teórico — un iPad en vertical (768px) que rota a horizontal (1024px) cruza el umbral con el cajón abierto.
- **`DESKTOP_BREAKPOINT_PX = 1024` está duplicado a mano** con `$breakpoint-desktop` de `_layout.scss`. No hay forma de compartir un número entre SCSS y TS sin build tooling extra; si cambia uno, cambia el otro. Mismo trato que la clave `align_theme` entre `index.html` y `ThemeService`.

Precisión que evita el siguiente intento: **ningún mecanismo de plantilla preserva la instancia al mover un componente de rama.** Ni `@if`, ni `@switch`, ni `ngTemplateOutlet`, ni `@defer` — todos destruyen y reconstruyen. Angular solo mantiene viva una instancia si su posición en el árbol de vistas no cambia. Por eso la única solución es que el outlet no se mueva nunca y sea CSS quien reordene: `grid-template-areas` distinto por media query mueve la nav de abajo al lateral sin tocar el árbol de componentes.

## `BreakpointService` — `matchMedia`, no `@angular/cdk`

`@angular/cdk` no está instalado y no se instala para esto. El repo ya tiene el patrón exacto resuelto en `core/theme/theme.service.ts`: un `signal` alimentado por un listener de `matchMedia`, expuesto como readonly, con un `computed` encima cuando hace falta derivar. `BreakpointService` es ese mismo patrón con otra media query — unas 20 líneas, cero dependencias nuevas, y consistente con lo que ya existe.

Traer el CDK entero (con su versionado atado a Angular y su superficie de API) para envolver una llamada a `matchMedia` es el tipo de abstracción prematura que [Development philosophy](#development-philosophy) descarta. Se revisa **si** algún día entra CDK por una razón real (overlays, drag & drop, a11y de listbox) — entonces migrar a `BreakpointObserver` es trivial y el resto de la app no se entera, porque nadie inyecta `matchMedia` directamente.

Los breakpoints se declaran **una sola vez** y en un solo idioma. Hoy viven en SCSS (los contenedores de `_tokens.scss`); si `BreakpointService` necesita el mismo valor, se define la constante en TS y el SCSS mantiene su media query con el mismo número, documentado en ambos sitios — igual que ya se hace con `align_theme` entre `index.html` y el servicio. No hay forma de compartir un número entre SCSS y TS sin build tooling extra, y no vale la pena.

## Chat: dominio en `features/`, montaje en `layout/`

Cerrada la decisión que estaba abierta, porque el árbol responsive la fuerza al meter un `assistant-widget` en Home:

- **`features/chat/` es el dominio**: `chat.service.ts` (HTTP puro), `chat.store.ts` (el estado), `models/`, `speech-recognition.ts`, y sub-componentes tontos `chat-thread/` (recibe mensajes, los pinta) y `chat-composer/` (draft + micro, emite `send`).
- **`layout/chat-panel/` es el montaje**: la burbuja flotante, la posición fija y el `open/close`. Es cromo del shell, igual que `theme-toggle/`. Lo monta `app.html`; ninguna feature lo importa.
- **`features/home/components/assistant-widget/` es un segundo montaje**, compuesto de los mismos `chat-thread` + `chat-composer` contra el mismo store. Esto entra por la excepción direccional de `home`.

**`chat.store.ts` deja de ser opcional en cuanto hay dos montajes.** El backend tiene **una conversación por usuario**, sin threads: dos instancias con su propio `messages()` mostrarían historiales divergentes de la misma conversación — un bug visible, no una imperfección. El store también hace que `GET /api/agent/history` se llame **una vez por sesión** (guardado por un flag `loadedOnce`), no una por cada montaje. Es la excepción de servicio con estado del [Service pattern](#service-pattern--stateless-is-the-default), y aquí está genuinamente ganada.

Regla general que se extrae de esto, porque va a volver a aparecer: **"reusable" no decide la carpeta; las dependencias sí.** Un componente usado en diez sitios que inyecta un servicio de dominio sigue siendo de la feature. Uno usado en dos que solo recibe inputs es primitiva de `shared/ui/`. Y estar presente en todas las páginas no es reuso: es **una sola instancia montada en el shell que sobrevive a la navegación** — que es justamente lo que se pierde si se instancia por página.

## Rechazado explícitamente (no reintroducir)

Piezas que aparecieron en la propuesta de árbol y **no** se construyen. Si vuelven a aparecer en un diseño, esta es la respuesta:

- **`core/services/api.service.ts`** (wrapper genérico sobre `HttpClient`). Es una capa de indirección sobre otra capa de indirección: `HttpClient` ya es el cliente, los interceptors ya resuelven token y unwrap, y el patrón de la app es un servicio stateless por feature. Un `ApiService` genérico solo añade un sitio más donde mirar cuando una petición falla.
- **`shared/components/card/` y `shared/components/priority-badge/`.** `.card` y `.badge` ya son clases globales de `_components.scss`, y el criterio de [Clase global vs. componente](#clase-global-vs-componente-en-sharedui) dice que pintura sobre un elemento que el consumidor ya escribe es clase, no componente. `progress-bar` sí califica (estructura interna: track + fill + label), pero entra a `shared/ui/` cuando lo usen dos features, no antes.
- **Streaming en el chat.** `POST /api/agent/chat` es síncrono y devuelve `{ reply: string }` completo; no hay SSE ni WebSocket. Cualquier servicio descrito como "maneja el stream" está describiendo un backend que no existe — la UI muestra estado de carga, no efecto máquina de escribir.
- **Sub-rutas de Finance `Budgets` y `Settings`.** No existe endpoint de presupuestos ni de preferencias. Finance arranca con lo que el backend soporta: `overview/` (`GET /api/transactions/summary`) y `activity/` (`GET /api/transactions` paginado).
- **`shared/components/layout/`.** El cromo del shell no es `shared/`: no se reutiliza, inyecta servicios y persiste entre navegaciones. Va en `layout/` de primer nivel, que existe exactamente para eso. Meterlo bajo `shared/` borra la línea entre "primitiva tonta" y "estructura de la app".
- **`shared/components/layout/mobile-shell/` + `desktop-shell/` como componentes intercambiables.** Ver [Responsive](#responsive-un-solo-shell-un-solo-router-outlet): destruye el componente ruteado al cruzar el breakpoint.
- **`core/services/breakpoint.service.ts` sobre CDK `BreakpointObserver`.** El servicio sí, la dependencia no — ver [BreakpointService](#breakpointservice--matchmedia-no-angularcdk). Y va en `core/layout/`, no en un bucket `core/services/`.
- **Degradar `ThemeService` a `signal<Theme>` con solo light/dark.** El árbol lo describe así, pero el servicio ya implementa `ThemePreference = 'light' | 'dark' | 'system'` con `system` como estado de primera clase y un `computed` que lo resuelve contra el SO en vivo. Quitar `system` no es simplificar: rompe el botón de tres posiciones del header y le quita el auto-dark a quien lo tenga en el sistema operativo. Ver [Cambio de tema](#cambio-de-tema-botón-del-header).

## Bloqueado por el backend, no por el frontend

No son malas ideas; no hay endpoint que las sostenga. Si vuelven a aparecer, esto es lo que falta:

- **Cards ricas dentro de la respuesta del agente** (`chat-message-budget-card`, "Top Expenses"). `POST /api/agent/chat` devuelve `{ reply: string }` — prosa, no datos tipados. Un `ChatMessage` como discriminated union en el frontend está bien como modelo (hoy con una sola variante, `text`), pero no hay nada sobre lo que discriminar mientras el backend mande texto. **Camino que sí funciona hoy sin tocar el backend**: que la card no venga del agente. Una `quick-action` tipo "Analizar gastos" llama a `GET /api/transactions/summary` desde el frontend y **compone localmente** un mensaje de tipo `summary` en el store. La union se gana su existencia ahí, con datos reales, y el agente sigue siendo texto. Lo que no se hace es parsear marcadores dentro del `reply` para fabricar cards: es frágil y se rompe cada vez que cambie el prompt del backend.
- **`task-search-bar`.** `GET /api/tasks` acepta `status`, `page`, `size` y `sort` — no hay parámetro de búsqueda. Un buscador cliente filtra **solo la página cargada**, así que con paginación mentiría: el usuario busca algo que existe, no aparece, y no hay forma de saber si es que no existe o es que está en la página 3. O el backend añade el filtro, o la búsqueda espera. Un filtro por `status` (las pestañas `task-filter-tabs`) sí es honesto porque el backend lo soporta de verdad.

## Decisiones abiertas

Ninguna pendiente ahora mismo.

**Cerrada 2026-08-20 — colisión entre la burbuja del chat y `bottom-nav`**: en móvil **no hay burbuja**. El chat es la cuarta pestaña de la barra y el panel ocupa la pantalla apoyado sobre ella; la burbuja queda solo para escritorio. Se descartó por el camino la opción de subir la burbuja por encima de la barra: eran dos disparadores para lo mismo, uno de ellos tapando contenido.

El precio es que `bottom-nav` sí conoce el estado abierto/cerrado del panel — pero lo recibe como `input`/`output` desde `App`, no lo posee ni importa nada del chat, así que la barra sigue sin depender de `features/chat/`. El `assistant-widget` de Home sigue siendo un montaje adicional, no un sustituto.

**Revisado 2026-08-20 (dos veces) — el menú móvil vuelve, y acaba siendo un cajón deslizante.** Primero como popover, y finalmente como `<dialog>` a pantalla completa entrando desde el borde derecho, en móvil **y tablet**. Esto contradice de frente el rechazo original, así que conviene ser explícito sobre qué cambió y qué no.

**Lo que sigue rechazado**: meter los destinos dentro del cajón. Esa era la mitad más grave de la objeción —navegación duplicada respecto a la barra inferior, dos sitios que mantener y que pueden divergir— y sigue en pie. `session-menu` contiene tema y cerrar sesión, cero enlaces; los cuatro destinos están en `bottom-nav`, a la vista y a un toque.

**Lo que cambió**: el precio. La objeción no era estética, era el coste — *"un overlay modal entero, con trampa de foco y bloqueo de scroll, para esconder dos botones"*. Ese coste ya no se paga, porque nada de eso se escribe a mano:

| Lo que costaba | De dónde sale ahora |
| --- | --- |
| Trampa de foco | `<dialog>` + `showModal()` |
| Cierre con Escape | `<dialog>`, nativo |
| Fondo inerte y top layer | `<dialog>`, nativo |
| Devolver el foco al cerrar | `<dialog>`, nativo |
| Bloqueo de scroll | `body:has(dialog[open])` en `_base.scss`, cero JS |
| Velo | `::backdrop` + `--color-scrim` |

Lo que queda en `session-menu.ts` son cuatro métodos y un `effect`. Detalles que no son obvios leyendo el código:

- **El `<dialog>` va sin `padding`.** "Cerrar al tocar fuera" es comparar `event.target === dialogEl`, porque un clic en el `::backdrop` llega con el diálogo como target. Con relleno, el borde del panel también reportaría el diálogo y cerraría al pulsarlo.
- **`role="dialog"` y `aria-modal` NO se escriben**: son implícitos en `<dialog>` abierto con `showModal()`. `aria-labelledby` sí, o el cajón se anuncia sin nombre.
- **La animación necesita `transition-behavior: allow-discrete` sobre `display` y `overlay`, más `@starting-style`.** Sin `allow-discrete` el navegador saca el elemento del top layer en el mismo fotograma del cierre y la salida no se ve; sin `@starting-style` no hay estado desde el que animar la entrada y solo se anima al cerrar. Verificado que los tres sobreviven al optimizador de `ng build`.
- **`prefers-reduced-motion` quita solo el recorrido**, no la modalidad: un panel que barre la pantalla de lado es justo el movimiento que provoca malestar vestibular.

## Component pattern

- Standalone, explicit `imports: [...]` array, split `.ts`/`.html`. Only add a `.scss` file when there are actual styles to put in it — an empty one just to match the shape is noise (see `home.ts`, which has no `styleUrl` at all).
- Anything the template reads reactively is a `signal()`, exposed `protected readonly`. **Incluye los campos escritos desde callbacks asíncronos que no son eventos de plantilla** — ese es el caso que más se escapa (ver el hallazgo sobre `draft` en [Deuda conocida](#deuda-conocida-detectada-en-revisión)).
- **Inputs y outputs con las APIs de signals, nunca con decoradores**: `input()`, `input.required<T>()`, `output<T>()`, `model()` para two-way. `@Input()`/`@Output()`/`EventEmitter` son legado soportado, no se escriben nuevos. Los inputs son signals, así que se derivan con `computed()` sin ningún `ngOnChanges`.
- Nombres de outputs en camelCase **sin prefijo `on`** (`send`, `valueChanged`, no `onSend`) y sin colisionar con eventos nativos (`click`, `submit`). Los inputs tampoco colisionan con propiedades DOM (`id`, `title`).
- `changeDetection: ChangeDetectionStrategy.OnPush` en todo componente nuevo. La app corre con Zone.js, así que por defecto Angular revisa el árbol entero ante cualquier evento; con el estado ya en signals, `OnPush` es gratis y acota la revisión a lo que de verdad cambió. La condición para que sea seguro es la regla de arriba: si un campo que la plantilla lee no es signal y se escribe fuera de un evento de plantilla, con `OnPush` deja de repintarse.
- Forms: `FormBuilder.nonNullable.group()` + `Validators`, guard `onSubmit()` with `if (form.invalid) { form.markAllAsTouched(); return; }`, track `submitting`/`errorMessage` signals, and on error call `extractErrorMessage(err)` — never hand-parse `err.error.message` inline (see `login.ts`/`register.ts`/`task-form.ts`). Exception: a single free-text field with no validation rules (the chat message box) uses plain `[(ngModel)]`/`FormsModule` instead — spinning up a `FormGroup` for one unvalidated field would be the premature abstraction [Development philosophy](#development-philosophy) warns against.
- **Todo `.form-error` lleva `role="alert"`.** El mensaje entra en el DOM cuando falla la petición, y un nodo que simplemente aparece no lo anuncia ningún lector de pantalla: quien no ve la pantalla se queda con un formulario que no hizo nada visible. `role="alert"` es una región `aria-live="assertive"` implícita, así que es la palabra entera del arreglo. Aplicado a los seis usos existentes el 2026-08-28 (auth, tareas); cualquier `.form-error` nuevo nace con él.

## Angular 20.3 — APIs disponibles y límites de versión

La versión instalada es **20.3.28**, y eso decide qué se puede usar. La guía general de Angular está escrita apuntando a v21+; donde diverge, manda la versión del repo.

- **`httpResource` y `resource()` están marcados `@experimental` en 20.x** (`@experimental 19.2` y `@experimental 19.0` en los `.d.ts` instalados). La recomendación general de Angular — "usa `httpResource` para lecturas y `HttpClient` solo para mutaciones" — **aplica a v21+, no aquí**. En este repo los servicios siguen devolviendo `Observable<T>` (ver [Service pattern](#service-pattern--stateless-is-the-default)): API estable, consistente con todo lo ya construido, y sin atarnos a una firma que puede cambiar. **Es el punto de revisión número uno cuando se suba a Angular 21**: las lecturas (`GET /api/tasks`, `/api/transactions`, `/api/transactions/summary`) son candidatas directas, porque `httpResource` da `value()`/`isLoading()`/`error()` como signals y borra el `subscribe` manual y los signals de `loading` escritos a mano. Las mutaciones se quedan en `HttpClient` incluso entonces.
- **`provideHttpClient(...)` sigue siendo obligatorio en v20**; lo de "`HttpClient` inyectable sin proveedor" es de v21. `app.config.ts` ya lo tiene.
- **En componentes, preferir `toSignal()` o el pipe `async` antes que `.subscribe()` a mano.** Un `subscribe` en `ngOnInit` sobre `HttpClient` no filtra (el observable completa), pero deja el estado en callbacks imperativos en vez de en la señal, y obliga a escribir a mano el `loading` y el `error`. `toSignal(obs, { initialValue })` es el camino por defecto para una lectura que la plantilla pinta.
- **`effect()` no propaga estado.** Llamar `.set()`/`.update()` sobre un signal *dentro* de un `effect` para sincronizarlo con otro es un error: causa `ExpressionChangedAfterItHasBeenChecked` y bucles. La derivación se hace con `computed()` o `linkedSignal()`, siempre. El `effect` de `ThemeService` es el caso legítimo y prácticamente el único que debería existir en la app: escribe `data-theme` en `<html>`, o sea sincroniza signal → API imperativa externa. Si además hubiera que **leer** del DOM, eso es `afterRenderEffect` con sus fases (`earlyRead` / `write`), no `effect`.
- **Estado expuesto desde un servicio va en readonly.** El patrón es `private readonly _x = signal(...)` + `readonly x = this._x.asReadonly()`, con métodos públicos para mutar. Aplica a `chat.store.ts` y a `BreakpointService` desde el primer día.
- **`@for` exige `track`, y hay que elegirlo con cabeza.** Para listas con id de servidor (`tasks`, `transactions`) es `track item.id`. Para los mensajes del chat **no hay id**: `ChatTurn` es `{ role, content }`. `track $index` es correcto ahí precisamente porque la lista es append-only — nunca se reordena ni se borra por el medio. Si algún día se pueden borrar o editar mensajes, `$index` pasa a ser un bug de reuso de DOM y hace falta un id local.
- **`@switch` con `@default never;`** para uniones cerradas (`TaskStatus`, `Priority`, y la futura union de tipos de mensaje del chat). Convierte "añadí una variante y me olvidé de pintarla" en error de compilación en vez de en una celda vacía.
- **`HttpParams` y `HttpHeaders` son inmutables**: `.set()`/`.append()` devuelven una instancia nueva, no mutan. Es la trampa clásica en los filtros opcionales de Finance (`type`, `category`, `from`, `to`) — construirlos en un bucle ignorando el retorno manda la petición sin filtros y sin ningún error.
- **`HttpErrorResponse.status === 0` significa red caída o timeout**, no un error del backend: no hay body, y no tiene sentido buscar `.error.message`. `extractErrorMessage` debe caer al mensaje genérico ahí. No confundir con el `401`, que sí es una respuesta real del servidor y tiene su propia rama en `authInterceptor`.
- **`angular-gridster2` está fijado en `^20.2.4` y sube DESPUÉS de Angular, nunca antes.** Su versionado sigue al de Angular una a una: `21.x` exige `@angular/core ^21`, `22.x` exige `^22`. Un `npm i angular-gridster2` a secas instala `latest` (hoy 22.0.0) y falla al resolver peers. Al subir el repo a Angular 21, esta dependencia entra en la misma tanda.

## Deuda conocida (detectada en revisión)

Hallazgos de la revisión contra las reglas de Angular, 2026-08-20.

**Arreglados (2026-08-20, `ng build` limpio):**

- **`chat-widget.ts`: `draft` pasó de propiedad plana a `signal('')`.** Se escribe desde el callback de `SpeechRecognition`, que no es un evento de plantilla: funcionaba solo porque Zone.js parchea el evento y dispara detección global, y habría dejado de repintarse al dictar en cuanto el componente adoptara `OnPush` o se partiera en `chat-composer`. La plantilla no cambió: **`[(ngModel)]="draft"` funciona con un `WritableSignal`** — el compilador emite `draft()` para leer y `draft.set($event)` para escribir (soportado desde v17.2, verificado con build en 20.3).
- **`ThemeService.preference` es ahora `_preference` privado + `preference = _preference.asReadonly()`.** El `cycle()` ya existía; lo que faltaba era que fuera el único camino. Cambiar la preferencia y persistirla en `localStorage` son la misma operación, así que un `.set()` desde fuera dejaba el tema aplicado pero perdido en la siguiente recarga. Efecto colateral que lo demuestra: `ThemeToggle` hacía `themeService.preference.asReadonly()` — se defendía él mismo de una fuga que ahora no existe, y esa llamada se cayó.

**Arreglados (2026-08-20, reestructura contra el árbol canónico, `ng build` limpio):**

- **`chat-widget.ts` desaparece, partido en cuatro piezas** — `features/chat/chat.store.ts` (el estado), `features/chat/components/chat-thread/` y `chat-composer/` (tontos, solo inputs/outputs), y `layout/chat-panel/` (la burbuja, la posición fija y el `open/close`). Gestionaba historial, envío, voz, apertura del panel y draft en una sola clase; ver [Chat](#chat-dominio-en-features-montaje-en-layout).
- **El header sale de `app.html` a `layout/app-header/`.** `App` se queda con lo que de verdad es el shell: rehidratar la sesión y montar header, `<router-outlet />` y panel de chat. `onLogout` y `app.scss` se fueron con él (`app.scss` quedó vacío y se borró, igual que los cuatro `.scss` vacíos de `home/`, `task-form/`, `login/` y `register/` — dos de ellos ni siquiera estaban referenciados por su `styleUrl`).
- **`OnPush` aplicado en los diez componentes de la app.** Ya no queda estado fuera de signals en ninguno, que era la condición para que fuera seguro.

**Pendiente:**

- **`ActivatedRoute` no debe aparecer en componentes nuevos.** Con `withComponentInputBinding()` ya habilitado, leer params por inyección y suscripción manual es la vía antigua. No hay ninguna pantalla que lo haga hoy; la regla existe para que la primera con `:id` no lo introduzca.

## Visual design system

- Global tokens and reusable primitives live in `src/styles.scss` — CSS custom properties (`--color-*`, `--radius`, `--shadow`, `--font-sans`) plus shared classes: `.card`/`.card--wide`, `.field`, `.btn`/`.btn-primary`/`.btn-ghost`/`.btn-block`, `.badge`, `.page`/`.page-header`, `.empty-state`, `.form-error`, `.form-footer`, `.auth-shell`. New screens should compose these instead of writing bespoke CSS for cards, buttons, or form fields — component-level `.scss` is for genuinely component-specific layout only (`task-list.scss`'s `.task-item*`/`.badge--*` color variants, `chat-panel.scss`'s fixed-position bubble/panel). Un `.scss` vacío no se crea "por simetría": si no hay estilos, no hay archivo ni `styleUrl`.
- Palette: neutral/clean — off-white background (`--color-bg: #fafafa`), near-black text, single indigo accent (`--color-accent: #4f46e5`). Picked 2026-08-20 over warmer/dark alternatives for being the safest to keep consistent as more features (Finance) get added.
- `public/manifest.webmanifest`'s `theme_color`/`background_color` and `index.html`'s `<meta name="theme-color">` are kept in sync with `--color-accent`/`--color-bg` — update both together if the palette ever changes. The icon PNGs in `public/icons/` are still the Angular CLI defaults (not regenerated to match) — that needs an external tool (e.g. realfavicongenerator.net), not something to hand-edit as code.

## Service pattern — stateless is the default

- **Default**: a stateless API-client service — `providedIn: 'root'`, injects only `HttpClient`, one method per backend endpoint, returns `Observable<T>` typed as the **already-unwrapped** DTO (`unwrapInterceptor` strips `ApiResponse<T>` before the service ever sees the body — never type a method as `Observable<ApiResponse<T>>`). No signals, no cached state; the calling component owns whatever state it needs (`TaskService` / `TaskList` is the reference example).
- **Exception**: a stateful global service (`AuthStateService`'s shape — signals for `user`/`isAuthenticated`) is only justified when the state is genuinely needed *outside* the feature that produces it (guards, the shell header, more than one unrelated feature). Don't reach for this by default for a new feature's data — it's the exception, not the starting point.

## Routing checklist

- Every route gets `canActivate: [authGuard]` **except** `login` and `register`.
- Every route uses `loadComponent: () => import(...)` for lazy loading (confirmed working — `ng build` produces a separate chunk per feature). La guía general de Angular recomienda dejar **eager** la landing page; aquí **no** se hace, deliberadamente: la app está detrás de login, así que `''` nunca es la primera impresión de un visitante anónimo, y el Service Worker cachea el chunk tras la primera visita. El coste real es un round-trip la primera vez; la ganancia es que la regla no tiene excepciones que recordar.
- `{ path: '**', redirectTo: '' }` **must be the last entry in the `routes` array.** The router evaluates top-to-bottom and `**` matches everything — anything after it is unreachable dead code. This isn't theoretical: on 2026-08-18 the Tasks routes were added after the wildcard and were silently unreachable (caught by manual testing, not by the compiler — `ng build` succeeds either way, so this has to be checked by eye or by clicking through the route).
- If a route should be reachable from the shell, add the link in `app.html`'s header, inside the `@if (authState.isAuthenticated())` block.
- Una feature con pantallas hermanas (Finance: overview / activity) declara sus rutas hijas en `features/<name>/<name>.routes.ts` y el shell la carga con `loadChildren: () => import('./features/finance/finance.routes')`. **Devolver la promesa de `import()` pelada solo funciona si ese archivo usa `export default`**; con un export nombrado (`export const FINANCE_ROUTES`) hace falta `.then(m => m.FINANCE_ROUTES)`. Es un fallo silencioso en runtime, no de compilación — elegir uno de los dos y ser consistente. Requiere además un componente contenedor con su propio `<router-outlet />`; no se anidan rutas sin él. Para una feature de una sola pantalla, `loadComponent` directo en `app.routes.ts` — no se crea un `.routes.ts` por simetría.
- Parámetros de ruta (`/tasks/:id/edit`, que llega con la feature de edición) se leen con `input()` en el componente, no inyectando `ActivatedRoute`. Ya está habilitado con `withComponentInputBinding()` — ver abajo.

### Features de `provideRouter` habilitadas

Configuradas en `app.config.ts` el 2026-08-20, anticipando el crecimiento de la app. Cada una está porque resuelve un problema concreto que ya se ve venir, no por completitud:

- **`withComponentInputBinding()`** — el param de la URL llega como `input()`. Sin esto, cada pantalla con `:id` inyecta `ActivatedRoute` y se suscribe a mano, que es estado imperativo en un componente cuyo estado ya es signals.
- **`withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' })`** — por defecto el router **no toca el scroll**: ir de una lista larga a un detalle deja la página a media altura, y el "atrás" no recupera la posición. Con listas paginadas de tareas y transacciones esto empeora solo.
- **`withRouterConfig({ paramsInheritanceStrategy: 'always' })`** — hace visibles params y `data` del padre en las rutas hijas. Es la pieza que falta para que `withComponentInputBinding` funcione en las pantallas anidadas de Finance; sin ella, el hijo no ve el param del padre y el `input()` llega `undefined`.

Descartadas a propósito, para que no se reabran sin motivo: `withViewTransitions()` (es una decisión de diseño, y se cruza con el trabajo responsive — se evalúa junto a él, no antes); `withPreloading(PreloadAllModules)` (hay pocos chunks y el Service Worker ya los cachea tras la primera visita; se revisa cuando el número crezca); `withEnabledBlockingInitialNavigation()` (es para SSR, y no hay SSR); `withHashLocation()` y `withDebugTracing()` (no aplican).

Hueco anotado, no resuelto: **`withNavigationErrorHandler()`**. Con todo lazy + Service Worker, un deploy nuevo invalida los hashes de los chunks y un `import()` de una ruta vieja falla con `ChunkLoadError` mientras la pestaña sigue abierta. Lo correcto es detectarlo y recargar. No se implementa hasta que haya un deploy real — hoy no hay ninguno.

## Adding a new feature — recipe (mirrors `features/tasks/`)

1. `features/<name>/models/<name>.model.ts` — Request/Response DTOs matching the [Backend contract](#backend-contract) section.
2. `features/<name>/<name>.service.ts` — stateless `HttpClient` wrapper, one method per endpoint used so far.
3. One folder per screen, e.g. `<name>-list/`, `<name>-form/` — standalone component + template. Reuse the shared classes from [Visual design system](#visual-design-system) (`.card`, `.field`, `.btn`, `.page`) before writing new component-specific CSS.
4. Register the routes in `app.routes.ts`, guarded and lazy-loaded, inserted **before** the `**` wildcard entry.
5. Wire a nav link into `app.html` if the feature needs to be reachable from the shell.
6. Antes de dar por buena la estructura, comprobar contra el [Árbol canónico](#árbol-canónico): ningún archivo `.component.ts`, ningún `models/` fuera de la feature o de `core/`, ningún componente nuevo en `shared/ui/` con un solo consumidor, ninguna importación cruzada entre features (salvo la excepción direccional de `home`).
7. Run `ng build` before calling it done — it won't catch the routing-order mistake above, but it does catch unused-import warnings (a good signal a template/component got out of sync) and type errors for free.

---

# Local dev setup

- Backend runs on `http://localhost:1010` (`server.port=1010` in `align`'s `application.properties`). Angular dev server runs on `http://localhost:4200`.
- `proxy.conf.json` (to be created at the project root) should forward `/api` and `/auth` to `http://localhost:1010`, so the dev server sits between the browser and the backend and CORS never comes into play locally. Wire it into `ng serve` (either via `--proxy-config proxy.conf.json` or the `serve` options in `angular.json`) so it's automatic, not something to remember to pass by hand.
- This does **not** solve CORS for a real deployment (the proxy only exists in the dev server) — that's backend work, tracked as a known gap, not yet scheduled.

---

# Current status

Auth foundation is built and confirmed working end-to-end against the live backend (login and register both tested manually, 2026-08-14). The app shell (home route + header + logout) is also built and confirmed working end-to-end (2026-08-14). Login, register, Tasks, and the app shell now share a consistent visual design system, and the chat panel is fully wired up end-to-end (2026-08-20).

## Done

- App shell — `App` (`app.ts`/`app.html`) monta `<app-header />` y `<app-chat-panel />` (ambos solo cuando `authState.isAuthenticated()`) alrededor de un único `<router-outlet />` que nunca se desmonta, y rehidrata la sesión en su constructor. No tiene `.scss` ni lógica propia: el header y el chat viven en `layout/`.
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
- App header (`layout/app-header/`) — marca y acciones de sesión en dos formas, ambas siempre en el DOM y conmutadas por CSS: en línea (`ThemeToggle` + cerrar sesión) en escritorio, y plegadas en el cajón deslizante `layout/session-menu/` en móvil y tablet. Ya **no** contiene enlaces de navegación (se fueron a `nav-links.ts` + las dos navs), así que su contenedor de acciones dejó de ser un `<nav>`: marcarlo así le mentiría al lector de pantalla, que lo ofrece como punto de referencia navegable. Alto fijo `$header-height`; quien se pega arriba es el envoltorio `.app-shell__top`, no el header por su cuenta.
- Navegación principal (2026-08-20) — `layout/nav-links.ts` + `layout/sidebar-nav/` (≥1024px, 3 rutas) + `layout/bottom-nav/` (<1024px, 4 pestañas: las 3 rutas más el chat), ambos montados siempre y conmutados por CSS. Hubo una variante intermedia con la nav en una fila superior (`top-nav`) que se descartó el mismo día: la barra inferior gana en alcance del pulgar y es la que aloja la pestaña del chat. El grid de `app.scss` reordena el shell sin tocar el árbol de componentes, así que el único `<router-outlet />` nunca se mueve de rama. Ver [Estado construido](#estado-construido-2026-08-20).
- Finanzas — **el dominio existe, la UI todavía no** (2026-08-28):
  - `features/finance/models/transaction.model.ts` — contratos verificados contra `/v3/api-docs`, no contra el resumen de este archivo. Las categorías van en **dos uniones** (`ExpenseCategory | IncomeCategory`) y no en una lista plana: es lo que permite que los `<optgroup>` del formulario y la derivación categoría → tipo salgan de una sola fuente que el compilador vigila.
  - `features/finance/transaction-labels.ts` — las 14 etiquetas en español, los dos arrays por tipo y `categoryType()`. Fuera de `models/` porque ese archivo es contrato de tipos puro; fuera de las pantallas porque lo usan tres.
  - `features/finance/date-ranges.ts` — `currentMonth()` / `lastMonth()` / `currentYear()` y sus presets. Existe porque `summary` **sin filtro devuelve el histórico completo**, que es un número que solo crece y no responde a ninguna pregunta real; el resumen arranca en el mes en curso. Formatea con componentes de fecha locales y no con `toISOString()`, que convierte a UTC antes de formatear y a partir de las 22:00 devolvería el día siguiente.
  - `features/finance/transaction.service.ts` — stateless, solo `list()` y `summary()` (los endpoints que hay pantallas para consumir). Su `toParams()` privado omite las claves vacías y **reasigna** el retorno de `HttpParams.set()`.
  - `features/finance/overview/` — pantalla real (2026-08-28): las tres cifras del **mes en curso** y los cinco últimos movimientos. Decisiones que no se leen en el código:
    - **Una sola petición combinada (`forkJoin`), no dos `subscribe`.** Las cifras de arriba y las filas de abajo describen el mismo conjunto; resueltas por separado, un movimiento nuevo aparece en la lista un instante antes de que el balance se entere y la pantalla se contradice a sí misma.
    - **La lista de cifras se pinta también mientras carga**, con un guion en cada hueco. Montarla solo al llegar los datos empuja hacia abajo todo lo que tiene debajo justo cuando el usuario está leyendo.
    - **El signo va escrito además del color, y el tipo va además en un `visually-hidden`.** El color solo excluye a quien no lo distingue; el signo `−` no lo anuncian los lectores de pantalla de forma fiable. Son tres copias del mismo dato y cada una cubre a un usuario distinto.
    - **Sin enlace "ver todos" y sin botón de crear**: `activity/` y `transaction-form/` no existen aún, y un enlace muerto es peor que su ausencia.
    - `LOCALE_ID` se **inyecta** en vez de escribir `'es-ES'` a mano como hace `task-list.ts` (que quedó como deuda menor), y las fechas ISO se parsean con `T00:00:00` para forzar lectura local — sin eso `new Date('2026-08-12')` es medianoche UTC y al oeste de Greenwich muestra el día anterior.
  - **Nada de esto está probado contra el backend vivo todavía**: `ng build` y `tsc --noEmit` limpios, pero ninguna petición se ha ejecutado de verdad. `toParams()` es lo primero que hay que ver funcionando.
- Chat feature — partido en dominio y montaje (2026-08-20), ver [Chat](#chat-dominio-en-features-montaje-en-layout):
  - `features/chat/chat.service.ts` — cliente HTTP stateless: `send()` (`POST /api/agent/chat`) y `history()` (`GET /api/agent/history`).
  - `features/chat/chat.store.ts` — el estado (`messages`/`loadingHistory`/`sending` como signals readonly) y el guard `loadedOnce` que garantiza un único GET de historial por sesión. Excepción de servicio con estado, ganada por la conversación única del backend.
  - `features/chat/components/chat-thread/` y `chat-composer/` — tontos: el primero recibe los mensajes por `input()`, el segundo posee el draft y el dictado y emite `send`.
  - **El hilo se coloca solo en el ultimo mensaje** (2026-08-29). Vive en `chat-thread` y no en el panel porque **quien tiene la barra de scroll es quien la mueve**: el `:host` de `chat-thread` lleva el `overflow-y: auto`. Efecto lateral bueno — el `assistant-widget` de Home lo heredara sin escribir nada. Cuatro decisiones dentro:
    - **`afterRenderEffect`, no `effect`.** Hay que LEER `scrollHeight`, y solo vale una vez pintado el mensaje nuevo; un `effect` corre antes del render y dejaria la vista en el alto anterior, o sea con el ultimo mensaje justo por debajo del borde. Mismo motivo que el auto-crecer del `<textarea>` en `chat-composer`.
    - **Si el usuario esta pegado al fondo se decide con su posicion ANTERIOR, no midiendo la distancia despues de insertar.** Medirla despues es el bug clasico: el mensaje recien anadido ya cuenta en `scrollHeight`, asi que una respuesta larga del agente deja al usuario "lejos del fondo" aunque estuviera pegado a el, y el hilo deja de seguirse justo cuando mas falta hace. Se lleva con un listener de `scroll` **fuera de la zona** (`runOutsideAngular` + `passive`), porque `scroll` dispara decenas de veces por segundo y con Zone.js cada evento provocaria una deteccion de cambios de toda la app; lo que escribe es un booleano plano que nadie pinta, asi que no hace falta ninguna.
    - **Un mensaje nuevo NO arrastra al que subio a leer, pero el mensaje propio SI baja.** Autoscroll incondicional es perder el sitio a media lectura; no bajar nunca deja al usuario sin ver lo que acaba de enviar. La regla se decide en local mirando `messages.at(-1)?.role === 'user'`: pulsar Enviar es pedir ver el resultado.
    - **La primera colocacion es un salto (`behavior: 'auto'`), las siguientes son suaves** — y todas secas con `prefers-reduced-motion`. Recorrer animado toda la conversacion al abrir el panel se lee como un fallo y obliga a esperar para ver lo ultimo, que es justo a lo que se venia. El panel esta dentro de un `@if (open())`, asi que cada apertura monta un `chat-thread` nuevo y vuelve a saltar: correcto sin codigo extra.
    - `chat-thread.spec.ts` (7 pruebas) espia `scrollTo` del host en vez de comprobar `scrollTop`: con desplazamiento suave el valor final no llega en el mismo tick y la prueba seria intermitente. Lo que se afirma es la intencion — si se pidio ir al fondo y con que `behavior`.
  - `layout/chat-panel/` — la burbuja flotante, la posición fija y el `open/close`. Importado estáticamente en `app.ts` (no `loadComponent`: es cromo del shell, no una ruta) y montado como hermano de `<router-outlet>`, solo cuando `authState.isAuthenticated()`.
  - Confirmado funcionando end-to-end antes del split (2026-08-20) — la conversación sobrevive a la navegación interna y a un reload.
- Revalidación tras el agente (`core/data/data-refresh.service.ts`, 2026-08-20) — `ChatStore.send()` llama a `invalidate()` al recibir la respuesta; `TaskList` escucha `changes` con `takeUntilDestroyed` y recarga la lista sin volver a mostrar el estado de carga (la lista está detrás del panel abierto, vaciarla para pintar "Cargando" sería ruido). **Pendiente de comprobar contra el backend vivo**, y Finance tendrá que suscribirse igual cuando exista. Ver la decisión de arquitectura arriba.
- Dictado en el chat (`features/chat/speech-recognition.ts` + `chat-composer`) — **reescrito el 2026-08-29** tras una revision que encontro siete fallos. Sigue siendo cliente puro (ver la decision de arquitectura arriba): ningun audio sale del navegador y el backend sigue recibiendo texto por `POST /api/agent/chat`.
  - **El campo es un `<textarea>` que crece con el contenido** hasta 160px (unas seis lineas) y luego hace scroll dentro. La altura la calcula un `afterRenderEffect` midiendo `scrollHeight`, no un `effect`: hay que LEER del DOM y eso solo da un numero correcto una vez pintado el texto nuevo. Pone `height: auto` antes de medir, o el campo crece pero no vuelve a encoger al borrar. Con textarea, **Intro envia y Mayus+Intro hace salto de linea**; sin eso el boton Enviar seria la unica salida.
  - **La transcripcion se ve en vivo** (`interimResults = true`). Sin ella el usuario habla a ciegas y no descubre que se le entendio mal hasta soltar. Dos precisiones que no se leen en el codigo:
    - **La previa NO se escribe en `draft`.** Vive en su propio signal `liveText` y el campo muestra un `computed` de los dos. Asi cancelar es dejar de mostrarla: no hay nada que deshacer, ni un instante en el que el borrador contenga texto sin confirmar.
    - **La previa es `buffer + provisionales`, no solo los provisionales.** Cuando el motor cierra una frase sus provisionales desaparecen; emitiendo solo esos, el texto ya reconocido se borraria de la pantalla a mitad de dictado.
  - **El compositor en reposo: dos botones redondos del mismo tamano y todo el ancho restante para el campo** (2026-08-29, tras verlo en el panel real). Tres arreglos que parecian estetica y eran los tres el mismo problema —el campo se quedaba con menos de la mitad del ancho—:
    - **El placeholder son dos palabras, no una frase.** "Escribe, o manten pulsado el microfono para enviar" envolvia a cuatro lineas en el ancho real del panel y estiraba la caja antes de escribir nada. **Un placeholder no documenta un gesto**: la instruccion va en el `aria-label` y el `title` del microfono, que es el control que la ejecuta. Efecto lateral: desaparece la rama por `voiceSupported` que hacia falta para no prometerle a Firefox un boton que ahi no se renderiza.
    - **Enviar es un boton de icono (`bi:send`), no de texto.** Con texto se llevaba ~90px de un panel de 440. Redondo y del tamano del microfono, los dos se leen como pareja. **`aria-label` obligatorio**: `<app-icon>` lleva `aria-hidden` fijo, asi que sin el un lector de pantalla lo anuncia como "boton".
    - **El campo vacio no se mide.** `resizeField()` sale antes de tocar `scrollHeight` si no hay texto y deja la altura en `auto`, que con `rows="1"` es exactamente una linea. El `scrollHeight` de un textarea vacio **no vale lo mismo en todos los motores**: Firefox cuenta la maquetacion del placeholder, asi que uno que envolviera dejaba la caja de cuatro lineas de alto en vacio. Medir solo cuando hay contenido lo hace determinista sin depender del motor.
    - **`scrollbar-width: thin` + `scrollbar-color` con tokens** en el textarea. La barra nativa de Windows trae flechas, se lleva ~17px del ancho y no sigue al tema oscuro.
  - **Al grabar, la fila se parte en dos** (revisado dos veces el 2026-08-29, las dos tras verlo en pantalla): **arriba el campo con la transcripcion; debajo el microfono y el carril de cancelacion a todo el ancho restante**, con la papelera al final. Antes el carril era una franja de 96px reservada dentro del propio campo y el recorrido se cortaba a media fila: se veia mal y dejaba al usuario sin saber si ya habia arrastrado bastante.
    - **La reordenacion es CSS (`flex-wrap` + `flex-basis: 100%` + `order`), no un `@if` que cambie el arbol.** El boton del microfono NO puede destruirse a mitad del gesto: se perderia la captura de puntero y el arrastre moriria en seco. Es el mismo principio que el shell responsive con un solo `<router-outlet>`.
    - **El campo va arriba y los controles abajo, y el orden lo pone `order: -1`, no el marcado.** En reposo la fila es `[microfono][campo][enviar]`; mover el campo delante en el DOM dejaria el microfono a la derecha, pegado al envio, tambien en reposo. Dos razones para que el texto quede arriba: crece hacia la conversacion en vez de empujar los controles fuera del alcance del pulgar, y **el boton que se esta manteniendo pulsado no se mueve bajo el dedo** — si se desplazara al aparecer texto, el recorrido de cancelacion cambiaria de sitio a mitad del gesto. El precio es que mientras se graba la tabulacion va de abajo arriba; asumible solo aqui, porque el campo esta en `readOnly`, el envio oculto y el microfono es el unico control real de la fila (y ya tiene el foco, porque grabar es mantenerlo pulsado).
    - **La pista arranca DEBAJO del boton, no a su derecha.** Un `margin-inline-start` negativo del ancho del microfono mas el `gap` anula la separacion de la fila, y el `padding-inline-start` devuelve el hueco por dentro. Sin eso los puntos empezaban 8px a la derecha y el recorrido se leia cortado en su origen; asi el microfono queda encima de la pista como el tirador de un control deslizante. **No descuadra la medida del recorrido**: `measureTravel()` va del borde derecho del microfono al derecho del carril, y ese no se mueve.
    - **El recorrido se mide del DOM, no es una constante.** El carril ocupa el ancho que sobra, que depende de la ventana. Se mide **una vez por gesto** en el primer `pointermove` —`getBoundingClientRect()` fuerza reflow y llamarlo a 120Hz mientras se arrastra es justo lo que hace que un gesto se sienta pegajoso— y no en `pointerdown`, porque el carril todavia no existe en el DOM en ese momento.
    - **El umbral es el 75% del carril con un suelo de 60px.** Proporcional para que "hasta el final" signifique lo mismo en cualquier ancho; el suelo porque en una ventana estrecha el 75% se queda en muy poco y el temblor del pulgar lo cruzaria solo. Se arma un poco antes del tope porque exigir el pixel exacto convierte un gesto en punteria.
    - **El relleno del carril avanza con el dedo**, animado con `transform: scaleX()` y no con `width`: escalar no dispara layout y el arrastre tiene que ir a 60fps. Sin esa barra no hay forma de saber cuanto falta, que es la queja clasica de los gestos de deslizar.
    - El envio se oculta mientras se graba: esta deshabilitado igual, y su hueco es justo el que necesita el carril para llegar al borde.
  - **No hay cronometro ni texto de ayuda** (revisado 2026-08-29). Un cronometro pertenece a grabar un audio; esto transcribe, y el resultado no depende de cuanto duro. El estado lo cuentan el microfono en rojo, el carril con su relleno y la papelera que crece al armarse, y sobre todo el texto apareciendo en el campo, que es la mejor prueba de que se esta escuchando. Consecuencias:
    - **Se cae con ello el `setInterval` y toda la maniobra de `NgZone`**: sin cronometro no hay temporizador que sacar de la zona.
    - **La region `role="status"` NO se quita.** Es el unico sitio donde el estado se dice con palabras, y quien no ve la pantalla no tiene los iconos. Que el aviso visible sea iconografico es justo lo que la hace imprescindible en vez de redundante.
    - El estado "armado" no se distingue solo por color: cambian tambien el grosor del recorrido y la escala de la papelera, ademas de la posicion del boton sobre ella. **El carril no lleva borde** (quitado el 2026-08-29: la pista punteada esperando vacia se veia como un fallo de pintura). Se le quito la PINTURA, no el elemento — `measureTravel()` mide su rect, asi que un `display: none` dejaria el recorrido en cero y cancelar se armaria al primer pixel. Perdido ese canal, el aviso de armado se apoya mas en la escala de la papelera, que es el que no depende del color.
  - **La region `role="status"` anuncia el estado, no la transcripcion.** Los resultados provisionales cambian varias veces por segundo y leerlos en voz alta seria un atropello continuo; el texto reconocido queda en el campo, que si se puede leer con calma al terminar.
  - **Soltar ENVIA** (2026-08-29). Esto revierte el "el usuario pulsa Enviar, nada se manda solo" que este archivo sostenia: el paso de revisar no desaparece, se mueve. La revision ocurre **durante** el gesto —se ve la transcripcion en vivo mientras se habla— y deslizar a la papelera es el descarte. Soltar es la confirmacion.
    - **Se envia porque hubo transcripcion, no porque haya texto.** Lo decide una bandera por gesto, no el contenido del borrador: si el borrador ya tenia algo escrito a mano y el dictado no reconoce nada, soltar no manda ese texto. Cancelar y los errores no llegan a levantar la bandera.
    - **El envio va en el handler de `end`, no en el de `transcript`.** Cuando llega el texto, `recording` sigue en pie y `onSubmit` se auto-bloquea; solo despues de apagar el estado tiene sentido enviar.
    - Las etiquetas lo dicen: el `aria-label` del boton pasa a "Suelta para enviar" y el placeholder a "manten pulsado el microfono para enviar". Una etiqueta que prometa "transcribir" cuando en realidad manda el mensaje es peor que no tener etiqueta.
  - **La interaccion es pulsar y mantener**, deslizar hasta el final del carril para cancelar, soltar para enviar. Se eligio sobre el toggle de un clic porque el gesto lleva su propia salida: con un toggle, cancelar exige un segundo clic sobre el mismo boton, indistinguible del que confirma.
  - **Todo sobre Pointer Events**, no `touch*` + `mouse*`: una sola ruta para dedo, raton y lapiz. `setPointerCapture` es lo que mantiene vivo el `pointermove` cuando el dedo ya salio del boton —o sea, justo durante el gesto de cancelar—, y el boton lleva `touch-action: none` o el navegador se queda el gesto para hacer scroll.
  - **`createDictation()` devuelve tres finales distintos —`finish` / `cancel` / `dispose`— y no el reconocedor crudo.** Es la diferencia que la API nativa hace facil de equivocar: `stop()` **entrega** el resultado y `abort()` lo descarta. El codigo anterior llamaba a `stop()` para cancelar, asi que cancelar entregaba igual.
  - **El texto se acumula dentro y se entrega una sola vez al terminar.** El motor decide por su cuenta cuando acabo la frase, asi que el resultado final puede llegar *antes* de que el usuario suelte; emitiendolo al vuelo, cancelar despues no borraria nada y "deslizar para cancelar" seria mentira la mitad de las veces.
  - **Ningun error se traga.** Cada codigo (`not-allowed`, `audio-capture`, `network`, `no-speech`, `language-not-supported`) tiene su mensaje, porque las acciones que exigen son distintas; `aborted` no muestra nada, que es el usuario cancelando a proposito. Va en un `role="alert"`, igual que el resto de `.form-error` de la app.
  - **`start()` va dentro de `try`.** Lanza `InvalidStateError` si ya habia un reconocimiento en curso, y como el estado "grabando" se encendia antes de llamarlo, la excepcion dejaba el boton pegado en rojo y muerto hasta recargar.
  - **Contexto inseguro detectado y explicado.** Chrome Android expone el constructor sobre `http`, asi que el boton aparece y `start()` falla: el sintoma es "lo pulso y no pasa nada". Es exactamente lo que ocurre al probar desde el movil contra `http://<ip-local>:4200`, y ahora lo dice.
  - **El idioma sale de `LOCALE_ID`** (`es-CO`), no de un `'es-ES'` escrito dentro del modulo.
  - **Hay equivalente por teclado**: mantener Espacio/Intro graba, soltar transcribe, Escape cancela. Un "mantener pulsado" fisico no existe sin puntero, y sin esto el dictado seria inalcanzable por teclado.
  - **El cronometro corre con `runOutsideAngular`.** Con Zone.js un `setInterval` de 1s dispara deteccion de cambios de toda la app cada segundo y deja la zona permanentemente inestable, lo que cuelga cualquier `fixture.whenStable()`. El repintado no lo necesita: `seconds` es un signal y el componente es `OnPush`.
  - **26 pruebas en `chat-composer.spec.ts`** cubren los cuatro perfiles de navegador (Chrome escritorio, Chrome Android, Safari iOS, Firefox) instalando en `window` la superficie que expone cada uno. **Lo que no cubren y sigue pendiente: una prueba en dispositivo real** — microfono de verdad, permisos de verdad y un origen HTTPS de verdad.

## Known gaps / next steps, in order

1. Task feature area — edit (`PUT /api/tasks/{id}`) and delete (`DELETE /api/tasks/{id}`); will need `TaskUpdateRequest` added to `task.model.ts`.
2. Finance feature area (`/api/transactions`) — dominio y pantalla de resumen construidos. Falta el **listado** `activity/` (paginado + filtros en query params, con chips de filtro activo y contador de resultados) y el **formulario** `transaction-form/`. En cuanto entre `activity/` como pantalla hermana hace falta `finance.routes.ts` (con `export default`) y un contenedor con su propio `<router-outlet />`; ese contenedor lleva un `<nav>` con `aria-current="page"`, **no un `role="tablist"`** — son rutas con historial propio, no paneles que se intercambian, y `@angular/aria` es v21+ y no está instalado. El selector de rango de fechas vive ahí: hoy `overview` fija el mes en curso al construirse.
3. Habit feature area (`/api/habits`) — not started. Backend REST is ready (see [Habit](#habit-apihabits) above); no pagination and no `HabitUpdateRequest`, so it's a slightly smaller build than Task/Finance. No AI tools yet, so the habit list/completion UI has no chat equivalent to fall back on.
4. `assistant-widget` en Home y `sidebar-nav` con marca/usuario — el sidebar hoy es solo la lista de enlaces.

## Tooling (no forma parte de la app, es para trabajar en el repo)

- **Graphify** (2026-08-28) — instalado localmente (`pip install graphifyy`) y registrado como skill de Claude Code. Genera un knowledge graph del repo en `graphify-out/` (`graphify update .` para refrescar tras cambios, `graphify export obsidian` para exportarlo como vault). `graphify-out/` está en `.gitignore` — es output regenerable, no se versiona.
- **Obsidian** (2026-08-28) — app de escritorio instalada vía winget, para explorar el vault que exporta Graphify.
- **`npm run icons`** (2026-08-29) — regenera `src/app/shared/ui/icon/icon-set.ts` desde `@iconify-json/bi`. Solo hace falta al anadir un icono nuevo; el archivo generado se versiona y el build no depende del script.
- **Angular skills** (2026-08-28) — `angular-developer` y `angular-new-app` instalados vía `npx skills add https://github.com/angular/skills` en `.agents/skills/` (symlink a `.claude/` local del proyecto). Pendiente decidir si `.agents/`, `.claude/` local y `skills-lock.json` se versionan o se gitignoran igual que `graphify-out/`.

## Local dev gotcha

Running the frontend against real endpoints requires the `align` Spring Boot backend running separately on `localhost:1010`. An `ECONNREFUSED` in the Vite proxy log for `/auth/*` or `/api/*` means the backend isn't up — check for a listener on port 1010 before assuming it's a frontend bug.
