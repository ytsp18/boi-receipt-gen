# แผนพัฒนา — BOI Work Permit Receipt System

> อัพเดต: 10 กุมภาพันธ์ 2569
> Current Production: v8.1.0 (deployed on main)
> Pending: v7.0 E-Sign (รอ hardware testing)

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
| v7.0.0-dev | 10 ก.พ. 69 | ⏸️ On Hold | E-Sign Workflow (ซ่อน UI, รอ hardware testing) |

---

## v7.0.0-dev — E-Sign Workflow (SIT Testing)

> **ยังไม่ deploy production** — ทดสอบบน SIT environment เท่านั้น
> Local: `http://localhost:8080/index.html?env=sit`
> Production ที่ `receipt.fts-internal.com` ยังเป็น v6.3.0

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

## v8.0-8.1 — UX Optimization + Card Print Lock + Fuzzy Search (Development)

> **ยังไม่ deploy production** — ต้องรัน SQL v8.0 + v8.1 บน SIT ก่อนทดสอบ
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
| 1 | Quick Print Mode (`?mode=quick-print`) | ⏳ อยู่ระหว่างทำ | app-supabase.js, index.html |

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
| `supabase-update-v8.0-card-print-lock.sql` | ✅ Done | ❌ รอ | Table + archive + trigger + RLS + Realtime |
| `supabase-update-v8.1-fuzzy-search.sql` | ✅ Done | ❌ รอ | pg_trgm + GIN indexes + search function |

### สิ่งที่ต้องทดสอบ (SIT)

| # | รายการทดสอบ | สถานะ |
|---|-----------|--------|
| 1 | Card Print Lock: lock, duplicate (23505), Realtime, S/N | ✅ ผ่าน (lock, dup blocked, S/N saved, admin delete) |
| 2 | Batch markAsPrinted: 1 call แทน N | ⏳ ยังไม่ได้ทดสอบเฉพาะ |
| 3 | Fuzzy search: "jhon" → "John" | ✅ ผ่าน ("TETS USER" → "TEST USER SIT") |
| 4 | Recent Receipts dropdown | ⏳ ยังไม่ได้ทดสอบเฉพาะ |
| 5 | Journey tracking milestones | ⏳ ยังไม่ได้ทดสอบเฉพาะ |
| 6 | Quick Print Mode UI | ❌ อยู่ระหว่างทำ |
| 7 | Cross-use: lock → receipt auto-fill | ✅ ผ่าน (appointment blur → name + requestNo auto-fill) |
| 8 | เลือกที่ยังไม่พิมพ์ + Ctrl+P | ✅ ผ่าน (เลือก 4 ใบ unprinted) |
| 9 | Regression: login, search, print, batch | ✅ ผ่าน (no errors, functions exist, SIT connected) |

### v8.0-8.1 Deploy to Production Checklist

1. [x] รัน SQL v8.0 (card-print-lock) บน SIT — 2026-02-10
2. [x] รัน SQL v8.1 (fuzzy-search) บน SIT — 2026-02-10
3. [x] ทดสอบ Card Print Lock ครบ (lock, duplicate, S/N, admin delete) — Realtime ข้ามเพราะต้อง 2 users
4. [x] ทดสอบ fuzzy search + fallback — "TETS USER" → "TEST USER SIT" ✅
5. [ ] ทดสอบ batch optimization + UX improvements — ยังไม่ได้ทดสอบเฉพาะ
6. [x] ทดสอบ cross-use auto-fill — appointment blur → auto-fill name + requestNo ✅
7. [x] Regression test: login, search, print, batch ทำงานปกติ (ข้าม e-sign เพราะยังพัฒนาไม่เสร็จ)
8. [ ] Quick Print Mode สมบูรณ์
9. [ ] รัน SQL v8.0 + v8.1 บน Production
10. [ ] Version bump + cache bust
11. [ ] Deploy ไป production (GitHub Pages)
12. [ ] Smoke test บน `receipt.fts-internal.com`

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
| S6 | Medium | viewImage() ไม่มี size limit | เพิ่ม check ขนาด URL ก่อน open |
| S7 | Low | user_id = null ใน analytics | เพิ่ม user_id จาก auth.uid() ถ้าต้องการ tracing |
| C1 | Medium | JsBarcode CDN ไม่มี SRI hash | เพิ่ม integrity + crossorigin attributes |
| C2 | Medium | Supabase CDN ไม่มี SRI hash | เพิ่ม integrity + crossorigin attributes |

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
| F3 | Low | goToPage() ไม่มี upper bound check | เพิ่ม check page <= totalPages |
| F4 | Medium | Monthly report ใช้ client-side data วันเดียว (bug เดิม) | สร้าง server query สำหรับ monthly data |
| F5 | Low | Multiple print functions share printTemplate | เพิ่ม lock/queue สำหรับ print |
| F6 | Medium | setTimeout print confirmation timing | ใช้ afterprint event แทน setTimeout |

---

## SQL Migrations รอ Run

| # | ไฟล์ | สถานะ SIT | สถานะ Prod | เมื่อไหร่ |
|---|------|-----------|------------|----------|
| 1 | `supabase-update-v6.0-api-integration.sql` | ❌ รอ | ❌ รอ | เมื่อเปิด VP API |
| 2 | `supabase-update-v6.0.2-security.sql` | ❌ รอ | ❌ รอ | ทันทีหลังสร้าง pending_receipts |
| 3 | `supabase-update-v7.0-photo-signature.sql` | ✅ Run | ❌ รอ | ก่อน deploy v7.0 |
| 4 | `is_admin()` function | ✅ Run | ❌ รอ | ก่อน deploy v7.0 |
| 5 | **`supabase-update-v8.0-card-print-lock.sql`** | **❌ รอ** | **❌ รอ** | **ก่อนทดสอบ Card Print Lock** |
| 6 | **`supabase-update-v8.1-fuzzy-search.sql`** | **❌ รอ** | **❌ รอ** | **ก่อนทดสอบ Fuzzy Search** |

---

## งานค้าง (Operational)

| # | งาน | สถานะ | หมายเหตุ |
|---|-----|--------|----------|
| 1 | กู้คืน 38 records ที่ถูกลบ | ⏳ รอ Excel | Staff ต้องกรอก SN/Request No./Appointment No. |
| 2 | Re-upload รูปสำหรับ 38 records | ❌ Blocked | ต้องทำหลัง INSERT recovery records |

---

## แผนพัฒนาในอนาคต

### ลำดับความสำคัญสูงสุด — v8.0-8.1 (กำลังทำ)
1. **Card Print Lock + UX Optimization** — ดูรายละเอียดด้านบน
   - Status: Development — รอรัน SQL บน SIT แล้วทดสอบ
   - Quick Print Mode อยู่ระหว่างทำ

### ลำดับความสำคัญสูง — v7.0 (SIT Testing)
2. **E-Sign Workflow** — ถ่ายรูป + ลายเซ็นดิจิทัล แทนกระดาษ
   - Status: SIT Testing
   - ต้องแก้ปัญหารูปไม่แสดง + ทดสอบ hardware + security test

3. **Phase 2: WAC-0503 Hardware Signature Pad**
   - ติดต่อ WAC InfoTech (sales@wacinfotech.com) เพื่อขอ SDK + license
   - ติดตั้ง WAC WebSocket Pro บนเครื่อง client
   - เปลี่ยน signature capture จาก canvas → WebSocket → WAC-0503 hardware
   - Keep canvas เป็น fallback

4. **VP API Integration** — เชื่อมต่อระบบ VP API เพื่อดึงข้อมูลอัตโนมัติ
   - Blocked: รอ production credentials จากทีม SWD/VP
   - ต้อง run 2 SQL migrations ตามลำดับ
   - Deploy Edge Functions + set Secrets

5. **Admin Analytics Dashboard** — หน้า dashboard สำหรับดู UX data
   - ใช้ข้อมูลจาก `ux_analytics` table ที่สร้างแล้ว
   - แสดง: timing, popular features, error rates, user journey

### ลำดับความสำคัญปานกลาง
6. **CDN Subresource Integrity** — เพิ่ม SRI hash ทุก CDN script (รวม signature_pad CDN ใหม่)
7. **Monthly Report Fix** — สร้าง server query สำหรับข้อมูลรายเดือน
8. **afterprint Event** — ใช้แทน setTimeout สำหรับ print confirmation

### ลำดับความสำคัญต่ำ
9. **Password Complexity** — enforce ความยาว + ตัวอักษรพิเศษ
10. **Rate Limiting** — จำกัด login attempts + API calls
11. **Mobile Responsive** — ปรับ UI สำหรับมือถือ
12. **Multi-device Real-time Sync** — Supabase Realtime
13. **QR Code Verification** — ยืนยันเอกสารด้วย QR

### แก้ไขแล้วใน v8.0 (ลบจาก remaining issues)
- ~~P2: getFilteredData() ซ้ำ 2 ครั้ง~~ → 3B. Cache getFilteredData()
- ~~P4: Batch print mark ทีละตัว~~ → 3A. Batch markAsPrinted()
- ~~pg_trgm Search~~ → 2B. Fuzzy Search (v8.1)

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
