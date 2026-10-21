# FlowAccount Web Authentication Template (เทมเพลตหน้าเข้าสู่ระบบ FlowAccount)

เทมเพลตหน้าเว็บไซต์สำหรับระบบยืนยันตัวตน (Authentication) ออกแบบตามอัตลักษณ์และโครงสร้างของเว็บไซต์ **FlowAccount** ([auth.flowaccount.com](https://auth.flowaccount.com/Account/Login?returnUrl=%2FAccount%2FSelectCompany?returnUrl=%2FAccount%2FSelectCompany)) ด้วยดีไซน์ที่ทันสมัย Responsive 100% สวยงาม และรองรับการทำงานทั้งบน Desktop, Tablet และ Mobile

---

## 📁 โครงสร้างไฟล์ที่จัดระเบียบแล้ว (Organized Clean Structure)

```text
MAM/
├── server/                         # 🖥️ [Backend & Database]
│   ├── database.js                 # จัดการ SQLite Schema & Queries
│   ├── server.js                   # Express REST API Server (พอร์ต 3000)
│   ├── flowaccount.db              # ไฟล์ฐานข้อมูลจริง
│   └── test-api.js                 # สคริปต์ทดสอบระบบ
│
├── public/                         # 🌐 [Frontend Client-side]
│   │
│   ├── assets/                     # รวมไฟล์ Static Assets
│   │   ├── css/
│   │   │   ├── auth.css            # สไตล์หน้า Login / Register
│   │   │   ├── dashboard.css       # สไตล์หน้า Dashboard & Sidebar
│   │   │   └── document-editor.css # สไตล์โหมดทำเอกสาร A4 Canvas
│   │   └── js/
│   │       ├── auth.js             # สคริปต์ Login & สลับภาษา
│   │       ├── dashboard.js        # สคริปต์ชาร์ตและการเงิน Dashboard
│   │       ├── quotations.js       # สคริปต์ตารางและฟิลเตอร์ใบเสนอราคา
│   │       └── document-editor.js  # สคริปต์คำนวณเงิน & บันทึกเอกสาร
│   │
│   ├── auth/                       # 🔐 [หมวดระบบยืนยันตัวตน]
│   │   ├── login.html              # หน้าเข้าสู่ระบบหลัก
│   │   ├── register.html           # หน้าสมัครสมาชิกใหม่
│   │   └── forgot-password.html    # หน้ารีเซ็ตรหัสผ่าน
│   │
│   ├── dashboard/                  # 📊 [หมวดภาพรวมธุรกิจ]
│   │   └── index.html              # หน้า Business Dashboard (N119465)
│   │
│   ├── documents/                  # 📑 [หมวดงานเอกสารการค้า]
│   │   ├── quotations.html         # หน้ารายการใบเสนอราคา
│   │   ├── quotation-new.html      # หน้าสร้างใบเสนอราคาใหม่
│   │   ├── billing-note-new.html   # หน้าสร้างใบวางบิล/แจ้งหนี้
│   │   ├── invoice-new.html        # หน้าสร้างใบกำกับภาษี/ส่งของ
│   │   └── cash-invoice-new.html   # หน้าสร้างใบเสร็จรับเงิน
│   │
│   └── index.html                  # Landing Page ตัวนำทางเริ่มต้น
│
├── package.json                    # การตั้งค่า Dependencies ของ Node.js
└── README.md                       # คู่มือระบบและ API Documentation
```

---

## 🗄️ โครงสร้างฐานข้อมูล (Database Schema)

ระบบใช้งานฐานข้อมูล **SQLite (`server/flowaccount.db`)** ซึ่งพร้อมนำไปเชื่อมต่อหรือแปลงเป็น **PostgreSQL / MySQL** ได้ทันที:

1. **`companies`** (ข้อมูลบริษัท & รหัสระบบ)
   - `id`, `code` (เช่น `N119465`), `name`, `tax_id`, `branch`, `address`, `phone`, `email`
2. **`customers`** (ฐานข้อมูลลูกค้า/คู่ค้า)
   - `id`, `code`, `name`, `tax_id`, `branch`, `address`, `contact_person`, `email`, `phone`, `credit_terms`
3. **`products`** (สินค้าและบริการ)
   - `id`, `code`, `name`, `type` (`PRODUCT` / `SERVICE`), `description`, `unit`, `unit_price`, `vat_rate`
4. **`documents`** (หัวเอกสารทุกประเภท: ใบเสนอราคา, ใบวางบิล, ใบกำกับภาษี, ใบเสร็จรับเงิน)
   - `id`, `company_id`, `doc_type`, `doc_number`, `issue_date`, `due_date`, `ref_doc_number`
   - ข้อมูลลูกค้า: `customer_name`, `customer_tax_id`, `customer_branch`, `customer_address`
   - ตัวเลขการเงิน: `subtotal`, `discount_amount`, `vat_type`, `vat_amount`, `wht_type`, `wht_rate`, `wht_amount`, `grand_total`
   - สถานะเอกสาร: `status` (`DRAFT`, `WAITING`, `APPROVED`, `PAID`, `CANCELLED`)
5. **`document_items`** (ตารางรายการสินค้า/บริการย่อยในเอกสาร)
   - `id`, `document_id`, `row_order`, `item_name`, `description`, `quantity`, `unit`, `unit_price`, `discount`, `vat_rate`, `total_amount`

---

## 🔌 รายการ REST API Endpoints

| Method | Endpoint | คำอธิบาย |
| :--- | :--- | :--- |
| `GET` | `/api/company` | ดึงข้อมูลบริษัทปัจจุบัน (`N119465`) |
| `GET` | `/api/customers` | ดึงรายชื่อลูกค้าทั้งหมด |
| `POST` | `/api/customers` | เพิ่มลูกค้าใหม่เข้าระบบ |
| `GET` | `/api/products` | ดึงรายการสินค้าและบริการ |
| `POST` | `/api/products` | เพิ่มสินค้าหรือบริการใหม่ |
| `GET` | `/api/documents?type=...&status=...` | ดึงรายการเอกสารตามประเภทและสถานะ |
| `GET` | `/api/documents/:id` | ดึงรายละเอียดเอกสารพร้อมตารางรายการสินค้า |
| `POST` | `/api/documents` | บันทึกสร้างเอกสารใหม่พร้อมบันทึกรายการสินค้าลงฐานข้อมูล |
| `PATCH` | `/api/documents/:id/status` | อัปเดตสถานะเอกสาร (เช่น อนุมัติ `APPROVED`, รับชำระ `PAID`) |
| `DELETE` | `/api/documents/:id` | ลบเอกสารออกจากระบบ |
| `GET` | `/api/documents/next-number/:type` | รันเลขที่เอกสารถัดไปอัตโนมัติ (เช่น `QT-202610-0003`) |
| `GET` | `/api/dashboard/metrics` | คำนวณยอดสรุปตัวเลข KPI ภาพรวมธุรกิจจากฐานข้อมูลจริง |

---

## 🚀 วิธีการเปิดใช้งานระบบจริง (Run Server)

เปิด Terminal หรือ PowerShell ในโฟลเดอร์โปรเจกต์:

```bash
# รันเซิร์ฟเวอร์ Node.js Express API
npm start
```

จากนั้นเปิดเว็บบราวเซอร์ไปที่:
* **หน้าเข้าสู่ระบบ (Login):** `http://localhost:3000/auth/login.html` (หรือเข้า `http://localhost:3000`)
* **หน้าภาพรวมธุรกิจ (Dashboard):** `http://localhost:3000/dashboard/`
* **หน้ารายการใบเสนอราคา:** `http://localhost:3000/documents/quotations.html`
* **หน้าออกเอกสารใหม่:** `http://localhost:3000/documents/quotation-new.html`

---

## ✨ คุณสมบัติเด่น (Key Features)

1. **Brand Identity & Vector Graphics:**
   - ใช้โลโก้ SVG คมชัดของ FlowAccount แท้ 100% ขยายได้ไม่แตก
   - คุมโทนสีประจำแบรนด์ **FlowAccount Blue** (`#2898CB`, `#1E7FA8`)

2. **ระบบฟอร์มและ UX ครบวงจร:**
   - **Show/Hide Password Toggle**: ปุ่มรูปดวงตาสำหรับกดสลับดูรหัสผ่าน
   - **Real-time Client Validation**: เช็คความถูกต้องของอีเมลและรหัสผ่าน พร้อมแสดงข้อความเตือน (Inline Error)
   - **Loading Spinner Animation**: แสดงสถานะกำลังโหลดบนปุ่มเมื่อกดเข้าสู่ระบบ ป้องกันการกดซ้ำซ้อน
   - **Alert Box**: แสดงข้อความแจ้งเตือนข้อผิดพลาดหรือสำเร็จด้านบนฟอร์ม

3. **Social Login Integration:**
   - ปุ่มล็อกอินผ่าน **Google**, **Facebook**, และ **Apple** พร้อม SVG Icon สีสันถูกต้องตาม Brand Guideline

4. **Multi-language Support (รองรับ 2 ภาษา):**
   - มีปุ่มสลับภาษา **TH 🇹🇭 / EN 🇬🇧** ที่มุมขวาล่างของ Footer
   - เปลี่ยนข้อความทุกจุดในหน้าจอได้ทันทีโดยไม่ต้องโหลดหน้าเว็บใหม่

5. **Mobile Friendly & Responsive:**
   - แถบดาวน์โหลดแอปมือถือ **FlowAccount App** ด้านบนเมื่อเปิดผ่านสมาร์ทโฟน
   - ปรับแต่งขนาดและ Padding ให้พอดีกับหน้าจอมือถือทุกขนาด

6. **Trust & Security Elements:**
   - ป้ายความปลอดภัย **256 bit SSL Encryption**
   - ลิงก์นโยบายความเป็นส่วนตัว (Privacy Notice) และเงื่อนไขการใช้บริการ (Terms of Service)

---

## 🎨 Design Tokens & Palette

| ตัวแปร CSS | โค้ดสี / ค่า | การใช้งาน |
| :--- | :--- | :--- |
| `--primary` | `#2898cb` | สีหลักปุ่มและโลโก้ FlowAccount |
| `--primary-hover` | `#1c7fa8` | สีปุ่มเมื่อนำเมาส์ไปชี้ |
| `--text-heading` | `#1e293b` | สีหัวข้อหลัก |
| `--text-muted` | `#64748b` | สีข้อความคำอธิบายและลิงก์รอง |
| `--border-color` | `#cbd5e1` | เส้นขอบกล่องข้อความ |
| `--bg-page` | `#f8fafc` | สีพื้นหลังหน้าเว็บ |
| `--error-color` | `#ef4444` | สีแจ้งเตือนข้อผิดพลาด |

---

## 🚀 วิธีการทดสอบและเปิดใช้งาน (Getting Started)

### 1. เปิดไฟล์โดยตรง
สามารถดับเบิลคลิกเปิดไฟล์ `index.html` บนเบราว์เซอร์ (Chrome, Edge, Safari, Firefox) ได้ทันที

### 2. รันผ่าน Local Server (แนะนำ)
เปิด PowerShell หรือ Terminal ในโฟลเดอร์นี้ แล้วรันคำสั่ง:

```bash
# ด้วย Python
python -m http.server 3000

# หรือด้วย Node.js (npx serve)
npx serve .
```
จากนั้นเปิดเบราว์เซอร์ไปที่ `http://localhost:3000`

---

## 🧪 ข้อมูลสำหรับทดสอบ Demo Login
- **Email:** `demo@flowaccount.com`
- **Password:** `123456`
> *หากกรอกข้อมูลนี้ ระบบจะแสดง Alert ข้อความสำเร็จสีเขียว*
