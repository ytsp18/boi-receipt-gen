# Version 1.0 - Basic Web App
## Backup Date: 4 Feb 2026

## Features in this version:
1. Form Panel - กรอกข้อมูล + อัพโหลดรูป
2. Preview Panel - ดูตัวอย่างใบรับ
3. Print - พิมพ์ใบรับบัตร Work Permit
4. Daily Summary - สรุปรายวัน (ผลิต, พิมพ์, รับบัตร)
5. Search & Filter - ค้นหาและกรองข้อมูล
6. Export CSV/PDF - ส่งออกรายงาน
7. Print Tracking - บันทึกสถานะพิมพ์ (LocalStorage)
8. Card Received - ติ๊กสถานะรับบัตร (LocalStorage)

## Data Source:
- Mock Data (ข้อมูลจำลองใน JavaScript)
- ยังไม่เชื่อมต่อ Google Sheets API

## Files:
- index.html - Main HTML
- style.css - CSS Styles
- app.js - JavaScript Logic

## To Restore:
```bash
cp backups/v1.0-basic/index.html ./
cp backups/v1.0-basic/style.css css/
cp backups/v1.0-basic/app.js js/
```
