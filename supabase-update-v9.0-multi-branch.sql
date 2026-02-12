-- ============================================================
-- v9.0 - Multi-Branch & User Management
-- ============================================================
-- Purpose: Add multi-branch support with data isolation via RLS.
--          Each branch sees only its own data. Super Admin sees all.
-- Date: 2026-02-12
-- Tables created: branches
-- Tables altered: profiles, receipts, card_print_locks,
--                 card_print_locks_archive, activity_logs, ux_analytics
-- Functions: get_user_branch_id(), is_super_admin(), is_branch_head()
-- RLS: All existing policies replaced with branch-scoped versions
--
-- Prerequisites:
--   - All tables from v5.1 through v8.5 must exist
--   - Run on SIT first (?env=sit), NOT production
--
-- Execution: Run all sections sequentially in Supabase SQL Editor.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. CREATE branches TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.branches (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    province_code TEXT NOT NULL,
    name_th TEXT NOT NULL,
    name_en TEXT NOT NULL,
    address_th TEXT,
    address_en TEXT,
    max_capacity INT DEFAULT 160,
    features JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. SEED BRANCH DATA
-- ============================================================
-- Source: Data Master Branch.xlsx
-- Non-mobile branches seeded directly from Excel.
-- Mobile branches: MB-001 through MB-008 (generic).
-- 4 receipt-enabled branches:
--   BKK-SC-M-001, CBI-SC-S-001, CMI-SC-M-001, PKT-SC-S-001
-- max_capacity from size code: L=700, M=320, S=160
-- ============================================================

-- 2a. Non-mobile branches (SC, OB, HQ)
INSERT INTO public.branches (code, province_code, name_th, name_en, address_th, address_en, max_capacity, features, display_order) VALUES

-- BKK Head Office
('BKK-HQ-001', 'BKK', 'สำนักงานใหญ่ ศูนย์กำกับและควบคุมการปฎิบัติงาน', 'Operations Supervision and Control Center (Head Office)', 'อาคารสกายไนน์ ชั้น 15 เลขที่ 554 ถนน อโศก-ดินแดง แขวงดินแดง เขตดินแดง จังหวัดกรุงเทพมหานคร 10400', 'Skyy9 Building, 15th Floor, No. 554, Asoke-Din Daeng Road, Din Daeng Sub-District, Din Daeng District, Bangkok 10400', 160, '{}', 1),

-- BKK Service Centers — BKK-SC-M-001 is receipt-enabled (current branch)
('BKK-SC-M-001', 'BKK', 'ศูนย์บริการวีซ่าและใบอนุญาตทํางาน อาคาร one bangkok', 'Bangkok Visa and Work Permit Service Center One Bangkok', 'อาคารจัตุรัสจามจุรี ชั้น 18 เลขที่ 319 ถนนพญาไท เขตปทุมวัน แขวงปทุมวัน กรุงเทพมหานคร 10330', 'Chamchuri Square Building, 18th Floor, No. 319, Phayathai Road, Pathumwan District, Pathumwan Sub-District, Bangkok 10330', 320, '{"receipt_module": true, "card_print_lock": true}', 2),

('BKK-SC-M-002', 'BKK', 'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าวกรุงเทพมหานคร 1 (สจก. 2)', 'Bangkok Work Permit Service Center 1', 'โลตัส สาขาบางปะกอก ชั้น 3 เลขที่ 538 ซอยสุขสวัสดิ์ 25/2 แขวงบางปะกอก เขตราษฏร์บูรณะ จังหวัดกรุงเทพมหานคร 10140', 'Lotus Bang Pakok, 3rd Floor, No. 538, Suksawat 25/2 Alley, Bang Pakok Sub-District, Rat Burana District, Bangkok 10140', 320, '{}', 3),

('BKK-SC-S-004', 'BKK', 'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าวกรุงเทพมหานคร 3 (ขนาดกลาง) พื้นที่รับผิดชอบของ สจก. 3', 'Bangkok Work Permit Service Center 3', 'อาคารบางนาธานี ชั้น 8 เลขที่ 1 ซอยบางนา-ตราด 34 ถนนเทพรัตน์ แขวงบางนาใต้ เขตบางนา จังหวัดกรุงเทพมหานคร 10260', 'Bangna Thani Building, 8th Floor, No. 1, Bangna-Trat 34 Alley, Debarat Road, Bangna Tai Sub-District, Bangna District, Bangkok 10260', 160, '{}', 4),

('BKK-SC-M-003', 'BKK', 'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าวกรุงเทพมหานคร 2 (สจก. 5)', 'Bangkok Work Permit Service Center 2', 'อาคารเสียงสมบูรณ์ เลขที่ 555 หมู่ 13 ถนนสีหบุรานุกิจ แขวงมีนบุรี เขตมีนบุรี จังหวัดกรุงเทพมหานคร 10510', 'Siangsomboon Building, No. 555, Village No. 13, Sihaburanukit Road, Minburi Sub-District, Minburi District, Bangkok 10510', 320, '{}', 5),

('BKK-SC-S-003', 'BKK', 'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าวกรุงเทพมหานคร 4 (ขนาดเล็ก) พื้นที่รับผิดชอบของ สจก. 7', 'Bangkok Work Permit Service Center 4', 'อาคารเอสซี พลาซ่า ชั้น G สถานีขนส่งผู้โดยสารกรุงเทพ (สายใต้ใหม่) เลขที่ 24/6 ถนนบรมราชชนนี แขวงฉิมพลี เขตตลิ่งชัน จังหวัดกรุงเทพมหานคร 10170', 'SC Plaza Building, G Floor, Bangkok Bus Terminal (Sai Tai Mai), No. 24/6, Borommaratchachonnani Road, Chim Phli Sub-District, Taling Chan District, Bangkok 10170', 160, '{}', 6),

('BKK-SC-S-001', 'BKK', 'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าวกรุงเทพมหานคร 5 (ขนาดเล็ก) พื้นที่รับผิดชอบของ สจก. 9', 'Bangkok Work Permit Service Center 5', 'ศูนย์การค้าไอทีสแควร์ ชั้น 3 เลขที่ 333 หมู่ที่ 4 ถนนกำแพงเพชร 6 แขวงตลาดบางเขน เขตหลักสี่ จังหวัดกรุงเทพมหานคร 10210', 'IT Square Shopping Center, 3rd Floor, No. 333, Village No. 4, Kamphaeng Phet 6 Road, Talat Bang Khen Sub-District, Lak Si District, Bangkok 10210', 160, '{}', 7),

('BKK-SC-S-002', 'BKK', 'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าวกรุงเทพมหานคร 6 (ขนาดเล็ก) พื้นที่รับผิดชอบของ สจก. 10', 'Bangkok Work Permit Service Center 6', 'อาคารพงษ์สุภี ชั้น 3 เลขที่ 41/16 ถนนวิภาวดีรังสิต แขวงจอมพล เขตจตุจักร จังหวัดกรุงเทพมหานคร 10900', 'Phongsuphee Building, 3rd Floor, No. 41/16, Vibhavadi Rangsit Road, Chomphon Sub-District, Chatuchak District, Bangkok 10900', 160, '{}', 8),

-- Provincial Service Centers
('SPK-SC-M-001', 'SPK', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดสมุทรปราการ', 'Samut Prakan Provincial Work Permit Service Center', 'อาคารพาณิชย์ติดกับห้างอิมพีเรียลเวิลด์สำโรง ชั้น 2 ถนนสุขุมวิท ตำบลสำโรงเหนือ อำเภอเมืองสมุทรปราการ จังหวัดสมุทรปราการ 10270', 'Commercial building next to Imperial World Samrong Department Store, 2nd Floor, Sukhumvit Road, Samrong Nuea Sub-District, Mueang District, Samut Prakan 10270', 320, '{}', 10),

('NBI-SC-M-001', 'NBI', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดนนทบุรี', 'Nonthaburi Provincial Work Permit Service Center', 'บิ๊กซี สาขารัตนาธิเบศร์ 2 ชั้น 1 เลขที่ 68/111 ถนนรัตนาธิเบศร์ ตำบลบางกระสอ อำเภอเมืองนนทบุรี จังหวัดนนทบุรี 11000', 'Big C Rattanathibet 2, 1st Floor, No. 68/111, Rattanathibet Road, Bang Kraso Sub-District, Mueang District, Nonthaburi 11000', 320, '{}', 11),

('PTE-SC-M-001', 'PTE', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดปทุมธานี', 'Pathum Thani Provincial Work Permit Service Center', 'โลตัส สาขาบางกะดี เลขที่ 204 หมู่ 5 ถนนติวานนท์ ตำบลบางกะดี อำเมืองปทุมธานี จังหวัดปทุมธานี 12000', 'Lotus, Bang Kadi, No. 204, Village No. 5, Tiwanon Road, Bang Kadi Sub-District, Mueang District, Pathum Thani 12000', 320, '{}', 12),

('AYA-SC-S-001', 'AYA', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดพระนครศรีอยุธยา', 'Phra Nakhon Si Ayutthaya Provincial Work Permit Service Center', 'ศูนย์การค้าเดอะสกาย เลขที่ 59/9 ถนนโรจนะ ตำบลธนู อำเภออุทัย จังหวัดพระนครศรีอยุธยา 13000', 'The Sky Shopping Center, No. 59/9, Rojana Road, Thanu Sub-District, Uthai District, Phra Nakhon Si Ayutthaya 13000', 160, '{}', 13),

('SRI-SC-S-001', 'SRI', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดสระบุรี', 'Saraburi Provincial Work Permit Service Center', 'ศูนย์การค้าสุขอนันต์ พาร์ค เลขที่ 179/5 ถนนสุดบรรทัด ตำบลปากเพรียว อำเภอเมืองสระบุรี จังหวัดสระบุรี 18000', 'Suk Anan Park Shopping Center, No. 179/5, Sudbanthat Road, Pak Phriao Sub-District, Mueang District, Saraburi 18000', 160, '{}', 14),

('CBI-SC-M-001', 'CBI', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดชลบุรี', 'Chon Buri Provincial Work Permit Service Center', 'โลตัส สาขาชลบุรีบ้านสวน เลขที่ 57/37 หมู่ที่ 6 ถนนเศรษฐกิจ ตำบลบ้านสวน อำเภอเมืองชลบุรี จังหวัดชลบุรี 20000', 'Lotus Chonburi Ban Suan, No. 57/37, Village No. 6, Setthakit Road, Ban Suan Sub-District, Mueang District, Chonburi 20000', 320, '{}', 15),

-- EEC Chonburi — receipt-enabled
('CBI-SC-S-001', 'CBI', 'ศูนย์บริการใบอนุญาตทำงาน EEC จ.ชลบุรี', 'EEC Work Permit Service Center Chon Buri', 'สถาบันพัฒนาฝีมือแรงงาน 3 ชลบุรี เลขที่ 145 ตำบลหนองไม้แดง อำเภอเมืองชลบุรี จังหวัดชลบุรี 20000', 'Skill Development Institute 3 Chonburi, No. 145, Nong Mai Daeng Sub-District, Mueang District, Chonburi 20000', 160, '{"receipt_module": true, "card_print_lock": true}', 16),

('RYG-SC-S-001', 'RYG', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดระยอง', 'Rayong Provincial Work Permit Service Center', 'ศูนย์การค้าแพชชั่น ช้อปปิ้งเดสติเนชั่น ชั้น 2 เลขที่ 554 ถนนสุขุมวิท ตำบลเนินพระ อำเภอเมืองระยอง จังหวัดระยอง 21000', 'Passion Mall Shopping Destination, 2nd Floor, No. 554, Sukhumvit Road, Noen Phra Sub-District, Mueang District, Rayong 21000', 160, '{}', 17),

('CTI-SC-S-001', 'CTI', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดจันทบุรี', 'Chanthaburi Provincial Work Permit Service Center', 'บิ๊กซี สาขาจันทบุรี เลขที่ 1012 ถนนท่าแฉลบ ตำบลวัดใหม่ อำเภอเมืองจันทบุรี จังหวัดจันทบุรี 22000', 'Big C Chanthaburi, No. 1012, Tha Chalaep Road, Wat Mai Sub-District, Mueang District, Chanthaburi 22000', 160, '{}', 18),

('TRT-SC-S-001', 'TRT', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดตราด', 'Trat Provincial Work Permit Service Center', 'สถานีบริการน้ำมัน ปตท. หนองเสม็ด (หจก.ไสว ปิโตรเลียม) เลขที่ 30/1 หมู่ 5 ตำบลหนองเสม็ด อำเภอเมืองตราด จังหวัดตราด 23000', 'PTT Nong Samet Gas Station (Sawai Petroleum Limited Partnership) No. 30/1, Village No. 5, Nong Samet Sub-District, Mueang District, Trat 23000', 160, '{}', 19),

('CCO-SC-S-001', 'CCO', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดฉะเชิงเทรา', 'Chachoengsao Provincial Work Permit Service Center', 'โลตัส สาขาดอนทอง เลขที่ 663/21 ถนนศุขประยูร ตำบลหน้าเมือง อำเภอเมืองฉะเชิงเทรา จังหวัดฉะเชิงเทรา 24000', 'Lotus Don Thong, No. 663/21, Sukprayoon Road, Na Mueang Sub-District, Mueang District, Chachoengsao 24000', 160, '{}', 20),

('PRI-SC-S-001', 'PRI', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดปราจีนบุรี', 'Prachin Buri Provincial Work Permit Service Center', 'โลตัส สาขาปราจีนบุรี เลขที่ 51/1 หมู่ 4 ตำบลดงพระราม อำเภอเมืองปราจีนบุรี จังหวัดปราจีนบุรี 25000', 'Lotus Prachinburi, No. 51/1, Village No. 4, Dong Phra Ram Sub-District, Mueang District, Prachinburi 25000', 160, '{}', 21),

-- Sa Kaeo (On-Board + Service Center)
('SKW-OB-L-001', 'SKW', 'ศูนย์แรกรับและสิ้นสุดการจ้างงาน จังหวัดสระแก้ว', 'Sa Keaw Post-Arrival and Reintegration Center for Migrant Workers', 'อาคารเอนกประสงค์ ตรงข้ามสวนน้ำ Dreamer ถนนสุวรรณศร ตำบลอรัญประเทศ อำเภออรัญประเทศ จังหวัดสระแก้ว 27120', 'Multi-purpose building Opposite Dreamer Water Park, Suwannason Road, Aranyaprathet Sub-District, Aranyaprathet District, Sa Kaeo 27120', 700, '{}', 22),

('SKW-SC-S-001', 'SKW', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดสระแก้ว', 'Sa Keaw Provincial Work Permit Service Center', 'อาคารเอนกประสงค์ ตรงข้ามสวนน้ำ Dreamer ถนนสุวรรณศร ตำบลอรัญประเทศ อำเภออรัญประเทศ จังหวัดสระแก้ว 27120', 'Multi-purpose building Opposite Dreamer Water Park, Suwannason Road, Aranyaprathet Sub-District, Aranyaprathet District, Sa Kaeo 27120', 160, '{}', 23),

('NMA-SC-S-001', 'NMA', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดนครราชสีมา', 'Nakhon Ratchasima Provincial Work Permit Service Center', 'โลตัส สาขานครราชสีมา ชั้น 1 เลขที่ 719/5 ถนนมิตรภาพ ตำบลในเมือง อำเภอเมืองนครราชสีมา จังหวัดนครราชสีมา 30000', 'Lotus Nakhon Ratchasima, 1st Floor, No. 719/5, Mittraphap Road, Nai Mueang Sub-District, Mueang District, Nakhon Ratchasima 30000', 160, '{}', 24),

('UBN-SC-S-001', 'UBN', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดอุบลราชธานี', 'Ubon Ratchathani Provincial Work Permit Service Center', 'โลตัส สาขาอุบลราชธานี เลขที่ 492 ถนนชยางกูร ตำบลในเมือง อำเภอเมืองอุบลราชธานี จังหวัดอุบลราชธานี 34000', 'Lotus Ubon Ratchathani, No. 492, Chayangkun Road, Nai Mueang Sub-District, Mueang District, Ubon Ratchathani 34000', 160, '{}', 25),

('KKN-SC-S-001', 'KKN', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดขอนแก่น', 'Khon Kaen Provincial Work Permit Service Center', 'โลตัส สาขาขอนแก่น เลขที่ 356 หมู่ 3 ถนนมิตรภาพ ตำบลเมืองเก่า อำเภอเมืองขอนแก่น จังหวัดขอนแก่น 40000', 'Lotus Khon Kaen, No. 356, Village No. 3, Mittraphap Road, Mueang Kao Sub-District, Mueang District, Khon Kaen 40000', 160, '{}', 26),

-- Nong Khai (On-Board + Service Center)
('NKI-OB-L-001', 'NKI', 'ศูนย์แรกรับและสิ้นสุดการจ้างงาน จังหวัดหนองคาย', 'Nong Khai Post-Arrival and Reintegration Center for Migrant Workers', 'เลขที่ดิน 99 ตำบลในเมือง อำเภอเมืองหนองคาย จังหวัดหนองคาย 43000', '99 Tambon Nai Mueang, Amphoe Mueang Nong Khai, Nong Khai 43000', 700, '{}', 27),

('NKI-SC-S-001', 'NKI', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดหนองคาย', 'Nong Khai Provincial Work Permit Service Center', 'เลขที่ดิน 99 ตำบลในเมือง อำเภอเมืองหนองคาย จังหวัดหนองคาย 43000', '99 Tambon Nai Mueang, Amphoe Mueang Nong Khai, Nong Khai 43000', 160, '{}', 28),

-- Mukdahan (On-Board + Service Center)
('MDH-OB-M-001', 'MDH', 'ศูนย์แรกรับและสิ้นสุดการจ้างงาน จังหวัดมุกดาหาร', 'Mukdahan Post-Arrival and Reintegration Center for Migrant Workers', 'ด่านพรมแดนมุกดาหาร ตำบลบางทรายใหญ่ อำเภอเมืองมุกดาหาร จังหวัดมุกดาหาร 49000', 'The Mukdahan border checkpoint, Bang Sai Yai Sub-District, Mueang District, Mukdahan 49000', 320, '{}', 29),

('MDH-SC-S-001', 'MDH', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดมุกดาหาร', 'Mukdahan Provincial Work Permit Service Center', 'ด่านพรมแดนมุกดาหาร ตำบลบางทรายใหญ่ อำเภอเมืองมุกดาหาร จังหวัดมุกดาหาร 49000', 'The Mukdahan border checkpoint, Bang Sai Yai Sub-District, Mueang District, Mukdahan 49000', 160, '{}', 30),

-- Chiang Mai — receipt-enabled
('CMI-SC-M-001', 'CMI', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดเชียงใหม่', 'Chiang Mai Provincial Work Permit Service Center', 'โลตัส หางดง ชั้น 2 เลขที่ 132 หมู่ที่ 1 ถนนเชียงใหม่-หางดง ตำบลป่าแดด อำเภอเมืองเชียงใหม่ จังหวัดเชียงใหม่ 50100', 'Lotus Hang Dong, 2nd Floor, No. 132, Village No. 1, Chiang Mai-Hang Dong Road, Pa Daet Sub-District, Mueang District, Chiang Mai 50100', 320, '{"receipt_module": true, "card_print_lock": true}', 31),

('PRE-SC-S-001', 'PRE', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดแพร่', 'Phrae Provincial Work Permit Service Center', 'โลตัส สาขาแพร่ เลขที่ 258 หมู่ 1 ถนนยันตรกิจโกศล ตำบลทุ่งกวาว อำเภอเมืองแพร่ จังหวัดแพร่ 54000', 'Lotus Phrae, No. 258, Village No. 1, Yantrakitkoson Road, Thung Kwao Sub-District, Mueang District, Phrae 54000', 160, '{}', 32),

('CRI-SC-S-001', 'CRI', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดเชียงราย', 'Chiang Rai Provincial Work Permit Service Center', 'บิ๊กซี สาขาเชียงราย ชั้น 2 เลขที่ 184 หมู่ 25 ถนนพหลโยธิน ตำบลรอบเวียง อำเภอเมืองเชียงราย จังหวัดเชียงราย 57000', 'Big C Chiang Rai, 2nd Floor, No. 184, Village No. 25, Phahonyothin Road, Rop Wiang Sub-District, Mueang District, Chiang Rai 57000', 160, '{}', 33),

-- Tak (On-Board + Service Centers)
('TAK-OB-L-001', 'TAK', 'ศูนย์แรกรับและสิ้นสุดการจ้างงาน จังหวัดตาก', 'Tak Post-Arrival and Reintegration Center for Migrant Workers', 'อาคารสำนักงาน เลขที่ 565 หมู่ 2 ตำบลท่าสายลวด อำเภอแม่สอด จังหวัดตาก 63110', 'Office building, No. 565, Village No. 2, Tha Sai Luat Sub-District, Mae Sot District, Tak 63110', 700, '{}', 34),

('TAK-SC-S-002', 'TAK', 'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว จังหวัดตาก (สาขาศูนย์แรกรับ)', 'Foreigner Work Permit Service Center in Tak (Post-Arrival and Reintegration Center)', 'อาคารสำนักงาน เลขที่ 565 หมู่ 2 ตำบลท่าสายลวด อำเภอแม่สอด จังหวัดตาก 63110', 'Office building, No. 565, Village No. 2, Tha Sai Luat Sub-District, Mae Sot District, Tak 63110', 160, '{}', 35),

('TAK-SC-S-001', 'TAK', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดตาก', 'Tak Provincial Work Permit Service Center', 'โลตัส สาขาตาก เลขที่ 18 ถนนพหลโยธิน ตำบลระแหง อำเภอเมืองตาก จังหวัดตาก 63000', 'Lotus Tak, No. 18, Phahonyothin Road, Rahaeng Sub-District, Mueang District, Tak 63000', 160, '{}', 36),

('RBR-SC-S-001', 'RBR', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดราชบุรี', 'Ratchaburi Provincial Work Permit Service Center', 'ศูนย์การค้าไอทีซันนี่ ชั้น 2 ถนนคฑาธร ตำบลหน้าเมือง อำเภอเมืองราชบุรี จังหวัดราชบุรี 70000', 'Sunny IT Shopping Center, 2nd Floor, Katathon Road, Na Mueang Sub-District, Mueang District, Ratchaburi 70000', 160, '{}', 37),

('KRI-SC-S-001', 'KRI', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดกาญจนบุรี', 'Kanchanaburi Provincial Work Permit Service Center', 'โลตัส สาขากาญจนบุรี เลขที่ 355/3 ถนนแสงชูโต ตำบลปากแพรก อำเภอเมืองกาญจนบุรี จังหวัดกาญจนบุรี 71000', 'Lotus Kanchanaburi, No. 355/3, Saeng Chuto Road, Pak Phraek Sub-District, Mueang District, Kanchanaburi 71000', 160, '{}', 38),

('SPB-SC-S-001', 'SPB', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดสุพรรณบุรี', 'Suphan Buri Provincial Work Permit Service Center', 'บิ๊กซี สาขาสุพรรณบุรี ชั้น 1 เลขที่ 140/20 ถนนมาลัยแมน ตำบลรั้วใหญ่ อำเภอเมืองสุพรรณบุรี จังหวัดสุพรรณบุรี 72000', 'Big C Suphanburi, 1st Floor, No. 140/20, Malaiman Road, Rua Yai Sub-District, Mueang District, Suphanburi 72000', 160, '{}', 39),

('NPT-SC-M-001', 'NPT', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดนครปฐม', 'Nakhon Pathom Provincial Work Permit Service Center', 'โลตัส นครปฐม เลขที่ 1048 ถนนเพชรเกษม ตำบลสนามจันทร์ อำเภอเมืองนครปฐม จังหวัดนครปฐม 73000', 'Lotus Nakhon Pathom, No. 1048, Phetkasem Road, Sanam Chan Sub-District, Mueang District, Nakhon Pathom 73000', 320, '{}', 40),

('SKN-SC-L-001', 'SKN', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดสมุทรสาคร', 'Samut Sakhon Provincial Work Permit Service Center', 'บิ๊กซี สาขามหาชัย 2 เลขที่ 67/534 หมู่ที่ 4 ตำบลโคกขาม อำเภอเมืองสมุทรสาคร จังหวัดสมุทรสาคร 74000', 'Big C Mahachai 2, No. 67/534, Village No. 4, Khok Kham Sub-District, Mueang District, Samut Sakhon 74000', 700, '{}', 41),

('PBI-SC-S-001', 'PBI', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดเพชรบุรี', 'Phetchaburi Provincial Work Permit Service Center', 'บิ๊กซี สาขาเพชรไพบูลย์ เลขที่ 105 หมู่ 2 ตำบลบ้านหม้อ อำเภอเมืองเพชรบุรี จังหวัดเพชรบุรี 76000', 'Big C, Phetchaburi, No. 105, Village No. 2, Ban Mo Sub-District, Mueang District, Phetchaburi 76000', 160, '{}', 42),

('PKN-SC-S-001', 'PKN', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดประจวบคีรีขันธ์', 'Prachuap Khiri Khan Provincial Work Permit Service Center', 'เลขที่ 504/1 ถนนเพชรเกษม ตำบลเกาะหลัก อำเภอเมืองประจวบคีรีขันธ์ จังหวัดประจวบคีรีขันธ์ 77000', 'No. 504/1, Phetkasem Road, Koh Lak Sub-District, Mueang District, Prachuap Khiri Khan 77000', 160, '{}', 43),

('NST-SC-S-001', 'NST', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดนครศรีธรรมราช', 'Nakhon Si Thammarat Provincial Work Permit Service Center', 'โลตัส สาขานครศรีธรรมราช ชั้น 1 เลขที่ 15 ถนนพัฒนาการคูขวาง ตำบลในเมือง อำเภอเมืองนครศรีธรรมราช จังหวัดนครศรีธรรมราช 80000', 'Lotus, Nakhon Si Thammarat, 1st Floor, No. 15, Phatthanakan Khu Khwang Road, Nai Mueang Sub-District, Mueang District, Nakhon Si Thammarat 80000', 160, '{}', 44),

('PNA-SC-S-001', 'PNA', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดพังงา', 'Phangnga Provincial Work Permit Service Center', 'สถานีบริการน้ำมัน ปตท. ราชพฤกษ์ (หจก.ราชพฤกษ์พังงา) เลขที่ 1/56 หมู่ที่ 4 ถนนเพชรเกษม ตำบลถ้ำน้ำผุด อำเภอเมืองพังงา จังหวัดพังงา 82000', 'PTT Ratchaphruek Gas Station (Ratchaphruek Phang Nga Limited Partnership) No. 1/56, Village No. 4, Phetkasem Road, Tham Nam Phut Sub-District, Mueang District, Phang Nga 82000', 160, '{}', 45),

-- Phuket — receipt-enabled
('PKT-SC-S-001', 'PKT', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดภูเก็ต', 'Phuket Provincial Work Permit Service Center', 'โรบินสัน ไลฟ์สไตล์ สาขาฉลอง ชั้น 1 เลขที่ 10/53 หมู่ 1 ถนนเจ้าฟ้าตะวันออก ตำบลฉลอง อำเภอเมืองภูเก็ต จังหวัดภูเก็ต 83130', 'Robinson Lifestyle Chalong, 1st Floor, No. 10/53, Village No. 1, Chao Fa Tawan Tok Road, Chalong Sub-District, Mueang District, Phuket 83130', 160, '{"receipt_module": true, "card_print_lock": true}', 46),

-- Note: Excel province_code=URT, branch_code=SNI-SC-M-001 for Surat Thani
('SNI-SC-M-001', 'URT', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดสุราษฎร์ธานี', 'Surat Thani Provincial Work Permit Service Center', 'โลตัส สาขาสุราษฏร์ธานี ชั้น 3 เลขที่ 287 ถนนเลขี่ยงเมือง ตำบลมะขามเตี้ย อำเภอเมืองสุราษฎร์ธานี จังหวัดสุราษฎร์ธานี 84000', 'Lotus Surat Thani, 3rd Floor, No. 287, Liang Mueang Road, Makham Tia Sub-District, Mueang District, Surat Thani 84000', 320, '{}', 47),

-- Ranong (On-Board + Service Centers)
('RNG-OB-M-001', 'RNG', 'ศูนย์แรกรับและสิ้นสุดการจ้างงาน จังหวัดระนอง', 'Ranong Post-Arrival and Reintegration Center for Migrant Workers', 'เลขที่ 999 ตำบล เขานิเวศน์ อำเภอเมืองระนอง ระนอง 85000', '999, Tambon Khao Niwet, Amphoe Mueang Ranong, Ranong 85000', 320, '{}', 48),

('RNG-SC-S-002', 'RNG', 'ศูนย์บริการใบอนุญาตทำงานของคนต่างด้าว จังหวัดระนอง (สาขาศูนย์แรกรับ)', 'Foreigner Work Permit Service Center in Ranong (Post-Arrival and Reintegration Center)', 'เลขที่ 999 ตำบล เขานิเวศน์ อำเภอเมืองระนอง ระนอง 85000', '999, Tambon Khao Niwet, Amphoe Mueang Ranong, Ranong 85000', 160, '{}', 49),

('RNG-SC-S-001', 'RNG', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดระนอง', 'Ranong Provincial Work Permit Service Center', 'โลตัส สาขาระนอง ชั้นที่ 1 เลขที่ 25/12 หมู่ 1 ถนนเพชรเกษม ตำบลบางริ้น อำเภอเมืองระนอง จังหวัดระนอง 85000', 'Lotus Ranong, 1st Floor, No. 25/12, Village No. 1, Phetkasem Road, Bang Rin Sub-District, Mueang District, Ranong 85000', 160, '{}', 50),

('CPN-SC-S-001', 'CPN', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดชุมพร', 'Chumphon Provincial Work Permit Service Center', 'โลตัส สาขาชุมพร เลขที่ 176 หมู่ 3 ถนนชุมพรตัดใหม่ ตำบลวังไผ่ จังหวัดเมืองชุมพร จังหวัดชุมพร 86000', 'Lotus Chumphon, No. 176, Village No. 3, Chumphon Tad Mai Road, Wang Phai Sub-District, Mueang Province, Chumphon 86000', 160, '{}', 51),

('SKA-SC-S-001', 'SKA', 'ศูนย์บริการใบอนุญาตทำงานต่างจังหวัด จังหวัดสงขลา', 'Songkhla Provincial Work Permit Service Center', 'โลตัส สาขาหาดใหญ่ 2 เลขที่ 1318 ถนนเพชรเกษม ตำบลควนลัง อำเภอหาดใหญ่ จังหวัดสงขลา 90110', 'Lotus Hat Yai 2, No. 1318, Phetkasem Road, Khuan Lang Sub-District, Hat Yai District, Songkhla 90110', 160, '{}', 52),

-- FTS Control Center
('FTS-SC-S-001', 'FTS', 'ศูนย์กำกับและควบคุม', 'Control Center (HQ)', NULL, NULL, 160, '{}', 99)

ON CONFLICT (code) DO NOTHING;

-- 2b. Mobile Units (MB-001 through MB-008)
INSERT INTO public.branches (code, province_code, name_th, name_en, max_capacity, features, display_order) VALUES
('MB-001', 'MB', 'หน่วยเคลื่อนที่ MB-001', 'Mobile Unit MB-001', 160, '{}', 100),
('MB-002', 'MB', 'หน่วยเคลื่อนที่ MB-002', 'Mobile Unit MB-002', 160, '{}', 101),
('MB-003', 'MB', 'หน่วยเคลื่อนที่ MB-003', 'Mobile Unit MB-003', 160, '{}', 102),
('MB-004', 'MB', 'หน่วยเคลื่อนที่ MB-004', 'Mobile Unit MB-004', 160, '{}', 103),
('MB-005', 'MB', 'หน่วยเคลื่อนที่ MB-005', 'Mobile Unit MB-005', 160, '{}', 104),
('MB-006', 'MB', 'หน่วยเคลื่อนที่ MB-006', 'Mobile Unit MB-006', 160, '{}', 105),
('MB-007', 'MB', 'หน่วยเคลื่อนที่ MB-007', 'Mobile Unit MB-007', 160, '{}', 106),
('MB-008', 'MB', 'หน่วยเคลื่อนที่ MB-008', 'Mobile Unit MB-008', 160, '{}', 107)
ON CONFLICT (code) DO NOTHING;


-- ============================================================
-- 3. ALTER EXISTING TABLES -- Add branch_id columns
-- ============================================================

-- 3a. profiles -- branch_id, branch_role, is_super_admin
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS branch_role TEXT DEFAULT 'officer';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false;

-- 3b. receipts
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

-- 3c. card_print_locks
ALTER TABLE public.card_print_locks ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

-- 3d. card_print_locks_archive (no FK -- archive table)
ALTER TABLE public.card_print_locks_archive ADD COLUMN IF NOT EXISTS branch_id UUID;

-- 3e. activity_logs
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

-- 3f. ux_analytics
ALTER TABLE public.ux_analytics ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);


-- ============================================================
-- 4. MIGRATE EXISTING DATA to BKK-SC-M-001 (One Bangkok)
-- ============================================================

-- 4a. Set all existing profiles to BKK-SC-M-001
UPDATE public.profiles
SET branch_id = (SELECT id FROM public.branches WHERE code = 'BKK-SC-M-001' LIMIT 1)
WHERE branch_id IS NULL;

-- 4b. Map existing roles to branch_role
--     admin -> head, manager -> deputy, staff/user -> officer (default)
UPDATE public.profiles SET branch_role = 'head'   WHERE role = 'admin'   AND branch_role = 'officer';
UPDATE public.profiles SET branch_role = 'deputy'  WHERE role = 'manager' AND branch_role = 'officer';

-- 4c. Set all existing receipts to BKK-SC-M-001
UPDATE public.receipts
SET branch_id = (SELECT id FROM public.branches WHERE code = 'BKK-SC-M-001' LIMIT 1)
WHERE branch_id IS NULL;

-- 4d. Set all existing card_print_locks to BKK-SC-M-001
UPDATE public.card_print_locks
SET branch_id = (SELECT id FROM public.branches WHERE code = 'BKK-SC-M-001' LIMIT 1)
WHERE branch_id IS NULL;

-- 4e. Set all existing card_print_locks_archive to BKK-SC-M-001
UPDATE public.card_print_locks_archive
SET branch_id = (SELECT id FROM public.branches WHERE code = 'BKK-SC-M-001' LIMIT 1)
WHERE branch_id IS NULL;

-- 4f. Set all existing activity_logs to BKK-SC-M-001
UPDATE public.activity_logs
SET branch_id = (SELECT id FROM public.branches WHERE code = 'BKK-SC-M-001' LIMIT 1)
WHERE branch_id IS NULL;

-- 4g. ux_analytics: leave NULL for historical data (acceptable)


-- ============================================================
-- 5. HELPER FUNCTIONS (SECURITY DEFINER)
-- ============================================================

-- 5a. get_user_branch_id() -- returns branch_id of current authenticated user
CREATE OR REPLACE FUNCTION public.get_user_branch_id()
RETURNS UUID AS $$
    SELECT branch_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 5b. is_super_admin() -- checks if current user is a super admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
    SELECT COALESCE(
        (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()),
        false
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 5c. is_branch_head() -- checks if current user is head or deputy of their branch
CREATE OR REPLACE FUNCTION public.is_branch_head()
RETURNS BOOLEAN AS $$
    SELECT COALESCE(
        (SELECT branch_role IN ('head', 'deputy') FROM public.profiles WHERE id = auth.uid()),
        false
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ============================================================
-- 6. DROP OLD RLS POLICIES
-- ============================================================
-- Old policies saved in comment block at the bottom for rollback.

-- 6a. profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admin can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admin can update all profiles" ON public.profiles;

-- 6b. receipts
DROP POLICY IF EXISTS "Authenticated users can read receipts" ON public.receipts;
DROP POLICY IF EXISTS "Authenticated users can insert receipts" ON public.receipts;
DROP POLICY IF EXISTS "Authenticated users can update receipts" ON public.receipts;
DROP POLICY IF EXISTS "Admin can delete receipts" ON public.receipts;

-- 6c. card_print_locks
DROP POLICY IF EXISTS "Authenticated users can read card_print_locks" ON public.card_print_locks;
DROP POLICY IF EXISTS "Authenticated users can insert card_print_locks" ON public.card_print_locks;
DROP POLICY IF EXISTS "Users can update own card_print_locks" ON public.card_print_locks;
DROP POLICY IF EXISTS "Admin can delete card_print_locks" ON public.card_print_locks;

-- 6d. card_print_locks_archive
DROP POLICY IF EXISTS "Authenticated users can read card_print_locks_archive" ON public.card_print_locks_archive;

-- 6e. activity_logs
DROP POLICY IF EXISTS "Authenticated users can insert activity_logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Authenticated users can read activity_logs" ON public.activity_logs;

-- 6f. ux_analytics
DROP POLICY IF EXISTS "Authenticated users can insert ux_analytics" ON public.ux_analytics;
DROP POLICY IF EXISTS "Admin can read ux_analytics" ON public.ux_analytics;


-- ============================================================
-- 7. NEW BRANCH-SCOPED RLS POLICIES
-- ============================================================

-- -------------------------------------------------------
-- 7a. branches -- all authenticated can read, super admin manages
-- -------------------------------------------------------
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branches_select_authenticated"
    ON public.branches FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "branches_insert_super_admin"
    ON public.branches FOR INSERT
    WITH CHECK (public.is_super_admin());

CREATE POLICY "branches_update_super_admin"
    ON public.branches FOR UPDATE
    USING (public.is_super_admin());

CREATE POLICY "branches_delete_super_admin"
    ON public.branches FOR DELETE
    USING (public.is_super_admin());

-- Allow anon users to read active branches (for registration dropdown)
CREATE POLICY "branches_select_anon_active"
    ON public.branches FOR SELECT
    TO anon
    USING (is_active = true);

-- -------------------------------------------------------
-- 7b. profiles -- own + same branch (head/deputy) + all (super admin)
-- -------------------------------------------------------

-- SELECT: own profile OR same branch (head/deputy) OR all (super admin)
CREATE POLICY "profiles_select"
    ON public.profiles FOR SELECT
    USING (
        auth.uid() = id
        OR public.is_super_admin()
        OR (
            public.is_branch_head()
            AND branch_id = public.get_user_branch_id()
        )
    );

-- INSERT: during registration (handle_new_user trigger uses SECURITY DEFINER)
CREATE POLICY "profiles_insert_own"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- UPDATE: own profile OR same branch (head/deputy) OR all (super admin)
CREATE POLICY "profiles_update"
    ON public.profiles FOR UPDATE
    USING (
        auth.uid() = id
        OR public.is_super_admin()
        OR (
            public.is_branch_head()
            AND branch_id = public.get_user_branch_id()
        )
    );

-- DELETE: super admin only
CREATE POLICY "profiles_delete_super_admin"
    ON public.profiles FOR DELETE
    USING (public.is_super_admin());

-- -------------------------------------------------------
-- 7c. receipts -- same branch + super admin
-- -------------------------------------------------------

-- SELECT: same branch OR super admin
CREATE POLICY "receipts_select"
    ON public.receipts FOR SELECT
    USING (
        branch_id = public.get_user_branch_id()
        OR public.is_super_admin()
    );

-- INSERT: same branch OR super admin
CREATE POLICY "receipts_insert"
    ON public.receipts FOR INSERT
    WITH CHECK (
        branch_id = public.get_user_branch_id()
        OR public.is_super_admin()
    );

-- UPDATE: same branch OR super admin
CREATE POLICY "receipts_update"
    ON public.receipts FOR UPDATE
    USING (
        branch_id = public.get_user_branch_id()
        OR public.is_super_admin()
    );

-- DELETE: branch head (own branch) OR super admin
CREATE POLICY "receipts_delete"
    ON public.receipts FOR DELETE
    USING (
        public.is_super_admin()
        OR (
            public.is_branch_head()
            AND branch_id = public.get_user_branch_id()
        )
    );

-- -------------------------------------------------------
-- 7d. card_print_locks -- same branch + super admin
-- -------------------------------------------------------

-- SELECT: same branch OR super admin
CREATE POLICY "card_print_locks_select"
    ON public.card_print_locks FOR SELECT
    USING (
        branch_id = public.get_user_branch_id()
        OR public.is_super_admin()
    );

-- INSERT: same branch OR super admin
CREATE POLICY "card_print_locks_insert"
    ON public.card_print_locks FOR INSERT
    WITH CHECK (
        branch_id = public.get_user_branch_id()
        OR public.is_super_admin()
    );

-- UPDATE: own locks OR branch head (own branch) OR super admin
CREATE POLICY "card_print_locks_update"
    ON public.card_print_locks FOR UPDATE
    USING (
        officer_id = auth.uid()
        OR public.is_super_admin()
        OR (
            public.is_branch_head()
            AND branch_id = public.get_user_branch_id()
        )
    );

-- DELETE: branch head (own branch) OR super admin
CREATE POLICY "card_print_locks_delete"
    ON public.card_print_locks FOR DELETE
    USING (
        public.is_super_admin()
        OR (
            public.is_branch_head()
            AND branch_id = public.get_user_branch_id()
        )
    );

-- -------------------------------------------------------
-- 7e. card_print_locks_archive -- read-only, same branch + super admin
-- -------------------------------------------------------

CREATE POLICY "card_print_locks_archive_select"
    ON public.card_print_locks_archive FOR SELECT
    USING (
        branch_id = public.get_user_branch_id()
        OR public.is_super_admin()
    );

-- -------------------------------------------------------
-- 7f. activity_logs -- branch head (own branch) + super admin for SELECT
-- -------------------------------------------------------

-- SELECT: branch head (own branch) OR super admin
CREATE POLICY "activity_logs_select"
    ON public.activity_logs FOR SELECT
    USING (
        public.is_super_admin()
        OR (
            public.is_branch_head()
            AND branch_id = public.get_user_branch_id()
        )
    );

-- INSERT: all authenticated users can write logs
CREATE POLICY "activity_logs_insert"
    ON public.activity_logs FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- -------------------------------------------------------
-- 7g. ux_analytics -- keep simple for analytics
-- -------------------------------------------------------

-- SELECT: all authenticated
CREATE POLICY "ux_analytics_select"
    ON public.ux_analytics FOR SELECT
    USING (auth.role() = 'authenticated');

-- INSERT: all authenticated
CREATE POLICY "ux_analytics_insert"
    ON public.ux_analytics FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');


-- ============================================================
-- 8. UPDATE TRIGGERS
-- ============================================================

-- 8a. handle_new_user() -- set branch_id from registration metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, name, email, role, is_approved, branch_id, branch_role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
        NEW.email,
        'user',
        FALSE,
        -- branch_id comes from registration form (stored in user metadata)
        (NEW.raw_user_meta_data->>'branch_id')::UUID,
        'officer'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8b. cleanup_old_card_locks() -- preserve branch_id when archiving
-- Must DROP first because return type changed (void → integer)
DROP FUNCTION IF EXISTS cleanup_old_card_locks();
CREATE OR REPLACE FUNCTION cleanup_old_card_locks()
RETURNS INTEGER AS $$
DECLARE
    moved_count INTEGER;
BEGIN
    -- Move completed/old locks to archive (now includes branch_id)
    INSERT INTO public.card_print_locks_archive
        (id, appointment_id, request_no, passport_no, foreigner_name,
         officer_id, officer_name, sn_good, sn_spoiled, spoiled_reason,
         status, lock_date, created_at, updated_at, archived_at, branch_id)
    SELECT
        id, appointment_id, request_no, passport_no, foreigner_name,
        officer_id, officer_name, sn_good, sn_spoiled, spoiled_reason,
        status, lock_date, created_at, updated_at, now(), branch_id
    FROM public.card_print_locks
    WHERE created_at < NOW() - INTERVAL '48 hours';

    GET DIAGNOSTICS moved_count = ROW_COUNT;

    -- Delete from main table
    DELETE FROM public.card_print_locks
    WHERE created_at < NOW() - INTERVAL '48 hours';

    -- Delete old archive entries (>90 days)
    DELETE FROM public.card_print_locks_archive
    WHERE archived_at < NOW() - INTERVAL '90 days';

    RETURN moved_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8c. Updated timestamp trigger for branches table
CREATE OR REPLACE FUNCTION update_branches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_branches_updated_at ON public.branches;
CREATE TRIGGER trg_branches_updated_at
    BEFORE UPDATE ON public.branches
    FOR EACH ROW EXECUTE FUNCTION update_branches_updated_at();


-- ============================================================
-- 9. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_branches_code
    ON public.branches (code);

CREATE INDEX IF NOT EXISTS idx_profiles_branch_id
    ON public.profiles (branch_id);

CREATE INDEX IF NOT EXISTS idx_receipts_branch_id
    ON public.receipts (branch_id);

CREATE INDEX IF NOT EXISTS idx_receipts_branch_date
    ON public.receipts (branch_id, receipt_date);

CREATE INDEX IF NOT EXISTS idx_card_print_locks_branch_id
    ON public.card_print_locks (branch_id);

CREATE INDEX IF NOT EXISTS idx_activity_logs_branch_id
    ON public.activity_logs (branch_id);


COMMIT;


-- ============================================================
-- OLD RLS POLICIES (for rollback reference)
-- ============================================================
/*
-- profiles (old)
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admin can view all profiles" ON public.profiles
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
CREATE POLICY "Admin can update all profiles" ON public.profiles
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- receipts (old)
CREATE POLICY "Authenticated users can read receipts" ON public.receipts
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert receipts" ON public.receipts
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can update receipts" ON public.receipts
    FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Admin can delete receipts" ON public.receipts
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- card_print_locks (old)
CREATE POLICY "Authenticated users can read card_print_locks" ON public.card_print_locks
    FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert card_print_locks" ON public.card_print_locks
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Users can update own card_print_locks" ON public.card_print_locks
    FOR UPDATE USING (officer_id = auth.uid());
CREATE POLICY "Admin can delete card_print_locks" ON public.card_print_locks
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- card_print_locks_archive (old)
CREATE POLICY "Authenticated users can read card_print_locks_archive" ON public.card_print_locks_archive
    FOR SELECT USING (auth.role() = 'authenticated');

-- activity_logs (old)
CREATE POLICY "Authenticated users can insert activity_logs" ON public.activity_logs
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can read activity_logs" ON public.activity_logs
    FOR SELECT USING (auth.role() = 'authenticated');

-- ux_analytics (old)
CREATE POLICY "Authenticated users can insert ux_analytics" ON public.ux_analytics
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Admin can read ux_analytics" ON public.ux_analytics
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
*/


-- ============================================================
-- ROLLBACK SECTION (commented out -- run manually if needed)
-- ============================================================
/*
-- Step 1: Drop new RLS policies on branches
DROP POLICY IF EXISTS "branches_select_authenticated" ON public.branches;
DROP POLICY IF EXISTS "branches_insert_super_admin" ON public.branches;
DROP POLICY IF EXISTS "branches_update_super_admin" ON public.branches;
DROP POLICY IF EXISTS "branches_delete_super_admin" ON public.branches;

-- Step 2: Drop new RLS policies on profiles
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_super_admin" ON public.profiles;

-- Step 3: Drop new RLS policies on receipts
DROP POLICY IF EXISTS "receipts_select" ON public.receipts;
DROP POLICY IF EXISTS "receipts_insert" ON public.receipts;
DROP POLICY IF EXISTS "receipts_update" ON public.receipts;
DROP POLICY IF EXISTS "receipts_delete" ON public.receipts;

-- Step 4: Drop new RLS policies on card_print_locks
DROP POLICY IF EXISTS "card_print_locks_select" ON public.card_print_locks;
DROP POLICY IF EXISTS "card_print_locks_insert" ON public.card_print_locks;
DROP POLICY IF EXISTS "card_print_locks_update" ON public.card_print_locks;
DROP POLICY IF EXISTS "card_print_locks_delete" ON public.card_print_locks;

-- Step 5: Drop new RLS policies on card_print_locks_archive
DROP POLICY IF EXISTS "card_print_locks_archive_select" ON public.card_print_locks_archive;

-- Step 6: Drop new RLS policies on activity_logs
DROP POLICY IF EXISTS "activity_logs_select" ON public.activity_logs;
DROP POLICY IF EXISTS "activity_logs_insert" ON public.activity_logs;

-- Step 7: Drop new RLS policies on ux_analytics
DROP POLICY IF EXISTS "ux_analytics_select" ON public.ux_analytics;
DROP POLICY IF EXISTS "ux_analytics_insert" ON public.ux_analytics;

-- Step 8: Restore old RLS policies (copy from "OLD RLS POLICIES" section above)
-- ... paste old CREATE POLICY statements here ...

-- Step 9: Drop helper functions
DROP FUNCTION IF EXISTS public.get_user_branch_id();
DROP FUNCTION IF EXISTS public.is_super_admin();
DROP FUNCTION IF EXISTS public.is_branch_head();
DROP FUNCTION IF EXISTS public.update_branches_updated_at();

-- Step 10: Drop new columns
ALTER TABLE public.profiles DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS branch_role;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_super_admin;
ALTER TABLE public.receipts DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.card_print_locks DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.card_print_locks_archive DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.activity_logs DROP COLUMN IF EXISTS branch_id;
ALTER TABLE public.ux_analytics DROP COLUMN IF EXISTS branch_id;

-- Step 11: Drop indexes
DROP INDEX IF EXISTS idx_branches_code;
DROP INDEX IF EXISTS idx_profiles_branch_id;
DROP INDEX IF EXISTS idx_receipts_branch_id;
DROP INDEX IF EXISTS idx_receipts_branch_date;
DROP INDEX IF EXISTS idx_card_print_locks_branch_id;
DROP INDEX IF EXISTS idx_activity_logs_branch_id;

-- Step 12: Drop trigger
DROP TRIGGER IF EXISTS trg_branches_updated_at ON public.branches;

-- Step 13: Drop branches table (CASCADE removes FK references)
DROP TABLE IF EXISTS public.branches CASCADE;

-- Step 14: Restore original handle_new_user() without branch support
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, name, email, role, is_approved)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
        NEW.email,
        'user',
        FALSE
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 15: Restore original cleanup_old_card_locks() without branch_id
CREATE OR REPLACE FUNCTION cleanup_old_card_locks()
RETURNS INTEGER AS $$
DECLARE
    moved_count INTEGER;
BEGIN
    INSERT INTO public.card_print_locks_archive
        (id, appointment_id, request_no, passport_no, foreigner_name,
         officer_id, officer_name, sn_good, sn_spoiled, spoiled_reason,
         status, lock_date, created_at, updated_at, archived_at)
    SELECT
        id, appointment_id, request_no, passport_no, foreigner_name,
        officer_id, officer_name, sn_good, sn_spoiled, spoiled_reason,
        status, lock_date, created_at, updated_at, now()
    FROM public.card_print_locks
    WHERE created_at < NOW() - INTERVAL '48 hours';

    GET DIAGNOSTICS moved_count = ROW_COUNT;

    DELETE FROM public.card_print_locks
    WHERE created_at < NOW() - INTERVAL '48 hours';

    DELETE FROM public.card_print_locks_archive
    WHERE archived_at < NOW() - INTERVAL '90 days';

    RETURN moved_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
*/

-- ============================================================
-- v9.0.1 - SN Duplicate Check with Branch Info
-- ============================================================
-- Updated: returns branch_code for cross-branch SN warnings
DROP FUNCTION IF EXISTS check_sn_duplicate(text, text);
CREATE OR REPLACE FUNCTION check_sn_duplicate(p_sn_number text, p_exclude_receipt_no text DEFAULT NULL)
RETURNS TABLE(receipt_no text, foreigner_name text, branch_code text) AS $$
BEGIN
  RETURN QUERY
  SELECT r.receipt_no, r.foreigner_name, b.branch_code
  FROM receipts r
  LEFT JOIN branches b ON r.branch_id = b.id
  WHERE r.sn_number = p_sn_number
  AND (p_exclude_receipt_no IS NULL OR r.receipt_no != p_exclude_receipt_no);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION check_sn_duplicate(text, text) TO authenticated;

-- =====================================================
-- RPC: get_user_email — Admin reset password fix
-- profiles table has no email column, email lives in auth.users
-- SECURITY DEFINER because client cannot read auth.users directly
-- Only admin/super_admin can call (checked inside function)
-- =====================================================
CREATE OR REPLACE FUNCTION get_user_email(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_email TEXT;
  v_is_admin BOOLEAN;
BEGIN
  SELECT (is_admin(auth.uid()) OR is_super_admin(auth.uid())) INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  RETURN v_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_user_email(UUID) TO authenticated;
