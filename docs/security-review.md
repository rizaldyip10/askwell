# Security review (Phase 6, P6H-T05)

The final pass over every rule in `project.md` §9, done on 2026-11-24 against `main` at `a1ff961` (after P6H-T01 to T04 and T07 to T09).

For each rule, the table gives:
- where it is enforced (file:line; paths start at the repo root, and `web/` means `apps/web/`)
- the test that proves it
- its status:
  - **pass**: it was already enforced and tested
  - **pass (new test)**: it was enforced, and this PR adds the missing regression test
  - **finding**: it needs a change outside this task

**Result: every rule passes. There are no findings, and nothing needed to go to the lead.**

The new audit tests (this PR):

| Test | Checks |
|---|---|
| `packages/db/tests/security-audit.test.ts` | Database API rules across the whole catalog, after every migration |
| `apps/widget/src/bundle-secrets.test.ts` | Builds `widget.js` in memory and checks it holds no secret |
| `apps/web/lib/security/audit/secrets.test.ts` | `NEXT_PUBLIC_*`, `.env.example`, and which file reads each secret |
| `apps/web/lib/security/audit/plan-gates.test.ts` | Every gated action reads the plan on the server first |
| `apps/web/lib/security/audit/service-client.test.ts` | Every service-client call site, with its ownership check |
| `apps/web/lib/security/audit/xss.test.tsx` | No HTML sink; messages render as text |

The inventory tests (gates, service-client call sites, tables, functions) fail when a new item appears. Someone then has to add it to the list on purpose, with its check.

## §9 rules

| Risk | Rule | Enforced at | Tests | Status |
|---|---|---|---|---|
| Plan bypass | Plan read on the server in every gated action, never from the client | `readOwnerPlan` reads `accounts.plan` through the owner client and falls back to `free`: `web/lib/projects/create-project.ts:14`. The gated actions are listed in [Gated actions](#gated-actions). | `web/lib/security/audit/plan-gates.test.ts`: the order of steps per gate, no `plan` field in any shared request schema, no plan read from the request, no `has({ plan })`. Route tests: `app/api/projects/[id]/config/route.test.ts` (402 on Free), `app/api/widget/chat/route.test.ts:128` ("uses the Pro limit … read on the server"), `upload-url/route.test.ts:135` (plan_limit) | pass (new test) |
| Tenant leak | Owner reads use the owner client (RLS) | `getOwnedProject`: `web/lib/projects/owned-project.ts:12`. Conversations: `web/app/api/projects/[id]/conversations/route.ts:26` and `web/lib/conversations/read.ts:34,74`. Dashboard pages use only `createOwnerClient` | `service-client.test.ts` ("owner pages and read helpers never import the service client"), `packages/db/tests/initial-schema.test.ts` ("owner isolation"), `private-rls-helpers.test.ts` | pass (new test) |
| Tenant leak | Never the service client with a manual owner filter | `web/lib/supabase/service.ts:14`. The only service chains on `clerk_user_id` are writes: `web/lib/billing/sync-plan.ts:30-33` (plan update, after the webhook signature check) and `web/lib/accounts/ensure-account.ts:33-34` (insert). | `service-client.test.ts` ("no service-client chain filters on owner_id", and the `clerk_user_id` chains are writes) | pass (new test) |
| Tenant leak | Service-client writes only after the route checks ownership | See [Service-client call sites](#service-client-call-sites) | `service-client.test.ts`: a complete inventory, and the guard comes before the first `createServiceClient()` | pass (new test) |
| Tenant leak | Chunk search is scoped to one project | `web/lib/chat/db.ts:110` passes `p_project_id`. `match_chunks` filters on it. | `packages/db/tests/knowledge.test.ts:284,315` ("returns this project's ready chunks only"), `service-client.test.ts` | pass |
| Database API | Every table has RLS on, with policies and grants in its migration | `supabase/migrations/*.sql`. On dev, 0 public tables have RLS off. | `security-audit.test.ts`: all 7 tables have RLS on, and every table has an RLS policy for `authenticated` | pass (new test) |
| Database API | `anon` gets nothing | Revokes in each migration. On dev, `anon` has 0 table grants. | `security-audit.test.ts`: no table, column, sequence or function privilege, no `private` usage. Also `initial-schema.test.ts:184` | pass (new test) |
| Database API | TRUNCATE revoked from API roles | `20261117124712_initial_schema.sql` | `security-audit.test.ts` (every table, `anon` and `authenticated`), `initial-schema.test.ts:292` | pass (new test) |
| Database API | Functions: SECURITY INVOKER (DEFINER only for the RLS helpers), `search_path = ''` | Each function's migration. The helpers live in `private` since `20261124023718_private_rls_helpers.sql` | `security-audit.test.ts`: all 10 functions in `public` and `private`. Only `private.owned_*_ids` are DEFINER, and every function has `search_path=""` | pass (new test) |
| Database API | EXECUTE revoked from PUBLIC/anon/authenticated unless needed | Each function's migration | `security-audit.test.ts`: no PUBLIC EXECUTE, and the exact grantee list per function. `authenticated` gets only `owner_activity` and the 2 private helpers, as §7 says | pass (new test) |
| Database API | PostgREST aggregates never on project-wide | Dev's `authenticator` role has no `pgrst.db_aggregates_enabled` setting (checked through the MCP, 2026-11-24) | Manual check. It's project config, not code. | pass |
| Public key abuse | The public key only identifies a project and grants no owner rights | Lookup by `public_key` only: `web/lib/widget/config.ts:56`, `web/lib/chat/db.ts:35`. Owner routes need a Clerk session: `web/lib/auth/routes.ts`, `web/proxy.ts` | `app/api/widget/config/route.test.ts:50` and `app/api/widget/chat/route.test.ts:221` (unknown key gives 404), `lib/projects/public-key.test.ts`, `lib/auth/routes.test.ts` | pass |
| Cost abuse | Rate limit on public routes | Arcjet `fixedWindow` per key and IP: `web/lib/security/arcjet.ts:17,22`, applied at `web/lib/security/widget.ts:57,65` | `lib/security/widget.test.ts:57`, `app/api/widget/chat/route.test.ts:202`, `app/api/widget/config/route.test.ts:60` | pass |
| Cost abuse | Monthly message quota | `consume_message` under a row lock: `web/app/api/widget/chat/route.ts:83` | `packages/db/tests/chat.test.ts:131-253` (quota, reset, `FOR UPDATE`), `app/api/widget/chat/route.test.ts:234` | pass |
| Cost abuse | Message length limit | `MESSAGE_MAX_LENGTH`: `packages/shared/src/api/widget.ts:23`. Body byte cap: `web/app/api/widget/chat/route.ts:29` | `packages/shared/src/contract.test.ts`, `app/api/widget/chat/route.test.ts:189` (413) | pass |
| Prompt injection (visitor) | Arcjet detects it before the AI call | `detectPromptInjection`: `web/lib/security/arcjet.ts:23`. It runs at step 2 of `web/app/api/widget/chat/route.ts:56`, before lookup, count and OpenAI. | `lib/security/widget.test.ts:70,76`, `app/api/widget/chat/route.test.ts:209` | pass |
| Prompt injection (visitor) | The system prompt limits scope and never reveals itself or other projects' data | `web/lib/ai/answer.ts:37-41` (answer only from `<knowledge>`, never reveal the instructions). Retrieval is scoped to one project (see Tenant leak). | `lib/ai/answer.test.ts:20,61` (wording and every rule) | pass |
| Prompt injection (documents) | Uploaded file text is data, and the system prompt says so | `web/lib/ai/answer.ts:39`, with delimited and escaped documents | `lib/ai/answer.test.ts:73,80` (delimiters escaped so a chunk can't close the block) | pass |
| File upload | Type and size checked on the server: declared ones at `upload-url`, real size and PDF bytes at `finalize` | `knowledgeUploadUrlRequestSchema`: `packages/shared/src/api/knowledge.ts:28-34`. `checkFile`: `web/app/api/projects/[id]/knowledge/finalize/route.ts:95` | `contract.test.ts:163-175`, `finalize/route.test.ts:164,182,199` | pass |
| File upload | Private bucket with its own size and type limits | `supabase/migrations/20261119074254_knowledge.sql:16-20`. On dev: `public=false`, 10 MB, 4 MIME types. | `packages/db/tests/knowledge.test.ts:105` | pass |
| File upload | One-time signed upload URLs, never public URLs | `createSignedUploadUrl`: `upload-url/route.ts:55`. No `getPublicUrl` anywhere. | `upload-url/route.test.ts:92` (random key, signed URL) | pass |
| XSS | Visitor messages and bot replies render as text, never HTML, in the widget and the dashboard | Text children: `web/components/embed/message-bubble.tsx:21`, `web/components/conversations/thread.tsx:34`. The only `innerHTML` is the constant icon at `apps/widget/src/widget.ts:53`. | `web/lib/security/audit/xss.test.tsx` (new: no HTML sink in apps/web, the `/embed` bubble renders markup as text, the widget's one sink is a constant), `components/conversations/conversations.test.tsx:60,131` | pass (new test) |
| CORS | Public widget routes allow any origin; owner routes don't | `web/lib/widget/http.ts:5,36`. Owner routes send no `Access-Control-*`. | `web/lib/security/cors.test.ts` (P6H-T02): every route is called cross-origin | pass |
| postMessage | Loader and panel check `event.origin` on every message, and never use `*` as the target for data | Panel: `web/lib/embed/messaging.ts:5,13` (host origin only; `web/lib/embed/origin.ts` normalizes it). Loader: `apps/widget/src/widget.ts:115` (checks source and origin). The loader posts nothing. | `lib/embed/messaging.test.ts:7,16,36`, `lib/embed/origin.test.ts`, `apps/widget/src/index.test.ts:225` ("ignores a wrong origin") | pass |
| Clickjacking | Only `/embed` may be framed; other pages send `frame-ancestors 'self'` | `web/next.config.ts:5,7,37-39` | `web/next-config.test.ts` | pass |
| Webhook | Clerk webhook signature verified before any update | `verifyWebhook(req)`: `web/app/api/clerk/webhook/route.ts:28`. It runs first, and a bad signature gives 400. | `app/api/clerk/webhook/route.test.ts:106` ("bad or missing signature → 400, nothing read or written") | pass |
| Secrets | No secret keys in the widget bundle | The widget reads no env variable at all | `apps/widget/src/bundle-secrets.test.ts` (new): no secret-shaped string, no secret variable name, no `process.env` or `NEXT_PUBLIC_`, and none of the real secret values when they are set | pass (new test) |
| Secrets | No secret in `NEXT_PUBLIC_*` | `.env.example` (only §11's 6 public names) | `secrets.test.ts` (new): `.env.example` lists every §11 variable with no values, its `NEXT_PUBLIC_` names are exactly §11's, the code uses no other `NEXT_PUBLIC_` name, and no `NEXT_PUBLIC_` value set in the environment looks like a secret. `.env` and `.env*.local` are git-ignored. | pass (new test) |
| Secrets | `SUPABASE_SECRET_KEY` read only by `lib/supabase/service.ts`, which imports `server-only` | `web/lib/supabase/service.ts:1,17` | `secrets.test.ts`: exactly one reader per secret, `import "server-only"` first, no client component imports it. Same for `OPENAI_API_KEY` (`lib/ai/client.ts`), `ARCJET_KEY` (`lib/security/arcjet.ts`) and `LANDING_WIDGET_KEY` (`lib/landing/widget-key.ts`). Our code never reads the Clerk secrets; the SDK does. | pass (new test) |
| Secrets | Test keys only | Every environment uses the Clerk development instance and the Supabase dev project (§4) | Not testable in code. Checked by the product owner's setup. | pass (as configured) |

## Gated actions

Each one reads the plan on the server before the check and the write it guards (`plan-gates.test.ts`).

| Action | Plan read | Gate | Guarded write |
|---|---|---|---|
| `POST /api/projects` (project limit) | `web/app/api/projects/route.ts:46` | `PLAN_LIMITS[plan].projects`: `web/lib/projects/create-project.ts:32` | `create_project` (limit checked under a row lock) |
| `POST /api/projects/:id/knowledge` (source limit) | `web/app/api/projects/[id]/knowledge/route.ts:35` | `knowledgeLimit(plan)` | `reserve_knowledge_source` |
| `POST /api/projects/:id/knowledge/upload-url` (source limit) | `upload-url/route.ts:39` | `knowledgeLimit(plan)` | `reserve_knowledge_source` |
| `PATCH /api/projects/:id/config` (Pro only, 402) | `web/app/api/projects/[id]/config/route.ts:49` | `PLAN_LIMITS[plan].customWidget` (line 50) | `updateWidgetConfig` (line 55) |
| `GET /api/widget/config` and `/embed` (Free gets defaults and the badge) | `web/lib/widget/config.ts:62` (`accounts.plan` joined by public key) | `applyPlanToWidgetConfig` | (read only) |
| `POST /api/widget/chat` (monthly quota) | `web/lib/chat/db.ts:40` | `PLAN_LIMITS[project.plan].messagesPerMonth`: `web/app/api/widget/chat/route.ts:75` | `consume_message` (line 83) |

`finalize` isn't a gate. The source was already counted at `upload-url`, so finalize only claims a row that is already reserved. The dashboard pages (Knowledge, Customize, Billing, Usage) read the plan on the server too, but only for display.

## Service-client call sites

Every file that calls `createServiceClient()` (`service-client.test.ts` keeps this list complete).

| File | Why the service client | Check before it |
|---|---|---|
| `web/app/api/projects/[id]/knowledge/route.ts:37` | Reserve and process pasted text | `checkOwnedProjectRequest` (session, then `getOwnedProject` through the owner client): `web/lib/knowledge/routes.ts:155-174` |
| `web/app/api/projects/[id]/knowledge/upload-url/route.ts:41` | Reserve, and get a signed upload URL | `checkOwnedProjectRequest` |
| `web/app/api/projects/[id]/knowledge/finalize/route.ts:45` | Claim this project's uploading source, then download and process | `checkOwnedProjectRequest`. The claim also filters on `project_id`. |
| `web/app/api/knowledge/[id]/route.ts:36` | Remove the file and the source row | Owner-client read of the source (RLS): line 28-34 |
| `web/app/api/projects/[id]/route.ts:96` | Remove a deleted project's files | Owner-client delete returned the row: line 86-88 |
| `web/app/api/projects/[id]/config/route.ts:55` | Write `widget_configs` | Owner-client project read (line 44-46), then the plan (line 49-50) |
| `web/lib/projects/create-project.ts:30` | `create_project` RPC | `owner_id` is the session's Clerk user ID (`POST /api/projects`) |
| `web/lib/accounts/ensure-account.ts:31` | Insert the session user's `accounts` row | Session user ID (`current-account.ts`, `POST /api/projects`), or the webhook's verified user |
| `web/lib/billing/sync-plan.ts:60` | Set `accounts.plan` | The webhook signature check, then Clerk's own subscription read |
| `web/lib/knowledge/process.ts:49` | Chunks and status for one source | Called only by paste and finalize, after their checks |
| `web/lib/widget/config.ts:53` | Config by public key | Public route; the key only identifies the project |
| `web/lib/chat/db.ts:30-125` | Project by key, quota, chunk search, saving the turn | Public route; the project comes from the key only, and the conversation is checked with `conversation_belongs` |

## Supabase security advisor (dev, 2026-11-24)

After applying every migration on `main` (up to `20261124073533_knowledge_failure_reason`), `get_advisors(type: security)` returned **0 lints: no ERROR and no WARN**.

## `pnpm audit --prod` (2026-11-24)

`No known vulnerabilities found`. That means no high or critical advisories, and nothing to explain.

## Notes (no action needed)

- `apps/widget/src/widget.ts:53` sets `button.innerHTML` to a constant SVG string. No visitor or server data reaches it, and `xss.test.tsx` checks that it stays a single literal.
- Vercel adds `access-control-allow-origin: *` on prerendered and cached pages. Those are static HTML, not owner API routes, so the CORS rule still holds. This was noted in PR #47.
