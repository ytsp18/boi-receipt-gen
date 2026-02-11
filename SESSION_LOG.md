# Session Log - Work Permit Receipt System

## Session Date: 11 February 2026 (Late Night) — v8.5.1 Monthly Report Fix + Deploy

### สิ่งที่ทำ
1. **ตรวจพบ Bug** — รายงานรายเดือนแสดงข้อมูลแค่วันเดียว (root cause: `getMonthlyData()` filter จาก `state.registryData` ที่มีแค่ 1 วัน)
2. **ออกแบบ Solution** — Client-side aggregation + Optimized query (SELECT 8 columns) + 5-min cache (Plan Mode → approved)
3. **Implement** — แก้ 2 ไฟล์ (supabase-adapter.js + app-supabase.js)
   - เพิ่ม `loadMonthlyDataFromSupabase(month, year)` — query ทั้งเดือน
   - เพิ่ม monthly cache (`state.monthlyReportData`) — TTL 5 นาที
   - แก้ `generateMonthlyReport()`, `exportMonthlyPDF()`, `exportMonthlyCSV()` → async + cache
   - แก้ `generateDailyBreakdown()` → ใช้ `row.isPrinted`/`row.isReceived` ตรง
   - เพิ่ม `invalidateMonthlyCache()` — เรียกใน save/delete/print/receive (5 จุด)
4. **ทดสอบ SIT** — ผ่าน (daily breakdown แสดง 2 วัน, ตัวเลขถูกต้อง, ไม่มี console error)
5. **Deploy Production** — commit e3708f9 + push origin main

### SIT Test Results
| # | Test Case | ผลลัพธ์ |
|---|-----------|---------|
| 1 | สร้างรายงานเดือน ก.พ. 2569 | ✅ PASS — แสดง 8 records จาก 2 วัน (10/2 + 11/2) |
| 2 | Daily breakdown หลายวัน | ✅ PASS — 10/2: 4 records, 11/2: 4 records |
| 3 | ตัวเลขสรุปถูกต้อง | ✅ PASS — ผลิต: 8, พิมพ์: 5, รับ: 0, รอ: 8 |
| 4 | Console ไม่มี error | ✅ PASS |
| 5 | Query log ถูกต้อง | ✅ PASS — date range 2026-02-01 to 2026-02-28 |

### Performance
- Query: SELECT 8 columns (ไม่ดึง images/signatures) → payload ~30-50 KB/เดือน
- Cache: 5 นาที → กด "สร้างรายงาน" ซ้ำ = instant
- ไม่กระทบ daily operations (cache แยกจาก `state.registryData`)

---

## Session Date: 11 February 2026 (Night) — v8.5.0 SIT Testing

### สิ่งที่ทำ
1. **วางแผน v8.5** — ผู้พิมพ์บัตรในใบรับ + ฟอร์มจองแค่เลขนัด (Plan Mode → approved)
2. **Part A: ผู้พิมพ์บัตร** — เพิ่ม card_printer_name column + print output rows + auto-fill
3. **Part B: ฟอร์มจองลดเหลือ 1 ช่อง** — ลบ 3 input + inline edit ในตาราง
4. **SQL Migration** — run `supabase-update-v8.5-card-printer.sql` บน SIT สำเร็จ
5. **Bug Fix** — Escape ไม่ cancel inline edit → เพิ่ม `_inlineEditCancelled` flag
6. **ทดสอบ SIT** — ผ่านครบ 9 test cases
7. **อัพเดทเอกสาร** — CHANGELOG, MEMORY, SESSION_LOG
8. **Cache bust** — ?v=8.4→?v=8.5 ทั้ง card-print.html + index.html

### SIT Test Results
| # | Test Case | ผลลัพธ์ |
|---|-----------|---------|
| 1 | จองด้วยเลขนัดอย่างเดียว | ✅ PASS |
| 2 | Inline edit ชื่อ → Enter | ✅ PASS |
| 3 | Inline edit เลขคำขอ → blur | ✅ PASS |
| 4 | Escape ยกเลิก inline edit | ✅ PASS (หลัง fix) |
| 5 | สร้างใบรับ มี cardPrinterName | ✅ PASS (code verified) |
| 6 | Print output มีบรรทัดผู้พิมพ์บัตร | ✅ PASS (JS verified) |
| 7 | สร้างใบรับ ชื่อว่าง → แจ้งเตือน | ✅ PASS |
| 8 | ทาง B auto-fill + cardPrinterName | ✅ PASS |
| 9 | ใบรับเก่า ไม่มี cardPrinterName | ✅ PASS (แสดง "-") |

### Next Steps
- ⚠️ run SQL v8.4 + v8.5 บน Production Supabase ก่อน deploy
- git push origin main

---

## Session Date: 11 February 2026 (Evening) — v8.4.0 SIT Testing

### สิ่งที่ทำ
1. **วางแผน v8.4** — แนบรูปบัตร + สร้างใบรับจากหน้าจอง (Plan Mode → approved)
2. **SQL Migration** — สร้าง `supabase-update-v8.4-card-image.sql` + run บน SIT สำเร็จ
   - เพิ่ม `card_image_url TEXT NULL` ใน card_print_locks + archive
   - DROP + CREATE archive/cleanup functions (แก้ return type error)
3. **แนบรูปบัตร** — ปุ่ม 📷 + upload + compress + thumbnail + modal preview
4. **สร้างใบรับจากหน้าจอง** — ปุ่ม 📄 + auto-generate receipt_no + duplicate check
5. **Auto-fill ทาง B** — SN + รูปบัตร auto-fill เมื่อกรอกเลขนัดหมายในหน้าหลัก
6. **ทดสอบ SIT** — ผ่านครบ 8 test cases (จอง, แนบรูป, กรอก SN, สร้างใบรับ, ทาง B, duplicate)
7. **อัพเดทเอกสาร** — CHANGELOG, MEMORY, DEVELOPMENT_ROADMAP, SESSION_LOG
8. **Cache bust** — ?v=8.3→?v=8.4 ทั้ง card-print.html + index.html

### SIT Test Results
| # | Test Case | ผลลัพธ์ |
|---|-----------|---------|
| 1 | จอง (ไม่มีรูป ไม่มี SN) | ✅ ปกติ + คอลัมน์ใหม่แสดง |
| 2 | กด "แนบรูป" → upload | ✅ thumbnail แสดง + "รอ SN" |
| 3 | กรอก SN → บันทึก | ✅ ปุ่ม "สร้างใบรับ" ปรากฏ |
| 4 | กด "สร้างใบรับ" | ✅ receipt 20260211-001 สร้าง + toast + badge |
| 5 | ตรวจ receipt ในหน้าใบรับ | ✅ ข้อมูลครบทุกช่อง |
| 6 | กด "สร้างใบรับ" ซ้ำ | ✅ badge "สร้างแล้ว" ป้องกัน |
| 7 | ทาง B: auto-fill SN + รูป | ✅ ทำงานสมบูรณ์ |
| 8 | มีรูป ไม่มี SN | ✅ แสดง "รอ SN" |

### ⚠️ ก่อน Deploy Production
- [ ] Run `supabase-update-v8.4-card-image.sql` บน Production Supabase
- [ ] Verify column `card_image_url` ใน production
- [ ] `git push origin main` → GitHub Pages
- [ ] Smoke test บน production

---

## Session Date: 10 February 2026 (Evening) — v8.1.0 Production Deploy

### สิ่งที่ทำ
1. **ตรวจสอบ uncommitted work** จาก session ก่อน (~2,600 lines, v7.0-v8.1)
2. **ซ่อน v7.0 E-Sign** (webcam, signature pad, officer signature) ด้วย display:none + JS guard
   - รอ hardware testing (RAPOO C280) ก่อนเปิดใช้
3. **แก้ layout bug** — preview panel หลุดจาก grid เพราะ unclosed `<div>` ใน webcam section
4. **ปรับ header UX** — เปลี่ยนสี buttons ให้ตัดกับพื้นน้ำเงิน (high contrast white borders)
5. **ซ่อน v7.0 filter/summary** — ลบ "เซ็นชื่อแล้ว/ยังไม่เซ็นชื่อ" จาก filter + summary card
6. **Bump version** — v6.3.0 → v8.1.0, cache bust ?v=8.1 ทุกไฟล์
7. **อัปเดตเอกสาร** — CHANGELOG, DEVELOPMENT_ROADMAP, SESSION_LOG, MEMORY.md

### Production Deploy Checklist
- [x] v7.0 E-Sign hidden (form, filter, summary, JS init)
- [x] v8.0-8.1 features complete (batch optimization, cache, recent receipts, journey, quick print, card print link)
- [x] Header buttons high contrast
- [x] Layout verified (form + preview side-by-side)
- [x] No console errors
- [x] Version badge v8.1.0
- [x] Cache bust ?v=8.1

### ⚠️ SQL ที่ต้อง run บน Production Supabase (แยกจาก code deploy)
- `supabase-update-v8.0-card-print-lock.sql` — ตาราง card_print_locks + archive + cleanup
- `supabase-update-v8.1-fuzzy-search.sql` — pg_trgm extension + fuzzy search function

### งานคงค้าง
- v7.0 E-Sign: รอ hardware testing (RAPOE C280 webcam)
- Security test plan v7.0: 43/45 items ยังไม่ได้ทดสอบ
- Card Print Lock: ต้อง run SQL v8.0 + ทดสอบ cross-browser Realtime
- Fuzzy Search: ต้อง run SQL v8.1 บน Production
- 38 deleted records recovery (รอ staff Excel)

---

## Session Date: 4 February 2026

### Session Overview
พัฒนาระบบออกใบรับบัตร Work Permit สำหรับ BOI จาก concept เป็น Web App ที่ใช้งานได้จริง

---

## Timeline

### Phase 1: ทำความเข้าใจ Requirements
- ศึกษา Google Sheets "ฟอร์มรับบัตร BOI1.xlsx"
  - Sheet: คุมทะเบียน, ฟอร์มรับบัตร, Letter C2
- เข้าใจ Workflow:
  - Station 1: ผลิตบัตร → ส่งรูปผ่าน LINE → บันทึกใน "คุมทะเบียน"
  - Station 2: เปิด "คุมทะเบียน" → กรอก "ฟอร์มรับบัตร" → พิมพ์ใบรับ

### Phase 2: เลือก Platform
- ตัดสินใจใช้ **Web App** แทน Windows App
- เหตุผล: เชื่อม Google Sheets ได้ง่ายกว่า

### Phase 3: สร้าง Web App v1.0
**Files Created:**
- `index.html` - Main UI
- `css/style.css` - Styling
- `js/app.js` - JavaScript Logic

**Features v1.0:**
- ฟอร์มกรอกข้อมูล + อัพโหลดรูป
- Preview ใบรับ
- พิมพ์ใบรับ (PDF)
- ตารางแสดงข้อมูล (Mock Data)

### Phase 4: เพิ่ม Features ตามที่ขอ
1. **หมายเลข SN บัตร** - เพิ่ม column ใหม่
2. **ติ๊กสถานะรับบัตร** - Checkbox + บันทึกเวลา
3. **สรุปรายวัน** - Dashboard แสดงสถิติ
4. **ค้นหา & กรอง** - Search box + Filter dropdown
5. **Export CSV/PDF** - ส่งออกรายงาน

### Phase 5: Backup v1.0
- สร้าง backup ที่ `backups/v1.0-basic/`
- พร้อมสำหรับ rollback ถ้าต้องการ

### Phase 6: อัพเกรดเป็น v2.0
**ความต้องการ:** ทุกอย่างจบในหน้าเดียว

**Features v2.0:**
- ปุ่ม "➕ เพิ่มข้อมูลใหม่"
- ปุ่ม "✏️ แก้ไข" - โหลดข้อมูล + รูปมาฟอร์ม
- ปุ่ม "🗑️ ลบ" - ลบรายการ
- บันทึกรูปภาพกับรายการ
- Form Mode Badge (เพิ่มใหม่/แก้ไข)
- LocalStorage สำหรับข้อมูลหลัก

---

## Technical Decisions

### Data Storage
| Data | Storage | Reason |
|------|---------|--------|
| ข้อมูลหลัก (รายการ + รูป) | LocalStorage | ใช้งานได้ทันที, ไม่ต้อง setup server |
| สถานะพิมพ์ | LocalStorage | เก็บแยกเพื่อความยืดหยุ่น |
| สถานะรับบัตร | LocalStorage | เก็บแยกเพื่อความยืดหยุ่น |

### Image Handling
- รูปแปลงเป็น Base64 เก็บใน LocalStorage
- ข้อจำกัด: LocalStorage มีขนาดจำกัด (~5MB)
- อนาคต: เปลี่ยนไปใช้ Google Drive

### UI Framework
- ไม่ใช้ Framework (Vanilla JS)
- เหตุผล: Simple, Fast, No dependencies

---

## Files Structure (Final)

```
work-permit-web/
├── index.html
├── css/
│   └── style.css
├── js/
│   └── app.js
├── backups/
│   └── v1.0-basic/
│       ├── index.html
│       ├── style.css
│       ├── app.js
│       └── README.md
├── CHANGELOG.md
└── SESSION_LOG.md
```

---

## Issues & Solutions

### Issue 1: รูปใน Google Sheets ดึงไม่ได้
**Problem:** รูปที่ Insert > Image ใน Google Sheets ไม่สามารถดึงผ่าน API
**Solution:** ใช้ manual upload ใน Web App แทน + เก็บรูปกับข้อมูล

### Issue 2: Server ไม่ทำงาน
**Problem:** python3 http.server หยุดทำงาน
**Solution:** Restart server ด้วย `python3 -m http.server 8080`

---

## Next Steps (Recommended)

1. **เชื่อม Google Sheets API**
   - ดึงข้อมูลจาก Sheet "คุมทะเบียน"
   - บันทึกข้อมูลกลับไป Sheet

2. **เชื่อม Google Drive**
   - อัพโหลดรูปไป Drive
   - เก็บ Link กลับมาใน Sheet

3. **Deploy**
   - Deploy บน GitHub Pages หรือ Vercel
   - ใช้งานได้จากทุกที่

---

## Commands Used

```bash
# Start local server
cd "/Users/tanapongsophon/Desktop/Claude/Project BOI/work-permit-web"
python3 -m http.server 8080

# Create backup
mkdir -p backups/v1.0-basic
cp index.html css/style.css js/app.js backups/v1.0-basic/

# Check server status
lsof -i :8080
```

---

### Phase 7: เพิ่มปุ่มพิมพ์ในตาราง (v2.1)
**ความต้องการ:** พิมพ์ใบรับได้โดยตรงจากตาราง ไม่ต้องกดแก้ไขก่อน

**Changes:**
- เพิ่มปุ่ม 🖨️ (สีเขียว) ในคอลัมน์ "การดำเนินการ"
- สร้างฟังก์ชัน `printFromTable()` สำหรับพิมพ์จากตาราง
- ปรับ CSS `.action-buttons` สำหรับจัดปุ่ม 3 ปุ่ม

**Workflow ใหม่:**
```
บันทึกข้อมูล → ข้อมูลแสดงในตาราง → กด 🖨️ พิมพ์ได้ทันที
```

---

## Session End
- **Status:** ระบบ v2.1 ทำงานได้ครบถ้วน
- **Backup:** v1.0 backed up ที่ `backups/v1.0-basic/`
- **Current Version:** 2.1.0
- **Ready for:** Production use (with LocalStorage) หรือ Google integration

---

## Version Summary

| Version | Features |
|---------|----------|
| 1.0.0 | ฟอร์มกรอก + พิมพ์ + สรุปรายวัน + Export |
| 2.0.0 | เพิ่ม/แก้ไข/ลบข้อมูล + บันทึกรูปภาพ |
| 2.1.0 | ปุ่มพิมพ์ในตาราง |
| 3.0.0 | Batch Print + รายงานรายเดือน + Activity Log |

---

### Phase 8: เพิ่ม 3 Features ใหม่ (v3.0)

**ความต้องการ:**
1. Batch Print - พิมพ์หลายใบพร้อมกัน
2. รายงานรายเดือน - สรุปสถิติรายเดือน
3. Activity Log - บันทึกประวัติการทำงาน

**Changes:**

**1. Batch Print**
- เพิ่ม Checkbox ในตารางสำหรับเลือกรายการ
- ปุ่ม "เลือกทั้งหมด" ในหัวตาราง
- ปุ่ม "พิมพ์ที่เลือก" พร้อมแสดงจำนวน
- พิมพ์หลายใบ พร้อม page break

**2. รายงานรายเดือน**
- Dropdown เลือกเดือน/ปี (พ.ศ.)
- แสดง 4 สถิติ: ผลิตบัตร, พิมพ์แล้ว, รับแล้ว, รอดำเนินการ
- ตารางสรุปรายวัน
- Export PDF/CSV

**3. Activity Log**
- บันทึกอัตโนมัติทุกการกระทำ
- กรองตาม type: เพิ่ม/แก้ไข/ลบ/พิมพ์/รับบัตร
- แสดง 100 รายการล่าสุด
- เก็บสูงสุด 500 รายการ

---

## Session End (v3.0)
- **Status:** ระบบ v3.0 ทำงานได้ครบถ้วน
- **Current Version:** 3.0.0
- **New Features:** Batch Print, Monthly Report, Activity Log

---

### Phase 9: เพิ่ม Features ใหม่ (v4.0)

**ความต้องการ:**
1. ลบปุ่มดูตัวอย่างออก (เพราะมี Preview panel อยู่แล้ว)
2. แก้บัคสถานะพิมพ์ - กดยกเลิกแล้วยังอัพเดตสถานะ
3. แก้หน้ากระดาษพิมพ์ให้อยู่หน้าเดียว + เพิ่มภาษาอังกฤษ
4. เปลี่ยนรูปแบบเลขรับที่เป็น YYYYMMDD-001
5. ย้ายรายงานรายเดือน & Activity Log เป็น Tab Menu
6. สร้างระบบ Login + User Management
7. กำหนดสิทธิการเข้าถึงตาม Role

**Changes:**

**1. ลบปุ่มดูตัวอย่าง**
- ลบ previewBtn จาก HTML และ JavaScript
- Preview แสดงแบบ real-time อยู่แล้ว

**2. แก้บัคสถานะพิมพ์**
- เพิ่ม confirmation dialog หลังพิมพ์ "พิมพ์ใบรับเรียบร้อยแล้วหรือไม่?"
- ถ้ากดยืนยันถึงจะอัพเดตสถานะ
- แก้ทั้ง printReceipt(), printFromTable(), batchPrint()

**3. ปรับหน้าพิมพ์ใหม่**
- ลดขนาดฟ้อนต์ทั้งหมดให้พอดีหน้าเดียว
- เพิ่มภาษาอังกฤษกำกับทุกฟิลด์
- เพิ่มช่องชื่อเจ้าหน้าที่ใต้ลายเซ็น
- ย้ายเลขเอกสารไปมุมล่างขวา (font-size: 7px)

**4. เปลี่ยนรูปแบบเลขรับที่**
- จาก "6902/0001" เป็น "20260204-001"
- รันนิ่งใหม่ทุกวัน

**5. Tab Menu**
- สร้าง Tab Navigation สำหรับรายงานรายเดือน & Activity Log
- UI สวยงามขึ้น

**6. ระบบ Login & User Management**
- สร้าง login.html + auth.js
- Default Users: admin, manager, staff
- Modal สำหรับจัดการผู้ใช้ (เพิ่ม/แก้ไข/ลบ)

**7. Role-based Access Control**
- Admin: Full access including UM and Activity Log
- Manager: Full access except UM and Activity Log
- Staff: Normal operations only

---

## Session End (v4.0)
- **Status:** ระบบ v4.0 ทำงานได้ครบถ้วน
- **Current Version:** 4.0.0
- **New Features:** Login System, User Management, Role-based Permissions, Tab Menu, Print Confirmation

## Default Users
| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | Admin |
| manager | manager123 | Manager |
| staff | staff123 | Staff |

---

### Phase 10: Google Sheets Integration & UI Improvements (v4.1)

**Session Date:** 5 February 2026

**ความต้องการ:**
1. ดึงข้อมูลจาก Google Sheet (Sheet คุมทะเบียน) แทนการกรอกมือ
2. ปรับ Print Form ให้สมมาตรและเต็มหน้ากระดาษ
3. เพิ่มภาษาอังกฤษกำกับทุก Label
4. เพิ่มชื่อเจ้าหน้าที่ผู้จัดทำ (ดึงจาก user login)
5. วันที่รับบัตรและเลขรับที่รันอัตโนมัติ ไม่ให้กรอกได้
6. ตัดเลขรับที่ออกจากฟอร์ม (เก็บไว้แค่ที่ Footer เป็น Doc No.)

**Changes:**

**1. Google Sheets Integration**
- เพิ่มปุ่ม "📥 ดึงข้อมูลจาก Google Sheet"
- Modal สำหรับค้นหาและเลือกข้อมูลจาก Sheet
- ใช้ Google Visualization API (gviz/tq endpoint)
- Live search ด้วย debounce 300ms
- แปลงเลขรับที่จาก format เดิม (6902/0101) เป็น format ใหม่ (YYYYMMDD-NNN)

**2. Form Improvements**
- วันที่รับบัตร: readonly, พื้นหลังสีเขียว, badge "อัตโนมัติ"
- เลขรับที่: เปลี่ยนเป็น hidden field, สร้างอัตโนมัติ
- Doc No. แสดงที่มุมล่างขวาของ Preview

**3. Print Form Improvements**
- Layout สมมาตรและเต็มหน้า A4
- Label แยก 2 บรรทัด (ไทย/อังกฤษ)
- เพิ่มชื่อเจ้าหน้าที่จาก AuthSystem.getSession().name
- เพิ่มช่องเบอร์โทรผู้รับบัตร
- Footer แสดงชื่อศูนย์บริการและ Doc No.

**4. Preview Improvements**
- Label แยกบรรทัด: ไทย (ตัวหนา) / อังกฤษ (ตัวเล็ก สีเทา)
- ลายเซ็น bilingual (ไทย/อังกฤษ)
- Doc No. แสดงที่มุมล่างขวา

**5. Bug Fixes**
- แก้ `formatTime` function ซ้ำกัน 2 ตัว ทำให้เกิด error
- แก้ `initializeApp` ให้ await loadRegistryData() ก่อนสร้างเลขรับที่
- แก้ `clearForm(true)` หลังบันทึกสำเร็จเพื่อ skip confirmation
- แก้ state ไม่อัพเดทหลัง set วันที่และเลขรับที่อัตโนมัติ

---

### Phase 11: Print Layout Optimization (v4.1.1)

**Session Date:** 5 February 2026

**ปัญหาที่พบ:**
- เมื่อกดพิมพ์ ระบบสร้างเอกสาร 5 หน้า แทนที่จะเป็น 1 หน้าต่อใบรับ
- รูปภาพและเนื้อหาเล็กเกินไป ไม่เต็มหน้ากระดาษ

**การแก้ไข:**

**1. แก้ปัญหาพิมพ์ 5 หน้า**
- ปรับ CSS `@media print` ให้ซ่อน elements อื่นๆ ด้วย `display: none !important`
- เพิ่ม `@page { size: A4 portrait; margin: 5mm; }`
- เปลี่ยน HTML content จาก CSS Grid เป็น HTML Table (รองรับ print ได้ดีกว่า)
- เพิ่ม `.print-receipt-page` class สำหรับ page-break controls

**2. ขยายขนาดเนื้อหาให้เต็มหน้า**
- Header: 24px (เดิม 16px)
- Content value: 16px (เดิม 11px)
- Labels: 12px (เดิม 9px)
- Padding: 12-15px (เดิม 6-8px)

**3. ขยายรูปภาพ**
- กรอบรูป min-height: 220px (เดิม 140px)
- รูป max-height: 210px (เดิม 130px)
- Border หนาขึ้น 2px + border-radius: 8px

**4. ช่องลายเซ็นใหญ่ขึ้น**
- ความสูง: 40px (เดิม 25px)
- Font size: 12px (เดิม 9px)
- Padding: 25px (เดิม 15px)

**Files Modified:**
- `js/app.js` - ปรับ `generatePrintContent()` และ `generateSinglePrintContent()`
- `css/style.css` - ปรับ `@media print` styles

---

## Session End (v4.1.1)
- **Status:** ระบบ v4.1.1 ทำงานได้ครบถ้วน
- **Current Version:** 4.1.1
- **New Features:** Print layout เต็มหน้า A4, รูปภาพขยายใหญ่ขึ้น
- **Bug Fixes:** Print 5 หน้า → 1 หน้าต่อใบรับ

---

## Session Date: 5 February 2026 (Session 2)

### Session Overview
เริ่ม Session ใหม่ - พร้อมรับคำสั่งสำหรับการพัฒนาต่อ

**Current Version:** 4.1.1
**Previous Session:** Google Sheets Integration, Print Layout Optimization

---

### Phase 12: Supabase Cloud Integration & Deployment (v5.0)

**Session Date:** 5 February 2026

**ความต้องการ:**
1. Deploy ระบบขึ้น Online เพื่อใช้งานจริง
2. เก็บข้อมูลบน Cloud Database แทน LocalStorage
3. รองรับ Multi-user และ Sync ข้อมูล

**เลือก Supabase เพราะ:**
- ฟรี 500MB Database + 1GB Storage
- Built-in Authentication
- PostgreSQL database (เร็วและเสถียร)
- REST API พร้อมใช้

---

### Supabase Setup

**1. Database Tables:**

```sql
-- profiles (user info)
CREATE TABLE profiles (
    id UUID REFERENCES auth.users PRIMARY KEY,
    username TEXT,
    name TEXT,
    role TEXT DEFAULT 'staff',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- receipts (main data)
CREATE TABLE receipts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    receipt_no TEXT UNIQUE NOT NULL,
    receipt_date DATE,
    foreigner_name TEXT,
    sn_number TEXT,
    request_no TEXT,
    appointment_no TEXT,
    card_image_url TEXT,
    is_printed BOOLEAN DEFAULT FALSE,
    printed_at TIMESTAMPTZ,
    is_received BOOLEAN DEFAULT FALSE,
    received_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- activity_logs (audit trail)
CREATE TABLE activity_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    action TEXT NOT NULL,
    receipt_no TEXT,
    details JSONB,
    user_id UUID REFERENCES auth.users,
    user_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**2. Storage Bucket:**
- `card-images` - Public bucket for Work Permit card images

**3. Row Level Security (RLS):**
- Enabled on all tables
- Authenticated users can CRUD

---

### Files Created/Modified

**New Files:**
- `js/supabase-config.js` - Supabase client & helper modules
- `js/supabase-adapter.js` - Adapter layer replacing LocalStorage
- `js/app-supabase.js` - Main app v5.0 with Supabase integration
- `CNAME` - Custom domain configuration

**Modified Files:**
- `login.html` - Inline Supabase initialization
- `index.html` - Load Supabase scripts
- `js/auth.js` - Supabase authentication

---

### Deployment

**1. GitHub Repository:**
- URL: https://github.com/ytsp18/boi-receipt-gen

**2. GitHub Pages:**
- Original URL: https://ytsp18.github.io/boi-receipt-gen/

**3. Custom Domain:**
- URL: **https://receipt.fts-internal.com**
- DNS: CNAME record pointing to `ytsp18.github.io`
- SSL: Auto-provisioned by GitHub Pages

---

### Bug Fixes

| Issue | Solution |
|-------|----------|
| 406 Error when checking existing receipt | Changed `.single()` to `.maybeSingle()` |
| Table not updating after save | Added auto-reload from Supabase after save |
| Supabase library not loading | Added inline initialization with retry |
| Infinite redirect loop on login | Removed auto-redirect on login page |

---

### Supabase Credentials

> ⚠️ **SECURITY NOTE:** Credentials are stored securely and NOT in this file.
> Please contact the administrator for access credentials.

| Item | Value |
|------|-------|
| Project URL | https://pyyltrcqeyfhidpcdtvc.supabase.co |
| Admin Email | (stored securely - contact admin) |
| Admin Password | (stored securely - contact admin) |

---

## Session End (v5.0)
- **Status:** ระบบ v5.0 Deploy เรียบร้อย
- **Current Version:** 5.0.0
- **Live URL:** https://receipt.fts-internal.com
- **Database:** Supabase (PostgreSQL)
- **Storage:** Supabase Storage (card-images bucket)
- **Hosting:** GitHub Pages with Custom Domain

---

## Phase 13: UI Rebranding & Form Layout (v5.1)

**Session Date:** 5 February 2026

### ความต้องการ
1. เปลี่ยน Header/Title จาก BOI เป็น EWP Service Center
2. ปรับหัวแบบฟอร์มให้เรียบง่าย
3. ย้ายชื่อหน่วยงานไป Footer

### การเปลี่ยนแปลง

**Receipt Form Header:**
```
แบบรับใบอนุญาตทำงาน e-WorkPermit
(e-WorkPermit Card Receipt)
─────────────────────────────────
```

**Receipt Form Footer:**
```
────────────────────────────────────────────────
ศูนย์บริการ EWP อาคาร One Bangkok    Doc No.: 20260205-001
```

**System Header:**
- จาก: "ระบบออกใบรับบัตร Work Permit / สำนักงานคณะกรรมการส่งเสริมการลงทุน (BOI)"
- เป็น: "ระบบสร้างแบบฟอร์มรับบัตร / ศูนย์บริการ EWP อาคาร One Bangkok"

**Table Header:**
- จาก: "ข้อมูลคุมทะเบียน"
- เป็น: "รายการเอกสารแบบรับใบอนุญาตทำงาน e-WorkPermit"

---

## Git Version Control (Rollback Guide)

**วิธี Rollback กลับไป Version ก่อนหน้า:**

```bash
# ดู commits ทั้งหมด
git log --oneline -20

# Rollback ไป commit ที่ต้องการ (ใช้ commit hash)
git checkout <commit-hash> -- <file>

# หรือ Rollback ทั้ง project
git reset --hard <commit-hash>

# Push force (ระวัง! จะลบ commits หลังจากนั้น)
git push origin main --force
```

**Commit History สำคัญ:**

| Commit | Description | Date |
|--------|-------------|------|
| `4e422ad` | v5.1 - Simplified footer (current) | 5 Feb 2026 |
| `91db333` | v5.1.0 - UI updates, sorting, sync toggle | 5 Feb 2026 |
| `72fea0d` | v5.0 - SESSION_LOG update | 5 Feb 2026 |
| `9f3ddbd` | v5.0 - Custom domain added | 5 Feb 2026 |
| `4b04e5b` | v5.0 - Initial Supabase integration | 5 Feb 2026 |

---

## Phase 14: Security Audit & Hardening (v5.1.1)

**Session Date:** 5 February 2026

### Security Audit Findings

| Severity | Issue | Status |
|----------|-------|--------|
| 🔴 Critical | Exposed admin credentials in docs | ✅ Fixed |
| 🟠 High | XSS vulnerabilities (innerHTML) | ✅ Fixed |
| 🟠 High | No input validation | ✅ Fixed |
| 🟡 Medium | No password complexity | ⚠️ Pending |
| 🟡 Medium | No rate limiting | ⚠️ Pending |

### Security Fixes Applied

1. **Credential Security**
   - ลบ admin password ออกจาก SESSION_LOG.md
   - เพิ่มคำเตือนให้ติดต่อ admin

2. **XSS Protection**
   - เพิ่ม `sanitizeHTML()` function
   - Sanitize ข้อมูลก่อนแสดงผลใน table
   - ป้องกัน script injection

3. **Input Validation**
   - เพิ่ม `validateInput()` function
   - Validate ข้อมูลก่อนบันทึก database
   - ตรวจสอบ: text, email, number, date, receiptNo

### Remaining Security Tasks (Manual)

> ✅ **Completed in Supabase Dashboard:**
> 1. ✅ เปลี่ยน Admin Password - เรียบร้อย
> 2. ✅ ตรวจสอบ RLS Policies - เปิดใช้งานแล้ว
> 3. ⚠️ Rate Limiting - Optional (ยังไม่จำเป็น)

---

### Final Security Status

| รายการ | สถานะ |
|--------|--------|
| XSS Protection | ✅ ใช้งานแล้ว |
| Input Validation | ✅ ใช้งานแล้ว |
| Supabase RLS | ✅ เปิดใช้งาน |
| Admin Password Changed | ✅ เปลี่ยนแล้ว |
| Credentials Removed from Docs | ✅ ลบแล้ว |
| User Approval System | ✅ มีระบบอนุมัติ |
| JWT Authentication | ✅ ใช้งานแล้ว |

**สรุป:** ระบบมีความปลอดภัยเพียงพอสำหรับการใช้งานจริง

---

## Session End (v5.1.1)
- **Status:** Security Audit & Hardening เรียบร้อย ✅
- **Current Version:** 5.1.1
- **Live URL:** https://receipt.fts-internal.com
- **Security Level:** Production Ready

---

## Version Summary (Updated)

| Version | Features |
|---------|----------|
| 1.0.0 | ฟอร์มกรอก + พิมพ์ + สรุปรายวัน + Export |
| 2.0.0 | เพิ่ม/แก้ไข/ลบข้อมูล + บันทึกรูปภาพ |
| 2.1.0 | ปุ่มพิมพ์ในตาราง |
| 3.0.0 | Batch Print + รายงานรายเดือน + Activity Log |
| 4.0.0 | Login System + User Management + Role-based Permissions |
| 4.1.0 | Google Sheets Integration + Print Layout Improvements |
| 4.1.1 | Print Layout Optimization (Full A4 page) |
| 5.0.0 | Supabase Cloud + GitHub Pages + Custom Domain |
| 5.1.0 | UI Rebranding - EWP Service Center |
| 5.1.1 | Security Audit & Hardening |
| 5.2.0 | Reset Password + Bug Fixes |
| 6.0.0 | VP API Integration + ลบ Google Sheet |
| **6.0.1** | **Critical Fix: SyntaxError + Recovery 38 records** |

---

## Phase 15: Reset Password & Bug Fixes (v5.2.0)

**Session Date:** 5 February 2026

### ปัญหาที่พบและแก้ไข

**1. Edit User Modal แสดง "undefined"**
- **สาเหตุ:** `showEditUserForm()` เรียก async function `getUserById()` โดยไม่ใช้ `await`
- **แก้ไข:** เพิ่ม `async` keyword และ `await` ในฟังก์ชัน

**2. User Approval Error (approved_at column not found)**
- **สาเหตุ:** โค้ดพยายาม update column `approved_by` และ `approved_at` ที่ไม่มีอยู่ใน profiles table
- **แก้ไข:** ลบ columns ที่ไม่มีออกจาก `approveUser()` function

**3. User Login ไม่ได้ (Invalid credentials)**
- **สาเหตุ:** Email ไม่ได้รับการยืนยัน (Supabase Email Confirmation เปิดอยู่)
- **แก้ไข:**
  - ปิด "Confirm email" ใน Supabase Dashboard
  - รัน SQL: `UPDATE auth.users SET email_confirmed_at = NOW() WHERE email_confirmed_at IS NULL;`

**4. Reset Password Link ไปที่ localhost:3000**
- **สาเหตุ:** Supabase Redirect URLs ไม่ได้ตั้งค่า
- **แก้ไข:**
  - ตั้ง Site URL: `https://receipt.fts-internal.com`
  - เพิ่ม Redirect URL: `https://receipt.fts-internal.com/reset-password.html`

---

### Features เพิ่มใหม่

**Reset Password (Admin)**
- ปุ่ม 🔑 ในตาราง User Management
- Admin กดปุ่ม → Supabase ส่ง email → ผู้ใช้คลิก link → ตั้งรหัสผ่านใหม่

**Files Modified:**
- `js/auth.js` - เพิ่ม `resetPassword()` function
- `js/app-supabase.js` - เพิ่ม `handleResetPassword()` และปุ่ม 🔑

**Files Created:**
- `reset-password.html` - หน้าตั้งรหัสผ่านใหม่

---

### Supabase Configuration

| Setting | Value |
|---------|-------|
| Site URL | `https://receipt.fts-internal.com` |
| Redirect URLs | `https://receipt.fts-internal.com/reset-password.html` |
| Confirm email | ❌ ปิด |

---

## Session End (v5.2.0)
- **Status:** ระบบ v5.2.0 ทำงานได้ครบถ้วน ✅
- **Current Version:** 5.2.0
- **Live URL:** https://receipt.fts-internal.com
- **New Features:** Reset Password (Admin), Bug Fixes

---

## Phase 16: VP API Integration (v6.0.0)

**Session Date:** 9 February 2026

### ความต้องการ
1. เชื่อมต่อ VP/SWD API แทน Google Sheet สำหรับดึงข้อมูลนัดหมาย
2. รองรับทั้ง Webhook (push) และ Polling (pull) จาก VP system

### สิ่งที่ทำ

**1. Edge Functions (Supabase)**
- `vpapi-webhook` — รับข้อมูล push จาก VP ผ่าน webhook, validate x-api-key
- `vpapi-sync` — polling ดึงข้อมูลจาก VP API ตาม schedule

**2. SQL Migration**
- `supabase-update-v6.0-api-integration.sql` — สร้างตาราง `pending_receipts`, เพิ่ม column `api_photo_url`

**3. Frontend**
- ลบ Google Sheet integration ทั้งหมด
- เพิ่ม VP pending modal, pending badge, realtime subscription
- เพิ่ม `_pendingId` และ `_apiPhotoUrl` ใน formData state

**4. ฟีเจอร์ VP ปิดไว้ชั่วคราว** (รอ migration + API credentials)
- ซ่อนปุ่ม VP ด้วย `display: none`
- Comment out `updatePendingBadge()` / `setupPendingRealtime()`

---

## Phase 17: Critical Bug Fix & Data Recovery (v6.0.1)

**Session Date:** 9 February 2026

### 🔴 เหตุการณ์สำคัญ: ระบบล่มจาก SyntaxError

**ปัญหา:**
- หลัง push v6.0 ขึ้น production พบ `SyntaxError: Identifier 'receiptNo' has already been declared`
- สาเหตุ: `printFromTable(receiptNo)` parameter ชื่อซ้ำกับ `const receiptNo` ภายในฟังก์ชัน
- ทำให้ **ทั้งไฟล์ JS ไม่ทำงาน** → ไม่โหลดข้อมูล, ไม่แสดงชื่อผู้ใช้, เพิ่มข้อมูลไม่ได้

**ผลกระทบ:**
- เจ้าหน้าที่เข้าใจว่าเพิ่มข้อมูลไม่ได้เพราะ "เต็ม" จึงลบ record ไป **38 รายการ**
- ข้อมูลถูก hard delete จาก DB + รูปภาพถูกลบจาก Storage

### การแก้ไข

**1. Fix SyntaxError**
- เปลี่ยนตัวแปรภายใน `printFromTable()` จาก `receiptNo`/`foreignerName` เป็น `printReceiptNo`/`printName`
- Commit: `d472092`

**2. Fix api_photo_url**
- ส่ง `api_photo_url` เฉพาะเมื่อมีค่า (ป้องกัน INSERT error ก่อนรัน migration)
- Commit: `812689f`

**3. ปิดฟีเจอร์ VP ชั่วคราว**
- ซ่อนปุ่มด้วย `display: none`, comment out DB queries
- Commit: `4074233`

**4. เพิ่ม Version badge + Cache busting**
- แสดง v6.0.0 มุมล่างขวา, อัพเดท `?v=6.0` ทุกไฟล์
- Commit: `8d04f38`, `63829ef`

### การกู้คืนข้อมูล 38 รายการ

**พบข้อมูลใน activity_logs:**
- 38 records ที่ถูกลบวันนี้ โดย "Sofia Sa-eh"
- เก็บ `receipt_no` + `foreigner_name` (แต่ไม่มี SN, Request No., Appointment No.)

**แผนกู้คืน:**
1. ✅ ดึงรายการจาก `activity_logs` — ได้ receipt_no + ชื่อ ครบ 38 คน
2. ✅ สร้าง Excel (`Recovery_38_records_20260209.xlsx`) ให้เจ้าหน้าที่กรอก SN/Request/Appointment
3. ✅ สร้าง SQL INSERT template (`recovery-insert-template.sql`)
4. ⏳ รอเจ้าหน้าที่กรอก Excel → INSERT กลับ DB ด้วยเลข receipt_no เดิม
5. ⏳ เจ้าหน้าที่อัพโหลดรูปบัตรใหม่ผ่านหน้าเว็บ (กดแก้ไข → อัพโหลดรูป)

**เลข receipt_no ที่ถูกลบ (38 รายการ):**
```
20260209-001, 002, 003, 004, 005, 006, 007, 008, 009, 010,
011, 012, 013, 014, 015, 016, 017, 018, 019, 020,
021, 023, 024, 025, 026, 027, 030, 031, 032, 034,
035, 037, 039, 041, 042, 043, 067, 068
```

### RLS Policies ตรวจสอบแล้ว

**activity_logs table:**
- SELECT: "Allow authenticated users to read logs" + "Only admin can view activity logs"
- INSERT: 2 policies (authenticated users + general insert)
- **ผลลัพธ์:** Activity Log แสดงปกติบนหน้าเว็บ (ใช้ filter "ลบข้อมูล" ดูรายการที่ถูกลบ)

### Git Commits (Session นี้)

| Commit | Description |
|--------|-------------|
| `40ec564` | feat: v6.0 เชื่อมต่อ API VP/SWD |
| `812689f` | fix: ไม่ส่ง api_photo_url ถ้าไม่มีค่า |
| `4074233` | chore: ปิดฟีเจอร์ VP API ชั่วคราว |
| `d472092` | fix: SyntaxError ตัวแปร receiptNo ซ้ำ |
| `226cd63` | docs: อัพเดท CHANGELOG v6.0.0 |
| `8d04f38` | chore: อัพเดท version เป็น v6.0 |
| `63829ef` | feat: แสดง version badge มุมล่างขวา |

### Files สำหรับกู้คืนข้อมูล

| File | Description |
|------|-------------|
| `Recovery_38_records_20260209.xlsx` | Excel สำหรับเจ้าหน้าที่กรอก (อยู่ Desktop) |
| `recovery-insert-template.sql` | SQL INSERT template (อยู่ใน project) |
| `deleted-records-20260209.csv` | CSV รายชื่อ 38 คน (อยู่ใน project) |

---

## Session End (v6.0.1)
- **Status:** Critical bug fixed ✅ | Data recovery in progress ⏳
- **Current Version:** 6.0.1
- **Live URL:** https://receipt.fts-internal.com
- **DB Records:** 65 active (เดิม 95 → ลบ 38 → เพิ่มใหม่ 8)
- **Pending:** รอเจ้าหน้าที่กรอก Excel → INSERT 38 records กลับ + อัพโหลดรูปใหม่
- **VP Feature:** ปิดไว้ชั่วคราว (รอ migration + API credentials)

---

## Session Date: 9 February 2026 (ต่อ) — Security + Print Enhancement

### Session Overview
แก้ไข security vulnerabilities 10 จุด + เพิ่มระบบหมวดหมู่ตัวอักษร A-Z สำหรับค้นหาเอกสารที่ปริ้นออกมาได้ง่ายขึ้น

---

### Phase 1: Security Audit & Fix (v6.0.2)

**ปัญหา:** พบ XSS vulnerabilities 10 จุด + permission ที่หลวมเกินไป

**สิ่งที่แก้ไข:**
1. `validateInput()` — เสริม regex block HTML tags, javascript: URI, event handlers
2. `renderActivityLog()` — sanitize title + details
3. `showUserManagement()` — sanitize username, name, role, id
4. `showEditUserForm()` — sanitize input values
5. `renderPendingResults()` — sanitize all fields + URL validation
6. `generateSinglePrintContent()` — sanitize all fields + cardImage URL validation
7. `generatePrintContent()` — เหมือน #6
8. `viewImage()` — sanitize + URL validation (https/data:image only)
9. `batchPrint()` — เปลี่ยนเป็น async `markAsPrinted()` (sync Supabase)
10. `pending_receipts` RLS policy SQL — จำกัด INSERT เฉพาะ service_role (รอตารางถูกสร้าง)

**Permission Fix (Fix 11):**
- ลบ `delete` จาก manager permissions ใน auth.js
- เพิ่ม admin check guard ใน `deleteRecord()`
- ซ่อน delete button สำหรับ non-admin
- แก้ timing bug: ย้าย `applyPermissions()` ก่อน `loadRegistryData()`

**Deploy:** Commit `c7ccc9e` → pushed to main

### Phase 2: Print Layout Enhancement (v6.1.0)

**ปัญหาจากหน้างาน:** เจ้าหน้าที่ปริ้นเอกสารรอไว้ล่วงหน้า เมื่อลูกค้ามารับบัตร ต้องค้นหาเอกสารจากกองกระดาษ ทำให้เสียเวลา

**4 ฟีเจอร์ที่เพิ่ม:**
1. **ตัวอักษรหมวดหมู่ A-Z** — มุมขวาบน 36px กรอบสี (ข้าม prefix mr./mrs./miss/ms.)
2. **แถบสี 5 กลุ่ม** — A-E แดง, F-J เขียว, K-O น้ำเงิน, P-T ส้ม, U-Z ม่วง
3. **Doc No. ขยายใหญ่** — จาก 10px เทา เป็น 16px ตัวหนาดำ
4. **Batch print เรียง A-Z** — อัตโนมัติตามชื่อจริง

**เพิ่มเติม:**
- แถบสีหมวดหมู่ในตาราง registry (border-left สีที่ column ลำดับ)
- Preview อัปเดตแสดง category badge + แถบสี + Doc No. ใหญ่
- Bump cache version เป็น v6.1

**ไฟล์ที่แก้:**
- `js/app-supabase.js` — getCategoryInfo(), generateSinglePrintContent(), generatePrintContent(), batchPrint(), updateReceiptPreview(), renderRegistryTable()
- `index.html` — เพิ่ม category badge element, bump version v6.1
- `css/style.css` — .category-badge, .receipt-document position, .footer-doc ขยาย

**Deploy:** Commit `5253e75` → pushed to main

### Git Commits (Session นี้)

| Commit | Description |
|--------|-------------|
| `c7ccc9e` | security: แก้ไข XSS vulnerabilities + delete permission control |
| `5253e75` | feat: ระบบหมวดหมู่ A-Z + แถบสี + Doc No. ขยาย + batch sort |

### Notice
- **pending_receipts RLS policy**: เมื่อเปิด VP API integration และสร้างตาราง `pending_receipts` ต้อง run `supabase-update-v6.0.2-security.sql` ทันที

---

## Session End (v6.1.0)
- **Status:** Security patched ✅ | Print enhancement deployed ✅
- **Current Version:** 6.1.0
- **Live URL:** https://receipt.fts-internal.com
- **VP Feature:** ปิดไว้ชั่วคราว (รอ migration + API credentials)
- **Pending SQL:** `supabase-update-v6.0.2-security.sql` (รอตาราง pending_receipts ถูกสร้าง)

---

## Phase 18: Image Compression & Date Filter (v6.2.0)

**Session Date:** 10 February 2026

### ความต้องการ
รองรับ 250 ใบ/วัน — ลดขนาด storage, ลด bandwidth, ให้ค้นหาข้ามวันได้

### สิ่งที่ทำ

**1. Image Compression**
- บีบอัดรูปก่อน upload ≤1200px, ≤800KB
- Block SVG/HTML files (ป้องกัน XSS via image upload)
- แสดงขนาดไฟล์หลังบีบอัด

**2. Date-Based Loading**
- Date picker default วันที่ปัจจุบัน
- โหลดเฉพาะข้อมูลวันที่เลือก (ลด bandwidth)
- สรุปรายวันเปลี่ยนตามวันที่

**3. Server-Side Search**
- ค้นหาข้ามวันที่ได้ (ไม่จำกัดเฉพาะวันที่เลือก)
- ค้นหาด้วยชื่อ, SN, เลขรับที่

**4. SQL Indexes**
- สร้างไฟล์ `supabase-update-v6.2-indexes.sql`
- Indexes: `created_at DESC`, `receipt_no`, `foreigner_name`

### Git Commits

| Commit | Description |
|--------|-------------|
| — | feat: v6.2.0 image compression + date filter + search |

### Deploy
- Commit → push to main → GitHub Pages auto-deploy
- Cache version bump: v6.1 → v6.2

---

## Session End (v6.2.0)
- **Status:** Deployed ✅
- **Current Version:** 6.2.0
- **Live URL:** https://receipt.fts-internal.com

---

## Phase 19: Pagination, Barcode, UX Analytics (v6.3.0)

**Session Date:** 10 February 2026

### ความต้องการ
1. Pagination 50/หน้า — ตาราง registry + Activity Log
2. Barcode Code 128 — พิมพ์บนใบรับ + ยิง scanner ค้นหา
3. UX Analytics — เก็บข้อมูลการใช้งานสำหรับวิเคราะห์

### Git Strategy
- สร้าง Tag `v6.2.0` เป็น rollback point
- สร้าง Branch `v6.3-dev` สำหรับพัฒนา
- เมื่อ test ผ่าน → merge เข้า main

### สิ่งที่ทำ

**1. Pagination (50 ต่อหน้า)**
- เพิ่ม state: `currentPage`, `pageSize`, `activityPage`, `activityPageSize`
- แก้ `renderRegistryTable()` → slice ข้อมูลตามหน้า
- สร้าง `renderPagination()` + `goToPage()` — แสดง "แสดง 1-50 จาก N รายการ"
- สร้าง `renderActivityPagination()` + `goToActivityPage()`
- Reset page 1 เมื่อ search/filter/date เปลี่ยน
- Select All เลือกเฉพาะหน้าปัจจุบัน
- ซ่อน pagination ใน print
- เพิ่ม HTML containers + CSS styles

**2. Barcode Code 128**
- เพิ่ม JsBarcode CDN ใน index.html
- แก้ `generatePrintContent()` + `generateSinglePrintContent()` — เพิ่ม barcode SVG ที่ footer
- สร้าง `renderBarcodes()` helper — ใช้ JsBarcode render + fallback
- เรียก `renderBarcodes()` ใน print paths ทั้ง 3 จุด
- Barcode config: Code128, width 1.5, height 28, displayValue true

**3. Barcode Scan Detection**
- เพิ่ม `barcodeScanLastKeyTime` ใน state
- เพิ่ม `keydown` listener บน search input
- ตรวจ pattern: พิมพ์เร็ว < 100ms + Enter → bypass debounce, search ทันที

**4. UX Analytics**
- สร้าง `UXAnalytics` module (IIFE pattern)
- Functions: `log()`, `startTimer()`, `endTimer()`, `trackFeature()`, `trackJourney()`, `trackError()`
- Batching: queue + flush ทุก 30s หรือ 50 events + beforeunload
- Instrument ~20 จุด: save, print, search, filter, export, tab switch, etc.
- SQL: สร้างตาราง `ux_analytics` + indexes + RLS
- เพิ่ม `loadAnalyticsSummary()` ใน supabase-adapter.js

**5. Bug Fixes**
- S1: Search query injection — sanitize input ใน supabase-adapter
- F1: Batch print selection loss — คง checkbox state หลัง re-render
- P1: Analytics batching — flush ทุก 30s/50 events แทน immediate INSERT

### Testing (Live Site)

| Test | ผลลัพธ์ |
|------|---------|
| Registry Pagination (97 records) | ✅ 50/หน้า, เปลี่ยนหน้าได้ |
| Activity Log Pagination (454 entries) | ✅ 50/หน้า, 10 หน้า |
| Barcode on print receipt | ✅ แสดง Code 128 + text |
| UX Analytics batching | ✅ POST 201 หลัง 30s |
| Console errors | ✅ ไม่มี errors |

### Print Layout Fixes (4 รอบ)

**ปัญหา:** Print preview แสดง 2 หน้า — barcode/footer ถูกดันไปหน้าที่ 2

**รอบ 1:** ลด padding, margins, font sizes, barcode height → ยังเป็น 2 หน้า
**รอบ 2:** ลด CSS max-height 277→260mm, padding 5→3mm, image 210→170px → ยังเป็น 2 หน้า
**รอบ 3:** User feedback "ต้องการให้ขนาดรูปเท่าเดิม ลด header แทน" → คืน image 210px, ลด header 24→18px, info table padding 12→5px, page padding 10→5mm
**Root cause:** CSS `!important` override JS inline styles + browser "Print headers and footers" กิน ~15mm

**Badge Alignment Fix:**
- ปัญหา: ตัวอักษรหมวดหมู่ (H, M, X) ไม่อยู่กลางกรอบ header
- สาเหตุ: `position: absolute; top: 5mm` เปลี่ยนตำแหน่งเมื่อ padding เปลี่ยน
- แก้: เปลี่ยนเป็น flexbox layout ใน header div (`align-items: center`)
- แก้ทั้ง 2 templates: `generateSinglePrintContent()` + `generatePrintContent()`

### Git Commits

| Commit | Description |
|--------|-------------|
| `8a85941` | docs: เพิ่มแผนพัฒนา (Development Roadmap) สำหรับ v6.3+ |
| — | feat: v6.3.0 pagination + barcode + UX analytics (on v6.3-dev) |
| — | merge v6.3-dev → main |
| `d0dc59d` | fix: ปรับ print layout ให้พอดี 1 หน้า A4 |
| `07c4d23` | fix: ปรับ print layout รอบ 2 — แก้ยังออก 2 หน้า |
| `c2872fa` | fix: ปรับ print layout รอบ 3 — คืนขนาดรูป 210px, ลด header/info แทน |
| `23ef724` | fix: แก้ตัวอักษรหมวดหมู่ไม่อยู่กลางกรอบ header |

### Files Modified

| File | Changes |
|------|---------|
| `js/app-supabase.js` | +UXAnalytics module, +renderBarcodes(), +barcode scan, +pagination ×2, +instrument ~20 จุด, print layout fixes, badge alignment fix |
| `js/supabase-adapter.js` | +activity log limit 500, +loadAnalyticsSummary(), search sanitize |
| `index.html` | +JsBarcode CDN, +pagination containers ×2, version bump v6.3 |
| `css/style.css` | +pagination CSS, +barcode print CSS, print layout adjustments |

---

## Session End (v6.3.0)
- **Status:** Deployed ✅ | All features tested ✅
- **Current Version:** 6.3.0
- **Live URL:** https://receipt.fts-internal.com
- **Features:** Pagination 50/หน้า, Barcode Code 128, UX Analytics, Print layout fixed
- **SQL Ran:** v6.2 indexes ✅, v6.3 ux_analytics table ✅
- **VP Feature:** ปิดไว้ชั่วคราว (รอ migration + API credentials)

---

## Version Summary (Updated)

| Version | Features |
|---------|----------|
| 1.0.0 | ฟอร์มกรอก + พิมพ์ + สรุปรายวัน + Export |
| 2.0.0 | เพิ่ม/แก้ไข/ลบข้อมูล + บันทึกรูปภาพ |
| 2.1.0 | ปุ่มพิมพ์ในตาราง |
| 3.0.0 | Batch Print + รายงานรายเดือน + Activity Log |
| 4.0.0 | Login System + User Management + Role-based Permissions |
| 4.1.0 | Google Sheets Integration + Print Layout Improvements |
| 4.1.1 | Print Layout Optimization (Full A4 page) |
| 5.0.0 | Supabase Cloud + GitHub Pages + Custom Domain |
| 5.1.0 | UI Rebranding - EWP Service Center |
| 5.1.1 | Security Audit & Hardening |
| 5.2.0 | Reset Password + Bug Fixes |
| 6.0.0 | VP API Integration + ลบ Google Sheet |
| 6.0.1 | Critical Fix: SyntaxError + Recovery 38 records |
| **6.1.0** | **Print category A-Z + color bands + Doc No. ขยาย** |
| **6.2.0** | **Image compression + date filter + server-side search** |
| **6.3.0** | **Pagination + Barcode Code 128 + UX Analytics + print layout fix** |
| **7.0.0** | **E-Sign Workflow: Webcam + Digital Signature + SIT Environment** |
| **8.0.0** | **UX Optimization + Card Print Lock (แทน Google Sheet)** |
| **8.1.0** | **Fuzzy Search (pg_trgm) + Quick Print Mode** |

---

## Phase 20: UX Optimization & Performance (v8.0.0)

**Session Date:** 10 February 2026 (Session 2+3)

### บริบท
จากข้อมูล UX Analytics จริง (1,485 events, 9-10 ก.พ.) พบ 3 จุดปรับปรุงหลัก:
- **30 sessions** เปิดมาแค่ search → print → ออก → ต้องมี Quick Print
- **Search** ใช้มากสุด (415 ครั้ง) → ควรมี fuzzy search, ประวัติการค้นหา
- **print_from_table** (306) ใช้มากกว่า print_single (58) ถึง 5 เท่า → batch workflow ต้องเร็วขึ้น
- **Batch markAsPrinted** ทำ N รอบ Supabase call + N ครั้ง re-render → performance issue

### สิ่งที่ทำ (Session ก่อนหน้า — v8.0 Part 1)

**1. 3A. Batch markAsPrinted — Performance Fix**
- เพิ่ม `markPrintedBatch(receiptNos[])` ใน `supabase-adapter.js` — 1 Supabase call แทน N calls
- แก้ `batchPrint()` post-confirmation ใช้ batch call + update local state + render 1 ครั้ง

**2. 3B. Cache getFilteredData()**
- เพิ่ม `state.filteredDataCache` + `state.filteredDataDirty`
- getFilteredData() return cached result ถ้า cache ยัง valid
- Invalidate cache เมื่อ data/search/filter เปลี่ยน

**3. 2A. Recent Receipts (Frontend)**
- `state.recentReceipts = []` — เก็บ 10 เลขใบรับล่าสุดใน localStorage
- Dropdown ใต้ช่องค้นหาเมื่อ focus + ช่องว่าง
- Arrow keys + Enter เลือก
- ปุ่มล้างประวัติ

**4. 2C. Search Query Hash**
- เพิ่ม `hashQuery()` ใช้ SHA-256 (12 ตัวแรก)
- Track `query_hash` ใน analytics — ย้อนกลับไม่ได้ (privacy)

### สิ่งที่ทำ (Session นี้ — v8.0 Part 2)

**5. Card Print Lock — แทน Google Sheet "บันทึกรายการห้ามซ้ำ V3"**
- สร้าง `supabase-update-v8.0-card-print-lock.sql`:
  - ตาราง `card_print_locks` + UNIQUE(appointment_id)
  - Trigger normalize: LOWER(TRIM(REGEXP_REPLACE))
  - Indexes, RLS, Realtime, Archive table
  - `cleanup_old_card_locks()` function (48hr → archive, 90d → delete)
- สร้าง `card-print.html` — หน้า standalone สำหรับล็อกพิมพ์บัตร
- สร้าง `js/card-print-app.js` — 3-layer lock, Realtime, barcode scan, S/N edit, officer colors
- แก้ `js/supabase-config.js` — เพิ่ม `SupabaseCardPrintLock` module (CRUD + search + archive)
- แก้ `index.html` — เพิ่มลิงก์ "ล็อกพิมพ์บัตร" ใน header
- แก้ `js/app-supabase.js` — cross-use auto-fill (appointmentNo blur → lookup lock → fill name/requestNo)

**6. 3C. Batch Print UX**
- เพิ่มปุ่ม "เลือกที่ยังไม่พิมพ์" ใน index.html
- สร้าง `selectAllNotPrinted()` function
- Keyboard shortcut: Ctrl+P → batchPrint() เมื่อมีรายการเลือก

**7. 4A. Journey Tracking**
- เพิ่ม `_journeyMilestones` ใน state (hasSearched, hasPrinted, hasFormAdd, startTime)
- Track milestones: journey_search, journey_print, journey_form_add
- journey_complete ที่ beforeunload — classify journey type

### สิ่งที่ทำ — v8.1

**8. 2B. Fuzzy Search (pg_trgm)**
- สร้าง `supabase-update-v8.1-fuzzy-search.sql`:
  - CREATE EXTENSION pg_trgm
  - GIN indexes สำหรับ foreigner_name + receipt_no
  - `search_receipts_fuzzy()` RPC function
- แก้ `js/supabase-adapter.js` — try fuzzy RPC first, fallback to ilike

**9. 1. Quick Print Mode** — **อยู่ระหว่างทำ**
- URL param detection เพิ่มแล้ว: `?mode=quick-print` → `initQuickPrintMode()`
- `initQuickPrintMode()` function ยังไม่ได้สร้าง

### ไฟล์ที่สร้าง/แก้ไข

| File | Action | หมายเหตุ |
|------|--------|----------|
| `supabase-update-v8.0-card-print-lock.sql` | สร้างใหม่ | Card print lock table + archive + cleanup |
| `supabase-update-v8.1-fuzzy-search.sql` | สร้างใหม่ | pg_trgm + fuzzy search function |
| `card-print.html` | สร้างใหม่ | หน้า Card Print Lock |
| `js/card-print-app.js` | สร้างใหม่ | Logic: lock, S/N, Realtime, barcode scan |
| `js/supabase-config.js` | แก้ไข | เพิ่ม SupabaseCardPrintLock module |
| `js/supabase-adapter.js` | แก้ไข | เพิ่ม markPrintedBatch(), fuzzy search RPC |
| `js/app-supabase.js` | แก้ไข | Recent receipts, cache, batch UX, journey, cross-use, quick print detection |
| `index.html` | แก้ไข | ลิงก์ล็อกบัตร, ปุ่มเลือกที่ยังไม่พิมพ์ |

### Lock Mechanism — 3 ชั้น

| ชั้น | กลไก | จุดประสงค์ |
|------|-------|-----------|
| Layer 1 | ตรวจ local state ก่อน insert | UX — แจ้งเตือนทันที |
| Layer 2 | DB UNIQUE(appointment_id) | หลัก — ป้องกัน race condition, error 23505 |
| Layer 3 | Supabase Realtime subscription | Live update ข้าม browser |

### งานค้าง

| รายการ | สถานะ |
|--------|--------|
| Quick Print Mode (`initQuickPrintMode()`) | อยู่ระหว่างทำ |
| ทดสอบทุก feature บน SIT | รอ |
| รัน SQL v8.0 + v8.1 บน SIT | รอ |

---

## Session End (v8.0-8.1 development)
- **Status:** ✅ Deployed to Production
- **Production Version:** v8.1.0
- **Features Done:** ทุก feature ครบ — Batch optimization, cache, recent receipts, query hash, card print lock, batch UX, journey tracking, fuzzy search, quick print mode
- **SQL:** ✅ v8.0 + v8.1 run บน Production Supabase สำเร็จ (11 ก.พ. 69)

---

## 11 กุมภาพันธ์ 2569 — v8.3.0 Pre-Migration Hardening

### สิ่งที่ทำ

**1. CDN SRI Hash (C1+C2)**
- เพิ่ม `integrity="sha384-..."` + `crossorigin="anonymous"` ให้ทุก CDN script
- Pin Supabase JS @2.95.3 (ป้องกัน SRI break เมื่อ CDN update)
- ไฟล์: index.html, login.html, card-print.html, reset-password.html

**2. goToPage() Upper Bound (F3)**
- เพิ่ม check `page > totalPages` ใน `goToPage()` — ป้องกัน pagination เกินจำนวนหน้า

**3. viewImage() URL Size Limit (S6)**
- เพิ่ม check URL length > 10MB ก่อน `window.open()` — ป้องกัน memory attack จาก data: URI ขนาดใหญ่

**4. afterprint Event (F6/P6)**
- เปลี่ยน `setTimeout(500ms)` → `window.addEventListener('afterprint')` ทั้ง 3 จุด:
  - batchPrint(), single print from form, printFromTable()
- ใช้ one-time listener pattern (`removeEventListener` ภายใน handler)

**5. Password Complexity — Client-Side (S5)**
- login.html: เพิ่ม validation ก่อน register (≥8 ตัว, A-Z, 0-9)
- Realtime strength indicator ด้วย ✓/✗ สีเขียว/แดง
- reset-password.html: เพิ่ม validation เดียวกัน + minlength 8

**6. Cache Bust + Deploy**
- ?v=8.2 → ?v=8.3 ทุกไฟล์ HTML
- Version badge card-print → v8.3
- ทดสอบ SRI load + password validation บน localhost
- Commit d093531 → push to Production

### ทดสอบ
- [x] SRI Hash: Supabase loaded ปกติ, ไม่มี console error
- [x] Password "123" → แดง 2 กฎ (8 ตัว, A-Z), เขียว 1 กฎ (0-9)
- [x] Password "Abc12345" → เขียวทั้ง 3 กฎ
- [x] Code review: afterprint ×3 จุดถูกต้อง, goToPage guard, viewImage limit

---

## 11 กุมภาพันธ์ 2569 — SQL Migration Production + Documentation Update

### สิ่งที่ทำ

**1. Run SQL v8.0 บน Production Supabase**
- เปิด Supabase Dashboard → SQL Editor → Production project
- สร้าง new query tab → paste `supabase-update-v8.0-card-print-lock.sql`
- Run → Success. No rows returned
- สร้าง: table `card_print_locks`, `card_print_locks_archive`, trigger, functions, RLS, Realtime, indexes

**2. Run SQL v8.1 บน Production Supabase**
- สร้าง new query tab → paste `supabase-update-v8.1-fuzzy-search.sql`
- Run → Success. No rows returned
- สร้าง: extension `pg_trgm`, GIN indexes, function `search_receipts_fuzzy()`

**3. Verification**
- Run verification query → ยืนยัน 15 objects ครบทั้งหมด:
  - 2 tables: card_print_locks, card_print_locks_archive
  - 3 functions: normalize_appointment_id, cleanup_old_card_locks, search_receipts_fuzzy
  - 1 extension: pg_trgm
  - 9 indexes: card_print_locks (4) + archive (3) + trgm (2)

**4. Documentation Update**
- อัพเดท CHANGELOG.md — SQL migration status เป็น ✅ Done
- อัพเดท DEVELOPMENT_ROADMAP.md — deploy checklist ✅ COMPLETED, SQL status ✅ Done
- อัพเดท SESSION_LOG.md — เพิ่ม session นี้
- อัพเดท MEMORY.md — SQL status

### สรุป
- ✅ SQL v8.0 + v8.1 run บน Production สำเร็จ
- ✅ ยืนยัน 15 objects สร้างครบ
- ✅ Documentation อัพเดทครบ
- ⏸️ v7.0 E-Sign ยังคง On Hold (รอ hardware testing)
- ⏳ pg_cron cleanup job ยังไม่ได้ schedule (แนะนำ: `cron.schedule('cleanup-card-locks', '0 0 * * *', 'SELECT cleanup_old_card_locks()')`)
- ⏳ 38 deleted records recovery ยังรอ staff input

---

## 11 กุมภาพันธ์ 2569 — Quick Wins v8.2.0 Development + SIT Testing

### สิ่งที่ทำ

**1. Q1+Q2: ปรับชื่อระบบหน้า Login**
- `login.html`: เปลี่ยนชื่อ → "ระบบสร้างแบบฟอร์มการรับบัตร BOI"
- Subtitle → "ศูนย์บริการ EWP"
- Footer → "© 2026 EWP Service Center"

**2. Q3: เปลี่ยน "ล็อก" → "จอง" ทั้งระบบ**
- `index.html`: เมนู "จองการพิมพ์บัตร"
- `card-print.html`: title, H1, H2, ปุ่ม, kbd hint, empty state (6 จุด)
- `card-print-app.js`: toast, status badges, warnings (9 จุด)

**3. Q4: Session Timeout 15 นาที**
- `js/auth.js`: เพิ่ม ~50 lines — passive listeners + setInterval check
- Warning ที่ 14 นาที, force logout ที่ 15 นาที

**4. Q5: Realtime Typing Indicator**
- `card-print.html`: CSS styles + HTML div
- `card-print-app.js`: ~90 lines — setupTypingBroadcast(), sendTypingEvent(), sendIdleEvent(), updateTypingIndicator()
- ใช้ Supabase Realtime Broadcast (ไม่ผ่าน DB)
- Conflict detection สีแดง ⚠️ เมื่อ 2 คนกรอกเลขเดียวกัน

**5. Cache Bust + Version Badge**
- `index.html`: ?v=8.1 → ?v=8.2 (5 จุด)
- `card-print.html`: ?v=8.0 → ?v=8.2 (4 จุด) + version badge v8.2

**6. Q6: pg_cron Cleanup Job บน SIT Supabase**
- CREATE EXTENSION pg_cron
- cron.schedule('cleanup-card-locks', '0 0 * * *', 'SELECT cleanup_old_card_locks()')
- Verified: jobid=1, active=true

### Testing (SIT — localhost:8899?env=sit)
- ✅ Q1+Q2: login page แสดงถูกต้อง
- ✅ Q3: card-print ทุกจุดเปลี่ยนเป็น "จอง"
- ✅ Q4: Console "Session timeout armed (15 min)"
- ✅ Q5: Typing indicator แสดง + Conflict สีแดง ⚠️
- ✅ Q6: pg_cron job active บน SIT

### สรุป
- ✅ Quick Wins Q1-Q6 ครบทั้งหมด
- ✅ ทดสอบบน SIT ผ่านทุกข้อ
- ⏳ Deploy Production + pg_cron บน Production รอดำเนินการ
