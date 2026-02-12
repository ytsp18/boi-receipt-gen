# CLAUDE.md — BOI Work Permit Receipt System

## Project Summary
Web application for BOI (Board of Investment) Work Permit receipt management.
Handles receipt creation, printing, card print lock tracking, monthly reporting, and multi-branch user management.

**Current Version:** v9.0.1 (multi-branch, SIT testing) / v8.6.2 (production)
**Production URL:** `receipt.fts-internal.com` (GitHub Pages)
**SIT URL:** `boi-receipt-gen-sit.pages.dev` (Cloudflare Pages)

## Tech Stack
- **Frontend:** Vanilla JavaScript (no framework, no build step)
- **Backend:** Supabase (PostgreSQL + Auth + RLS + Storage + Realtime)
- **Hosting:** GitHub Pages (production, `main` branch) + Cloudflare Pages (SIT, `sit` branch)
- **Security:** Row Level Security (RLS) at database level — RLS-first approach

## Architecture

### Environment Detection
- **Production:** default (hostname = `receipt.fts-internal.com`)
- **SIT:** auto-detect via `hostname.includes('sit.pages.dev')` OR `?env=sit` param
- Detection happens in both `supabase-config.js` AND `login.html` (inline, separate init)
- Always preserve `?env=sit` across navigations using `getEnvParam()`

### Supabase Projects
- **Production:** `pyyltrcqeyfhidpcdtvc.supabase.co` (org: ytsp18, Pro plan)
- **SIT:** `cctzbereqvuaunweuqho.supabase.co` (org: FTS, Free plan)

### Module Pattern
All Supabase interactions are organized as module objects:
```
const ModuleName = { async method() { ... } };
window.ModuleName = ModuleName;
```
Modules: SupabaseAuth, SupabaseReceipts, SupabaseStorage, SupabaseActivityLog, SupabaseUsers, SupabaseCardPrintLock, SupabaseBranches

### State Pattern
Each page uses a state object at the top:
```
const state = { receipts: [], currentPage: 1, ... };
const elements = { table: document.getElementById('...'), ... };
```

### Branch Context Globals (v9.0)
- `window._currentBranchId` — user's own branch
- `window._viewingBranchId` — branch currently being viewed (super admin can switch)
- Used by `supabase-adapter.js` for branch-scoped queries

## Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `js/app-supabase.js` | ~4,741 | Main app logic, receipt CRUD, printing, reporting |
| `js/card-print-app.js` | ~978 | Card Print Lock page logic |
| `js/supabase-adapter.js` | ~816 | Supabase query abstraction layer |
| `js/supabase-config.js` | ~634 | Supabase client init + 7 modules |
| `js/auth.js` | ~572 | Authentication, user management, `getEnvParam()` |
| `index.html` | - | Main receipt page |
| `card-print.html` | - | Card Print Lock page |
| `login.html` | - | Login (has SEPARATE inline Supabase init) |
| `landing.html` | - | Landing for non-receipt branches (v9.0) |

## Key Commands
```bash
# No build step — open HTML files directly or use Live Server
# Git branches:
#   main = production (GitHub Pages auto-deploy)
#   sit = SIT (Cloudflare Pages auto-deploy)

# Cache busting: bump ?v=X.Y.Z in HTML <script>/<link> tags
```

## Critical Warnings

### DO NOT
- Merge `sit` → `main` before production DB has v9.0 schema (SQL migration must run FIRST)
- Deploy code before running SQL migration — app will crash
- Use `force push` on `main` — production is live
- Hardcode credentials or API keys (anon key in config is OK — Supabase design)
- Remove `getEnvParam()` from navigation URLs — breaks SIT environment

### IMPORTANT PATTERNS
- `login.html` has SEPARATE inline Supabase init — does NOT use `supabase-config.js`
- `is_admin()` and `is_super_admin()` take ZERO parameters — they use `auth.uid()` internally
- Admin cannot `signUp()` new users — it switches auth session. Use self-registration flow.
- `profiles` table has NO email column — email lives in `auth.users` only
- For cross-branch data access, use SECURITY DEFINER RPC functions (bypass RLS safely)
- Supabase error code `23505` = unique constraint violation (duplicate detection)
- `overflow-x: auto` on table wrappers (not `overflow: hidden` — cuts off action buttons)
- `DROP FUNCTION` required when changing return type in PostgreSQL

## Auth & Roles
- Session timeout: 15 min inactivity
- Legacy roles: admin, manager, staff (backward compat)
- **v9.0 Branch roles:** head, deputy, officer, temp_officer, other
- Super admin: `is_super_admin = true` → sees all branches + all permissions
- Feature access: `branches.features` JSONB → `{"receipt_module": true, "card_print_lock": true}`

## SQL Migrations (chronological)
- v5.1 → v6.0 → v6.0.2 → v6.2 → v6.3 → v7.0 → v7.1 → v8.0 → v8.1 → v8.4 → v8.5 → v9.0
- Rollback: `rollback-v9.0-to-v8.6.2.sql` (16 steps, in transaction)

## Related Documentation
- `SPRINT-PLAN.md` — current sprint priorities
- `DEVELOPMENT_ROADMAP.md` — long-term roadmap
- `CHANGELOG.md` — version history
- `USER_MANUAL.md` — user documentation
- `MEMORY.md` — at `.claude/projects/.../memory/MEMORY.md` (Claude-specific context)
