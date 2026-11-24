# Launch runbook (production)

The product owner's steps to take Askwell live, once (`docs/project.md` §4 "Production rollout").
Do them in order. Each step ends with a check. Tick it before moving on.

**Decisions this runbook follows**

- Production uses the **same Clerk development instance** as dev and previews, with its test keys (product owner decision, 2026-11-24). Billing stays in test mode, so Pro is paid with a test card. Two limits come with it:
  - **100 users in total.** Clerk caps a development instance at 100 users, and dev, previews and production share them (18 on 2026-11-24). Past the cap, new sign-ups fail. Delete test users after each check (Clerk → Users). Moving production to a Clerk production instance (needs your own domain) is a later decision for the lead and you.
  - **Test addresses are open.** Anyone can sign in to an email containing `+clerk_test` with code `424242`. Never own anything real with such an address, and delete each test account right after its check.
- Supabase **prod** is a new, empty project. Only migration files reach it. Never copy data from dev.
- Vercel's automatic production promotion stays **off**. Nothing is live until you press Promote.

**What you need open:** the Supabase dashboard, the Clerk dashboard (dev instance), the Vercel project, a terminal with the repo on the latest `main` and the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started).

No secret value goes in this file, a PR, a chat or a commit. Copy values straight from one dashboard into another.

---

## 1. Supabase production project

1. **Create the project.** Supabase → New project → name it `askwell-prod`, Free plan, the region closest to your Vercel functions (Vercel → Settings → Functions → Region). Save the database password in your password manager. The Free plan allows 2 active projects per organization; dev and prod use both, so pause or delete any other free project first.
   - [ ] The project shows "Healthy".
2. **Note its reference ID.** Settings → General → Project ID (the `<prod-ref>` below).
3. **Accept Clerk tokens (third-party auth).** Authentication → Sign In / Providers → Third-Party Auth → **Add provider → Clerk** → enter the Clerk domain of the **dev instance** (Clerk → Configure → Integrations → Supabase shows it; it's the same value the dev Supabase project uses). Clerk's Supabase integration is already active on that instance, so nothing changes on the Clerk side.
   - [ ] Third-Party Auth lists Clerk with the same domain as the dev project's.
4. **Apply every migration, in order.** In the repo, on the latest `main`:
   ```bash
   supabase login                               # once, opens the browser
   supabase link --project-ref <prod-ref>       # asks for the database password
   supabase migration list                      # every file shows under Local, nothing under Remote
   supabase db push                             # applies them in file order and records each version
   supabase migration list                      # every version now shows under Local AND Remote
   ```
   Record each version as you check it off. As of this runbook, `supabase/migrations` holds 7 files:

   | # | Version | File | Applied |
   |---|---|---|---|
   | 1 | 20261117124712 | `initial_schema.sql` | [ ] |
   | 2 | 20261119033819 | `create_project.sql` | [ ] |
   | 3 | 20261119074254 | `knowledge.sql` | [ ] |
   | 4 | 20261119080609 | `chat.sql` | [ ] |
   | 5 | 20261123023406 | `owner_activity.sql` | [ ] |
   | 6 | 20261124023718 | `private_rls_helpers.sql` | [ ] |
   | 7 | 20261124073533 | `knowledge_failure_reason.sql` | [ ] |

   If `main` has more files than this table, apply and record those too. The dev project has the same 7 versions, so prod and dev match.
   - [ ] `supabase migration list` shows all versions on both sides, none missing.
5. **Check the `knowledge` bucket** (created by migration 3). Storage → Buckets → `knowledge`:
   - [ ] **Private** (not public).
   - [ ] File size limit **10 MB**.
   - [ ] Allowed types: `application/pdf`, `text/markdown`, `text/x-markdown`, `text/plain`.
6. **Check the security advisor.** Advisors → Security Advisor → Refresh.
   - [ ] **No errors and no warnings** about tables, functions, RLS or exposed schemas. The dev project shows 0 lints on 2026-11-24, so prod should too. The app doesn't use Supabase Auth, so a lint about Auth settings (e.g. leaked password protection) doesn't apply; anything else, stop and tell the lead.
   - [ ] Database → Extensions: `vector` is on (migration 1 turns it on).
7. **Copy three values for Vercel** (step 3). Settings → API Keys and Settings → Data API:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Publishable key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - Secret key (create one named `vercel-production`) → `SUPABASE_SECRET_KEY`

## 2. Clerk webhook for production (dev instance)

The webhook keeps `accounts.plan` in sync. Production needs its own endpoint, because it writes to the prod database.

1. Find the production URL: Vercel → Settings → Domains (e.g. `https://askwell-<team>.vercel.app`, or your own domain). It's `<prod-url>` below. No trailing slash.
2. Clerk → Configure → Webhooks → **Add Endpoint**:
   - URL: `<prod-url>/api/clerk/webhook` (no bypass query: production isn't behind Vercel's preview protection).
   - Events: tick the whole **`subscriptionItem`** group (every `subscriptionItem.*` event). Nothing else is needed; the route ignores other events.
   - Create.
3. Open the new endpoint → **Signing Secret** → copy it → it becomes `CLERK_WEBHOOK_SIGNING_SECRET` for **Production** in step 3. It differs from the preview endpoint's secret.
   - [ ] Two endpoints now: the preview one (unchanged) and the production one.

**Good to know:** both endpoints get every billing event, because dev and prod share one Clerk instance. Each writes only to its own database. A user who upgraded **before** the production endpoint existed shows as Free in production until their next subscription event. Use a fresh user for anything that must be Pro in production (step 5).
Two side effects, both accepted for launch:
- **Accounts in the other database.** Each endpoint creates an `accounts` row for the user if there isn't one, so a preview user who subscribes gets a row in prod, and a prod user gets one in dev.
- **`upgraded` counted twice.** Both endpoints send `upgraded` to the same PostHog project, so one upgrade shows as two events. Read the funnel's last step with that in mind.

## 3. Vercel Production variables

Vercel → Settings → Environment Variables. For each row, add the variable to **Production** only (leave Preview and Development as they are). Every variable from `project.md` §11:

| Variable | Production value comes from |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Prod Supabase** (step 1.7) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Prod Supabase** (step 1.7) |
| `SUPABASE_SECRET_KEY` | **Prod Supabase** (step 1.7). Mark it Sensitive. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Same value as Preview (same Clerk dev instance) |
| `CLERK_SECRET_KEY` | Same value as Preview. Sensitive. |
| `CLERK_WEBHOOK_SIGNING_SECRET` | **New**: the production endpoint's signing secret (step 2.3). Sensitive. |
| `OPENAI_API_KEY` | Same value as Preview. Sensitive. |
| `ARCJET_KEY` | Same value as Preview. Sensitive. |
| `NEXT_PUBLIC_POSTHOG_KEY` | Same value as Preview (one PostHog project) |
| `NEXT_PUBLIC_POSTHOG_HOST` | Same value as Preview |
| `NEXT_PUBLIC_APP_URL` | **New**: `<prod-url>` (step 2.1), `https://`, no trailing slash |
| `LANDING_WIDGET_KEY` | **Leave unset for now.** Step 5 creates the project and sets it. The landing page works without it (no widget). |

- [ ] Production has all 11 variables above (12 after step 5), each with the source in the table.
- [ ] None of the three Supabase variables in Production equals the Preview value (Preview stays on the dev project).
- Don't add `VERCEL_AUTOMATION_BYPASS_SECRET` or `SUPABASE_ACCESS_TOKEN` to Production: the app doesn't read them.

## 4. Promote the build

`NEXT_PUBLIC_*` values are built into the app, and Vercel only applies variable changes to new deployments. So build again after step 3, then promote that build.

1. Vercel → Deployments → filter **Production** → the newest deployment from `main` (its commit matches the latest `main` on GitHub) → **⋯ → Redeploy** (leave "Use existing Build Cache" off).
2. Wait for **Ready**. Open its own deployment URL (not the domain) and check that `/` loads.
3. **⋯ → Promote**. Confirm.
   - [ ] Vercel → Settings → Domains: `<prod-url>` points at that deployment ("Current").
   - [ ] `<prod-url>/` loads the dark landing page, with no chat button yet (no `LANDING_WIDGET_KEY`).
   - [ ] `<prod-url>/widget.js` loads (JavaScript, not a 404).
   - [ ] Sign up with a fresh `+clerk_test` email (code `424242`) → you land on an empty dashboard. In prod Supabase, Table Editor → `accounts` has that user's row. This proves Clerk tokens reach prod RLS.
   - [ ] Delete that test user: Clerk → Users → the user → Delete; then in prod Supabase delete its `accounts` row.

## 5. The landing page's widget in production

1. **Owner account.** Sign up on `<prod-url>` with the account that will own the landing project: a **real address you control, without `+clerk_test`** (those accept code `424242` from anyone). Create it **after** step 2 (see "Good to know" there).
2. **Make it Pro (recommended).** On Free, the landing bot answers 100 messages a month and then shows the quota message to every visitor until the month resets. Pro gives 2,000 a month. Billing → Pro → **Subscribe** → **Pay with test card** → **Continue** (test mode, no real charge).
   - [ ] Billing shows Pro. Prod Supabase: `accounts.plan = pro` for that user (this also proves the production webhook works).
   - Staying on Free also works; then the panel shows "Powered by Askwell" and the 100-message limit applies.
3. **Create the project.** Dashboard → New project → name it `Askwell`.
4. **Add the knowledge.** Knowledge → upload `docs/landing-knowledge.md` from the repo (or paste its text). Wait for **Ready**.
5. **Copy the key.** Install → the snippet's `data-key` value (`pk_…`). This is a public key, but treat it as configuration: paste it only into Vercel.
6. Vercel → Environment Variables → add `LANDING_WIDGET_KEY` = that key, **Production** only.
7. Build and promote again, as in step 4 (Redeploy the current production deployment → Ready → Promote). The page reads the key per request, but Vercel applies new variables only to new deployments.
   - [ ] `<prod-url>/` shows the "Ask us" button in the bottom-right corner and the "Try it: ask the bot in the corner." line.
   - [ ] Ask "How many projects can I have on Pro?" → "5". Ask "Who won the 2018 FIFA World Cup?" → "I don't know…".
8. Run the full core flow (`project.md` §2, all 9 steps) on `<prod-url>`, as in the P6H-T10 PR. Phase 6 is done when all 9 pass. Use a separate test owner for it, not the landing owner. Afterwards end its Pro item and delete it (Clerk user, then its `accounts` row and projects in prod Supabase).

## 6. Rollback

**The app (Vercel).** Vercel → Deployments → filter Production → the previous good deployment → **⋯ → Promote** (Vercel calls this "Instant Rollback"; it doesn't rebuild).
- Before the first launch there is no earlier good production build. If the first promoted build is broken, the fix is a new PR, merge, redeploy, promote.
- A rollback keeps the variables the old build was made with. If the problem is a variable, fix it in Settings and redeploy instead.

**A migration fails** (step 1.4, or any later one):
1. Stop. Don't promote a build that needs the failing migration.
2. Read the error `supabase db push` printed. Each migration file runs in one transaction, so a failed file leaves **nothing** of itself behind, and `supabase migration list` doesn't show its version as Remote. The files before it stay applied.
3. Don't run SQL by hand and don't edit the file. Send the error, the file name and the `supabase migration list` output to the lead. Note: a **newer** migration can't fix it. `supabase db push` always retries the failed file first and stops there again.
4. The lead plans the fix with you. Every file already ran on dev, so the cause is usually something in prod's state (a missing extension, an object left from a manual change, a setting). Fixing that and running `supabase db push` again is enough. If the file itself must change, it's a contract change: the lead plans how the corrected file and the migration history (`supabase migration repair`) stay the same on dev and prod, and you approve it.
5. After the fix: `supabase db push` again, then check `supabase migration list` and the security advisor (steps 1.4–1.6).
6. Migrations are additive (§4), so the build already live keeps working while you wait.

**Wrong data or a bad project in prod.** Dev data is never copied, so there's nothing to restore from dev. The Supabase Free plan has no point-in-time recovery; before the first launch, the simplest reset is to delete the prod project and redo step 1. A new project has a new URL and keys, so then also:
1. Replace the three Supabase variables in Vercel Production with the new project's values (step 3).
2. Redeploy and promote (step 4). The live build keeps the deleted project's values until a new deployment replaces it.
3. Redo step 5: the landing project lived in the deleted database, so create it again and set the new `LANDING_WIDGET_KEY`.

**The production webhook misbehaves.** Clerk → Webhooks → the production endpoint → **Disable**. Plans stop syncing in prod (no one gains or loses Pro); dev and previews are untouched. Turn it on again once fixed. Failed deliveries stay in the endpoint's message log; resend them from there.
