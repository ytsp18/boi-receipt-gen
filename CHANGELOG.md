# Change Log - Work Permit Receipt System

## [9.0.0] - 2026-02-12

> **สถานะ: SIT Testing 🧪** — Deploy บน Cloudflare Pages (`boi-receipt-gen-sit.pages.dev`)

### Major Feature — Multi-Branch & User Management

ระบบรองรับหลายสาขา (55+ สาขาทั่วประเทศ) — ข้อมูลแยกด้วย RLS, role ใหม่ต่อสาขา, super admin เห็นทุกสาขา

**🏢 Branch System:**
- สร้าง `branches` table — seed 52 service centers + 8 mobile units จาก Data Master Branch.xlsx
- เพิ่ม `branch_id` FK ใน `profiles`, `receipts`, `card_print_locks`, `card_print_locks_archive`, `activity_logs`, `ux_analytics`
- Migrate ข้อมูลเดิมทั้งหมด → สาขา BKK-SC-M-001 (One Bangkok)
- Feature access control: `branches.features` JSONB → เปิด `receipt_module` เฉพาะ 4 สาขา (BKK, CBI, CMI, PKT)

**👥 Role System:**
- Branch roles ใหม่: `head`, `deputy`, `officer`, `temp_officer`, `other`
- Map จาก legacy roles: admin→head, manager→deputy, staff→officer
- `is_super_admin` flag — เห็นทุกสาขา + ทุก permission
- Role-based permissions: head ได้ user_management, deputy ได้ export, officer ได้ create/edit/print

**🔒 RLS (Row-Level Security):**
- Helper functions: `get_user_branch_id()`, `is_super_admin()`, `is_branch_head()`
- Branch-scoped policies ทุก table — user เห็นเฉพาะสาขาตัวเอง
- Super admin bypass ทุก branch filter

**📝 Registration & User Management:**
- ฟอร์ม register มี branch dropdown — user เลือกสาขาตั้งแต่สมัคร
- Approve flow แสดงสาขาที่ user เลือก + กำหนด branch_role
- User management: เพิ่มคอลัมน์สาขา+ตำแหน่ง, edit role, ย้ายสาขา
- Branch management UI (super admin) — เพิ่ม/แก้/ปิดสาขา

**🏷️ Dynamic Center Names:**
- ชื่อศูนย์ใน header, receipt confirmation, footer, monthly report → ดึงจาก `branches` table
- แทนที่ hardcode "ศูนย์บริการ EWP อาคาร One Bangkok" ทั้งหมด

**🚪 Landing Page (Non-Receipt Branches):**
- `landing.html` — หน้า standalone สำหรับสาขาที่ยังไม่เปิด receipt_module
- แสดงชื่อสาขา + ข้อความ "ระบบยังไม่เปิดใช้งานสำหรับสาขานี้"
- Auth check: redirect ไป login ถ้าไม่ login / redirect ไป index.html ถ้ามี receipt_module
- `applyPermissions()` ใน app-supabase.js redirect ไป landing.html แทนการซ่อน elements

**🌐 SIT Deployment (Cloudflare Pages):**
- Git branch `sit` → auto-deploy ที่ `boi-receipt-gen-sit.pages.dev`
- Hostname auto-detection: `*sit.pages.dev` → ใช้ SIT Supabase อัตโนมัติ
- แยกจาก production (GitHub Pages จาก `main` branch)

**📍 Branch Selector (Super Admin):**
- Dropdown ใน header-left ใต้ subtitle — "📍 สาขา: [dropdown]"
- เลือก "สาขาของตนเอง" / "ทุกสาขา" / สาขาเฉพาะ → reload data ตาม

### SQL Migration
| ไฟล์ | สถานะ |
|------|--------|
| `supabase-update-v9.0-multi-branch.sql` | ✅ Run on SIT (12 ก.พ. 69) |

### Files Changed
| ไฟล์ | เปลี่ยนแปลง |
|------|------------|
| `supabase-update-v9.0-multi-branch.sql` | **NEW** — branches table, seed 60 branches, ALTER tables, helper functions, RLS policies, triggers, indexes |
| `js/auth.js` | Branch role system, branch permissions, registerUser with branchId, approve/transfer user |
| `js/supabase-config.js` | SupabaseBranches module, branch_id in all modules, hostname auto-detect SIT |
| `js/supabase-adapter.js` | Branch filter in all queries, cross-branch SN duplicate check |
| `js/app-supabase.js` | Dynamic center names, branch mgmt UI, user mgmt upgrade, branch selector, feature access control |
| `js/card-print-app.js` | Branch-scoped realtime, branch_id in lock/receipt |
| `index.html` | Dynamic elements, branch mgmt button, version bump `?v=9.0.0` |
| `card-print.html` | Dynamic header, version bump `?v=9.0.0` |
| `login.html` | Branch dropdown in register form, hostname auto-detect SIT |
| `landing.html` | **NEW** — Landing page for non-receipt branches (auth check + branch name display) |

---

## [8.6.2] - 2026-02-12

> **สถานะ: Deployed ✅**

### Bug Fix — ตารางหน้าจองตัดปุ่ม + S/N และ ลบ ออกจากหน้าจอ

- **Table overflow ซ่อน action buttons**
  - `.locks-table-wrapper` มี `overflow: hidden` ทำให้ column สุดท้าย (ปุ่ม + S/N, ลบ) ถูกตัดออก
  - แก้: เปลี่ยนเป็น `overflow-x: auto` ให้ scroll ได้
  - ลด cell padding (`12px` → `8px`) เพื่อให้ตารางพอดีจอมากขึ้น

### Files Changed
| ไฟล์ | เปลี่ยนแปลง |
|------|------------|
| `card-print.html` | แก้ CSS `overflow: hidden` → `overflow-x: auto`, ลด padding, cache busting `?v=8.6.2` |

---

## [8.6.1] - 2026-02-12

> **สถานะ: Deployed ✅**

### Bug Fix — Admin แก้ไขรายการจองของเจ้าหน้าที่คนอื่นไม่ได้

- **Admin ไม่เห็นปุ่มแก้ไขในหน้าจองบัตร**
  - สาเหตุ: เช็ค `isOwn = officer_id === currentUserId` เท่านั้น — Admin มี userId ต่างจากเจ้าหน้าที่
  - แก้: เพิ่ม `canEdit = isOwn || isAdmin` แทน `isOwn` ใน 6 จุด
  - ปุ่มที่ได้รับผล: + S/N, แก้ S/N, ✏️ inline edit, 📷 แนบรูป, 📄 สร้างใบรับ, pending hints

### Files Changed
| ไฟล์ | เปลี่ยนแปลง |
|------|------------|
| `js/card-print-app.js` | เพิ่ม `isAdmin` + `canEdit` logic ใน `renderLocksTable()` |
| `card-print.html` | cache busting `?v=8.6.1` |
| `index.html` | cache busting `?v=8.6.1` |

---

## [8.6.0] - 2026-02-12

> **สถานะ: Deployed ✅**

### New Features — UX Improvements จาก Production Analytics

วิเคราะห์ UX Analytics (3,414 events, 543 sessions, 4 วัน) แล้วปรับปรุง 8 รายการ:

**Performance (P1):**
- **P1.1: Parallel duplicate checks** — `Promise.allSettled()` แทน sequential `await`
- **P1.2: Guard redundant getNextReceiptNo** — ลบ call ซ้ำตอน page init
- **P1.3: Parallel card image upload** — upload card image ร่วมกับ photo/signature ใน `Promise.all()`

**Discoverability (P2):**
- **P2.1: Batch print hint toast** — แสดง tip หลังพิมพ์ทีละใบ 3 ครั้ง
- **P2.2: Quick Print button highlight** — เปลี่ยนสีปุ่มให้เด่นขึ้น + icon ⚡
- **P2.3: Summary color coding** — สีส้ม/เหลือง/เขียว ตามสถานะ + auto-refresh 60s

**Polish (P3):**
- **P3.1: Export dropdowns** — รวม 4 ปุ่ม export เป็น 2 dropdown (daily + monthly)
- **P3.2: Manager onboarding toast** — welcome message + Reports tab highlight

### Files Changed
| ไฟล์ | เปลี่ยนแปลง |
|------|------------|
| `js/app-supabase.js` | P1.1, P1.2, P1.3, P2.1, P2.3, P3.1, P3.2 |
| `js/supabase-adapter.js` | P1.3 card image upload refactor |
| `index.html` | P2.2, P2.3, P3.1 UI changes |

---

## [8.5.2] - 2026-02-11

> **สถานะ: Deployed ✅**

### Bug Fixes
- **Card printer name input** — เพิ่มช่องกรอกชื่อผู้พิมพ์บัตร (editable สำหรับใบรับเก่า)
- **Fix user_id in ux_analytics** — ส่ง user_id ถูกต้อง
- **Fix card printer name in form print** — แสดงชื่อผู้พิมพ์บัตรใน print output

---

## [8.5.1] - 2026-02-11

> **สถานะ: Deployed ✅**

### Bug Fix — รายงานรายเดือนดึงข้อมูลแค่วันเดียว

- **Monthly Report ดึงข้อมูลทั้งเดือน**
  - ก่อนหน้า: `getMonthlyData()` filter จาก `state.registryData` ซึ่งมีแค่ 1 วัน → รายงานแสดงผิด
  - แก้: เพิ่ม `loadMonthlyDataFromSupabase(month, year)` query ทั้งเดือนจาก Supabase โดยตรง
  - SELECT เฉพาะ 8 columns (ไม่ดึง images/signatures) → ลด payload ~50%
  - Cache 5 นาที (`state.monthlyReportData`) → ไม่ query ซ้ำ
  - Cache invalidated อัตโนมัติเมื่อ save/delete/print/receive
  - Export PDF + CSV ใช้ข้อมูลทั้งเดือนถูกต้อง
  - แสดง loading state ระหว่างรอ query

### Files Changed
| ไฟล์ | เปลี่ยนแปลง |
|------|------------|
| `js/supabase-adapter.js` | เพิ่ม `loadMonthlyDataFromSupabase()` + export `loadMonthlyData` |
| `js/app-supabase.js` | แก้ `generateMonthlyReport()`, `getMonthlyData()`, `generateDailyBreakdown()`, `exportMonthlyPDF()`, `exportMonthlyCSV()` เป็น async + cache + direct property access, เพิ่ม `invalidateMonthlyCache()` |

---

## [8.5.0] - 2026-02-11

> **สถานะ: Deployed ✅ — SQL v8.5 run Production สำเร็จ 11 ก.พ. 69**

### New Features — ผู้พิมพ์บัตรในใบรับ + ฟอร์มจองแค่เลขนัด

- **ผู้พิมพ์บัตร (Card Printer Name)**
  - เพิ่มแถว "ผู้พิมพ์บัตร / Card Printer" ในใบรับ (print output)
  - แสดงชื่อเจ้าหน้าที่ที่จอง+พิมพ์บัตร (จาก `card_print_locks.officer_name`)
  - แยกจาก "เจ้าหน้าที่ผู้ออกใบรับ / Issuing Officer" (session.name ของคนกดพิมพ์)
  - ใบรับเก่าที่ไม่มี card_printer_name แสดง "-" (graceful fallback)
  - Auto-fill ทาง B: เมื่อกรอกเลขนัดหมาย → cardPrinterName = officer_name

- **ฟอร์มจองแค่เลขนัดหมาย (Simplified Booking Form)**
  - ลดจาก 4 ช่อง → เหลือ 1 ช่อง (เลขนัดหมายเท่านั้น)
  - ข้อมูลอื่น (ชื่อ, เลขคำขอ, Passport) กรอกทีหลังผ่าน inline edit ในตาราง
  - Click ที่ cell → กลายเป็น input → Enter/blur = save, Escape = cancel
  - เฉพาะ row ของตัวเองเท่านั้นที่ edit ได้ + ไม่ให้ edit row ที่ completed
  - Validation: สร้างใบรับไม่ได้ถ้ายังไม่กรอกชื่อ

### Bug Fix
- **Escape cancel inline edit** — เพิ่ม `_inlineEditCancelled` flag ป้องกัน blur event save ค่าหลัง Escape

### DB Migration
- `supabase-update-v8.5-card-printer.sql`
  - ADD COLUMN `card_printer_name TEXT NULL` → `receipts`

### Files Changed
- `js/card-print-app.js` — handleLock null fields, clearForm simplified, renderLocksTable inline edit, startInlineEdit/saveInlineEdit/cancelInlineEdit
- `js/supabase-config.js` — updateDetails() method
- `js/supabase-adapter.js` — card_printer_name in save/load/search
- `js/app-supabase.js` — print output rows + auto-fill cardPrinterName
- `card-print.html` — form 1 field + CSS inline edit + cache bust v8.5
- `index.html` — cache bust v8.5

---

## [8.4.0] - 2026-02-11

> **สถานะ: Deployed ✅ — SQL v8.4 run Production สำเร็จ 11 ก.พ. 69**

### New Features — แนบรูปบัตร + สร้างใบรับจากหน้าจอง

- **แนบรูปบัตร (Card Image Upload)**
  - ปุ่ม "📷 แนบรูป" ในตารางจองแต่ละแถว
  - Upload → compress (max 1200px, quality 0.8) → Supabase Storage
  - บันทึก URL ใน `card_print_locks.card_image_url`
  - แสดง thumbnail (click ดูขนาดเต็มใน modal)

- **สร้างใบรับจากหน้าจอง (Auto-Create Receipt)**
  - ปุ่ม "📄 สร้างใบรับ" ปรากฏเมื่อมี SN + รูปครบ
  - Auto-generate receipt_no (YYYYMMDD-NNN)
  - Insert ลง receipts table พร้อมข้อมูลครบ (ชื่อ, SN, เลขคำขอ, เลขนัด, รูป)
  - ตรวจซ้ำ — ถ้ามีใบรับอยู่แล้วจะ warning
  - Badge "✅ สร้างแล้ว" หลังสร้างสำเร็จ

- **Auto-fill SN + รูป ในหน้าใบรับ (ทาง B)**
  - เมื่อกรอกเลขนัดหมายในหน้าหลัก → auto-fill SN จาก `lock.sn_good`
  - Auto-fill รูปบัตรจาก `lock.card_image_url`
  - หน้าใบรับเดิมใช้งานได้ 100% + ได้ข้อมูลเพิ่ม

### DB Migration
- `supabase-update-v8.4-card-image.sql`
  - ADD COLUMN `card_image_url TEXT NULL` → `card_print_locks` + `card_print_locks_archive`
  - DROP + CREATE `archive_old_card_locks()` + `cleanup_old_card_locks()` (รองรับ column ใหม่)

### Changed
- Cache bust `?v=8.4` ทุก CSS/JS (card-print.html + index.html)
- Version badge card-print → v8.4

### Files Changed
| ไฟล์ | ประเภท | เปลี่ยนแปลง |
|------|--------|------------|
| `supabase-update-v8.4-card-image.sql` | ใหม่ | ALTER TABLE + DROP/CREATE functions |
| `card-print.html` | แก้ไข | CSS upload/receipt, คอลัมน์รูปบัตร+ใบรับ, modal, file input, cache bust |
| `js/card-print-app.js` | แก้ไข | renderLocksTable +imageCell/receiptCell, upload flow, createReceiptFromLock |
| `js/supabase-config.js` | แก้ไข | เพิ่ม updateImage(), checkExistingReceipt() |
| `js/app-supabase.js` | แก้ไข | auto-fill SN+รูป ใน appointment blur handler |
| `index.html` | แก้ไข | cache bust ?v=8.3→?v=8.4 |

---

## [8.3.0] - 2026-02-11

> **สถานะ: Production — deployed ✅**
> **Pre-Migration Hardening — frontend-only, ไม่แตะ DB**

### Security Hardening
- **CDN SRI Hash (C1+C2):** เพิ่ม `integrity` + `crossorigin` ทุก CDN script
  - Supabase JS pinned @2.95.3 (4 ไฟล์), JsBarcode @3.11.6, signature_pad @4.2.0
- **viewImage() URL size limit (S6):** เพิ่ม check URL length > 10MB ก่อน window.open
- **Password Complexity (S5):** client-side validation สำหรับ register + reset-password
  - ≥8 ตัวอักษร, ต้องมี A-Z ≥1, ต้องมี 0-9 ≥1
  - Realtime strength indicator (✓/✗ สีเขียว/แดง)

### Bug Fixes
- **goToPage() upper bound (F3):** เพิ่ม check page <= totalPages ป้องกัน pagination เกิน
- **afterprint Event (F6/P6):** เปลี่ยน setTimeout(500ms) → `window.addEventListener('afterprint')` ทั้ง 3 จุด (batchPrint, single print, printFromTable) — แม่นยำกว่า

### Changed
- Cache bust `?v=8.3` ทุก CSS/JS
- Version badge card-print → v8.3

### Files Changed
| ไฟล์ | ประเภท | เปลี่ยนแปลง |
|------|--------|------------|
| `index.html` | แก้ไข | SRI hash (3 CDN scripts), cache bust ?v=8.3 |
| `card-print.html` | แก้ไข | SRI hash, cache bust ?v=8.3, version badge v8.3 |
| `login.html` | แก้ไข | SRI hash, password complexity validation + realtime indicator |
| `reset-password.html` | แก้ไข | SRI hash, password complexity validation, minlength 8 |
| `js/app-supabase.js` | แก้ไข | goToPage upper bound, viewImage size limit, afterprint ×3 |

---

## [8.2.0] - 2026-02-11

> **สถานะ: Production — deployed ✅**
> **✅ pg_cron cleanup job — scheduled บน SIT Supabase สำเร็จ (11 ก.พ. 69)**

### Quick Wins

- **Q1+Q2: ปรับชื่อระบบหน้า Login**
  - เปลี่ยนชื่อเป็น "ระบบสร้างแบบฟอร์มการรับบัตร BOI"
  - Subtitle: "ศูนย์บริการ EWP"
  - Footer: "© 2026 EWP Service Center"

- **Q3: เปลี่ยน "ล็อก" → "จอง" ทั้งระบบ**
  - เมนู index.html: "จองการพิมพ์บัตร"
  - card-print.html: title, H1, H2, ปุ่ม, kbd hint, empty state
  - card-print-app.js: toast messages, status badges, warnings

- **Q4: Session Timeout 15 นาที**
  - Auto-logout เมื่อไม่มีกิจกรรม 15 นาที
  - Warning popup ที่ 14 นาที
  - ใช้ passive event listeners (zero performance impact)

- **Q5: Realtime Typing Indicator (Card Print)**
  - Supabase Realtime Broadcast — ไม่ผ่าน DB, ไม่มี storage cost
  - แสดง banner เมื่อ officer อื่นกำลังกรอกเลขนัดหมาย
  - ⚠️ Conflict detection สีแดง เมื่อ 2 คนกรอกเลขเดียวกัน
  - Stats chips "ของฉัน" / "คนอื่น" ใน stats bar
  - Auto-cleanup 10 วินาที + debounce 500ms

- **Q6: pg_cron Cleanup Job**
  - Schedule `cleanup_old_card_locks()` ทุกวันเที่ยงคืน
  - Archive >48 ชม., Delete archive >90 วัน

### Changed
- Cache bust `?v=8.2` ทุก CSS/JS
- Version badge → v8.2

### Files Changed
| ไฟล์ | ประเภท | เปลี่ยนแปลง |
|------|--------|------------|
| `login.html` | แก้ไข | ชื่อระบบ, subtitle, footer |
| `index.html` | แก้ไข | เมนู "จองการพิมพ์บัตร", cache bust |
| `card-print.html` | แก้ไข | 6 จุดเปลี่ยนชื่อ, CSS typing indicator, HTML div, cache bust, version badge |
| `js/card-print-app.js` | แก้ไข | 9 จุดเปลี่ยนชื่อ, typing broadcast system (~90 lines), stats chips |
| `js/auth.js` | แก้ไข | Session timeout 15 นาที (~50 lines) |

### SQL Migration
| ไฟล์ | สถานะ SIT | สถานะ Prod | หมายเหตุ |
|------|-----------|------------|----------|
| pg_cron extension + schedule | ✅ Done (11 ก.พ.) | ✅ Done (11 ก.พ.) | `cron.schedule('cleanup-card-locks', '0 0 * * *', ...)` |

---

## [8.1.0] - 2026-02-10

> **สถานะ: Production — deployed ✅**
> **✅ SQL v8.0 (card_print_locks) + v8.1 (pg_trgm) — run บน Production Supabase สำเร็จ (11 ก.พ. 69)**

### Added — Fuzzy Search (pg_trgm)
- **pg_trgm extension** สำหรับ fuzzy/similarity search
  - GIN indexes บน `foreigner_name` และ `receipt_no`
  - `search_receipts_fuzzy()` RPC function — handles typos (e.g. "Jhon" → "John")
  - Fallback อัตโนมัติไป ilike ถ้า RPC error (backwards compatible)

### Added — Quick Print Mode (อยู่ระหว่างทำ)
- URL param detection: `?mode=quick-print`
- `initQuickPrintMode()` function ยังไม่สมบูรณ์

### SQL Migration
- **supabase-update-v8.1-fuzzy-search.sql**
  - `CREATE EXTENSION IF NOT EXISTS pg_trgm`
  - GIN indexes: `idx_receipts_name_trgm`, `idx_receipts_receipt_no_trgm`
  - Function: `search_receipts_fuzzy(search_query, max_results)`

### Files Modified
| File | Action | หมายเหตุ |
|------|--------|----------|
| `supabase-update-v8.1-fuzzy-search.sql` | สร้างใหม่ | pg_trgm + fuzzy function |
| `js/supabase-adapter.js` | แก้ไข | เพิ่ม fuzzy RPC call + fallback |

---

### Added — Production Readiness
- ซ่อน v7.0 E-Sign UI (webcam, signature pad, officer signature) — display:none + JS guard
- ปรับ header buttons ให้มองเห็นชัดบนพื้นน้ำเงิน (high contrast white borders)
- ซ่อน filter "เซ็นชื่อแล้ว/ยังไม่เซ็นชื่อ" และ summary card "เซ็นชื่อแล้ว"
- Quick Print Mode (`?mode=quick-print`) สมบูรณ์
- Cache bust: `?v=8.1` ทุกไฟล์

---

## [8.0.0] - 2026-02-10

> **สถานะ: Production — deployed ✅**
> **✅ SQL v8.0 (card_print_locks) — run บน Production Supabase สำเร็จ (11 ก.พ. 69)**

### Added — Card Print Lock (แทน Google Sheet "บันทึกรายการห้ามซ้ำ V3")

#### Card Print Lock System
- **หน้า `card-print.html`** — standalone page สำหรับ 5 เจ้าหน้าที่ล็อกพิมพ์บัตร work permit
- **3-layer lock mechanism:**
  - Layer 1: Optimistic UI check (local state)
  - Layer 2: DB UNIQUE constraint on `appointment_id` (error 23505)
  - Layer 3: Supabase Realtime subscription (live update ข้าม browser)
- **Officer auto-fill** จาก `profiles.name` (ไม่ต้องเลือกจาก dropdown)
- **Officer color coding** — แต่ละเจ้าหน้าที่มีสีแถวเฉพาะ (8 สี)
- **S/N tracking** — กรอก S/N บัตรดี/บัตรเสีย inline
- **Barcode scan detection** — auto-detect + auto-submit (80ms threshold)
- **Archive system** — ข้อมูลเกิน 48 ชม. ย้ายไป archive, ลบ archive เกิน 90 วัน
- **Keyboard shortcuts:** Enter = lock, Ctrl+L = focus appointment input

#### Cross-use Integration ("ทำ 1 เรื่อง ใช้ได้หลายส่วน")
- **Lock → auto-fill receipt form** — appointmentNo blur → lookup card_print_locks → fill name/requestNo
- **S/N archive search** — ค้นหา S/N ย้อนหลังจาก archive

### Added — UX Optimization (จาก Analytics Data)

#### 3A. Batch markAsPrinted — Performance Fix
- `markPrintedBatch(receiptNos[])` — 1 Supabase call แทน N calls
- update local state + render 1 ครั้ง (แทน N re-renders)

#### 3B. Cache getFilteredData()
- `state.filteredDataCache` + `state.filteredDataDirty`
- ลดจาก 3 calls/render เหลือ 1 call/render

#### 2A. Recent Receipts (Frontend)
- เก็บ 10 เลขใบรับล่าสุดใน localStorage
- Dropdown ใต้ช่องค้นหา (focus + empty) — Arrow keys + Enter

#### 2C. Search Query Hash
- SHA-256 hash (12 ตัวแรก) สำหรับวิเคราะห์ว่า search ซ้ำคำเดิมบ่อยแค่ไหน
- ย้อนกลับไม่ได้ (privacy-preserving)

#### 3C. Batch Print UX
- ปุ่ม "เลือกที่ยังไม่พิมพ์" — เลือกเฉพาะรายการ is_printed=false ในหน้าปัจจุบัน
- Keyboard shortcut: Ctrl+P → batchPrint() เมื่อมีรายการเลือก

#### 4A. Journey Tracking
- Track session journey milestones: journey_search, journey_print, journey_form_add
- Classify journey type ตอน beforeunload: search_then_print, form_add_then_print, browse_only, etc.

### SQL Migration
- **supabase-update-v8.0-card-print-lock.sql**
  - ตาราง `card_print_locks` (appointment_id UNIQUE, officer_id, sn_good, sn_spoiled, status)
  - Trigger `normalize_appointment_id()` — LOWER(TRIM(REGEXP_REPLACE))
  - Indexes: lock_date DESC, officer_id, appointment_id, status
  - RLS: read all, insert all, update own, delete admin
  - Realtime enabled
  - ตาราง `card_print_locks_archive` + indexes
  - Function `cleanup_old_card_locks()` — 48hr archive, 90d delete

### Files Modified
| File | Action | หมายเหตุ |
|------|--------|----------|
| `supabase-update-v8.0-card-print-lock.sql` | สร้างใหม่ | Card print lock table + archive + cleanup |
| `card-print.html` | สร้างใหม่ | หน้า Card Print Lock (HTML + inline CSS) |
| `js/card-print-app.js` | สร้างใหม่ | 3-layer lock, Realtime, barcode, S/N, colors |
| `js/supabase-config.js` | แก้ไข | เพิ่ม SupabaseCardPrintLock module (CRUD + search + archive) |
| `js/supabase-adapter.js` | แก้ไข | เพิ่ม markPrintedBatch() |
| `js/app-supabase.js` | แก้ไข | Recent receipts, cache, batch UX, journey, cross-use, quick print detect |
| `index.html` | แก้ไข | ลิงก์ล็อกบัตร, ปุ่มเลือกที่ยังไม่พิมพ์ |

### Deployment Notes
✅ ทำสำเร็จทั้งหมดแล้ว:
1. ✅ รัน SQL v8.0 + v8.1 บน SIT — ทดสอบผ่าน
2. ✅ ทดสอบ Card Print Lock: lock, duplicate (23505), S/N, admin delete
3. ✅ ทดสอบ fuzzy search: "TETS USER" → "TEST USER SIT"
4. ✅ ทดสอบ cross-use: lock → receipt form auto-fill
5. ✅ Commit e4100e5 + push to production (GitHub Pages) — 10 ก.พ. 69
6. ✅ รัน SQL v8.0 + v8.1 บน Production Supabase — 11 ก.พ. 69
   - Verified: 2 tables, 3 functions, 11 indexes, 1 extension (pg_trgm) — ครบ 15 objects

---

## [7.0.0-dev] - 2026-02-10

> **สถานะ: Development / SIT Testing — ยังไม่ deploy production**
> **Branch: แยกจาก main — ห้าม merge จนกว่าจะทดสอบครบ**

### Added — E-Sign Workflow: Webcam + Digital Signature

#### Webcam Photo Capture (RAPOO C280)
- **ถ่ายรูปผู้รับบัตร** จากกล้อง USB ผ่าน getUserMedia API
  - Dropdown เลือกกล้อง (`enumerateDevices()`) — รองรับกล้องหลายตัว
  - Capture ที่ 1280x960 (ไม่ใช้ full 2K เพื่อประหยัด storage)
  - Compress เป็น JPEG 0.8 ก่อน upload (~100-200KB/รูป)
  - ปุ่ม: เปิดกล้อง / ถ่ายรูป / ถ่ายใหม่
  - Fallback: แสดงข้อความเมื่อไม่พบกล้อง หรือ permission denied

#### Recipient Digital Signature (Phase 1: Canvas)
- **ลายเซ็นดิจิทัลผู้รับบัตร** ผ่าน signature_pad library v4.2.0
  - Canvas 400x200px, penColor: #000, minWidth: 1.5, maxWidth: 3
  - ปุ่ม: ล้าง / Undo (undo last stroke)
  - Export เป็น PNG via `toDataURL('image/png')`
  - **Phase 2 (อนาคต):** เปลี่ยนเป็น WAC-0503 hardware signature pad ผ่าน WebSocket Pro SDK

#### Officer Signature (Profile Settings)
- **ลายเซ็นเจ้าหน้าที่** ตั้งค่าครั้งเดียว ใช้ซ้ำทุกรายการ
  - Modal ตั้งค่าลายเซ็น (เข้าจากปุ่ม header)
  - บันทึก PNG ไป Supabase Storage → URL ใน profiles.signature_url
  - Auto-fill ลายเซ็นเจ้าหน้าที่ในฟอร์มทุกรายการ
  - แจ้งเตือนถ้ายังไม่ได้ตั้งค่าลายเซ็น

#### E-Sign Workflow
- **Flow ใหม่:** กรอกข้อมูล → ถ่ายรูป → ผู้รับเซ็น → Save → Mark Received
- **Print เป็น optional** — ไม่บังคับปริ้นกระดาษอีกต่อไป
- **Status ใหม่:** Created → Signed → Received (แทน Printed/Not Printed)
- **Receipt preview** แสดงรูปถ่าย + ลายเซ็นทั้ง 2 ฝ่าย

#### SIT Environment
- **Supabase SIT project** แยกจาก Production สำหรับทดสอบ
  - URL param `?env=sit` สลับ environment ได้
  - SIT badge แสดงที่มุมบนซ้ายเมื่ออยู่ใน SIT mode
  - Database schema ครบถ้วน (supabase-sit-full-setup.sql)

### Changed
- **login.html** — เพิ่ม environment switching (เดิม hardcode production)
- **auth.js** — เพิ่ม `getEnvParam()` รักษา `?env=` param ผ่านทุก redirect
- **Receipt preview** — แสดงรูปถ่าย + ลายเซ็นจริงแทนเส้นว่าง
- **Status filter** — เปลี่ยนจาก Printed/Not Printed เป็น Created/Signed/Received
- **Summary panel** — ปรับตัวเลขเป็น Total, Signed, Received, Pending

### Fixed (พบระหว่าง SIT Testing)
- **BUG: login.html hardcoded Production Supabase** — `?env=sit` ไม่ทำงาน เพราะ login.html มี config ตายตัว → เพิ่ม environment switching
- **BUG: Redirect loses `?env=sit` param** — login → index → login วนลูปโดยสูญเสีย env param → เพิ่ม `getEnvParam()` ใน auth.js
- **BUG: Profiles RLS infinite recursion** — Admin policy query profiles ภายใน profiles RLS → สร้าง `is_admin()` SECURITY DEFINER function (แก้บน SIT, Production อาจต้องแก้เหมือนกัน)
- **BUG: `session.id` ไม่มีค่า** — ใช้ `session.id` แต่ AuthSystem.getSession() คืน `.userId` → แก้เป็น `session.userId` (2 จุด)
- **BUG: ไม่ await getSession()** — เรียก async function โดยไม่ await → ได้ Promise object แทนข้อมูลจริง → เพิ่ม `await` (2 จุด)

### SQL Migration
- **supabase-update-v7.0-photo-signature.sql**
  - เพิ่ม `recipient_photo_url TEXT` ใน receipts
  - เพิ่ม `recipient_signature_url TEXT` ใน receipts
  - เพิ่ม `officer_signature_url TEXT` ใน receipts
  - เพิ่ม `signature_url TEXT` ใน profiles
  - เพิ่ม index `idx_receipts_signature_status`
- **SIT-only: `is_admin()` function** — SECURITY DEFINER function แก้ RLS recursion
- **supabase-sit-full-setup.sql** — Full schema สำหรับ SIT environment

### External Dependencies (ใหม่)
- `signature_pad@4.2.0` — CDN จาก jsDelivr (~30KB)

### Files Modified
| File | Action | หมายเหตุ |
|------|--------|----------|
| `index.html` | แก้ไข | เพิ่ม webcam UI, signature pads, officer signature modal, CDN script |
| `js/app-supabase.js` | แก้ไข | เพิ่ม webcam/signature modules, แก้ save/preview/clear/filter, fix session bugs |
| `js/supabase-adapter.js` | แก้ไข | เพิ่ม upload functions สำหรับ photo/signature, แก้ save payload |
| `js/supabase-config.js` | แก้ไข | เพิ่ม SIT environment config |
| `js/auth.js` | แก้ไข | เพิ่ม `getEnvParam()`, fix redirects |
| `login.html` | แก้ไข | เพิ่ม environment switching |
| `css/style.css` | แก้ไข | เพิ่ม styles สำหรับ webcam, signature pad, modal |
| `supabase-update-v7.0-photo-signature.sql` | สร้างใหม่ | Migration script |
| `supabase-sit-full-setup.sql` | สร้างใหม่ | Full SIT schema |

### Deployment Notes
> **ยังไม่ deploy production** — ทดสอบบน SIT เท่านั้น
> - Local testing: `python3 -m http.server 8080` → `http://localhost:8080/index.html?env=sit`
> - Production ที่ `receipt.fts-internal.com` ยังเป็น v6.3.0
> - ต้องทดสอบ hardware จริง (RAPOO C280 + WAC-0503) ก่อน deploy
> - ต้อง run `is_admin()` function บน Production Supabase ก่อน deploy (fix RLS recursion)

---

## [6.3.0] - 2026-02-10

### Added — Pagination, Barcode, UX Analytics
- **Pagination 50 รายการ/หน้า** สำหรับทั้ง Registry Table และ Activity Log
  - แสดง "แสดง 1-50 จาก N รายการ" + ปุ่มเปลี่ยนหน้า
  - Reset หน้า 1 อัตโนมัติเมื่อ search/filter เปลี่ยน
  - Select All เลือกเฉพาะหน้าปัจจุบัน
  - ซ่อน pagination เมื่อ ≤ 50 รายการ
- **Barcode Code 128** พิมพ์ที่ footer ของใบรับทุกใบ
  - ใช้ JsBarcode library (CDN)
  - แสดง receipt_no ใต้ barcode (displayValue)
  - Fallback: แสดง "Doc No." เป็นข้อความถ้า JsBarcode ไม่โหลด
- **Barcode Scan Detection** ที่ช่องค้นหา
  - ตรวจจับ pattern พิมพ์เร็ว (< 100ms ระหว่างตัว) + Enter
  - Bypass debounce เมื่อเป็น barcode scan → ค้นหาทันที
- **UX Analytics** (batched, fire-and-forget)
  - เก็บ timing, feature usage, user journey, errors
  - Batching: flush ทุก 30 วินาที หรือ 50 events
  - flush ก่อน beforeunload
  - ไม่เก็บ PII — ใช้ session ID แทน
  - ตาราง `ux_analytics` + indexes + RLS (INSERT authenticated, SELECT admin only)

### Fixed
- **S1: Search query injection** — sanitize search input ใน supabase-adapter.js
- **F1: Batch print selection loss** — คงสถานะ checkbox หลัง re-render
- **P1: Analytics batching** — flush ทุก 30s/50 events แทน immediate INSERT
- **Print layout overflow 2 หน้า** — ปรับ header (24→18px), info table padding (12→5px), page padding (10→5mm) ให้พอดี 1 หน้า A4 (คงรูปภาพ 210px)
- **ตัวอักษรหมวดหมู่ไม่อยู่กลางกรอบ** — เปลี่ยนจาก `position: absolute` เป็น flexbox layout

### Changed
- **Cache version** bump จาก v6.2 เป็น v6.3
- **Version badge** อัพเดทเป็น v6.3.0
- **Activity Log limit** เพิ่มจาก 100 เป็น 500

### SQL Migration
- สร้างตาราง `ux_analytics` + indexes (`created_at`, `event_type + event_name`)
- RLS: INSERT สำหรับ authenticated, SELECT สำหรับ admin only

---

## [6.2.0] - 2026-02-10

### Added — Image Compression, Date Filter, Search Enhancement
- **Image compression** — บีบอัดรูปก่อน upload (≤1200px, ≤800KB)
  - Block SVG/HTML files (ป้องกัน XSS via image upload)
  - แสดงขนาดไฟล์หลังบีบอัด
- **Date picker** — default วันที่ปัจจุบัน, เปลี่ยนวันที่ดูข้อมูลได้
- **Date-based loading** — โหลดเฉพาะข้อมูลวันที่เลือก (ลด bandwidth)
- **Server-side search** — ค้นหาข้ามวันที่ได้ (ไม่จำกัดเฉพาะวันที่เลือก)

### Changed
- **Cache version** bump จาก v6.1 เป็น v6.2

### SQL Migration
- เพิ่ม indexes: `created_at DESC`, `receipt_no`, `foreigner_name`

---

## [6.1.0] - 2026-02-09

### Added - Print Layout Enhancement (ค้นหาเอกสารง่ายขึ้น)
- **ตัวอักษรหมวดหมู่ A-Z** มุมขวาบนของใบรับ (36px กรอบสี)
  - ข้าม prefix (mr./mrs./miss/ms.) ใช้ตัวอักษรแรกของชื่อจริง
  - Helper function `getCategoryInfo(name)` คืนค่า `{ letter, color }`
- **แถบสี 5 กลุ่ม** ด้านบนใบรับ (border-top 4px)
  - A-E แดง (#dc2626), F-J เขียว (#16a34a), K-O น้ำเงิน (#2563eb)
  - P-T ส้ม (#ea580c), U-Z ม่วง (#9333ea)
- **Batch print เรียง A-Z อัตโนมัติ** ตามชื่อจริง (ข้าม prefix)
- **แถบสีหมวดหมู่ในตาราง registry** (border-left สีตามกลุ่มที่ column ลำดับ)
- **Preview อัปเดต** แสดง category badge + แถบสี + Doc No. ขนาดใหญ่

### Changed
- **Doc No. footer** ขยายจาก 10px เทาอ่อน เป็น 16px ตัวหนา สีดำ (อ่านชัดขึ้น)
- **Receipt bottom footer** border-top หนาขึ้นจาก 1px เป็น 2px
- **Cache version** bump จาก v6.0 เป็น v6.1

### Security (v6.0.2)
- **sanitizeHTML()** ครอบคลุมทุก rendering function (XSS prevention)
- **validateInput()** block HTML tags, javascript: URI, event handlers
- **Delete permission** เฉพาะ admin เท่านั้น (manager/staff ไม่ได้)
- **batchPrint()** ใช้ `markAsPrinted()` async sync to Supabase
- **pending_receipts RLS policy** SQL พร้อม run เมื่อสร้างตาราง

---

## [6.0.1] - 2026-02-09

### Fixed
- **🔴 SyntaxError ตัวแปรซ้ำ (Critical — ทำให้ระบบล่มทั้งหมด)**
  - `printFromTable(receiptNo)` มี parameter ชื่อ `receiptNo` ซ้ำกับ `const receiptNo` ข้างใน
  - ทำให้ทั้งไฟล์ JS ไม่ทำงาน → ไม่โหลดข้อมูล ไม่แสดงชื่อผู้ใช้ ไม่สามารถเพิ่มข้อมูลใหม่
  - เจ้าหน้าที่เข้าใจว่าเพิ่มข้อมูลไม่ได้ จึงลบ record ไป 38 รายการ
  - แก้โดยเปลี่ยนเป็น `printReceiptNo` / `printName`

- **api_photo_url ทำให้บันทึกไม่ได้**
  - สาเหตุ: ส่ง `api_photo_url: null` ไป Supabase แต่ column ยังไม่มี (ยังไม่ได้รัน migration)
  - แก้ให้ส่งเฉพาะเมื่อมีค่าจริงเท่านั้น

- **ปิดฟีเจอร์ VP API ชั่วคราว** เพื่อป้องกันหน้างานผิดพลาดก่อนรัน migration
  - ซ่อนปุ่ม VP ด้วย `display: none`
  - Comment out `updatePendingBadge()` และ `setupPendingRealtime()`

### Added
- **Version badge** แสดง v6.0.0 มุมล่างขวาของหน้าเว็บ
- **Cache busting** อัพเดท query string เป็น `?v=6.0` ทุกไฟล์

### Recovery
- **กู้คืนข้อมูล 38 รายการที่ถูกลบ**
  - ดึงรายการจาก `activity_logs` (receipt_no + ชื่อ)
  - สร้างไฟล์ Excel (`Recovery_38_records_20260209.xlsx`) สำหรับเจ้าหน้าที่กรอก SN/Request No./Appointment No.
  - สร้าง SQL INSERT template (`recovery-insert-template.sql`) สำหรับ insert กลับด้วยเลข receipt_no เดิม
  - รูปภาพบัตรต้องอัพโหลดใหม่ผ่านหน้าเว็บหลัง insert

---

## [6.0.0] - 2026-02-09

### Added
- **VP API Integration (ปิดไว้ชั่วคราว — รอ migration)**
  - Edge Function `vpapi-webhook` รับข้อมูลจาก VP แบบ push (webhook)
  - Edge Function `vpapi-sync` ดึงข้อมูลอัตโนมัติตาม schedule (polling backup)
  - ตาราง `pending_receipts` เก็บข้อมูลจาก VP ที่รอสร้างใบรับบัตร
  - SQL migration `supabase-update-v6.0-api-integration.sql`
  - Modal เลือกข้อมูลจาก VP แทน Google Sheet
  - Realtime notification เมื่อมีข้อมูลใหม่จาก VP
  - Pending badge แสดงจำนวนรายการที่รอสร้างใบรับ
  - Column `api_photo_url` ในตาราง receipts (สำหรับรูปถ่ายจาก API)

### Changed
- **ลบ Google Sheet Integration**
  - ลบ `fetchSheetData()`, `fetchSheetDataPublic()`, `renderSheetResults()` ฯลฯ
  - ลบ Google Sheet sync toggle สำหรับ Admin
  - ลบ CONFIG สำหรับ SPREADSHEET_ID, SHEET_COLUMNS, API_KEY
  - เปลี่ยนปุ่ม "📥 ดึงข้อมูลจาก Google Sheet" → "📋 เลือกข้อมูลจาก VP" (ซ่อนไว้รอ migration)

### Fixed
- **Race Condition เมื่อ 3 เครื่องบันทึกพร้อมกัน**
  - สาเหตุ: เลข receipt number ถูก gen ตอนเปิดฟอร์ม แต่ 3 เครื่องได้เลขเดียวกัน
  - เครื่องที่ save ทีหลังจะ overwrite ข้อมูลเครื่องแรก (รูปไม่ตรงคน)
  - แก้ 3 ชั้น: (1) Re-gen เลขก่อน save (2) Block duplicate insert (3) Auto-retry 3 ครั้ง

- **ข้อมูลพิมพ์ไม่ตรงกับ preview**
  - สาเหตุ: ตาราง sort (ยังไม่พิมพ์อยู่บน พิมพ์แล้วอยู่ล่าง) แต่ปุ่มพิมพ์ใช้ index ของ array ที่ยังไม่ sort
  - กดพิมพ์แถว 1 ในตาราง → ได้ข้อมูล index 1 จาก array จริง → คนละคน
  - แก้โดยใช้ `receiptNo` (เลขรับที่) แทน index ใน `printFromTable()` และ `selectRow()`

### Technical
- Edge Functions ใช้ Deno runtime (Supabase Edge Functions standard)
- Webhook authentication ด้วย `x-api-key` header
- VP API credentials เก็บใน Supabase Secrets (VP_API_USERNAME, VP_API_PASSWORD)
- Realtime subscription ผ่าน Supabase Channels (postgres_changes)
- ฟีเจอร์ VP ปิดไว้ด้วย `style="display: none;"` และ comment out — เปิดได้ทันทีหลังรัน migration

### Deployment Notes
ก่อนเปิดฟีเจอร์ VP ต้อง:
1. รัน SQL migration `supabase-update-v6.0-api-integration.sql`
2. Deploy Edge Functions: `supabase functions deploy vpapi-webhook` / `vpapi-sync`
3. ตั้ง Supabase Secrets: `VPAPI_WEBHOOK_SECRET`, `VP_API_USERNAME`, `VP_API_PASSWORD`
4. เปิดปุ่มใน `index.html` (ลบ `style="display: none;"`)
5. Uncomment `updatePendingBadge()` และ `setupPendingRealtime()` ใน `app-supabase.js`

---

## [5.2.0] - 2026-02-05

### Added
- **Reset Password Feature (Admin)**
  - ปุ่ม 🔑 Reset Password ในตาราง User Management
  - ฟังก์ชัน `resetPassword()` ใน auth.js ใช้ Supabase `resetPasswordForEmail`
  - ฟังก์ชัน `handleResetPassword()` ใน app-supabase.js
  - หน้า `reset-password.html` สำหรับผู้ใช้ตั้งรหัสผ่านใหม่

### Fixed
- **Edit User Modal แสดง "undefined"**
  - สาเหตุ: เรียก async function โดยไม่ใช้ await
  - แก้ไข: เพิ่ม async/await ใน `showEditUserForm()`, `confirmDeleteUser()`

- **User Approval Error (approved_at column)**
  - สาเหตุ: พยายาม update column ที่ไม่มีอยู่
  - แก้ไข: ลบ `approved_by` และ `approved_at` ออกจาก `approveUser()`

- **User Login ไม่ได้**
  - สาเหตุ: Email ไม่ได้รับการยืนยัน + Supabase Redirect URL ไม่ถูกต้อง
  - แก้ไข: ปิด Email Confirmation + ตั้งค่า Site URL และ Redirect URLs ใน Supabase

### Changed
- **Supabase Settings**
  - ปิด "Confirm email" ใน Authentication → Providers → Email
  - ตั้ง Site URL: `https://receipt.fts-internal.com`
  - เพิ่ม Redirect URL: `https://receipt.fts-internal.com/reset-password.html`

### Technical
- เพิ่ม `resetPassword` ใน `window.AuthSystem` exports
- เพิ่ม `handleResetPassword` ใน global window functions

---

## [5.1.1] - 2026-02-05

### Security
- **XSS Protection**
  - เพิ่ม `sanitizeHTML()` function สำหรับป้องกัน XSS attacks
  - Sanitize ข้อมูลทั้งหมดก่อนแสดงผลใน table

- **Input Validation**
  - เพิ่ม `validateInput()` function สำหรับตรวจสอบข้อมูล
  - Validate ข้อมูลก่อนบันทึกลง database
  - ป้องกัน script injection

- **Credential Security**
  - ลบ credentials ที่เปิดเผยออกจาก documentation
  - เพิ่มคำเตือนความปลอดภัยใน SESSION_LOG
  - เปลี่ยน Admin Password ใน Supabase Dashboard

- **Authentication & Authorization**
  - Supabase RLS (Row Level Security) enabled
  - JWT-based session management
  - User approval system for new registrations

### Technical
- Security audit completed ✅
- Added security utility functions
- All critical/high security issues resolved
- System ready for production use

---

## [5.1.0] - 2026-02-05

### Changed
- **Receipt Form Header**
  - เปลี่ยนหัวเรื่องเป็น "แบบรับใบอนุญาตทำงาน e-WorkPermit"
  - เพิ่ม subtitle "(e-WorkPermit Card Receipt)"
  - ใช้รูปแบบเรียบง่าย มีเส้นขีดใต้สีน้ำเงิน

- **Receipt Form Footer**
  - ย้ายชื่อหน่วยงาน "ศูนย์บริการ EWP อาคาร One Bangkok" ไป footer
  - แสดงชื่อหน่วยงานซ้าย และ Doc No. ขวา ในแถวเดียวกัน

- **System Header**
  - เปลี่ยนจาก "ระบบออกใบรับบัตร Work Permit" เป็น "ระบบสร้างแบบฟอร์มรับบัตร"
  - เปลี่ยนชื่อหน่วยงานเป็น "ศูนย์บริการ EWP อาคาร One Bangkok"

- **Registry Table Header**
  - เปลี่ยนจาก "ข้อมูลคุมทะเบียน" เป็น "รายการเอกสารแบบรับใบอนุญาตทำงาน e-WorkPermit"

### Technical
- Added CSS version query for cache busting
- Updated print layout to match preview

---

## [5.0.0] - 2026-02-05

### Added
- **Supabase Cloud Integration**
  - PostgreSQL database for receipts, profiles, activity_logs
  - Supabase Storage for Work Permit card images
  - Real-time data sync across devices
  - Secure authentication with Supabase Auth

- **Cloud Deployment**
  - GitHub Pages hosting
  - Custom domain: `receipt.fts-internal.com`
  - Auto SSL certificate provisioning

- **New Files**
  - `js/supabase-config.js` - Supabase client configuration
  - `js/supabase-adapter.js` - Adapter layer for Supabase operations
  - `js/app-supabase.js` - Main app v5.0 with cloud integration
  - `CNAME` - Custom domain configuration

### Changed
- **Data Storage**
  - Migrated from LocalStorage to Supabase PostgreSQL
  - Images stored in Supabase Storage bucket
  - Activity logs stored in database

- **Authentication**
  - Changed from LocalStorage sessions to Supabase Auth
  - Email/password authentication
  - Profile data from `profiles` table

- **Auto-reload after save**
  - Table automatically updates after saving data
  - No need to manually refresh page

### Fixed
- **406 Error** - Changed `.single()` to `.maybeSingle()` when checking existing receipts
- **Table not updating** - Added auto-reload from Supabase after save
- **Supabase library loading** - Added inline initialization with retry mechanism
- **Login redirect loop** - Removed auto-redirect on login page

### Technical
- Supabase Project: `pyyltrcqeyfhidpcdtvc`
- Database: PostgreSQL with Row Level Security (RLS)
- Storage: `card-images` public bucket
- Hosting: GitHub Pages + Custom Domain

---

## [4.1.1] - 2026-02-05

### Changed
- **Print Layout ปรับปรุงใหม่**
  - ขยายขนาดเนื้อหาให้เต็มหน้า A4 มากขึ้น
  - ขยายรูปภาพ Work Permit จาก 130px เป็น 210px
  - เพิ่มขนาด font ทั้งหมด (Header 24px, Content 16px, Labels 12px)
  - ช่องลายเซ็นใหญ่ขึ้น 40px
  - Spacing และ padding เพิ่มขึ้นทั้งหมด

### Fixed
- **Print 5 หน้า** - แก้ปัญหาพิมพ์ออกมา 5 หน้าให้เหลือ 1 หน้าต่อใบรับ
  - ปรับ CSS @media print ให้ซ่อน elements อื่นถูกต้อง
  - เปลี่ยนจาก CSS Grid เป็น HTML Table (รองรับ print ได้ดีกว่า)
  - เพิ่ม `.print-receipt-page` class พร้อม page-break controls

### Technical
- ปรับ `generatePrintContent()` และ `generateSinglePrintContent()` ให้ใช้ HTML Table layout
- เพิ่ม CSS print styles: `@page`, `visibility`, `display: none` สำหรับ containers
- เพิ่ม `.print-receipt-page` class สำหรับควบคุม page break

---

## [4.1.0] - 2026-02-05

### Added
- **Google Sheets Integration**
  - ปุ่ม "📥 ดึงข้อมูลจาก Google Sheet" สำหรับ import ข้อมูลจาก Sheet คุมทะเบียน
  - Modal ค้นหาและเลือกข้อมูลจาก Google Sheet
  - ใช้ Google Visualization API (gviz/tq endpoint)
  - Live search ด้วย debounce 300ms

- **Auto-generated Fields**
  - วันที่รับบัตร (Date) รันอัตโนมัติ ไม่ให้กรอก
  - เลขรับที่ (No.) สร้างอัตโนมัติ format YYYYMMDD-NNN
  - Badge "อัตโนมัติ" แสดงที่ field วันที่

- **Bilingual Labels**
  - Preview แสดง label ไทย/อังกฤษ แยกบรรทัด
  - Print form แสดง label 2 ภาษา
  - ช่องลงลายเซ็นมีทั้งไทยและอังกฤษ

- **Officer Name**
  - ชื่อเจ้าหน้าที่ผู้จัดทำใต้ลายเซ็น
  - ดึงชื่อจาก AuthSystem.getSession().name อัตโนมัติ

### Changed
- **Form Layout**
  - ตัดเลขรับที่ออกจากฟอร์มกรอกข้อมูล (เป็น hidden field)
  - วันที่รับบัตรเป็น readonly พื้นหลังสีเขียว
  - Doc No. แสดงที่มุมล่างขวาของ Preview และ Print

- **Preview Improvements**
  - Label แยกบรรทัด: ไทย (ตัวหนา) / อังกฤษ (ตัวเล็ก สีเทา)
  - Doc No. footer ที่มุมล่างขวา

### Fixed
- **formatTime function duplicate** - แก้ฟังก์ชัน formatTime ซ้ำ 2 ตัวทำให้เกิด error
- **Async initialization** - แก้ initializeApp ให้ await loadRegistryData() ก่อนสร้างเลขรับที่
- **State update** - แก้ state.formData ไม่อัพเดทหลัง set วันที่และเลขรับที่
- **clearForm confirmation** - แก้ clearForm(true) หลังบันทึกเพื่อ skip confirmation

### Technical
- เพิ่มฟังก์ชัน `openGoogleSheetModal()`, `searchGoogleSheet()`, `selectSheetRecord()`
- เพิ่มฟังก์ชัน `formatSheetTime()` แยกจาก `formatTime()`
- เพิ่ม CSS สำหรับ `.auto-badge`, `.readonly-field`, `.receipt-doc-number`
- Modal สำหรับ Google Sheets search/select

---

## [4.0.0] - 2026-02-04

### Added
- **ระบบ Login**
  - หน้า Login สำหรับเข้าสู่ระบบ
  - Session management ด้วย LocalStorage
  - Logout functionality

- **User Management (Admin Only)**
  - เพิ่ม/แก้ไข/ลบ ผู้ใช้งาน
  - กำหนด Role สำหรับผู้ใช้
  - Default Users: admin, manager, staff

- **Role-based Access Control**
  - Admin: Full access รวม User Management และ Activity Log
  - Manager: Full access ยกเว้น UM และ Activity Log
  - Staff: ดำเนินการปกติเท่านั้น

- **Tab Navigation**
  - ย้ายรายงานรายเดือนและ Activity Log เป็น Tab Menu
  - UI ใหม่สวยงามขึ้น

- **Print Confirmation**
  - ถามยืนยันหลังพิมพ์ก่อนอัพเดตสถานะ
  - แก้บัค กดยกเลิกแล้วยังอัพเดตสถานะ

### Changed
- **รูปแบบเลขรับที่ใหม่**
  - จาก "6902/0001" เป็น "YYYYMMDD-001"
  - รันนิ่งใหม่ทุกวัน

- **ปรับหน้าพิมพ์ใหม่**
  - ลดขนาดฟ้อนต์ให้อยู่หน้าเดียว
  - เพิ่มภาษาอังกฤษกำกับทุกฟิลด์
  - เพิ่มช่องชื่อเจ้าหน้าที่ใต้ลายเซ็น
  - ย้ายเลขเอกสารไปมุมล่างขวา

- **Header ใหม่**
  - แสดงชื่อผู้ใช้และ Role
  - ปุ่มจัดการผู้ใช้ (Admin only)
  - ปุ่มออกจากระบบ

### Removed
- ลบปุ่มดูตัวอย่างออก (Preview แสดง real-time อยู่แล้ว)

### Technical
- เพิ่มไฟล์ `login.html` และ `js/auth.js`
- เพิ่ม Modal สำหรับ User Management
- ปรับ CSS สำหรับ Tab Navigation และ Header

---

## [3.0.0] - 2026-02-04

### Added
- **Batch Print (พิมพ์หลายใบพร้อมกัน)**
  - Checkbox ในตารางสำหรับเลือกรายการ
  - ปุ่ม "เลือกทั้งหมด" ในหัวตาราง
  - ปุ่ม "พิมพ์ที่เลือก" แสดงจำนวนที่เลือก
  - พิมพ์หลายใบในคราวเดียวพร้อม page break

- **Monthly Report (รายงานรายเดือน)**
  - เลือกเดือน/ปีเพื่อดูสถิติ
  - แสดงสรุป: ผลิตบัตร, พิมพ์แล้ว, รับแล้ว, รอดำเนินการ
  - ตารางสรุปรายวัน
  - Export รายงานเป็น PDF/CSV

- **Activity Log (บันทึกประวัติการทำงาน)**
  - บันทึกทุกการกระทำ: เพิ่ม, แก้ไข, ลบ, พิมพ์, รับบัตร
  - กรองตาม Activity type
  - แสดงวันเวลาและรายละเอียด
  - ล้าง Log ได้

### Changed
- ปรับโครงสร้างตารางเพิ่ม column checkbox
- ปรับ UI ให้รองรับ Features ใหม่

### Technical
- เพิ่ม `STORAGE_KEY_ACTIVITY` สำหรับเก็บ Activity Log
- เพิ่มฟังก์ชัน Batch Print: `toggleSelectItem()`, `batchPrint()`, `generateSinglePrintContent()`
- เพิ่มฟังก์ชัน Monthly Report: `generateMonthlyReport()`, `exportMonthlyPDF()`, `exportMonthlyCSV()`
- เพิ่มฟังก์ชัน Activity Log: `addActivity()`, `renderActivityLog()`, `clearActivityLog()`

---

## [2.1.0] - 2026-02-04

### Added
- **ปุ่มพิมพ์ใบรับในตาราง** - สามารถพิมพ์ใบรับได้โดยตรงจากตาราง ไม่ต้องกดแก้ไขก่อน
- **ฟังก์ชัน `printFromTable()`** - พิมพ์ใบรับจากข้อมูลในตารางโดยตรง

### Changed
- ปรับ column "การดำเนินการ" ให้มี 3 ปุ่ม: 🖨️ พิมพ์, ✏️ แก้ไข, 🗑️ ลบ
- เพิ่ม CSS `.action-buttons` สำหรับจัดปุ่มในตาราง

---

## [2.0.0] - 2026-02-04

### Added
- **ระบบจัดการข้อมูลครบวงจร** - เพิ่ม/แก้ไข/ลบข้อมูลได้ในหน้าเดียว
- **บันทึกรูปภาพกับรายการ** - รูปบัตร Work Permit เก็บพร้อมข้อมูล
- **ปุ่ม "เพิ่มข้อมูลใหม่"** - สร้างรายการใหม่ได้ทันที
- **ปุ่ม "แก้ไข"** - โหลดข้อมูล + รูปมาฟอร์มเพื่อแก้ไข
- **ปุ่ม "ลบ"** - ลบรายการที่ไม่ต้องการ (มี confirm)
- **Column "รูป"** ในตาราง - แสดง thumbnail รูปบัตร
- **Form Mode Badge** - แสดงโหมด "เพิ่มใหม่" หรือ "แก้ไข"
- **LocalStorage สำหรับข้อมูลหลัก** - เก็บข้อมูลทั้งหมดรวมรูปภาพ

### Changed
- ปรับ UI ฟอร์มด้านซ้ายให้รองรับทั้งเพิ่มและแก้ไข
- แยกปุ่ม "บันทึกข้อมูล" ออกจากปุ่ม "พิมพ์ใบรับ"
- ตารางเพิ่ม column รูปและปุ่มจัดการ

### Technical
- เพิ่ม `STORAGE_KEY_REGISTRY` สำหรับเก็บข้อมูลหลัก
- เพิ่มฟังก์ชัน `saveData()`, `deleteRecord()`, `setFormMode()`
- เพิ่มฟังก์ชัน `viewImage()` สำหรับดูรูปขยาย

---

## [1.0.0] - 2026-02-04

### Added
- **ฟอร์มรับบัตร** - กรอกข้อมูล + อัพโหลดรูป
- **ตัวอย่างใบรับ** - Preview ก่อนพิมพ์
- **พิมพ์ใบรับ** - Export เป็น PDF ผ่าน browser print
- **สรุปรายวัน** - แสดงสถิติผลิตบัตร/พิมพ์/รับบัตร
- **ค้นหา & กรอง** - ค้นหาตามเลขรับที่, SN, ชื่อ
- **Export CSV/PDF** - ส่งออกรายงานสรุป
- **ติ๊กสถานะพิมพ์** - บันทึกว่าพิมพ์ใบรับแล้ว (LocalStorage)
- **ติ๊กสถานะรับบัตร** - Checkbox บันทึกว่ารับบัตรแล้ว
- **หมายเลข SN บัตร** - เพิ่ม column SN ในฟอร์มและตาราง

### Technical
- HTML/CSS/JavaScript (Vanilla)
- Font: Sarabun (Google Fonts)
- LocalStorage สำหรับเก็บสถานะพิมพ์/รับบัตร
- Mock Data (รอเชื่อม Google Sheets API)

---

## Backup Versions

| Version | Location | Description |
|---------|----------|-------------|
| v1.0 | `backups/v1.0-basic/` | Basic version ก่อนเพิ่มระบบจัดการข้อมูล |

---

## Roadmap (Future)

- [x] ~~เชื่อมต่อ Google Sheets API~~ (v4.1.0 → ลบใน v6.0.0)
- [x] ~~บันทึกรูปไป Cloud~~ (v5.0.0 - Supabase Storage)
- [x] ~~Batch Print (พิมพ์หลายใบพร้อมกัน)~~ (v3.0.0)
- [x] ~~รายงานสรุปรายเดือน~~ (v3.0.0)
- [x] ~~Activity Log (ประวัติการทำงาน)~~ (v3.0.0)
- [x] ~~Cloud Deployment~~ (v5.0.0 - GitHub Pages + Custom Domain)
- [x] ~~VP/SWD API Integration~~ (v6.0.0 - Edge Functions + pending_receipts)
- [x] ~~Image Compression + Date Filter~~ (v6.2.0)
- [x] ~~Pagination + Barcode + UX Analytics~~ (v6.3.0)
- [ ] เปิดใช้งาน VP API (รอ migration + credentials)
- [ ] กู้คืน 38 รายการที่ถูกลบ (รอเจ้าหน้าที่กรอก Excel → INSERT กลับ)
- [ ] **v7.0 E-Sign Workflow** (อยู่ระหว่างทดสอบ — ยังไม่ deploy prod)
  - [x] Webcam photo capture (RAPOO C280)
  - [x] Digital signature pad (Phase 1: canvas)
  - [x] Officer signature from profile
  - [x] SIT environment setup
  - [ ] ทดสอบ hardware จริง (RAPOO C280 + WAC-0503)
  - [ ] ทดสอบ Mark Received flow
  - [ ] ทดสอบ Status filters (Created/Signed/Received)
  - [ ] ทดสอบ Print with signatures
  - [ ] Security testing
  - [ ] Deploy to production
- [ ] **v8.0 UX Optimization + Card Print Lock** (อยู่ระหว่างทดสอบ)
  - [x] 3A. Batch markAsPrinted (1 call แทน N)
  - [x] 3B. Cache getFilteredData()
  - [x] 2A. Recent Receipts (localStorage)
  - [x] 2C. Search Query Hash (SHA-256)
  - [x] Card Print Lock (3-layer lock, Realtime, barcode, S/N, archive)
  - [x] Cross-use auto-fill (lock → receipt form)
  - [x] 3C. Batch Print UX (เลือกที่ยังไม่พิมพ์ + Ctrl+P)
  - [x] 4A. Journey Tracking (milestones + classify)
  - [x] 2B. Fuzzy Search (pg_trgm + RPC + fallback)
  - [ ] 1. Quick Print Mode (`?mode=quick-print`) — อยู่ระหว่างทำ
  - [ ] ทดสอบทุก feature บน SIT
  - [ ] Deploy to production
- [ ] Phase 2: WAC-0503 hardware signature pad (รอ SDK จาก WAC)
- [ ] Admin Analytics Dashboard (ใช้ข้อมูลจาก ux_analytics)
- [ ] CDN Subresource Integrity (SRI hash)
- [ ] Multi-device real-time sync
- [ ] Mobile responsive improvements
- [ ] QR Code verification integration
