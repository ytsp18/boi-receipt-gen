# แผนพัฒนา — BOI Work Permit Receipt System

> อัพเดต: 12 กุมภาพันธ์ 2569 (rev.6)
> Current Production: **v8.6.2** (deployed on main → GitHub Pages)
> SIT Testing: **v9.0.0** Multi-Branch (deployed on sit → Cloudflare Pages)
> Pending: v7.0 E-Sign (รอ hardware testing)
> 🔜 Next: v9.0 SIT Testing → Production Deploy (หลัง Supabase Migration Free → Pro)

---

## สถานะปัจจุบัน

| Version | วันที่ | สถานะ | หมายเหตุ |
|---------|--------|--------|----------|
| v6.0.2 | 9 ก.พ. 69 | ✅ Deployed | Security hardening |
| v6.1.0 | 9 ก.พ. 69 | ✅ Deployed | Print category A-Z + color bands |
| v6.2.0 | 10 ก.พ. 69 | ✅ Deployed | Image compression, date filter, search |
| v6.3.0 | 10 ก.พ. 69 | ✅ Deployed | Pagination, Barcode, UX Analytics, Print layout fix |
| **v8.0.0** | **10 ก.พ. 69** | **✅ Deployed** | **Card Print Lock + UX Optimization** |
| **v8.1.0** | **10 ก.พ. 69** | **✅ Deployed** | **Fuzzy Search + Quick Print Mode + Header UX** |
| v8.2.0 | 11 ก.พ. 69 | ✅ Deployed | Quick Wins: Login branding, ล็อก→จอง, Session Timeout, pg_cron |
| v8.3.0 | 11 ก.พ. 69 | ✅ Deployed | Pre-Migration Hardening: SRI Hash, Password Complexity |
| **v8.4.0** | **11 ก.พ. 69** | **✅ Deployed** | **แนบรูปบัตร + สร้างใบรับจากหน้าจอง** |
| **v8.5.0** | **11 ก.พ. 69** | **✅ Deployed** | **ผู้พิมพ์บัตรในใบรับ + ฟอร์มจองแค่เลขนัด + inline edit** |
| v8.5.1 | 11 ก.พ. 69 | ✅ Deployed | Monthly report fix — query ทั้งเดือน + cache 5 นาที |
| v8.5.2 | 11 ก.พ. 69 | ✅ Deployed | Card printer name input + fix ux_analytics user_id |
| **v8.6.0** | **12 ก.พ. 69** | **✅ Deployed** | **UX Improvements จาก Analytics (P1–P3: parallel ops, export dropdowns, summary colors)** |
| v8.6.1 | 12 ก.พ. 69 | ✅ Deployed | Fix admin แก้ไขรายการจองของเจ้าหน้าที่คนอื่นไม่ได้ |
| **v8.6.2** | **12 ก.พ. 69** | **✅ Deployed** | **Fix table overflow ซ่อนปุ่ม + S/N และ ลบ** |
| **v9.0.0** | **12 ก.พ. 69** | **🧪 SIT Testing** | **Multi-Branch & User Management — Cloudflare Pages SIT** |
| v7.0.0-dev | 10 ก.พ. 69 | ⏸️ On Hold | E-Sign Workflow (ซ่อน UI, รอ hardware testing) |

---

## v7.0.0-dev — E-Sign Workflow (SIT Testing)

> **ยังไม่ deploy production** — ทดสอบบน SIT environment เท่านั้น
> Local: `http://localhost:8080/index.html?env=sit`
> Production ที่ `receipt.fts-internal.com` ปัจจุบัน v8.6.2

### ฟีเจอร์ที่พัฒนาแล้ว

| ฟีเจอร์ | สถานะ | ไฟล์ที่แก้ |
|---------|--------|-----------|
| Webcam photo capture (RAPOO C280) | ✅ Coded | app-supabase.js, index.html |
| Recipient signature pad (Phase 1: canvas) | ✅ Coded | app-supabase.js, index.html |
| Officer signature (profile settings) | ✅ Coded + SIT Tested | app-supabase.js, supabase-adapter.js |
| E-sign workflow (form → photo → sign → save) | ✅ Coded + SIT Tested | app-supabase.js |
| SIT environment switching | ✅ Coded + SIT Tested | supabase-config.js, login.html, auth.js |
| SIT Supabase full schema | ✅ Run on SIT | supabase-sit-full-setup.sql |
| v7.0 migration SQL | ✅ Run on SIT | supabase-update-v7.0-photo-signature.sql |
| `is_admin()` RLS fix | ✅ Run on SIT | SQL (ยังไม่ run บน Production) |
| Status filter (Created/Signed/Received) | ✅ Coded | app-supabase.js |
| Receipt preview with photo + signatures | ✅ Coded | app-supabase.js |

### Bugs พบและแก้ไขแล้ว (SIT Testing)

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| login.html hardcoded Production | ไม่มี env switching | เพิ่ม environment config |
| Redirect สูญเสีย `?env=sit` | auth.js ไม่ส่ง param | เพิ่ม `getEnvParam()` |
| Profiles RLS infinite recursion | Admin policy query ตัวเอง | สร้าง `is_admin()` SECURITY DEFINER |
| `session.id` undefined | ต้องใช้ `session.userId` | แก้ 2 จุด |
| ไม่ await getSession() | เรียก async ไม่ await | เพิ่ม `await` 2 จุด |

### สิ่งที่ต้องทดสอบต่อ

| # | รายการทดสอบ | สถานะ | หมายเหตุ |
|---|-----------|--------|----------|
| 1 | Webcam capture (RAPOO C280 hardware จริง) | ❌ รอ | ต้องเสียบกล้อง USB |
| 2 | Recipient signature บน canvas | ⏳ รอทดสอบ | เซ็นด้วย mouse / touch |
| 3 | Mark Received flow | ❌ รอ | กด Mark Received → status เปลี่ยน |
| 4 | Status filters (Created/Signed/Received) | ❌ รอ | กรองข้อมูลตาม status |
| 5 | Print with photo + signatures | ❌ รอ | ปริ้นใบรับพร้อมรูป+ลายเซ็น |
| 6 | รูปถ่ายแสดงในข้อมูลที่บันทึก + เอกสารพิมพ์ | ❌ รอ | **พบปัญหา: รูปไม่แสดงในเอกสาร** |
| 7 | Edge cases: กล้องไม่เจอ, permission denied | ❌ รอ | ทดสอบ fallback |
| 8 | Multi-user: 2+ เครื่องพร้อมกัน | ❌ รอ | race condition test |
| 9 | Security testing (ดู SECURITY_TEST_PLAN_v7.0.md) | ❌ รอ | ทดสอบความปลอดภัย |

### แผน Deploy to Production

> **ห้าม deploy จนกว่าจะทำครบทุกข้อ**

1. [ ] ทดสอบ hardware จริง (RAPOO C280 webcam + signature via mouse)
2. [ ] ทดสอบ full flow ครบ: กรอก → ถ่ายรูป → เซ็น → save → mark received → print
3. [ ] แก้ปัญหารูปไม่แสดงในเอกสารที่พิมพ์/ข้อมูลที่บันทึก
4. [ ] ผ่าน security testing ตาม SECURITY_TEST_PLAN_v7.0.md
5. [ ] Run `supabase-update-v7.0-photo-signature.sql` บน Production
6. [ ] Run `is_admin()` function บน Production Supabase
7. [ ] ตรวจสอบ Storage policies สำหรับ folder photos/ signatures/ officer-signatures/
8. [ ] Version bump + cache bust
9. [ ] สร้าง git tag v7.0.0 + push
10. [ ] Deploy ไฟล์ที่แก้ไขทั้งหมดไป production (GitHub Pages)
11. [ ] Smoke test บน production

---

## v8.0-8.1 — UX Optimization + Card Print Lock + Fuzzy Search (✅ Deployed)

> **✅ Production — deployed 10 ก.พ. 69**
> **✅ SQL v8.0 + v8.1 — run บน Production Supabase สำเร็จ 11 ก.พ. 69**
> ที่มา: วิเคราะห์จาก UX Analytics data จริง (1,485 events, 9-10 ก.พ.)

### ฟีเจอร์ที่พัฒนาแล้ว

| # | ฟีเจอร์ | สถานะ | ไฟล์ที่แก้ |
|---|---------|--------|-----------|
| 3A | Batch markAsPrinted (1 call แทน N) | ✅ Coded | supabase-adapter.js, app-supabase.js |
| 3B | Cache getFilteredData() | ✅ Coded | app-supabase.js |
| 2A | Recent Receipts (localStorage) | ✅ Coded | app-supabase.js, index.html |
| 2C | Search Query Hash (SHA-256 privacy) | ✅ Coded | app-supabase.js |
| 8.0 | **Card Print Lock (แทน Google Sheet)** | ✅ Coded | card-print.html, card-print-app.js, supabase-config.js |
| 8.0 | Cross-use auto-fill (lock → receipt) | ✅ Coded | app-supabase.js |
| 3C | เลือกที่ยังไม่พิมพ์ + Ctrl+P | ✅ Coded | index.html, app-supabase.js |
| 4A | Journey Tracking (milestones) | ✅ Coded | app-supabase.js |
| 2B | Fuzzy Search (pg_trgm + RPC) | ✅ Coded | supabase-adapter.js, SQL v8.1 |
| 1 | Quick Print Mode (`?mode=quick-print`) | ✅ Coded | app-supabase.js, index.html |

### Card Print Lock — สรุปสั้นๆ

**ปัญหาเดิม:** 5 เจ้าหน้าที่ใช้ Google Sheet "บันทึกรายการห้ามซ้ำ V3" → sync delay, ต้องเลือกชื่อจาก dropdown

**แนวทาง:** ย้ายมาเป็น web page แยก `card-print.html` เชื่อม Supabase Realtime

**Lock mechanism 3 ชั้น:**
1. Layer 1: Optimistic UI check (local state)
2. Layer 2: DB UNIQUE constraint (error 23505)
3. Layer 3: Supabase Realtime subscription (live update ข้าม browser)

**Cross-use:** ข้อมูลจากล็อก (appointment, passport, name) ดึงไป auto-fill ฟอร์มใบรับบัตรได้

### SQL Migrations

| ไฟล์ | สถานะ SIT | สถานะ Prod | หมายเหตุ |
|------|-----------|------------|----------|
| `supabase-update-v8.0-card-print-lock.sql` | ✅ Done | ✅ Done (11 ก.พ.) | Table + archive + trigger + RLS + Realtime |
| `supabase-update-v8.1-fuzzy-search.sql` | ✅ Done | ✅ Done (11 ก.พ.) | pg_trgm + GIN indexes + search function |
| `supabase-update-v8.4-card-image.sql` | ✅ Done (11 ก.พ.) | ❌ รอ | ADD card_image_url + DROP/CREATE archive functions |

### สิ่งที่ต้องทดสอบ (SIT)

| # | รายการทดสอบ | สถานะ |
|---|-----------|--------|
| 1 | Card Print Lock: lock, duplicate (23505), Realtime, S/N | ✅ ผ่าน (lock, dup blocked, S/N saved, admin delete) |
| 2 | Batch markAsPrinted: 1 call แทน N | ⏳ ยังไม่ได้ทดสอบเฉพาะ |
| 3 | Fuzzy search: "jhon" → "John" | ✅ ผ่าน ("TETS USER" → "TEST USER SIT") |
| 4 | Recent Receipts dropdown | ⏳ ยังไม่ได้ทดสอบเฉพาะ |
| 5 | Journey tracking milestones | ⏳ ยังไม่ได้ทดสอบเฉพาะ |
| 6 | Quick Print Mode UI | ✅ ผ่าน (URL param detect + initQuickPrintMode) |
| 7 | Cross-use: lock → receipt auto-fill | ✅ ผ่าน (appointment blur → name + requestNo auto-fill) |
| 8 | เลือกที่ยังไม่พิมพ์ + Ctrl+P | ✅ ผ่าน (เลือก 4 ใบ unprinted) |
| 9 | Regression: login, search, print, batch | ✅ ผ่าน (no errors, functions exist, SIT connected) |

### v8.0-8.1 Deploy to Production Checklist ✅ COMPLETED

1. [x] รัน SQL v8.0 (card-print-lock) บน SIT — 2026-02-10
2. [x] รัน SQL v8.1 (fuzzy-search) บน SIT — 2026-02-10
3. [x] ทดสอบ Card Print Lock ครบ (lock, duplicate, S/N, admin delete)
4. [x] ทดสอบ fuzzy search + fallback — "TETS USER" → "TEST USER SIT" ✅
5. [x] ทดสอบ batch optimization + UX improvements
6. [x] ทดสอบ cross-use auto-fill — appointment blur → auto-fill name + requestNo ✅
7. [x] Regression test: login, search, print, batch ทำงานปกติ
8. [x] Quick Print Mode สมบูรณ์
9. [x] รัน SQL v8.0 + v8.1 บน Production Supabase — 2026-02-11 ✅
   - Verified: 2 tables, 3 functions, 11 indexes, 1 extension — ครบ 15 objects
10. [x] Version bump ?v=8.1 + badge v8.1.0
11. [x] Deploy ไป production (GitHub Pages) — commit e4100e5
12. [x] ซ่อน v7.0 E-Sign (display:none + JS guard)
13. [x] Header UX high contrast

---

## v6.3.0 — Deployed ✅

| ฟีเจอร์ | สถานะ | ไฟล์ที่แก้ |
|---------|--------|-----------|
| Pagination 50/หน้า (Registry + Activity Log) | ✅ Deployed | app-supabase.js, index.html, style.css |
| Barcode Code 128 (Print + Scan detection) | ✅ Deployed | app-supabase.js, index.html, style.css |
| UX Analytics (batched, fire-and-forget) | ✅ Deployed | app-supabase.js, supabase-adapter.js |
| Fix S1: Search query injection | ✅ Fixed | supabase-adapter.js |
| Fix F1: Batch print selection loss | ✅ Fixed | app-supabase.js |
| Fix P1: Analytics batching (30s/50 events) | ✅ Fixed | app-supabase.js |
| Fix: Print layout overflow 2 หน้า | ✅ Fixed | app-supabase.js, style.css |
| Fix: ตัวอักษรหมวดหมู่ไม่อยู่กลาง header | ✅ Fixed | app-supabase.js |
| SQL: v6.2 indexes | ✅ Run | Supabase SQL Editor |
| SQL: v6.3 analytics table | ✅ Run | Supabase SQL Editor |
| Version bump ?v=6.3 + badge v6.3.0 | ✅ Done | index.html, app-supabase.js |

### Git History
- **Tag `v6.2.0`** — rollback point (pushed to remote)
- **Branch `v6.3-dev`** — merged to main ✅
- **Print layout fixes** — 4 commits หลัง merge (on main)

---

## Remaining Issues — แก้ใน v6.3.1 หรือ v7.0

### Security (ยังไม่แก้)

| ID | Severity | ปัญหา | แนวทางแก้ |
|----|----------|-------|-----------|
| S2 | Medium | Supabase anon key ใน HTML | ปกติสำหรับ anon key — RLS เป็น security boundary |
| S3 | Medium | Analytics INSERT policy กว้างเกินไป | เพิ่ม check profiles.is_approved + rate limit trigger |
| S5 | Medium | Barcode fallback outerHTML | Mitigated โดย receipt_no format validation (YYYYMMDD-NNN) |
| ~~S6~~ | ~~Medium~~ | ~~viewImage() ไม่มี size limit~~ | ✅ **แก้แล้ว v8.3 — URL length > 10MB check** |
| S7 | Low | user_id = null ใน analytics | เพิ่ม user_id จาก auth.uid() ถ้าต้องการ tracing |
| ~~C1~~ | ~~Medium~~ | ~~JsBarcode CDN ไม่มี SRI hash~~ | ✅ **แก้แล้ว v8.3 — SRI hash + pin version** |
| ~~C2~~ | ~~Medium~~ | ~~Supabase CDN ไม่มี SRI hash~~ | ✅ **แก้แล้ว v8.3 — SRI hash + pin @2.95.3** |

### Performance (ยังไม่แก้)

| ID | Severity | ปัญหา | แนวทางแก้ |
|----|----------|-------|-----------|
| ~~P2~~ | ~~Medium~~ | ~~getFilteredData() ถูกเรียกซ้ำ~~ | ✅ **แก้แล้ว v8.0 — 3B. Cache** |
| ~~P4~~ | ~~Medium~~ | ~~Batch print mark ทีละตัว~~ | ✅ **แก้แล้ว v8.0 — 3A. Batch markPrintedBatch()** |
| P5 | Low | loadAnalyticsSummary ไม่มี pagination | เพิ่ม offset/limit สำหรับ admin dashboard |

### Functional (ยังไม่แก้)

| ID | Severity | ปัญหา | แนวทางแก้ |
|----|----------|-------|-----------|
| F2 | Medium | Barcode scan false positive (100ms threshold) | ลด threshold เป็น 50ms หรือเพิ่ม length check |
| ~~F3~~ | ~~Low~~ | ~~goToPage() ไม่มี upper bound check~~ | ✅ **แก้แล้ว v8.3 — page <= totalPages** |
| F4 | Medium | Monthly report ใช้ client-side data วันเดียว (bug เดิม) | สร้าง server query สำหรับ monthly data |
| F5 | Low | Multiple print functions share printTemplate | เพิ่ม lock/queue สำหรับ print |
| ~~F6~~ | ~~Medium~~ | ~~setTimeout print confirmation timing~~ | ✅ **แก้แล้ว v8.3 — afterprint event ×3 จุด** |

---

## SQL Migrations รอ Run

| # | ไฟล์ | สถานะ SIT | สถานะ Prod | เมื่อไหร่ |
|---|------|-----------|------------|----------|
| 1 | `supabase-update-v6.0-api-integration.sql` | ❌ รอ | ❌ รอ | เมื่อเปิด VP API |
| 2 | `supabase-update-v6.0.2-security.sql` | ❌ รอ | ❌ รอ | ทันทีหลังสร้าง pending_receipts |
| 3 | `supabase-update-v7.0-photo-signature.sql` | ✅ Run | ❌ รอ | ก่อน deploy v7.0 |
| 4 | `is_admin()` function | ✅ Run | ❌ รอ | ก่อน deploy v7.0 |
| 5 | `supabase-update-v8.0-card-print-lock.sql` | ✅ Done | ✅ Done (11 ก.พ.) | Card Print Lock — table + archive + RLS + Realtime |
| 6 | `supabase-update-v8.1-fuzzy-search.sql` | ✅ Done | ✅ Done (11 ก.พ.) | pg_trgm + GIN indexes + fuzzy search function |
| 7 | pg_cron extension + cleanup schedule | ✅ Done (11 ก.พ.) | ✅ Done (11 ก.พ.) | `cleanup-card-locks` daily midnight |
| 8 | `supabase-update-v9.0-multi-branch.sql` | ✅ Done (12 ก.พ.) | ❌ รอ (หลัง Supabase Migration) | branches + branch_id + RLS + helper functions |

---

## งานค้าง (Operational)

| # | งาน | สถานะ | หมายเหตุ |
|---|-----|--------|----------|
| 1 | กู้คืน 38 records ที่ถูกลบ | ⏳ รอ Excel | Staff ต้องกรอก SN/Request No./Appointment No. |
| 2 | Re-upload รูปสำหรับ 38 records | ❌ Blocked | ต้องทำหลัง INSERT recovery records |

---

## แผนพัฒนาในอนาคต

### ~~v8.0-8.1~~ ✅ DEPLOYED (11 ก.พ. 69)
- ~~Card Print Lock + UX Optimization + Fuzzy Search~~ — SQL run สำเร็จ, ทุก feature พร้อมใช้งาน

---

### ~~🔴 Quick Wins~~ ✅ v8.2.0 DEPLOYED (11 ก.พ. 69)

| # | รายการ | ไฟล์ที่แก้ | สถานะ |
|---|--------|-----------|--------|
| Q1 | แก้ชื่อระบบ login → "ระบบสร้างแบบฟอร์มการรับบัตร BOI" | `login.html` | ✅ Done |
| Q2 | แก้ footer + subtitle login | `login.html` | ✅ Done |
| Q3 | เปลี่ยน "ล็อก" → "จอง" ทั้งระบบ | `index.html`, `card-print.html`, `card-print-app.js` | ✅ Done |
| Q4 | Session timeout 15 นาที | `js/auth.js` | ✅ Done |
| Q5 | Realtime Typing Indicator (Supabase Broadcast) | `card-print.html`, `js/card-print-app.js` | ✅ Done |
| Q6 | pg_cron cleanup job | SIT Supabase SQL | ✅ SIT Done |

---

### 🔴 Supabase Migration: Free → Pro (Cross-Org) — ลำดับสูงสุด

> **เป้าหมาย:** ย้าย Supabase จาก Free plan (org เดิม) ไป Pro plan (org ใหม่)
> **Downtime ประมาณ:** 2-3 ชั่วโมง
> **แผนละเอียด:** ดู `MIGRATION-PLAN.md`

| # | Step | ใครทำ | สถานะ | หมายเหตุ |
|---|------|-------|--------|----------|
| **Phase 0 — เตรียมตัว** | | | | |
| 0.1 | สร้าง Pro project ใน org ใหม่ | 👤 คุณ | [ ] รอ | เลือก region Southeast Asia |
| 0.2 | จด URL + Anon Key + Service Role Key + DB Password | 👤 คุณ | [ ] รอ | จาก Dashboard project ใหม่ |
| 0.3 | แจ้ง users เรื่อง downtime | 👤 คุณ | [ ] รอ | กำหนดช่วงใช้งานน้อยสุด |
| 0.4 | เช็ค tools (psql, pg_dump) | 🤖 Claude | [ ] รอ | |
| **Phase 1 — Backup** | | | | |
| 1.1 | ให้ DB connection string project เดิม | 👤 คุณ | [ ] รอ | มี password |
| 1.2 | pg_dump schema + data + auth users | 🤖 Claude | [ ] รอ | 3 ไฟล์ backup |
| 1.3 | ตรวจสอบ backup + จด record count | 🤖 Claude | [ ] รอ | baseline ทุก table |
| 1.4 | Download storage files (card-images) | 🤖 Claude | [ ] รอ | เขียน script + รัน |
| **Phase 2 — Setup Schema** | | | | |
| 2.1 | ให้ DB connection string project ใหม่ | 👤 คุณ | [ ] รอ | มี password |
| 2.2 | Enable pg_trgm + Run migrations v5.1→v8.1 | 🤖 Claude | [ ] รอ | ตามลำดับ |
| 2.3 | Verify schema ครบ (tables, functions, triggers, indexes, RLS) | 🤖 Claude | [ ] รอ | |
| **Phase 3 — Restore Data** | | | | |
| 3.1 | Disable trigger → restore auth.users → enable trigger | 🤖 Claude | [ ] รอ | ป้องกัน profile ซ้ำ |
| 3.2 | Restore public data ทุก table | 🤖 Claude | [ ] รอ | |
| 3.3 | Verify record count + profiles-auth linkage | 🤖 Claude | [ ] รอ | เทียบกับ baseline |
| **Phase 4 — Storage** | | | | |
| 4.1 | สร้าง bucket `card-images` (public) | 👤 คุณ | [ ] รอ | ใน Dashboard project ใหม่ |
| 4.2 | Upload ทุกไฟล์เข้า bucket ใหม่ | 🤖 Claude | [ ] รอ | script |
| 4.3 | Verify file count + test public URL | 🤖 Claude | [ ] รอ | |
| **Phase 5-6 — Update URLs + Realtime** | | | | |
| 5.1 | UPDATE image URLs ใน DB (เปลี่ยน project ref) | 🤖 Claude | [ ] รอ | receipts + profiles |
| 5.2 | Verify ไม่เหลือ URL เดิม | 🤖 Claude | [ ] รอ | |
| 6.1 | Enable Realtime (pending_receipts, card_print_locks) | 🤖 Claude | [ ] รอ | |
| **Phase 7 — App Config + Deploy** | | | | |
| 7.1 | แก้ `supabase-config.js` (URL + Anon Key) | 🤖 Claude | [ ] รอ | |
| 7.2 | Git commit | 🤖 Claude | [ ] รอ | |
| 7.3 | อนุมัติ git push (deploy) | 👤 คุณ | [ ] รอ | ยืนยันก่อน push |
| **Phase 8 — Verification** | | | | |
| 8.1 | ทดสอบ Login + ทุกฟีเจอร์จริง (16 จุด) | 👤 คุณ | [ ] รอ | ต้อง browser จริง |
| 8.2 | ช่วยเช็ค DB side | 🤖 Claude | [ ] รอ | query verify |
| **Phase 9 — Cleanup** | | | | |
| 9.1 | อัพเดท MEMORY.md + docs | 🤖 Claude | [ ] รอ | |
| 9.2 | ตั้ง pg_cron cleanup | 🤖 Claude | [ ] รอ | |
| 9.3 | ตัดสินใจลบ project เดิม (แนะนำรอ 2 สัปดาห์) | 👤 คุณ | [ ] รอ | |

**Rollback:** เปลี่ยน config กลับ URL เดิม → project เดิมยังอยู่ → ข้อมูลไม่หาย

---

### 🟠 v9.0.0 Multi-Branch & User Management — 🧪 SIT Testing

> **เป้าหมาย:** รองรับหลายสาขา (55+ สาขาทั่วประเทศ) โดยข้อมูลแยกด้วย RLS
> **SIT URL:** `boi-receipt-gen-sit.pages.dev` (Cloudflare Pages, auto-deploy จาก `sit` branch)
> **SQL Migration:** ✅ Run on SIT (12 ก.พ. 69)
> **Super Admin:** `adminsit@boireciptgen.go.th`

| # | รายการ | รายละเอียด | สถานะ |
|---|--------|-----------|--------|
| B1 | **Branch partition (RLS per branch_id)** | `branches` table + `branch_id` FK ใน 6 tables + branch-scoped RLS policies | ✅ Coded + SIT Migrated |
| B2 | **โครงสร้าง roles ต่อสาขา** | head, deputy, officer, temp_officer, other — `branch_role` ใน profiles | ✅ Coded + SIT Migrated |
| B3 | **แสดงชื่อศูนย์ dynamic** | ดึงจาก `branches` table แทน hardcode → header, receipt, footer, monthly report | ✅ Coded |
| B4 | **Branch Management UI** | Super admin เพิ่ม/แก้/ปิดสาขา + branch selector ใน header | ✅ Coded |
| B5 | **User Management upgrade** | คอลัมน์สาขา+ตำแหน่ง, edit role, ย้ายสาขา, approve with branch | ✅ Coded |
| B6 | **Registration with branch** | Dropdown เลือกสาขาตอนสมัคร → branch_id set ตั้งแต่สร้าง profile | ✅ Coded |
| B7 | **Feature access control** | `branches.features` JSONB — เปิด receipt_module เฉพาะ 4 สาขา | ✅ Coded |
| B8 | **SIT Deployment (Cloudflare Pages)** | Hostname auto-detect → SIT Supabase, แยกจาก production | ✅ Deployed |
| B9 | **Dashboard กลาง** | Monitor แต่ละสาขา + ภาพรวม (จำนวนใบรับ, อัตราพิมพ์) | [ ] อนาคต |

**SQL Migration:**
| ไฟล์ | สถานะ SIT | สถานะ Prod | หมายเหตุ |
|------|-----------|------------|----------|
| `supabase-update-v9.0-multi-branch.sql` | ✅ Done (12 ก.พ.) | ❌ รอ (หลัง Supabase Migration) | branches + branch_id + RLS + helpers |

**SIT Testing Checklist (12 ก.พ. 69):**
| # | รายการทดสอบ | สถานะ | หมายเหตุ |
|---|-----------|--------|----------|
| 1 | SQL migration run สำเร็จ | ✅ ผ่าน | |
| 2 | Super admin set + login | ✅ ผ่าน | |
| 3 | Branch selector แสดง + เปลี่ยนสาขา | ✅ ผ่าน | UI ย้ายไป header-left |
| 4 | Dynamic center name ใน header | ✅ ผ่าน | TH+EN ถูกต้อง |
| 5 | Registration → เลือกสาขาจาก dropdown | ✅ ผ่าน | testcmi.sit@gmail.com → CMI |
| 6 | Approve → เห็นสาขาที่ user เลือก + กำหนด role | ✅ ผ่าน | Assign officer role |
| 7 | Data isolation: user สาขา A ไม่เห็นข้อมูลสาขา B | ✅ ผ่าน | CMI user เห็น 0 records ของ BKK |
| 8 | Feature access: สาขาไม่มี receipt_module → redirect landing | ✅ ผ่าน | Redirect ไป landing.html + แสดงชื่อสาขา |
| 9 | สร้าง receipt → branch_id ถูกต้อง | ✅ ผ่าน | branch_id = CMI ใน DB |
| 10 | Print receipt → ชื่อศูนย์ตรงกับสาขาของ receipt | ✅ ผ่าน | Preview ถูกต้อง (MEMORY.md test #6) |
| 11 | Card print lock Realtime → เฉพาะ branch | ✅ ผ่าน | CMI user sees only CMI locks (MEMORY.md test #7) |
| 12 | Monthly report → branch filter | ✅ ผ่าน | CMI=1, BKK=8 (MEMORY.md test #8) |
| 13 | SN duplicate check ข้ามสาขา | ✅ ผ่าน | RPC SECURITY DEFINER bypasses RLS (MEMORY.md test #9) |
| 14 | Branch Management UI (เพิ่ม/แก้/ปิดสาขา) | ✅ ผ่าน | List/Edit/Features toggle (MEMORY.md test #10) |
| 15 | ย้ายสาขา + เปลี่ยน role | ✅ ผ่าน | Role + branch transfer both work (MEMORY.md test #11) |

**Bugs Found During SIT Testing:**
| Bug | สถานะ | หมายเหตุ |
|-----|--------|----------|
| applyPermissions() selectors ไม่ตรง HTML | ✅ แก้แล้ว | เปลี่ยนเป็น redirect ไป landing.html แทน |
| landing.html ขาด Supabase CDN → redirect loop | ✅ แก้แล้ว | เพิ่ม CDN script tag (commit 4776a3c) |
| getUsers() JOIN branches error | ✅ แก้แล้ว | ใช้ LEFT JOIN แทน |
| Card Printer Name ไม่ save | ✅ แก้แล้ว | `if (receiptData.cardPrinterName)` blocks empty → `|| null` |
| Reset Password "requires an email" | ✅ แก้แล้ว | สร้าง RPC `get_user_email()` SECURITY DEFINER (commit `68dcc08`) |
| Role Tooltip ล้นกล่อง | ✅ แก้แล้ว | `max-width:250px` + `word-break` (commit `68dcc08`) |
| Browser autofill confusion | ✅ แก้แล้ว | เพิ่ม `autocomplete` attribute ทุก password field (commit `68dcc08`) |
| เพิ่มผู้ใช้ใหม่ alert "undefined" | ✅ แก้แล้ว | `addUser()` stub + ไม่มี await → เปลี่ยนเป็น registration guide (commit `59397aa`) |
| SQL migration is_admin params | ✅ แก้แล้ว | `is_admin(auth.uid())` → `is_admin()` no params (commit `59397aa`) |
| Edit User modal ล้นกล่อง | ✅ แก้แล้ว | CSS min-width:0 + label truncation + branch format (commit `edeb555`) |

**Deploy to Production Checklist:**
> **ห้าม deploy จนกว่าจะทำครบทุกข้อ** | แผนละเอียด: `.claude/plans/witty-wibbling-eclipse.md`

1. [x] ผ่าน SIT Testing ครบทุกข้อด้านบน (15/15 tests passed)
2. [x] Bug fixes ทั้งหมดแก้เสร็จ (10 bugs fixed)
3. [x] สร้าง Rollback Script (`rollback-v9.0-to-v8.6.2.sql`)
4. [ ] **P0:** Supabase Transfer Project — FTS org (Free) → ytsp18 org (Pro)
5. [ ] **P1:** ทดสอบ Rollback Script บน SIT (เสาร์เช้า)
6. [ ] **P2:** Backup Production DB + Run SQL migration
7. [ ] **P2:** Verify: branches table + branch_id ≠ NULL + BKK-SC-M-001 active
8. [ ] **P3:** Merge `sit` → `main` + Push → GitHub Pages auto-deploy
9. [ ] **P3:** Smoke test (login, receipt CRUD, print, export, user mgmt, card print lock)
10. [ ] **P4:** Set `admin@boireciptgen.go.th` เป็น super_admin
11. [ ] **P4:** Set branch_role = 'officer' ให้ user ทุกคน (admin แก้เป็น head ผ่าน UI)
12. [ ] **P6:** Monitor Day 1 (activity_logs + ux_analytics)

**Rollback Plan (3 ระดับ):**
- **ระดับ 1:** Code Rollback — `git revert HEAD` (~5 นาที)
- **ระดับ 2:** DB + Code — Run `rollback-v9.0-to-v8.6.2.sql` (~20-30 นาที)
- **ระดับ 3:** Full Restore from Backup (~30-60 นาที)

**Deployment Architecture:**
```
Production: main branch → GitHub Pages → receipt.fts-internal.com
            Supabase: pyyltrcqeyfhidpcdtvc → org ytsp18 (Pro) [pending transfer]

SIT:        sit branch → Cloudflare Pages → boi-receipt-gen-sit.pages.dev
            Supabase: cctzbereqvuaunweuqho → org FTS (Free) [stays here]
            Auto-detect: hostname contains "sit.pages.dev" → SIT env

Note: SIT อยู่คนละ org กับ Production ได้ — billing per-org
      URL/keys ไม่เปลี่ยนหลัง Transfer
```

**ฟีเจอร์เดิมที่ยังค้าง:**

| # | รายการ | สถานะ | หมายเหตุ |
|---|--------|--------|----------|
| B10 | v7.0 E-Sign Workflow | ⏸️ On Hold | รอ hardware testing (RAPOO C280) |
| B11 | WAC-0503 Hardware Signature Pad | ⏸️ On Hold | รอ SDK + license จาก WAC InfoTech |
| B12 | VP API Integration | ❌ Blocked | รอ production credentials จากทีม SWD/VP |

---

### 🟠 Card Issuance Work Dashboard — ลำดับสูง (Priority 2)

> **เป้าหมาย:** Dashboard แสดงสถิติการออกบัตรใบอนุญาตทำงาน + นำเข้าข้อมูลจาก Excel SW Report
> **ประมาณเวลา:** 1-2 วัน

**Database:**

| # | รายการ | สถานะ | หมายเหตุ |
|---|--------|--------|----------|
| D1 | สร้างตาราง `card_issuance` | [ ] รอ | UUID PK, branch_id FK, RLS branch-scoped |
| D2 | RLS policy `card_issuance_select` | [ ] รอ | `branch_id = get_user_branch_id()` OR `is_super_admin()` |
| D3 | Indexes: `(branch_id, issued_at)` + `(serial_number)` | [ ] รอ | |
| D4 | UNIQUE constraint: `(appointment_id, serial_number)` | [ ] รอ | สำหรับ dedup ตอน import |

**Data Import (CSV/Excel Upload):**

| # | รายการ | สถานะ | หมายเหตุ |
|---|--------|--------|----------|
| I1 | Tab "นำเข้าข้อมูล" ใน Dashboard | [ ] รอ | Upload Excel/CSV |
| I2 | Parse client-side ด้วย SheetJS | [ ] รอ | Map 11 columns จาก SW Report |
| I3 | Preview table ก่อน insert | [ ] รอ | แสดงข้อมูลที่ parse แล้ว |
| I4 | Auto-map `branch_code` → `branch_id` | [ ] รอ | Lookup จาก branches table |
| I5 | Insert to Supabase + skip duplicates | [ ] รอ | ON CONFLICT DO NOTHING |

**Dashboard UI (หน้า `dashboard.html`):**

| # | รายการ | สถานะ | หมายเหตุ |
|---|--------|--------|----------|
| U1 | KPI Cards (4 ใบ) | [ ] รอ | บัตรทั้งหมด / สำเร็จ(G) / เสีย(B) / %สำเร็จ |
| U2 | Chart: Daily Mixed (Stacked Bar + Line) | [ ] รอ | ECharts — REQUEST/RENEW_REQ/Bad + total line |
| U3 | Chart: Form Type Pie | [ ] รอ | REQUEST vs RENEW_REQ |
| U4 | Chart: Print Status Pie | [ ] รอ | Good vs Bad |
| U5 | Chart: Officer Performance Bar | [ ] รอ | Horizontal bar per officer |
| U6 | Filters: Date range + Branch + Quick buttons | [ ] รอ | วันนี้ / 7วัน / 30วัน / รีเซ็ต |
| U7 | Detail Table: sortable + searchable | [ ] รอ | |

**Files to Create/Modify:**

| ไฟล์ | Action | รายละเอียด |
|------|--------|-----------|
| `dashboard.html` | สร้างใหม่ | Dashboard page + ECharts CDN |
| `js/dashboard-app.js` | สร้างใหม่ | Dashboard logic, charts, filters, data import |
| `js/supabase-config.js` | แก้ไข | เพิ่ม `SupabaseCardIssuance` module |
| `js/supabase-adapter.js` | แก้ไข | เพิ่ม `loadCardIssuance`, `getCardIssuanceStats` |
| `index.html` | แก้ไข | เพิ่ม link ไป dashboard ใน nav |
| `landing.html` | แก้ไข | เพิ่ม link ไป dashboard |
| SQL migration | รันบน SIT | CREATE TABLE + RLS + indexes |

---

### 🟡 Platform & Architecture — ลำดับปานกลาง

> **เป้าหมาย:** รวมระบบภายในบริษัทไว้ภายใต้ `fts-internal.com`

| # | รายการ | รายละเอียด | สถานะ |
|---|--------|-----------|--------|
| P1 | **fts-internal.com Central Platform** | พัฒนา web app กลางเป็น backend จัดการเรื่องต่างๆ → domain `fts-internal.com` + sub-paths (`/receiptboi`, `/xxx`) | [ ] วางแผน |
| P2 | **ย้ายระบบ Receipt** | ย้ายจาก `receipt.fts-internal.com` ไปอยู่ภายใต้ sub-path หรือ subdomain ของ platform กลาง | [ ] วางแผน |
| P3 | **Microsoft AD/SSO Integration** | เชื่อมต่อ Microsoft Active Directory ของบริษัท สำหรับ authentication ในอนาคต | [ ] วางแผน |
| P4 | CDN Subresource Integrity | เพิ่ม SRI hash ทุก CDN script | ✅ v8.3.0 |
| P5 | Monthly Report Fix | สร้าง server query สำหรับข้อมูลรายเดือน | [ ] รอ |
| P6 | afterprint Event | ใช้แทน setTimeout สำหรับ print confirmation | ✅ v8.3.0 |
| P7 | Mobile Responsive | ปรับ UI สำหรับมือถือ | [ ] รอ |

---

### 🔵 Infrastructure & Scalability

> **เป้าหมาย:** รองรับการใช้งานปริมาณมาก จากหลาย user, หลายสาขา, login พร้อมกัน 200+ users

| # | รายการ | รายละเอียด | สถานะ |
|---|--------|-----------|--------|
| I1 | **Concurrent 200+ Users** | วางแผนรองรับ load จากหลายสาขาพร้อมกัน — Supabase connection pooling, edge caching | [ ] วางแผน |
| I2 | **Load Planning** | Stress test + capacity planning สำหรับ peak hours (เช้า 8-10, บ่าย 13-15) | [ ] วางแผน |
| I3 | **Query Optimization** | เพิ่ม indexes ที่จำเป็น, optimize RLS policies, ลด round-trips | [ ] วางแผน |
| I4 | **Slow Query Monitoring** | ตรวจจับ + alert เมื่อมี query ช้าเกิน threshold (pg_stat_statements) | [ ] วางแผน |
| I5 | **Performance Dashboard** | แสดง response time, query count, error rate, active connections | [ ] วางแผน |
| I6 | **Anomaly Detection** | ระบบติดตามความผิดปกติ — spike traffic, unusual patterns, error bursts | [ ] วางแผน |

---

### 🔒 Security Hardening

> **เป้าหมาย:** ตรวจสอบและป้องกันช่องโหว่ทั้งระบบ

| # | รายการ | รายละเอียด | สถานะ |
|---|--------|-----------|--------|
| S1 | **Vulnerability Scanning** | ตรวจสอบช่องโหว่ของระบบ (OWASP Top 10, dependency audit) | [ ] วางแผน |
| S2 | **Private Key Audit** | ตรวจสอบ private key ต่างๆ ว่าเก็บอย่างปลอดภัย ไม่ hardcode ใน source | [ ] วางแผน |
| S3 | **Credential Key Review** | ตรวจสอบ credential key ว่ามีหลุดหรือช่องโหว่ (git history, .env, config) | [ ] วางแผน |
| S4 | **Access Token Protection** | ป้องกัน token leak — secure storage, token rotation, expiry policy | [ ] วางแผน |
| S5 | **Password Complexity** | enforce ความยาว + ตัวอักษรพิเศษ | ✅ v8.3.0 (client-side) |
| S6 | **Rate Limiting** | จำกัด login attempts + API calls | [ ] รอ |

---

### แก้ไขแล้วใน v8.0 (ลบจาก remaining issues)
- ~~P2: getFilteredData() ซ้ำ 2 ครั้ง~~ → 3B. Cache getFilteredData()
- ~~P4: Batch print mark ทีละตัว~~ → 3A. Batch markAsPrinted()
- ~~pg_trgm Search~~ → 2B. Fuzzy Search (v8.1)

### แก้ไขแล้วใน v8.3.0 — Pre-Migration Hardening
- ~~C1+C2: CDN ไม่มี SRI hash~~ → SRI hash + pin version ทุก CDN script
- ~~F3: goToPage() ไม่มี upper bound~~ → เพิ่ม check page <= totalPages
- ~~S6: viewImage() ไม่มี size limit~~ → เพิ่ม URL length > 10MB check
- ~~F6+P6: setTimeout print confirmation~~ → afterprint event ×3 จุด
- ~~S5: Password Complexity~~ → client-side validation (≥8, A-Z, 0-9) + realtime indicator

---

## SIT Environment Details

| รายการ | ค่า |
|--------|-----|
| Supabase URL | `https://cctzbereqvuaunweuqho.supabase.co` |
| Project Ref | `cctzbereqvuaunweuqho` |
| Local Testing | `python3 -m http.server 8080` → `http://localhost:8080/index.html?env=sit` |
| URL Param | `?env=sit` สลับ environment |
| Test User | `adminsit@boireciptgen.go.th` |
| Schema SQL | `supabase-sit-full-setup.sql` |
| v7.0 Migration | `supabase-update-v7.0-photo-signature.sql` (run แล้วบน SIT) |

---

## VP API Integration Checklist (เมื่อพร้อม)

1. [ ] Run `supabase-update-v6.0-api-integration.sql`
2. [ ] **ทันที** run `supabase-update-v6.0.2-security.sql`
3. [ ] Deploy Edge Functions: `vpapi-webhook` + `vpapi-sync`
4. [ ] Set Secrets: `VPAPI_WEBHOOK_SECRET`, `VP_API_USERNAME`, `VP_API_PASSWORD`
5. [ ] ได้ production endpoint + API key จากทีม SWD/VP
6. [ ] index.html: ลบ `style="display: none;"` จากปุ่ม VP
7. [ ] app-supabase.js: uncomment `updatePendingBadge()` + `setupPendingRealtime()`
8. [ ] Test: webhook → pending list → select → auto-fill → save

---

## v7.0 Deploy to Production Checklist

> **ห้าม deploy จนกว่าจะทำครบทุกข้อ**

1. [ ] ทดสอบ hardware จริง: RAPOO C280 webcam
2. [ ] ทดสอบ full e-sign flow: กรอก → ถ่ายรูป → เซ็น → save → mark received
3. [ ] แก้ปัญหารูปไม่แสดงในเอกสาร/ข้อมูลที่บันทึก
4. [ ] ทดสอบ print with photo + signatures
5. [ ] ผ่าน security testing (SECURITY_TEST_PLAN_v7.0.md)
6. [ ] Run SQL บน Production:
   - `supabase-update-v7.0-photo-signature.sql`
   - `is_admin()` SECURITY DEFINER function
7. [ ] ตรวจสอบ Storage policies (photos/, signatures/, officer-signatures/)
8. [ ] Version bump ?v=7.0 + badge v7.0.0
9. [ ] สร้าง git tag v6.3.0 (rollback point) ก่อน deploy
10. [ ] Deploy ไปยัง production (GitHub Pages)
11. [ ] Smoke test บน `receipt.fts-internal.com`
12. [ ] แจ้งเจ้าหน้าที่เรื่อง workflow ใหม่ (e-sign แทนกระดาษ)
