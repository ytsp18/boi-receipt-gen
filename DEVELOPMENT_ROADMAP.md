# แผนพัฒนา — BOI Work Permit Receipt System

> อัพเดต: 10 กุมภาพันธ์ 2569
> Current: v6.2.0 (deployed) → v6.3.0 (on branch v6.3-dev, testing)

---

## สถานะปัจจุบัน

| Version | วันที่ | สถานะ | หมายเหตุ |
|---------|--------|--------|----------|
| v6.0.2 | 9 ก.พ. 69 | ✅ Deployed | Security hardening |
| v6.1.0 | 9 ก.พ. 69 | ✅ Deployed | Print category A-Z + color bands |
| v6.2.0 | 10 ก.พ. 69 | ✅ Deployed | Image compression, date filter, search |
| v6.3.0 | 10 ก.พ. 69 | ⏳ Testing | Pagination, Barcode, UX Analytics |

---

## v6.3.0 — สิ่งที่ทำแล้ว (รอ test + merge)

| ฟีเจอร์ | สถานะ | ไฟล์ที่แก้ |
|---------|--------|-----------|
| Pagination 50/หน้า (Registry + Activity Log) | ✅ Done | app-supabase.js, index.html, style.css |
| Barcode Code 128 (Print + Scan detection) | ✅ Done | app-supabase.js, index.html, style.css |
| UX Analytics (batched, fire-and-forget) | ✅ Done | app-supabase.js, supabase-adapter.js |
| Fix S1: Search query injection | ✅ Fixed | supabase-adapter.js |
| Fix F1: Batch print selection loss | ✅ Fixed | app-supabase.js |
| Fix P1: Analytics batching (30s/50 events) | ✅ Fixed | app-supabase.js |
| SQL: v6.2 indexes | ✅ Run | Supabase SQL Editor |
| SQL: v6.3 analytics table | ✅ Run | Supabase SQL Editor |
| Version bump ?v=6.3 + badge v6.3.0 | ✅ Done | index.html, app-supabase.js |

### Git Strategy
- **Tag `v6.2.0`** — rollback point (pushed to remote)
- **Branch `v6.3-dev`** — ยังไม่ merge เข้า main
- **Rollback**: `git checkout main` (main ยังเป็น v6.2.0)

---

## Remaining Issues — แก้ใน v6.3.1 หรือ v6.4

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
| P2 | Medium | getFilteredData() ถูกเรียกซ้ำ 2 ครั้งต่อ render | Cache ผลลัพธ์ใน state |
| P4 | Medium | Batch print mark ทีละตัว (N requests + N re-renders) | ใช้ Promise.all() + defer re-render |
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

| # | ไฟล์ | สถานะ | เมื่อไหร่ |
|---|------|--------|----------|
| 1 | `supabase-update-v6.0-api-integration.sql` | ❌ รอ | เมื่อเปิด VP API |
| 2 | `supabase-update-v6.0.2-security.sql` | ❌ รอ | ทันทีหลังสร้าง pending_receipts table |

---

## งานค้าง (Operational)

| # | งาน | สถานะ | หมายเหตุ |
|---|-----|--------|----------|
| 1 | กู้คืน 38 records ที่ถูกลบ | ⏳ รอ Excel | Staff ต้องกรอก SN/Request No./Appointment No. |
| 2 | Re-upload รูปสำหรับ 38 records | ❌ Blocked | ต้องทำหลัง INSERT recovery records |

---

## แผนพัฒนาในอนาคต (v6.4+)

### ลำดับความสำคัญสูง
1. **VP API Integration** — เชื่อมต่อระบบ VP API เพื่อดึงข้อมูลอัตโนมัติ
   - Blocked: รอ production credentials จากทีม SWD/VP
   - ต้อง run 2 SQL migrations ตามลำดับ
   - Deploy Edge Functions + set Secrets

2. **Admin Analytics Dashboard** — หน้า dashboard สำหรับดู UX data
   - ใช้ข้อมูลจาก `ux_analytics` table ที่สร้างแล้ว
   - แสดง: timing, popular features, error rates, user journey

3. **Batch Print Optimization** — ปรับปรุง performance
   - ใช้ `Promise.all()` แทน sequential await
   - Defer re-render จนกว่าทุกตัวจะเสร็จ

### ลำดับความสำคัญปานกลาง
4. **CDN Subresource Integrity** — เพิ่ม SRI hash ทุก CDN script
5. **Monthly Report Fix** — สร้าง server query สำหรับข้อมูลรายเดือน
6. **afterprint Event** — ใช้แทน setTimeout สำหรับ print confirmation
7. **pg_trgm Search** — เปิด extension สำหรับ fuzzy name search

### ลำดับความสำคัญต่ำ
8. **Password Complexity** — enforce ความยาว + ตัวอักษรพิเศษ
9. **Rate Limiting** — จำกัด login attempts + API calls
10. **Mobile Responsive** — ปรับ UI สำหรับมือถือ
11. **Multi-device Real-time Sync** — Supabase Realtime
12. **QR Code Verification** — ยืนยันเอกสารด้วย QR

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
