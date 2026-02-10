# แผนทดสอบความปลอดภัย — v7.0 E-Sign Workflow

> สร้าง: 10 กุมภาพันธ์ 2569
> สถานะ: ยังไม่ได้ทดสอบ — ทดสอบก่อน deploy production
> เป้าหมาย: ตรวจสอบว่า v7.0 features ไม่สร้างช่องโหว่ด้านความปลอดภัย

---

## 1. Authentication & Authorization

### 1.1 Environment Switching Security

| # | Test Case | วิธีทดสอบ | คาดหวัง | สถานะ |
|---|-----------|-----------|---------|-------|
| A1 | `?env=invalid` ไม่ทำให้ระบบพัง | เข้า `index.html?env=hacked` | Fallback ไปใช้ production (default) | ❌ |
| A2 | SIT env ไม่เข้าถึง production data | Login บน `?env=sit` → ดูข้อมูล | เห็นเฉพาะ SIT data | ❌ |
| A3 | Production env ไม่เข้าถึง SIT data | Login บน production → ดูข้อมูล | ไม่เห็น SIT data | ❌ |
| A4 | ไม่มี Cross-environment data leak | เปิด 2 tab: SIT + Production พร้อมกัน | แต่ละ tab ดึงข้อมูลแยกกัน | ❌ |

### 1.2 Session Security (v7.0 bug fixes)

| # | Test Case | วิธีทดสอบ | คาดหวัง | สถานะ |
|---|-----------|-----------|---------|-------|
| A5 | Session ไม่ leak userId | ดู console/network tab | ไม่มี userId ใน URL params | ❌ |
| A6 | Expired session → redirect login | รอ session หมดอายุ → กด save | Redirect ไป login ไม่ error | ❌ |
| A7 | Invalid session → ไม่ execute actions | แก้ session cookie ให้ invalid → กด save | ได้ error message ไม่ execute | ❌ |

---

## 2. Supabase RLS (Row Level Security)

### 2.1 Profiles Table

| # | Test Case | วิธีทดสอบ | คาดหวัง | สถานะ |
|---|-----------|-----------|---------|-------|
| R1 | `is_admin()` function ทำงานถูกต้อง | Admin user → query all profiles | ได้ทุก profile | ❌ |
| R2 | Non-admin ไม่เห็น profile คนอื่น | Staff user → query all profiles | ได้เฉพาะ profile ตัวเอง | ❌ |
| R3 | Non-admin แก้ไข profile คนอื่นไม่ได้ | Staff → UPDATE profiles SET role='admin' WHERE id=other | Error: RLS violation | ❌ |
| R4 | `is_admin()` ไม่มี infinite recursion | Admin → query profiles | ไม่มี "infinite recursion" error | ✅ (SIT) |
| R5 | Anonymous user ไม่เข้าถึง profiles | ไม่ login → query profiles | Error: ไม่มีสิทธิ์ | ❌ |

### 2.2 Receipts Table (v7.0 new fields)

| # | Test Case | วิธีทดสอบ | คาดหวัง | สถานะ |
|---|-----------|-----------|---------|-------|
| R6 | Authenticated user อ่าน receipt ได้ | Login → query receipts | อ่านได้ทุก receipt | ❌ |
| R7 | Authenticated user เขียน photo URL ได้ | Save receipt with recipient_photo_url | บันทึกสำเร็จ | ❌ |
| R8 | Authenticated user เขียน signature URL ได้ | Save receipt with recipient_signature_url | บันทึกสำเร็จ | ❌ |
| R9 | Anonymous user เข้าถึง receipts ไม่ได้ | ไม่ login → query receipts | Error: ไม่มีสิทธิ์ | ❌ |
| R10 | Non-admin ลบ receipt ไม่ได้ | Staff → DELETE receipt | Error: RLS violation | ❌ |

### 2.3 Officer Signature (Profiles)

| # | Test Case | วิธีทดสอบ | คาดหวัง | สถานะ |
|---|-----------|-----------|---------|-------|
| R11 | User อัพเดท signature ตัวเองได้ | Save officer signature → check profiles | signature_url อัพเดท | ✅ (SIT) |
| R12 | User อัพเดท signature คนอื่นไม่ได้ | Staff A → UPDATE profiles SET signature_url WHERE id=B | Error: RLS violation | ❌ |

---

## 3. Storage Security

### 3.1 Supabase Storage Bucket (`card-images`)

| # | Test Case | วิธีทดสอบ | คาดหวัง | สถานะ |
|---|-----------|-----------|---------|-------|
| S1 | Authenticated user upload photo ได้ | Upload ภาพถ่ายผู้รับ | Upload สำเร็จ | ❌ |
| S2 | Authenticated user upload signature ได้ | Upload ลายเซ็น PNG | Upload สำเร็จ | ❌ |
| S3 | Anonymous user upload ไม่ได้ | ไม่ login → POST to storage | Error: 401 | ❌ |
| S4 | File type validation (photo) | Upload .exe rename เป็น .jpg | ถูก reject หรือ safe | ❌ |
| S5 | File type validation (signature) | Upload .html rename เป็น .png | ถูก reject หรือ safe | ❌ |
| S6 | File size limit | Upload ไฟล์ 50MB | ถูก reject | ❌ |
| S7 | Path traversal ใน filename | Upload file ชื่อ `../../etc/passwd.jpg` | Filename ถูก sanitize | ❌ |

### 3.2 Public URL Exposure

| # | Test Case | วิธีทดสอบ | คาดหวัง | สถานะ |
|---|-----------|-----------|---------|-------|
| S8 | Public URL ไม่ list ไฟล์ทั้งหมด | เข้า `{storage_url}/card-images/` | ไม่ list directory | ❌ |
| S9 | Photo URL มี random path | ตรวจ URL ของ photo ที่ upload | ไม่ predictable (มี receipt_no ที่เดาได้) | ❌ |
| S10 | Officer signature URL ไม่ exposed | ตรวจ network tab | URL ส่งเฉพาะเมื่อจำเป็น | ❌ |

---

## 4. Input Validation & XSS Prevention

### 4.1 Webcam Data

| # | Test Case | วิธีทดสอบ | คาดหวัง | สถานะ |
|---|-----------|-----------|---------|-------|
| X1 | Photo data URL ถูก validate | แก้ data URL เป็น `javascript:alert(1)` | ถูก reject | ❌ |
| X2 | Photo ถูก compress ก่อน upload | ส่ง raw 2K image | ถูก compress ≤1280px | ❌ |
| X3 | deviceId ถูก validate | แก้ deviceId เป็น script injection | ถูก sanitize | ❌ |

### 4.2 Signature Data

| # | Test Case | วิธีทดสอบ | คาดหวัง | สถานะ |
|---|-----------|-----------|---------|-------|
| X4 | Signature PNG data ถูก validate | แก้ toDataURL output เป็น malicious | ถูก reject | ❌ |
| X5 | Empty signature ถูก block | กด save โดยไม่เซ็น | แจ้งเตือน "กรุณาเซ็นชื่อ" | ❌ |
| X6 | Officer signature URL ถูก sanitize | แก้ signature_url ใน DB เป็น XSS payload | ไม่ execute script | ❌ |

### 4.3 Receipt Preview & Print

| # | Test Case | วิธีทดสอบ | คาดหวัง | สถานะ |
|---|-----------|-----------|---------|-------|
| X7 | Photo `<img src>` ใน preview ถูก sanitize | ใส่ `onerror=alert(1)` ใน src | ไม่ execute | ❌ |
| X8 | Signature `<img src>` ใน print ถูก sanitize | ใส่ XSS ใน officer_signature_url | ไม่ execute | ❌ |
| X9 | `sanitizeHTML()` ครอบคลุม v7.0 fields | ตรวจโค้ดว่า fields ใหม่ผ่าน sanitize | ใช้ sanitizeHTML() ทุกจุด | ❌ |

---

## 5. Data Integrity

### 5.1 Upload & Save Consistency

| # | Test Case | วิธีทดสอบ | คาดหวัง | สถานะ |
|---|-----------|-----------|---------|-------|
| D1 | Photo upload + DB save atomic | ปิด internet ขณะ upload | ไม่มี orphan file / dangling URL | ❌ |
| D2 | Signature upload + DB save atomic | ปิด internet ขณะ upload | ไม่มี orphan file / dangling URL | ❌ |
| D3 | 3 uploads parallel (Promise.all) | Save receipt ปกติ | photo + recipient sig + officer sig upload สำเร็จ | ❌ |
| D4 | Partial upload failure → rollback | 1 ใน 3 uploads fail | แจ้งเตือน user, ไม่ save ข้อมูลครึ่งๆ | ❌ |

### 5.2 Photo & Signature Integrity

| # | Test Case | วิธีทดสอบ | คาดหวัง | สถานะ |
|---|-----------|-----------|---------|-------|
| D5 | Photo ตรงกับ receipt | Save → reload → ดู preview | รูปถ่ายตรงกับ receipt ที่บันทึก | ❌ |
| D6 | Officer signature ตรงกับ user | Login user A → save → check officer_signature_url | ตรงกับ signature ของ user A | ❌ |
| D7 | Signature ไม่ถูก overwrite ข้าม user | User A + B save พร้อมกัน | แต่ละ receipt มี officer_signature ของคนที่ save | ❌ |

---

## 6. CDN & External Library Security

### 6.1 signature_pad Library

| # | Test Case | วิธีทดสอบ | คาดหวัง | สถานะ |
|---|-----------|-----------|---------|-------|
| L1 | CDN URL ถูกต้อง | ตรวจ URL ใน index.html | jsDelivr official URL | ❌ |
| L2 | SRI hash (Subresource Integrity) | ตรวจ `<script>` tag | มี integrity + crossorigin | ❌ |
| L3 | Fallback เมื่อ CDN ไม่ตอบ | Block CDN URL → โหลดหน้า | แจ้ง error ไม่พัง app ทั้งหมด | ❌ |
| L4 | Library version ไม่มี known CVE | ตรวจ npm audit / Snyk | ไม่มี critical/high vulnerability | ❌ |

---

## 7. Privacy & PDPA Compliance

### 7.1 Photo Privacy

| # | Test Case | วิธีทดสอบ | คาดหวัง | สถานะ |
|---|-----------|-----------|---------|-------|
| P1 | Photo ไม่ถูกเก็บ client-side | ดู localStorage/sessionStorage/IndexedDB | ไม่มี photo data เก็บ local | ❌ |
| P2 | Webcam stream หยุดหลังถ่ายรูป | ถ่ายรูป → ดู camera LED/indicator | กล้องดับหลัง capture | ❌ |
| P3 | Webcam stream หยุดเมื่อ leave page | เปลี่ยนหน้า → ดู camera LED | กล้องดับ | ❌ |
| P4 | Photo ถูก compress ลด identifiable detail | เปรียบเทียบ raw vs compressed | ยัง identify ตัวคนได้ แต่ลด metadata | ❌ |

### 7.2 Signature Privacy

| # | Test Case | วิธีทดสอบ | คาดหวัง | สถานะ |
|---|-----------|-----------|---------|-------|
| P5 | Signature ไม่ถูกเก็บ client-side | ดู localStorage/sessionStorage | ไม่มี signature data เก็บ local | ❌ |
| P6 | Officer signature ไม่ cached ข้าม session | Logout → login user B → ดู form | ไม่เห็น signature ของ user A | ❌ |

---

## 8. Browser Security

### 8.1 getUserMedia (Webcam)

| # | Test Case | วิธีทดสอบ | คาดหวัง | สถานะ |
|---|-----------|-----------|---------|-------|
| B1 | HTTPS required สำหรับ webcam | เข้าผ่าน HTTP (ไม่ใช่ localhost) | getUserMedia ถูก block | ❌ |
| B2 | Permission prompt แสดงถูกต้อง | กดเปิดกล้อง → ดู browser prompt | แสดง permission dialog | ❌ |
| B3 | Permission denied → fallback | ปฏิเสธ camera permission | แสดงข้อความ "ไม่สามารถเปิดกล้อง" | ❌ |
| B4 | Camera list ไม่ leak device info | ตรวจ console | ไม่ log deviceId/label โดยไม่จำเป็น | ❌ |

### 8.2 Content Security Policy

| # | Test Case | วิธีทดสอบ | คาดหวัง | สถานะ |
|---|-----------|-----------|---------|-------|
| B5 | CSP header (ถ้ามี) allow CDN | ตรวจ response headers | CDN URLs อยู่ใน allowed sources | ❌ |
| B6 | data: URL allowed สำหรับ img src | ตรวจ CSP | `img-src: data:` allowed | ❌ |
| B7 | blob: URL allowed สำหรับ webcam | ตรวจ CSP | `media-src: blob:` allowed | ❌ |

---

## 9. Known Issues from v6.x (ยังไม่แก้)

| ID | Severity | ปัญหา | ส่งผลต่อ v7.0? |
|----|----------|-------|----------------|
| S2 | Medium | Supabase anon key ใน HTML | ไม่เพิ่มความเสี่ยง (RLS เป็น boundary) |
| S3 | Medium | Analytics INSERT policy กว้างเกินไป | ไม่เกี่ยวกับ v7.0 |
| C1 | Medium | JsBarcode CDN ไม่มี SRI hash | ไม่เกี่ยวกับ v7.0 |
| C2 | Medium | Supabase CDN ไม่มี SRI hash | ไม่เกี่ยวกับ v7.0 |
| **NEW** | Medium | **signature_pad CDN ไม่มี SRI hash** | **ต้องเพิ่มก่อน deploy** |

---

## 10. Test Environment

| รายการ | ค่า |
|--------|-----|
| SIT Supabase | `https://cctzbereqvuaunweuqho.supabase.co` |
| Local Server | `python3 -m http.server 8080` |
| URL | `http://localhost:8080/index.html?env=sit` |
| Test User | `adminsit@boireciptgen.go.th` |
| Browser | Chrome (latest) |
| Hardware | RAPOO C280 USB webcam (ต้องทดสอบ) |

---

## 11. Risk Summary

| ระดับ | จำนวน Test Cases | คำอธิบาย |
|-------|-----------------|----------|
| Critical | 5 | Auth bypass, RLS violation, data leak |
| High | 12 | Storage security, XSS, input validation |
| Medium | 18 | Privacy, CDN integrity, data consistency |
| Low | 10 | Browser compat, edge cases, UI feedback |
| **รวม** | **45** | |

### Action Required ก่อน Deploy Production
1. ผ่าน test cases ระดับ Critical ทั้ง 5 ข้อ
2. ผ่าน test cases ระดับ High ทั้ง 12 ข้อ
3. ผ่าน test cases ระดับ Medium อย่างน้อย 80%
4. เพิ่ม SRI hash สำหรับ signature_pad CDN
5. ตรวจสอบ Storage policies สำหรับ folder ใหม่
6. Run `is_admin()` function บน Production Supabase
