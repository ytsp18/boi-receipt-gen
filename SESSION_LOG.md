# Session Log - Work Permit Receipt System

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

> ⚠️ **ต้องทำใน Supabase Dashboard:**
> 1. เปลี่ยน Admin Password
> 2. ตรวจสอบ RLS Policies
> 3. เพิ่ม Rate Limiting (ถ้าต้องการ)

---

## Session End (v5.1.1)
- **Status:** Security Hardening เรียบร้อย
- **Current Version:** 5.1.1
- **Live URL:** https://receipt.fts-internal.com

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
| **5.1.1** | **Security Audit & Hardening** |
