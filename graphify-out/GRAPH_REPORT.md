# Graph Report - align-web  (2026-08-19)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 251 nodes · 313 edges · 30 communities (18 shown, 12 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ba7155cd`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- devDependencies
- auth-state.service.ts
- development
- dependencies
- app.ts
- TaskResponse
- align-web
- app.routes.ts
- options
- <router-outlet /> (root app shell)
- package.json
- app.config.ts
- AuthResponse DTO
- /api/transactions API
- ngsw-config.json
- Unwrapped AgentResponse Exception to ApiResponse Envelope
- No Backend CORS Config - Dev Proxy Workaround
- /api/tasks API
- 401/403 Non-ApiResponse Error Shape (branch on status code)
- GET /auth/me
- Business/Validation Error Shape (ApiResponse.error)
- Client-Side-Only Logout (stateless JWT, no server blacklist)
- PWA App Icon (128x128) - Angular Shield Logo
- PWA App Icon (144x144)
- PWA App Icon (152x152)
- PWA App Icon (192x192, Angular Logo)
- PWA App Icon (384x384) - Angular Shield Logo
- PWA App Icon (512x512)
- Angular PWA App Icon (72x72)
- PWA App Icon 96x96

## God Nodes (most connected - your core abstractions)
1. `AuthStateService` - 13 edges
2. `TaskResponse` - 9 edges
3. `TaskList` - 7 edges
4. `align-web` - 7 edges
5. `extractErrorMessage()` - 7 edges
6. `options` - 7 edges
7. `App` - 6 edges
8. `TaskService` - 6 edges
9. `getToken()` - 6 edges
10. `UserResponse` - 6 edges

## Surprising Connections (you probably didn't know these)
- `AlignWeb README` --semantically_similar_to--> `Align Web (Frontend Project)`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md
- `Login Form Template (email/password)` --references--> `POST /auth/login`  [INFERRED]
  src/app/features/auth/login/login.html → CLAUDE.md
- `Register Link (routerLink to /register)` --references--> `POST /auth/register`  [INFERRED]
  src/app/features/auth/login/login.html → CLAUDE.md
- `Default Angular Placeholder Template` --references--> `Current Status: Freshly Scaffolded, Default Template Not Yet Replaced`  [INFERRED]
  src/app/app.html → CLAUDE.md
- `Chat as Persistent Floating Panel (sibling to router-outlet)` --references--> `<router-outlet /> (root app shell)`  [INFERRED]
  CLAUDE.md → src/app/app.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Authentication Flow (register/login, tokens, login UI)** — claude_md_auth_login_endpoint, claude_md_auth_register_endpoint, claude_md_authresponse, src_app_features_auth_login_login_form, claude_md_token_storage_localstorage [INFERRED 0.80]
- **Chat Agent Panel Architecture** — claude_md_agent_chat_api, claude_md_chat_floating_panel, claude_md_chat_no_streaming, claude_md_chat_no_history_endpoint, src_app_app_router_outlet [INFERRED 0.80]
- **HTTP Response/Error Handling Pipeline** — claude_md_apiresponse_envelope, claude_md_unwrapinterceptor, claude_md_authinterceptor, claude_md_extracterrormessage, claude_md_agent_chat_unwrapped_exception [INFERRED 0.85]

## Communities (30 total, 12 thin omitted)

### Community 0 - "devDependencies"
Cohesion: 0.07
Nodes (27): @angular/build, @angular/compiler-cli, Align Backend (Spring Boot Repo), Align Web (Frontend Project), jasmine-core, karma, karma-chrome-launcher, karma-coverage (+19 more)

### Community 1 - "auth-state.service.ts"
Cohesion: 0.14
Nodes (13): Injectable, authGuard(), AuthStateService, LoginRequest, RegisterRequest, clearToken(), getToken(), setToken() (+5 more)

### Community 2 - "development"
Cohesion: 0.09
Nodes (25): architect, build, extract-i18n, serve, test, builder, configurations, defaultConfiguration (+17 more)

### Community 3 - "dependencies"
Cohesion: 0.11
Nodes (19): @angular/common, @angular/compiler, @angular/core, @angular/forms, @angular/platform-browser, @angular/router, @angular/service-worker, dependencies (+11 more)

### Community 4 - "app.ts"
Cohesion: 0.15
Nodes (9): App, Component, ChatService, Injectable, ChatWidget, Component, AgentResponse, ChatMessage (+1 more)

### Community 5 - "TaskResponse"
Cohesion: 0.19
Nodes (9): Page, TaskPriority, TaskRequest, TaskResponse, TaskStatus, TaskList, Component, TaskService (+1 more)

### Community 6 - "align-web"
Cohesion: 0.13
Nodes (14): prefix, projectType, root, schematics, sourceRoot, analytics, cli, newProjectRoot (+6 more)

### Community 7 - "app.routes.ts"
Cohesion: 0.21
Nodes (7): extractErrorMessage(), Login, Component, Register, Component, TaskForm, Component

### Community 8 - "options"
Cohesion: 0.23
Nodes (12): options, assets, browser, inlineStyleLanguage, polyfills, styles, tsConfig, options (+4 more)

### Community 9 - "<router-outlet /> (root app shell)"
Cohesion: 0.18
Nodes (12): POST /api/agent/chat API, Architect/Mentor Role Directive (guide, don't implement), Chat as Persistent Floating Panel (sibling to router-outlet), No Conversation History Endpoint (deliberate YAGNI), Synchronous Chat, No Streaming/Typing Effect, Current Status: Freshly Scaffolded, Default Template Not Yet Replaced, PWA Scope: Installable Shell Only, Not Offline-First Data, YAGNI Development Philosophy (no premature abstractions) (+4 more)

### Community 10 - "package.json"
Cohesion: 0.17
Nodes (11): name, prettier, overrides, private, scripts, build, ng, start (+3 more)

### Community 11 - "app.config.ts"
Cohesion: 0.33
Nodes (5): appConfig, routes, isApiResponse(), unwrapInterceptor(), ApiResponse

### Community 12 - "AuthResponse DTO"
Cohesion: 0.29
Nodes (7): POST /auth/login, POST /auth/register, AuthResponse DTO, No Refresh Token Policy (24h JWT, re-login only), Token Storage in localStorage (24h persistence over XSS minimization), Login Form Template (email/password), Register Link (routerLink to /register)

### Community 13 - "/api/transactions API"
Cohesion: 0.40
Nodes (5): Category Alone Derives Transaction Type (no type selector), FinancialSummaryResponse DTO, TransactionRequest / TransactionUpdateRequest DTO, TransactionResponse DTO, /api/transactions API

### Community 14 - "ngsw-config.json"
Cohesion: 0.50
Nodes (3): assetGroups, index, $schema

### Community 15 - "Unwrapped AgentResponse Exception to ApiResponse Envelope"
Cohesion: 1.00
Nodes (3): Unwrapped AgentResponse Exception to ApiResponse Envelope, ApiResponse<T> Envelope, unwrapInterceptor Design (pure response transform)

### Community 16 - "No Backend CORS Config - Dev Proxy Workaround"
Cohesion: 1.00
Nodes (3): No Backend CORS Config - Dev Proxy Workaround, No environment.ts - Relative API Paths Everywhere, proxy.conf.json

### Community 17 - "/api/tasks API"
Cohesion: 0.67
Nodes (3): /api/tasks API, TaskRequest / TaskUpdateRequest DTO, TaskResponse DTO

## Knowledge Gaps
- **83 isolated node(s):** `TaskPriority`, `TaskStatus`, `@angular/build`, `@angular/compiler-cli`, `jasmine-core` (+78 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `options`, `package.json`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **Why does `zone.js` connect `options` to `dependencies`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **What connects `TaskPriority`, `TaskStatus`, `@angular/build` to the rest of the system?**
  _83 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `devDependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._
- **Should `auth-state.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1396011396011396 - nodes in this community are weakly interconnected._
- **Should `development` be split into smaller, more focused modules?**
  _Cohesion score 0.08666666666666667 - nodes in this community are weakly interconnected._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._