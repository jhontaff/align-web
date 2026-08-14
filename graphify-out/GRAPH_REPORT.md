# Graph Report - .  (2026-08-14)

## Corpus Check
- Corpus is ~7,385 words - fits in a single context window. You may not need a graph.

## Summary
- 207 nodes · 231 edges · 29 communities (17 shown, 12 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 14 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Angular Build Config
- Auth State & Guard
- Test & Dev Tooling
- Angular Core Dependencies
- App Shell & Bootstrap
- Angular Workspace Metadata
- Architecture Decisions & Shell
- Package Scripts & Metadata
- Angular Build Options
- Auth Endpoints & Login UI
- Login Component Logic
- Project Identity
- Finance Transactions API Contract
- Service Worker Config
- ApiResponse Unwrap Exception
- Dev Proxy & CORS Workaround
- Task API Contract
- Auth Error Handling
- Current User Endpoint
- Error Message Extraction
- Client-Side Logout
- PWA Icon 128x128
- PWA Icon 144x144
- PWA Icon 152x152
- PWA Icon 192x192
- PWA Icon 384x384
- PWA Icon 512x512
- PWA Icon 72x72
- PWA Icon 96x96

## God Nodes (most connected - your core abstractions)
1. `AuthStateService` - 12 edges
2. `align-web` - 7 edges
3. `options` - 7 edges
4. `production` - 6 edges
5. `development` - 6 edges
6. `options` - 6 edges
7. `scripts` - 6 edges
8. `getToken()` - 6 edges
9. `UserResponse` - 6 edges
10. `architect` - 5 edges

## Surprising Connections (you probably didn't know these)
- `AlignWeb README` --semantically_similar_to--> `Align Web (Frontend Project)`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md
- `Register Link (routerLink to /register)` --references--> `POST /auth/register`  [INFERRED]
  src/app/features/auth/login/login.html → CLAUDE.md
- `Login Form Template (email/password)` --references--> `POST /auth/login`  [INFERRED]
  src/app/features/auth/login/login.html → CLAUDE.md
- `Chat as Persistent Floating Panel (sibling to router-outlet)` --references--> `<router-outlet /> (root app shell)`  [INFERRED]
  CLAUDE.md → src/app/app.html
- `manifest.webmanifest link` --references--> `PWA Scope: Installable Shell Only, Not Offline-First Data`  [INFERRED]
  src/index.html → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Authentication Flow (register/login, tokens, login UI)** — claude_md_auth_login_endpoint, claude_md_auth_register_endpoint, claude_md_authresponse, src_app_features_auth_login_login_form, claude_md_token_storage_localstorage [INFERRED 0.80]
- **HTTP Response/Error Handling Pipeline** — claude_md_apiresponse_envelope, claude_md_unwrapinterceptor, claude_md_authinterceptor, claude_md_extracterrormessage, claude_md_agent_chat_unwrapped_exception [INFERRED 0.85]
- **Chat Agent Panel Architecture** — claude_md_agent_chat_api, claude_md_chat_floating_panel, claude_md_chat_no_streaming, claude_md_chat_no_history_endpoint, src_app_app_router_outlet [INFERRED 0.80]

## Communities (29 total, 12 thin omitted)

### Community 0 - "Angular Build Config"
Cohesion: 0.09
Nodes (25): architect, build, extract-i18n, serve, test, builder, configurations, defaultConfiguration (+17 more)

### Community 1 - "Auth State & Guard"
Cohesion: 0.16
Nodes (11): Injectable, authGuard(), AuthStateService, LoginRequest, RegisterRequest, clearToken(), getToken(), setToken() (+3 more)

### Community 2 - "Test & Dev Tooling"
Cohesion: 0.09
Nodes (23): @angular/build, @angular/cli, @angular/compiler-cli, jasmine-core, karma, karma-chrome-launcher, karma-coverage, karma-jasmine (+15 more)

### Community 3 - "Angular Core Dependencies"
Cohesion: 0.10
Nodes (21): @angular/common, @angular/compiler, @angular/core, @angular/forms, @angular/platform-browser, @angular/router, @angular/service-worker, dependencies (+13 more)

### Community 4 - "App Shell & Bootstrap"
Cohesion: 0.22
Nodes (7): App, appConfig, routes, Component, isApiResponse(), unwrapInterceptor(), ApiResponse

### Community 5 - "Angular Workspace Metadata"
Cohesion: 0.15
Nodes (12): prefix, projectType, root, schematics, sourceRoot, newProjectRoot, projects, align-web (+4 more)

### Community 6 - "Architecture Decisions & Shell"
Cohesion: 0.18
Nodes (12): POST /api/agent/chat API, Architect/Mentor Role Directive (guide, don't implement), Chat as Persistent Floating Panel (sibling to router-outlet), No Conversation History Endpoint (deliberate YAGNI), Synchronous Chat, No Streaming/Typing Effect, Current Status: Freshly Scaffolded, Default Template Not Yet Replaced, PWA Scope: Installable Shell Only, Not Offline-First Data, YAGNI Development Philosophy (no premature abstractions) (+4 more)

### Community 7 - "Package Scripts & Metadata"
Cohesion: 0.17
Nodes (11): name, prettier, overrides, private, scripts, build, ng, start (+3 more)

### Community 8 - "Angular Build Options"
Cohesion: 0.25
Nodes (11): options, assets, browser, inlineStyleLanguage, polyfills, styles, tsConfig, options (+3 more)

### Community 9 - "Auth Endpoints & Login UI"
Cohesion: 0.29
Nodes (7): POST /auth/login, POST /auth/register, AuthResponse DTO, No Refresh Token Policy (24h JWT, re-login only), Token Storage in localStorage (24h persistence over XSS minimization), Login Form Template (email/password), Register Link (routerLink to /register)

### Community 10 - "Login Component Logic"
Cohesion: 0.47
Nodes (3): extractErrorMessage(), Login, Component

### Community 11 - "Project Identity"
Cohesion: 0.40
Nodes (5): Align Backend (Spring Boot Repo), Align Web (Frontend Project), AlignWeb README, Angular CLI, Karma Test Runner

### Community 12 - "Finance Transactions API Contract"
Cohesion: 0.40
Nodes (5): Category Alone Derives Transaction Type (no type selector), FinancialSummaryResponse DTO, TransactionRequest / TransactionUpdateRequest DTO, TransactionResponse DTO, /api/transactions API

### Community 13 - "Service Worker Config"
Cohesion: 0.50
Nodes (3): assetGroups, index, $schema

### Community 14 - "ApiResponse Unwrap Exception"
Cohesion: 1.00
Nodes (3): Unwrapped AgentResponse Exception to ApiResponse Envelope, ApiResponse<T> Envelope, unwrapInterceptor Design (pure response transform)

### Community 15 - "Dev Proxy & CORS Workaround"
Cohesion: 1.00
Nodes (3): No Backend CORS Config - Dev Proxy Workaround, No environment.ts - Relative API Paths Everywhere, proxy.conf.json

### Community 16 - "Task API Contract"
Cohesion: 0.67
Nodes (3): /api/tasks API, TaskRequest / TaskUpdateRequest DTO, TaskResponse DTO

## Knowledge Gaps
- **84 isolated node(s):** `$schema`, `version`, `newProjectRoot`, `projectType`, `style` (+79 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `Test & Dev Tooling` to `Package Scripts & Metadata`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Angular Core Dependencies` to `Package Scripts & Metadata`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `architect` connect `Angular Build Config` to `Angular Workspace Metadata`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `$schema`, `version`, `newProjectRoot` to the rest of the system?**
  _84 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Angular Build Config` be split into smaller, more focused modules?**
  _Cohesion score 0.08666666666666667 - nodes in this community are weakly interconnected._
- **Should `Test & Dev Tooling` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `Angular Core Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._