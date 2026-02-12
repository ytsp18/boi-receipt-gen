# Sprint Plan — BOI Work Permit Receipt System

> อัพเดต: 13 กุมภาพันธ์ 2569
> Branch: `sit` → Cloudflare Pages auto-deploy
> SIT URL: `boi-receipt-gen-sit.pages.dev`

---

## 🔴 Priority 1 — ก่อน MD (วันเสาร์) ✅ เสร็จแล้ว

| # | รายการ | สถานะ | Commit |
|---|--------|--------|--------|
| 1.1A | Batch Print Tooltip (checkbox ครั้งแรก) | ✅ เสร็จ | `6855916` |
| 1.1B | User Management Hints (เข้าครั้งแรก + approve + role tooltip) | ✅ เสร็จ | `6855916` |
| 1.1C | First-time Onboarding Toast | ✅ เสร็จ | `6855916` |
| 1.2 | SN Duplicate + branch_code (SQL RPC + warning message) | ✅ เสร็จ | `6855916` + SQL on SIT |
| 1.3 | Monthly Report Reminder (วันที่ ≥ 25) | ✅ เสร็จ | `6855916` |
| — | SQL migration file อัพเดท | ✅ เสร็จ | `1a95103` |

### Bug Fixes (พบระหว่าง SIT Testing)

| # | รายการ | สถานะ | Commit |
|---|--------|--------|--------|
| BF1 | Reset Password "requires an email" — สร้าง RPC `get_user_email()` + แก้ `handleResetPassword()` | ✅ แก้แล้ว | `68dcc08` + SQL on SIT |
| BF2 | Role Description Tooltip ล้นกล่อง — `max-width:250px` + `word-break` | ✅ แก้แล้ว | `68dcc08` |
| BF3 | Browser autofill — เพิ่ม `autocomplete` attribute ทุก password field | ✅ แก้แล้ว | `68dcc08` |

---

## 🟠 Priority 2 — Card Issuance Work Dashboard (ใหม่)

### 2.1 Context & Data Source
- Dashboard แสดงสถิติการออกบัตรใบอนุญาตทำงาน
- Data: Excel SW Report — 11 columns, daily card issuance records

### 2.2 Database Design — ตาราง card_issuance

```sql
CREATE TABLE card_issuance (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    appointment_id TEXT,
    form_id TEXT,
    form_obj_type TEXT,           -- REQUEST / RENEW_REQ
    branch_id UUID REFERENCES branches(id),
    branch_code TEXT,             -- denormalized for quick filter
    alien_card_id TEXT,
    workpermit_no TEXT,
    serial_number TEXT,
    print_status TEXT DEFAULT 'G', -- G=Good, B=Bad
    reject_type TEXT,
    officer_id TEXT,              -- os_id from SW system
    issued_at TIMESTAMPTZ,       -- create_date from SW
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(appointment_id, serial_number)
);

ALTER TABLE card_issuance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "card_issuance_select" ON card_issuance FOR SELECT USING (
    branch_id = get_user_branch_id(auth.uid()) OR is_super_admin(auth.uid())
);

CREATE INDEX idx_card_issuance_branch_date ON card_issuance(branch_id, issued_at);
CREATE INDEX idx_card_issuance_serial ON card_issuance(serial_number);
```

### 2.3 Data Import — CSV Upload UI
- หน้า: เพิ่ม tab "นำเข้าข้อมูล" ใน Dashboard page
- Flow: Upload Excel/CSV → Parse client-side (SheetJS) → Preview → Confirm → Insert to Supabase
- Mapping: Auto-map `branch_code` → `branch_id` จาก branches table
- Dedup: `UNIQUE(appointment_id, serial_number)` — skip duplicates on insert

### 2.4 Dashboard Page — `dashboard.html` (หน้าใหม่)

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Header: Dashboard การออกบัตร                      │
│  Filters: [วันที่เริ่ม] [วันที่สิ้นสุด] [สาขา▼]      │
│  Quick: [วันนี้] [7 วัน] [30 วัน] [รีเซ็ต]          │
├─────────────────────────────────────────────────┤
│  KPI Cards Row (4 cards):                        │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐           │
│  │บัตรทั้งหมด│ │บัตรสำเร็จ(G)│ │บัตรเสีย(B)│ │ %สำเร็จ │           │
│  └──────┘ └──────┘ └──────┘ └──────┘           │
├─────────────────────────────────────────────────┤
│  Chart 1: รายวัน (Mixed Bar+Line)                 │
├──────────────────────┬──────────────────────────┤
│  Chart 2: ประเภทคำร้อง  │  Chart 3: สถานะพิมพ์       │
├──────────────────────┴──────────────────────────┤
│  Chart 4: ผลงานเจ้าหน้าที่ (Horizontal Bar)        │
├─────────────────────────────────────────────────┤
│  Table: รายละเอียด (sortable, searchable)          │
└─────────────────────────────────────────────────┘
```

**KPI Card Design:** Border-left 4px สี, Fixed height 140px, Icon + Large number + Label

**Charts (ECharts):**
1. Daily Mixed Chart — Stacked bar (REQUEST/RENEW_REQ/Bad) + Line (total)
2. Form Type Pie — REQUEST vs RENEW_REQ
3. Print Status Pie — Good vs Bad
4. Officer Performance Bar — Horizontal bar per officer

**Filters:** Date range, Branch dropdown, Quick buttons (วันนี้, 7วัน, 30วัน, รีเซ็ต)

### 2.5 Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `dashboard.html` | สร้างใหม่ | Dashboard page + ECharts CDN |
| `js/dashboard-app.js` | สร้างใหม่ | Dashboard logic, charts, filters, data import |
| `js/supabase-config.js` | แก้ไข | เพิ่ม `SupabaseCardIssuance` module |
| `js/supabase-adapter.js` | แก้ไข | เพิ่ม functions: loadCardIssuance, getCardIssuanceStats |
| `index.html` | แก้ไข | เพิ่ม link ไป dashboard.html ใน nav |
| `landing.html` | แก้ไข | เพิ่ม link ไป dashboard |
| SQL migration | รัน | CREATE TABLE card_issuance + RLS + indexes |

---

## 🟡 Priority 3 — Pre-Production

| # | รายการ | สถานะ |
|---|--------|--------|
| 3.1 | Onboarding Flow (ทำแล้วใน P1) | ✅ เสร็จ |
| 3.2 | Activity Log UI (backend มีแล้ว ขาด UI) | [ ] รอ |
| 3.3 | Super Admin Dashboard Overview | [ ] รอ |

---

## 🟢 Priority 4 — Post-MD Roadmap

| Item | Priority | Effort |
|------|----------|--------|
| Production deploy v9.0 (SQL migration + merge) | สูง | 2-3 ชม. |
| Capacity monitoring per branch | กลาง | 1 วัน |
| Backup/Recovery procedure | กลาง | ครึ่งวัน |
| Performance monitoring (slow query alerts) | ต่ำ | 1 วัน |
| Offline mode / PWA | ต่ำ | 2-3 วัน |
| Role-based feature toggle UI | ต่ำ | 1 วัน |
