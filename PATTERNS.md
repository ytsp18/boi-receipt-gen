# PATTERNS.md — Coding Patterns & Conventions

## 1. State Object Pattern

Every page uses a mutable state object at the top of the main script file.

```javascript
// app-supabase.js line 180
const state = {
    receipts: [],
    currentPage: 1,
    itemsPerPage: 50,
    currentBranchId: null,
    viewingBranchId: null,
    // ...
};
```

**Used in:** `app-supabase.js`, `card-print-app.js`, `app.js`

**Rules:**
- State is the single source of truth for UI data
- Always update state before re-rendering
- Use `state.xxx` not local variables for shared data

---

## 2. Element Cache Pattern

DOM elements are cached at init time to avoid repeated `getElementById`.

```javascript
// app-supabase.js line 297
const elements = {
    receiptTable: document.getElementById('receiptTable'),
    searchInput: document.getElementById('searchInput'),
    // ...
};
```

**Used in:** `app-supabase.js`, `app.js`

**Rules:**
- Cache on DOMContentLoaded
- Reference via `elements.xxx` throughout the file
- Not all pages use this pattern (card-print-app.js uses inline `document.getElementById`)

---

## 3. Supabase Module Pattern

All Supabase interactions are organized as object literals with async methods, attached to `window`.

```javascript
// supabase-config.js
const SupabaseReceipts = {
    async getAll(branchId = null) { ... },
    async create(data) { ... },
    async update(id, data) { ... },
    async delete(id) { ... },
};
window.SupabaseReceipts = SupabaseReceipts;
```

**Modules (7 total in supabase-config.js):**
| Module | Purpose |
|--------|---------|
| `SupabaseAuth` | Login, logout, session management |
| `SupabaseReceipts` | Receipt CRUD + search + monthly report |
| `SupabaseStorage` | File upload/download (card images) |
| `SupabaseActivityLog` | Activity logging |
| `SupabaseUsers` | User profile management |
| `SupabaseCardPrintLock` | Card print lock CRUD |
| `SupabaseBranches` | Branch management (v9.0) |

**Rules:**
- Always use `window.ModuleName.method()` from other files
- Methods are async — always `await`
- Return `{ data, error }` pattern from Supabase

---

## 4. Window Global Functions (onclick handlers)

Functions called from HTML `onclick` must be attached to `window`.

```javascript
// app-supabase.js line 2991
window.selectRow = selectRow;
window.viewImage = viewImage;
window.printFromTable = printFromTable;
```

**Why:** Vanilla JS with no bundler — HTML onclick attributes need global scope.

**Rules:**
- Define function normally, then assign to window
- Group all window assignments together (usually near bottom or after function definition)
- Always check function exists before calling from HTML

---

## 5. Branch Context Globals (v9.0)

Two global variables control which branch's data is visible.

```javascript
// Set during init
window._currentBranchId = state.currentBranchId;  // User's own branch
window._viewingBranchId = val;                      // Branch being viewed (super admin switch)
```

**Used by:** `supabase-adapter.js` — injects `branch_id` filter into all queries.

**Rules:**
- `_currentBranchId` = set once at login, never changes
- `_viewingBranchId` = changes when super admin selects different branch
- `null` = show all branches (super admin "all branches" mode)
- Regular users: `_viewingBranchId` always equals `_currentBranchId`

---

## 6. Environment Detection Pattern

Two-layer detection: hostname auto-detect + URL parameter fallback.

```javascript
// supabase-config.js
function detectEnvironment() {
    const hostname = window.location.hostname;
    if (hostname.includes('sit.pages.dev')) return 'sit';

    const params = new URLSearchParams(window.location.search);
    if (params.get('env') === 'sit') return 'sit';

    return 'production';
}
```

**CRITICAL:** `login.html` has its OWN inline version — does NOT use `supabase-config.js`.

**Rules:**
- Always use `getEnvParam()` when building navigation URLs
- Returns `?env=sit` or empty string
- Hostname check takes priority over URL param

---

## 7. Analytics Pattern

UX analytics tracked via batched calls.

```javascript
UXAnalytics.trackFeature('feature_name', {
    action: 'click',
    metadata: { ... }
});
```

**Rules:**
- Track meaningful user actions, not every click
- Batched — doesn't block UI
- Stored in `ux_analytics` table (branch-scoped in v9.0)

---

## 8. Cache Busting Pattern

Version string appended to all script/CSS tags in HTML.

```html
<script src="js/app-supabase.js?v=9.0.1"></script>
<link rel="stylesheet" href="css/style.css?v=9.0.1">
```

**Rules:**
- Bump version in ALL HTML files when changing JS/CSS
- Cloudflare may cache aggressively — cache bust is essential for SIT
- Version badge at bottom of page should match

---

## 9. RLS Bypass Pattern (SECURITY DEFINER)

When RLS blocks needed cross-branch data access, create a server-side function.

```sql
CREATE OR REPLACE FUNCTION public.check_sn_duplicate(p_sn TEXT, p_exclude_id TEXT DEFAULT NULL)
RETURNS TABLE(receipt_no TEXT, branch_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$ ... $$;

GRANT EXECUTE ON FUNCTION public.check_sn_duplicate TO authenticated;
```

**When to use:**
- Cross-branch duplicate checking (SN numbers)
- Accessing `auth.users` email (not queryable from client)
- Any query that needs to bypass branch-scoped RLS

**Rules:**
- Always use `SECURITY DEFINER` (runs as function owner, not caller)
- Always add permission checks inside the function
- Always `GRANT EXECUTE` to appropriate roles

---

## 10. Error Handling Patterns

### Supabase Error Codes
```javascript
// Duplicate detection
if (error?.code === '23505') {
    // Unique constraint violation — show duplicate warning
}
```

### Try-Catch Pattern
```javascript
try {
    const { data, error } = await SupabaseReceipts.create(payload);
    if (error) throw error;
    // success
} catch (err) {
    console.error('Error:', err);
    alert('เกิดข้อผิดพลาด: ' + err.message);
}
```

---

## 11. CSS Grid Overflow Fix

When using CSS grid, child elements must have `min-width: 0` to prevent overflow.

```css
.form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
}
.form-row > * {
    min-width: 0; /* Prevent grid child overflow */
}
```

**Also:** Table wrappers must use `overflow-x: auto` (not `overflow: hidden`) to keep action buttons visible.

---

## 12. Permission Check Pattern

Admin permission check for owner-specific actions:

```javascript
const canEdit = isOwn || isAdmin;  // Owner OR admin can edit
const canDelete = isAdmin;          // Only admin can delete
```

**v9.0 hierarchy:** super_admin > head > deputy > officer > temp_officer > other
