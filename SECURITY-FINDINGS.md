# SECURITY-FINDINGS.md — Security Scan Results

> **Scan Date:** 13 กุมภาพันธ์ 2569
> **Scope:** XSS (innerHTML), Secret Scan, Dangerous Patterns
> **Codebase:** 6 JS files, ~11,130 lines

---

## Executive Summary

| Category | Count | Critical | Medium | Safe |
|----------|-------|----------|--------|------|
| innerHTML assignments | 57 | 6 | 14 | 37 |
| document.write | 2 | 0 | 2 | - |
| outerHTML | 2 | 1 | 1 | - |
| eval/new Function | 0 | - | - | ✅ |
| Hardcoded secrets | 0 | - | - | ✅ |

**Overall Risk:** 🟠 MEDIUM — 7 potential XSS vectors, mainly from inline onclick + unsanitized attribute values

---

## Critical Findings (7 items)

### C1: Unsanitized receiptNo in onclick (app-supabase.js:2762)

**Risk:** 🔴 CRITICAL — attribute context XSS

```javascript
// Line 2762: receiptNo NOT sanitized
`<img src="${row.cardImage}" onclick="viewImage('${row.receiptNo}')" ...>`
```

**Issue:** `row.receiptNo` ไม่ผ่าน escaping ก่อนใส่ใน onclick attribute
**Attack:** Receipt number ที่มี `'` จะ break ออกจาก attribute
**Fix:** ใช้ `escapeHtmlAttribute()` หรือเปลี่ยนเป็น data attribute + event delegation

---

### C2: Partially sanitized receiptNo in onclick (app-supabase.js:2804-2810)

**Risk:** 🔴 HIGH — sanitizeHTML() ไม่เพียงพอสำหรับ attribute context

```javascript
const safeReceiptNo = sanitizeHTML(row.receiptNo);
// Line 2804-2810: used in onclick
`onclick="printFromTable('${safeReceiptNo}')">`
`onclick="selectRow('${safeReceiptNo}')">`
`onclick="deleteRecord('${safeReceiptNo}')">`
```

**Issue:** `sanitizeHTML()` escapes `&<>"'` — เพียงพอสำหรับ HTML content แต่ไม่ cover backtick (`) ใน template literals
**Actual Risk:** ต่ำ เพราะ receiptNo จาก DB ไม่น่ามี special chars — แต่เป็น pattern ที่ไม่ดี

---

### C3: Unsanitized receiptNo in onclick (app.js:1690, 1729)

**Risk:** 🔴 CRITICAL — legacy file ยังมี pattern เดียวกัน

```javascript
// Legacy app.js — same issue as C1
`onclick="viewImage('${row.receiptNo}')">`
`onclick="deleteRecord('${row.receiptNo}')">`
```

---

### C4: Unsanitized receiptNo in outerHTML (app-supabase.js:1207, 1211)

**Risk:** 🟠 MEDIUM — barcode fallback text

```javascript
el.outerHTML = `<span>Doc No.: ${receiptNo}</span>`;
```

**Issue:** `receiptNo` ไม่ sanitize — ถ้ามี `<script>` ใน receiptNo จะ inject ได้

---

### C5: lockId in onblur handler (card-print-app.js:956)

**Risk:** 🟡 LOW-MEDIUM — UUID ปกติปลอดภัย

```javascript
td.innerHTML = `<input onblur="saveInlineEdit('${lockId}','${field}', this.value)">`;
```

**Issue:** `lockId` (UUID) ไม่ sanitize — pattern ที่ไม่ดี แต่ UUID ไม่ควรมี special chars

---

### C6-7: User/Branch IDs in onclick (app-supabase.js:3514-3516, 3858-3861)

**Risk:** 🟡 LOW — UUIDs ปกติปลอดภัย

```javascript
`onclick="showEditUserForm('${safeId}')">`
`onclick="showEditBranchForm('${b.id}')">`
```

---

## Sanitization Functions Assessment

### sanitizeHTML() (app-supabase.js)
```javascript
function sanitizeHTML(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
```
- ✅ Good for HTML content context
- ⚠️ Incomplete for attribute context (missing backtick)
- ⚠️ Manual — prefer browser's native escaping

### escapeHtml() (card-print-app.js)
```javascript
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
```
- ✅ Safe by construction (uses browser's escaping)
- ⚠️ Not suitable for attribute context

---

## Secret Scan Results

| Item | Status | Notes |
|------|--------|-------|
| Supabase anon keys | ✅ Expected | Public by design — RLS provides security |
| Supabase service_role key | ✅ Not found | Good — never expose in client code |
| Hardcoded passwords | ✅ Not found | Clean |
| API tokens | ✅ Not found | Clean |
| `.env` files | ✅ Not found | No .env in project (static hosting) |

---

## Recommended Fixes (Prioritized)

### Priority 1 — ก่อน Production Deploy (ถ้าเหลือเวลา)

| # | Fix | File | Effort | Impact |
|---|-----|------|--------|--------|
| F1 | สร้าง `escapeHtmlAttribute()` function | app-supabase.js | 15 min | แก้ root cause |
| F2 | ใช้กับ receiptNo ใน onclick (line 2762) | app-supabase.js | 5 min | แก้ C1 |
| F3 | ใช้กับ receiptNo ใน outerHTML (line 1207,1211) | app-supabase.js | 5 min | แก้ C4 |

**Recommended escapeHtmlAttribute:**
```javascript
function escapeHtmlAttribute(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/`/g, '&#96;');
}
```

### Priority 2 — Sprint ถัดไป

| # | Fix | Effort |
|---|-----|--------|
| F4 | Standardize: ใช้ escaping function เดียวกันทั้ง project | 1 hr |
| F5 | เปลี่ยน inline onclick → data attributes + event delegation | 4-8 hr |
| F6 | Add CSP (Content Security Policy) header ถ้า host รองรับ | 1 hr |

### Priority 3 — Long-term

| # | Fix | Effort |
|---|-----|--------|
| F7 | สร้าง centralized `Sanitizer` module | 2 hr |
| F8 | Remove document.write() ใน print functions | 2 hr |
| F9 | Add automated XSS scanning to CI | 4 hr |

---

## Risk Assessment

**จะ deploy production ได้ไหมโดยยังไม่แก้?**

**ได้ — ความเสี่ยงจริงต่ำ** เพราะ:
1. `receiptNo` มาจาก DB (admin สร้าง) → ไม่ใช่ arbitrary user input
2. ระบบมี authentication — ต้อง login ก่อนเห็น receipt data
3. RLS ป้องกัน cross-branch data access อยู่แล้ว
4. ไม่มี public-facing form ที่ inject ได้โดยตรง

**แต่ควรแก้ Priority 1 ก่อน production deploy** ถ้าเหลือเวลา — เป็น good practice และป้องกัน escalation ในอนาคต

---

## Scan Details

- **No eval() or new Function()** — ✅ Clean
- **No dangerous DOM APIs** (besides innerHTML) — ✅ Clean
- **textContent used appropriately** — ✅ Good practice seen in codebase
- **app.js = legacy file** — duplicate patterns from app-supabase.js (เดิมใช้ localStorage)
