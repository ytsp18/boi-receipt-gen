# DECISION-LOG.md — Architecture Decision Records

> บันทึกเหตุผลการตัดสินใจสำคัญของโปรเจกต์ เพื่อให้ทีมเข้าใจว่า "ทำไม" ไม่ใช่แค่ "อะไร"

## สารบัญ

| # | วันที่ | การตัดสินใจ | ผลกระทบ |
|---|--------|-----------|---------|
| D01 | 5 ก.พ. 69 | ใช้ Vanilla JS ไม่ใช้ Framework | สูง |
| D02 | 5 ก.พ. 69 | ใช้ Supabase ไม่ใช่ Firebase | สูง |
| D03 | 5 ก.พ. 69 | Host บน GitHub Pages | ปานกลาง |
| D04 | 10 ก.พ. 69 | RLS-first Security | สูง |
| D05 | 10 ก.พ. 69 | Branch-scoped RLS | สูง |
| D06 | 11 ก.พ. 69 | SECURITY DEFINER RPC สำหรับ cross-branch | ปานกลาง |
| D07 | 12 ก.พ. 69 | Cloudflare Pages สำหรับ SIT | ต่ำ |
| D08 | 12 ก.พ. 69 | Hostname auto-detect สำหรับ environment | ปานกลาง |
| D09 | 13 ก.พ. 69 | Supabase Transfer (ไม่ Clone) | สูง |
| D10 | 13 ก.พ. 69 | SIT/Production คนละ org | ปานกลาง |
| D11 | 13 ก.พ. 69 | SQL migration ก่อน code deploy | สูง |

---

## D01: Vanilla JavaScript (ไม่ใช้ Framework)

**วันที่:** 5 กุมภาพันธ์ 2569
**สถานะ:** ✅ Active

**Context:**
ต้องการสร้าง web app สำหรับ BOI ที่ deploy ง่าย ไม่มี build step

**ทางเลือก:**
| ตัวเลือก | ข้อดี | ข้อเสีย |
|----------|-------|---------|
| **Vanilla JS** ← เลือก | No build step, deploy ไป static hosting ได้เลย, เรียนรู้ง่าย | ไม่มี component system, จัดการ state ยาก, ไฟล์ใหญ่ |
| React | Component-based, ecosystem ใหญ่ | ต้อง build, ต้อง Node.js, learning curve |
| Vue | เบากว่า React, template-based | ยังต้อง build system |

**เหตุผล:**
- GitHub Pages = static hosting → ไม่มี server-side processing
- ทีมไม่มีประสบการณ์ React/Vue
- App ไม่ได้ซับซ้อนจนต้องใช้ framework (หลักๆ คือ CRUD + print)
- Deploy = push to git → auto-deploy ทันที

**ผลที่ตามมา:**
- ไฟล์ `app-supabase.js` ใหญ่มาก (~4,741 บรรทัด) เพราะไม่มี component แยก
- ต้องใช้ `window.xxx` สำหรับ onclick handlers
- State management = object literal ธรรมดา

---

## D02: Supabase (ไม่ใช่ Firebase)

**วันที่:** 5 กุมภาพันธ์ 2569
**สถานะ:** ✅ Active

**Context:**
ต้องการ Backend-as-a-Service ที่รองรับ auth + database + storage

**ทางเลือก:**
| ตัวเลือก | ข้อดี | ข้อเสีย |
|----------|-------|---------|
| **Supabase** ← เลือก | PostgreSQL + RLS, SQL migrations, Realtime, open source | Community เล็กกว่า Firebase |
| Firebase | Community ใหญ่, Google Cloud integration | NoSQL (Firestore), RLS ไม่มี, pricing complex |
| Custom backend | Full control | ต้องเขียน+deploy+maintain เอง |

**เหตุผล:**
- PostgreSQL = relational data (receipts, profiles, branches) เหมาะกว่า NoSQL
- RLS (Row Level Security) = security ที่ database level → ไม่ต้องเขียน auth middleware
- SQL migrations = version control ของ DB schema
- Free tier พอสำหรับ production ระดับ 1 สาขา

---

## D04: RLS-first Security

**วันที่:** 10 กุมภาพันธ์ 2569
**สถานะ:** ✅ Active

**Context:**
ต้องการป้องกันไม่ให้ user เห็นข้อมูลสาขาอื่น (multi-branch)

**ทางเลือก:**
| ตัวเลือก | ข้อดี | ข้อเสีย |
|----------|-------|---------|
| **RLS at DB level** ← เลือก | ป้องกันที่ source, ไม่ว่า client จะเรียก API ยังไงก็ไม่รั่ว | ซับซ้อน, debug ยาก, test ยาก |
| App-level filtering | เขียนง่าย, debug ง่าย | ไม่ปลอดภัย ถ้า client bypass API, data leak risk |

**เหตุผล:**
- Supabase client library เรียก DB ตรง → ถ้าไม่มี RLS ใครก็ query ได้ทุกอย่าง
- RLS = "defense in depth" → แม้โค้ด client มี bug ก็ไม่รั่ว
- Multi-branch data isolation เป็น critical requirement

**ผลที่ตามมา:**
- ต้องสร้าง helper functions (`is_super_admin()`, `get_user_branch_id()`) เป็น SECURITY DEFINER
- Debug RLS policies ยาก → ต้อง test ผ่าน Supabase dashboard
- Cross-branch queries (เช่น SN duplicate check) ต้องใช้ SECURITY DEFINER RPC

---

## D06: SECURITY DEFINER RPC สำหรับ cross-branch access

**วันที่:** 11 กุมภาพันธ์ 2569
**สถานะ:** ✅ Active

**Context:**
RLS block cross-branch SELECT → SN duplicate check ไม่ทำงาน (CMI user เช็ค BKK ไม่ได้)

**ทางเลือก:**
| ตัวเลือก | ข้อดี | ข้อเสีย |
|----------|-------|---------|
| **SECURITY DEFINER RPC** ← เลือก | ปลอดภัย, controlled access, ไม่ต้องแก้ RLS | ต้องสร้าง function ใหม่ทุกครั้ง |
| Loosen RLS policies | ง่าย, ไม่ต้องสร้าง function | ลด security → user อาจเห็นข้อมูลสาขาอื่นไม่ตั้งใจ |
| Service role key in client | เข้าถึงทุกอย่าง | อันตรายมาก — expose service key = ไม่มี security เลย |

**เหตุผล:**
- SECURITY DEFINER ทำงานในสิทธิ์ของ function owner (postgres) → bypass RLS
- แต่ function กำหนดได้ว่า return อะไร → ไม่ expose data ทั้งหมด
- ใส่ permission check ใน function ได้ (เช่น ต้องเป็น authenticated)

**ใช้กับ:**
- `check_sn_duplicate(text, text)` — ตรวจ SN ซ้ำข้ามสาขา
- `get_user_email(uuid)` — ดึง email จาก auth.users (admin only)
- `is_admin()` — เช็ค role โดยไม่เกิด RLS recursion

---

## D09: Supabase Transfer (ไม่ Clone)

**วันที่:** 13 กุมภาพันธ์ 2569
**สถานะ:** ⏳ Pending execution (P0 — ก่อนเสาร์)

**Context:**
Production project อยู่ใน org FTS (Free plan) → ต้องย้ายไป org ytsp18 (Pro plan) เพื่อ daily backup + higher limits

**ทางเลือก:**
| ตัวเลือก | ข้อดี | ข้อเสีย |
|----------|-------|---------|
| **Transfer project** ← เลือก | URL/keys ไม่เปลี่ยน, zero downtime, ข้อมูลครบ | Project หายจาก source org |
| Clone + create new | SIT ยังอยู่เดิม | URL/keys เปลี่ยน, ต้องแก้ config, migrate users ยาก |
| Stay on Free | ไม่ต้องทำอะไร | ไม่มี daily backup, rate limits, อาจ pause |

**เหตุผล:**
- Transfer = ย้าย project ทั้งก้อน → Auth users, data, RLS, Storage ไม่เปลี่ยน
- URL/API keys คงเดิม → ไม่ต้องแก้ `supabase-config.js`
- SIT อยู่คนละ org ได้ (Supabase billing = per-org)

---

## D11: SQL Migration ก่อน Code Deploy

**วันที่:** 13 กุมภาพันธ์ 2569
**สถานะ:** ⏳ Pending execution (P2 — เสาร์บ่าย)

**Context:**
v9.0 ต้อง run SQL migration (สร้าง branches table, เพิ่ม columns, เปลี่ยน RLS) ก่อน deploy code ใหม่

**ทางเลือก:**
| ตัวเลือก | ข้อดี | ข้อเสีย |
|----------|-------|---------|
| **SQL first → Code second** ← เลือก | Code v8.6.2 เดิมยังทำงานได้, ทดสอบ DB แยกได้ | ต้อง verify ว่า RLS ใหม่ไม่ break code เก่า |
| Code + SQL พร้อมกัน | ทำครั้งเดียว | ถ้าพัง ไม่รู้ว่าเพราะ SQL หรือ Code |
| Code first → SQL second | - | **อันตรายมาก** — code ใหม่เรียก branches table ที่ยังไม่มี → crash ทั้ง app |

**เหตุผล:**
- Code v8.6.2 ไม่รู้จัก branches table, branch_id columns → ignore ได้
- SQL migration auto-assign `branch_id = BKK` ให้ data เดิม → RLS ใหม่ยังเห็นข้อมูล
- ถ้า SQL ล้มเหลว → rollback ได้ง่าย (ยังไม่ deploy code)
- แยกขั้นตอน = ลดความเสี่ยง + debug ง่ายกว่า
