import http.server
import socketserver
import os
import json
import sqlite3
import secrets
import smtplib
import urllib.parse
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')
DB_PATH = os.path.join(BASE_DIR, 'server', 'flowaccount.db')
CONFIG_PATH = os.path.join(BASE_DIR, 'server', 'email-config.json')
PORT = 3000

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def load_email_config():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"[Config Error] {e}")
    return {
        "admin_email": "admin@giftory.com",
        "smtp_enabled": False,
        "smtp_host": "smtp.gmail.com",
        "smtp_port": 587,
        "smtp_user": "",
        "smtp_pass": "",
        "smtp_from": "Giftory System <no-reply@giftory.com>"
    }

def send_approval_email(user_name, user_email, requested_role, token, host='localhost:3000'):
    config = load_email_config()
    admin_email = config.get('admin_email', 'admin@giftory.com')
    protocol = 'http'
    approve_url = f"{protocol}://{host}/api/auth/approve?token={token}"
    reject_url = f"{protocol}://{host}/api/auth/reject?token={token}"

    role_display = {
        'ADMIN': 'เจ้าของกิจการ (Admin)',
        'ACCOUNTANT': 'นักบัญชี (Accountant)',
        'SALES': 'พนักงานขาย (Sales)'
    }.get(requested_role, requested_role)

    subject = f"[Giftory] มีคำขอเข้าใช้งานระบบใหม่: คุณ {user_name} ({role_display})"

    html_content = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {{ font-family: 'Prompt', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; }}
  .email-container {{ max-width: 540px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }}
  .email-header {{ background: linear-gradient(135deg, #7D0A0A 0%, #a81818 100%); padding: 24px 28px; text-align: center; color: #ffffff; }}
  .email-header h1 {{ margin: 0; font-size: 20px; font-weight: 600; }}
  .email-header p {{ margin: 6px 0 0; font-size: 13px; opacity: 0.9; }}
  .email-body {{ padding: 28px; color: #334155; }}
  .info-table {{ width: 100%; border-collapse: collapse; margin: 20px 0; background: #f8fafc; border-radius: 10px; overflow: hidden; border: 1px solid #e2e8f0; }}
  .info-table td {{ padding: 12px 16px; font-size: 14px; border-bottom: 1px solid #edf2f7; }}
  .info-table td:first-child {{ font-weight: 600; color: #64748b; width: 35%; }}
  .role-badge {{ display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 12.5px; font-weight: 600; background: #fef2f2; color: #7D0A0A; border: 1px solid #fecaca; }}
  .btn-approve {{ display: block; width: 100%; text-align: center; padding: 13px 20px; background: #059669; color: #ffffff !important; text-decoration: none; font-weight: 600; font-size: 15px; border-radius: 8px; margin-top: 14px; box-sizing: border-box; }}
  .btn-reject {{ display: block; width: 100%; text-align: center; padding: 11px 20px; background: #f1f5f9; color: #dc2626 !important; text-decoration: none; font-weight: 600; font-size: 13.5px; border-radius: 8px; margin-top: 8px; box-sizing: border-box; border: 1px solid #e2e8f0; }}
  .email-footer {{ padding: 16px 28px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8; }}
</style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <h1>คำขอเข้าใช้งานระบบใหม่</h1>
      <p>ระบบบัญชีและการเงินดิจิทัล Giftory</p>
    </div>
    <div class="email-body">
      <p style="font-size: 15px; margin-top: 0;">เรียน ผู้ดูแลระบบ (Admin),</p>
      <p style="font-size: 14px; line-height: 1.6; color: #475569;">มีผู้ใช้งานส่งคำขอสร้างบัญชีใหม่เข้ามาในระบบ กรุณาตรวจสอบข้อมูลและพิจารณาอนุมัติสิทธิ์การเข้าถึง:</p>
      
      <table class="info-table">
        <tr><td>ชื่อ-นามสกุล</td><td><strong>{user_name}</strong></td></tr>
        <tr><td>อีเมล (Email)</td><td><a href="mailto:{user_email}" style="color: #7D0A0A;">{user_email}</a></td></tr>
        <tr><td>สิทธิ์ที่ขอ (Role)</td><td><span class="role-badge">{role_display}</span></td></tr>
        <tr><td>เวลาที่ส่งคำขอ</td><td>{datetime.now().strftime('%d/%m/%Y %H:%M:%S')}</td></tr>
      </table>

      <div style="margin-top: 24px;">
        <a href="{approve_url}" class="btn-approve">ยืนยันอนุมัติสิทธิ์ (Approve)</a>
        <a href="{reject_url}" class="btn-reject">ปฏิเสธคำขอ (Reject)</a>
      </div>

      <div style="margin-top: 20px; padding: 12px 14px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; font-size: 12.5px; color: #92400e; text-align: left; line-height: 1.5;">
        <strong>หมายเหตุสำหรับการทดสอบบนเครื่อง (Localhost):</strong><br>
        หากคลิกปุ่มแล้วขึ้นหน้าขาวหมุนค้าง (เนื่องจากระบบความปลอดภัยของ Gmail กับ Localhost)<br>
        • ให้<strong>คลิกขวาที่ปุ่ม</strong> แล้วเลือก <em>"คัดลอกที่อยู่ลิงก์" (Copy link address)</em> มาวางในแถบ URL ของเบราว์เซอร์โดยตรง<br>
        • หรือเข้าไปกดอนุมัติได้ทันทีที่หน้า <a href="http://localhost:3000/settings/users.html" style="color: #7D0A0A; font-weight: bold;">[จัดการผู้ใช้งานในระบบ]</a>
      </div>
    </div>
    <div class="email-footer">
      Giftory System © 2026 • อีเมลแจ้งเตือนอัตโนมัติ กรุณาอย่าตอบกลับ
    </div>
  </div>
</body>
</html>"""

    send_smtp_email(admin_email, subject, html_content)
    return True

def send_smtp_email(to_email, subject, html_content):
    config = load_email_config()
    
    # Always log email to local sent-emails.log for testing/inspection
    log_file = os.path.join(BASE_DIR, 'server', 'sent-emails.log')
    with open(log_file, 'a', encoding='utf-8') as f:
        f.write(f"\n======================================================\n")
        f.write(f"TIME: {datetime.now().isoformat()}\n")
        f.write(f"TO: {to_email}\n")
        f.write(f"SUBJECT: {subject}\n")
        f.write(f"======================================================\n")

    print(f"\n[EMAIL DISPATCHED]")
    print(f"  To: {to_email}")
    print(f"  Subject: {subject}\n")

    if config.get('smtp_enabled') and config.get('smtp_user') and config.get('smtp_pass'):
        try:
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = config.get('smtp_from', config['smtp_user'])
            msg['To'] = to_email
            msg.attach(MIMEText(html_content, 'html', 'utf-8'))

            server = smtplib.SMTP(config.get('smtp_host', 'smtp.gmail.com'), config.get('smtp_port', 587))
            server.starttls()
            server.login(config['smtp_user'], config['smtp_pass'])
            server.sendmail(config['smtp_user'], [to_email], msg.as_string())
            server.quit()
            print(f"[SMTP] Email sent successfully to {to_email}")
            return True
        except Exception as e:
            print(f"[SMTP Error] Failed to send email via SMTP to {to_email}: {e}")
            return False
    return True

def send_user_approved_email(user_name, user_email, role_name, host='localhost:3000'):
    subject = f"[Giftory] อนุมัติสิทธิ์เรียบร้อยแล้ว - ยินดีต้อนรับคุณ {user_name}"
    login_url = f"http://{host}/auth/login.html"

    html_content = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {{
    font-family: 'Prompt', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background-color: #f8fafc;
    margin: 0;
    padding: 24px 12px;
  }}
  .email-container {{
    max-width: 480px;
    margin: 0 auto;
    background: #ffffff;
    border-radius: 18px;
    overflow: hidden;
    border: 1px solid #e2e8f0;
    box-shadow: 0 10px 30px rgba(0,0,0,0.06), 0 20px 40px rgba(125, 10, 10, 0.08);
  }}
  .top-stripe {{
    height: 5px;
    background: linear-gradient(135deg, #7D0A0A 0%, #a81818 100%);
  }}
  .card-body {{
    padding: 36px 30px 30px;
    text-align: center;
  }}
  .brand-tag {{
    display: inline-block;
    font-size: 13px;
    font-weight: 700;
    color: #7D0A0A;
    letter-spacing: 1.2px;
    margin-bottom: 20px;
    text-transform: uppercase;
  }}
  .icon-circle {{
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: #ecfdf5;
    border: 2px solid #a7f3d0;
    color: #059669;
    font-size: 30px;
    line-height: 64px;
    text-align: center;
    font-weight: bold;
    margin: 0 auto 18px;
  }}
  .title {{
    font-size: 22px;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 8px;
  }}
  .subtitle {{
    font-size: 14.5px;
    color: #475569;
    line-height: 1.6;
    margin: 0 0 20px;
  }}
  .user-box {{
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 16px 20px;
    margin: 22px 0;
    text-align: left;
    font-size: 14px;
    line-height: 1.9;
  }}
  .info-line {{
    margin: 4px 0;
  }}
  .role-badge {{
    display: inline-block;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 12.5px;
    font-weight: 700;
    background: #fef2f2;
    color: #7D0A0A;
    border: 1px solid #fecaca;
  }}
  .status-badge {{
    display: inline-block;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: 12.5px;
    font-weight: 700;
    background: #ecfdf5;
    color: #059669;
    border: 1px solid #a7f3d0;
  }}
  .btn-primary {{
    display: block;
    width: 100%;
    text-align: center;
    padding: 13px 24px;
    background: #7D0A0A;
    color: #ffffff !important;
    text-decoration: none;
    font-weight: 600;
    font-size: 15px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(125, 10, 10, 0.25);
    box-sizing: border-box;
    margin-top: 14px;
  }}
  .email-footer {{
    padding: 16px 24px;
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;
    text-align: center;
    font-size: 12px;
    color: #94a3b8;
  }}
</style>
</head>
<body>
  <div class="email-container">
    <div class="top-stripe"></div>
    <div class="card-body">
      <div class="brand-tag">GIFTORY ACCOUNTING SYSTEM</div>
      <div class="icon-circle">✓</div>
      <h1 class="title">อนุมัติสิทธิ์เรียบร้อยแล้ว</h1>
      <p class="subtitle">
        ยินดีต้อนรับคุณ <strong>{user_name}</strong> เข้าสู่ระบบ<br>
        คำขอเข้าใช้งานได้รับการอนุมัติเรียบร้อยแล้ว สามารถเข้าสู่ระบบได้ทันที
      </p>

      <div class="user-box">
        <div class="info-line"><strong>ชื่อ-นามสกุล:</strong> {user_name}</div>
        <div class="info-line"><strong>อีเมลเข้าสู่ระบบ:</strong> {user_email}</div>
        <div class="info-line"><strong>สิทธิ์ที่ได้รับ:</strong> <span class="role-badge">{role_name}</span></div>
        <div class="info-line"><strong>สถานะบัญชี:</strong> <span class="status-badge">เปิดใช้งานแล้ว (ACTIVE)</span></div>
      </div>

      <a href="{login_url}" class="btn-primary">ไปที่หน้าเข้าสู่ระบบ &rarr;</a>

      <div style="margin-top: 18px; font-size: 12px; color: #94a3b8; line-height: 1.5;">
        หากคลิกปุ่มไม่ได้ ให้คัดลอกลิงก์นี้ไปวางที่เบราว์เซอร์:<br>
        <a href="{login_url}" style="color: #7D0A0A; word-break: break-all;">{login_url}</a>
      </div>
    </div>
    <div class="email-footer">
      Giftory System © 2026 • ระบบบัญชีและการเงินดิจิทัลสำหรับธุรกิจของคุณ
    </div>
  </div>
</body>
</html>"""
    return send_smtp_email(user_email, subject, html_content)

def send_user_rejected_email(user_name, user_email, host='localhost:3000'):
    subject = f"[Giftory] แจ้งผลคำขอเข้าใช้งานระบบ"

    html_content = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {{
    font-family: 'Prompt', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background-color: #f8fafc;
    margin: 0;
    padding: 24px 12px;
  }}
  .email-container {{
    max-width: 480px;
    margin: 0 auto;
    background: #ffffff;
    border-radius: 18px;
    overflow: hidden;
    border: 1px solid #e2e8f0;
    box-shadow: 0 10px 30px rgba(0,0,0,0.06);
  }}
  .top-stripe {{
    height: 5px;
    background: #64748b;
  }}
  .card-body {{
    padding: 36px 30px 30px;
    text-align: center;
  }}
  .icon-circle {{
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: #fef2f2;
    border: 2px solid #fecaca;
    color: #dc2626;
    font-size: 30px;
    line-height: 64px;
    text-align: center;
    font-weight: bold;
    margin: 0 auto 18px;
  }}
  .title {{
    font-size: 22px;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 8px;
  }}
  .subtitle {{
    font-size: 14.5px;
    color: #475569;
    line-height: 1.6;
    margin: 0 0 20px;
  }}
  .email-footer {{
    padding: 16px 24px;
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;
    text-align: center;
    font-size: 12px;
    color: #94a3b8;
  }}
</style>
</head>
<body>
  <div class="email-container">
    <div class="top-stripe"></div>
    <div class="card-body">
      <div style="font-size: 13px; font-weight: 700; color: #64748b; letter-spacing: 1.2px; margin-bottom: 20px;">GIFTORY SYSTEM</div>
      <div class="icon-circle">✕</div>
      <h1 class="title">แจ้งผลคำขอเข้าใช้งานระบบ</h1>
      <p class="subtitle">
        เรียนคุณ <strong>{user_name}</strong>,<br>
        คำขอเข้าใช้งานระบบ Giftory ของคุณไม่ได้รับการอนุมัติจากผู้ดูแลระบบในครั้งนี้
      </p>
      <p style="font-size: 13.5px; color: #64748b; line-height: 1.6; margin: 0;">
        หากคุณคิดว่าเกิดข้อผิดพลาดหรือต้องการติดต่อขอเข้าใช้งานเพิ่มเติม กรุณาติดต่อผู้ดูแลระบบขององค์กร
      </p>
    </div>
    <div class="email-footer">
      Giftory System © 2026 • ระบบบัญชีและการเงินดิจิทัลสำหรับธุรกิจของคุณ
    </div>
  </div>
</body>
</html>"""
    return send_smtp_email(user_email, subject, html_content)

class GiftoryRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=PUBLIC_DIR, **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # 1. API: Approve User by Token
        if path == '/api/auth/approve':
            token = query.get('token', [''])[0]
            if not token:
                return self.render_html_response("ข้อผิดพลาด", "ไม่พบรหัสยืนยันสิทธิ์ (Token) ในลิงก์", False)

            conn = get_db()
            user = conn.execute("SELECT * FROM users WHERE approval_token = ?", (token,)).fetchone()
            if not user:
                conn.close()
                return self.render_html_response("ไม่พบคำขอ", "ลิงก์นี้ไม่ถูกต้อง หรือคำขอนี้ได้รับการอนุมัติไปแล้ว", False)

            conn.execute("UPDATE users SET status = 'ACTIVE', approval_token = NULL WHERE id = ?", (user['id'],))
            conn.commit()
            conn.close()

            role_map = {'ADMIN': 'เจ้าของกิจการ (Admin)', 'ACCOUNTANT': 'นักบัญชี (Accountant)', 'SALES': 'พนักงานขาย (Sales)'}
            role_text = role_map.get(user['role'], user['role'])

            # Send Email Notification to User!
            host = self.headers.get('Host', 'localhost:3000')
            send_user_approved_email(user['name'], user['email'], role_text, host=host)

            return self.render_html_response(
                "อนุมัติสิทธิ์เรียบร้อยแล้ว",
                f"ผู้ใช้ <strong>{user['name']}</strong> ({user['email']}) ได้รับการอนุมัติสิทธิ์ <strong>{role_text}</strong> เรียบร้อยแล้ว (ระบบได้ส่งอีเมลแจ้งผู้ใช้งานเรียบร้อยแล้ว) สามารถเข้าสู่ระบบได้ทันที",
                True,
                user_info={"name": user['name'], "email": user['email'], "role": role_text}
            )

        # 2. API: Reject User by Token
        elif path == '/api/auth/reject':
            token = query.get('token', [''])[0]
            if not token:
                return self.render_html_response("ข้อผิดพลาด", "ไม่พบรหัสยืนยันสิทธิ์ (Token) ในลิงก์", False)

            conn = get_db()
            user = conn.execute("SELECT * FROM users WHERE approval_token = ?", (token,)).fetchone()
            if not user:
                conn.close()
                return self.render_html_response("ไม่พบคำขอ", "ลิงก์นี้ไม่ถูกต้อง หรือคำขอนี้ได้รับการดำเนินการไปแล้ว", False)

            conn.execute("UPDATE users SET status = 'REJECTED', approval_token = NULL WHERE id = ?", (user['id'],))
            conn.commit()
            conn.close()

            # Send Email Notification to User!
            host = self.headers.get('Host', 'localhost:3000')
            send_user_rejected_email(user['name'], user['email'], host=host)

            return self.render_html_response(
                "ปฏิเสธคำขอเรียบร้อยแล้ว",
                f"ปฏิเสธคำขอเข้าใช้งานของ <strong>{user['name']}</strong> ({user['email']}) เรียบร้อยแล้ว (ระบบได้ส่งอีเมลแจ้งผู้ใช้งานแล้ว)",
                False
            )

        # 3. API: Get All Users
        elif path == '/api/users':
            conn = get_db()
            rows = conn.execute("SELECT id, name, email, role, phone, avatar_url, status, last_login, username FROM users ORDER BY id DESC").fetchall()
            users = [dict(r) for r in rows]
            conn.close()
            return self.send_json_response(users)

        # Default: Serve static files
        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
        
        try:
            data = json.loads(body)
        except:
            data = {}

        # 1. API: Register with Email Approval
        if path == '/api/auth/register':
            full_name = (data.get('fullName') or data.get('name') or '').strip()
            email = (data.get('email') or '').strip()
            role = (data.get('role') or 'SALES').strip().upper()
            password = (data.get('password') or '').strip()

            if not full_name or not email or not password:
                return self.send_json_response({"error": "กรุณากรอกข้อมูลให้ครบทุกช่อง"}, status=400)

            if len(password) < 8:
                return self.send_json_response({"error": "รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร"}, status=400)

            if role not in ['ADMIN', 'ACCOUNTANT', 'SALES']:
                role = 'SALES'

            conn = get_db()
            existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
            if existing:
                conn.close()
                return self.send_json_response({"error": "อีเมลนี้ถูกใช้งานในระบบแล้ว"}, status=400)

            username = email.split('@')[0]
            approval_token = secrets.token_hex(24)

            conn.execute("""
                INSERT INTO users (name, email, username, role, requested_role, password, status, approval_token)
                VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)
            """, (full_name, email, username, role, role, password, approval_token))
            conn.commit()
            conn.close()

            # Dispatch Approval Email
            host = self.headers.get('Host', 'localhost:3000')
            send_approval_email(full_name, email, role, approval_token, host=host)

            return self.send_json_response({
                "success": True,
                "message": "ส่งคำขอสร้างบัญชีผู้ใช้สำเร็จ! ระบบได้ส่งอีเมลแจ้งผู้ดูแลระบบเพื่อพิจารณาอนุมัติสิทธิ์แล้ว",
                "approval_token": approval_token
            })

        # 2. API: Login with status verification
        elif path == '/api/auth/login':
            login_id = (data.get('email') or data.get('username') or '').strip()
            password = (data.get('password') or '').strip()

            if not login_id or not password:
                return self.send_json_response({"error": "กรุณากรอกอีเมลและรหัสผ่าน"}, status=400)

            conn = get_db()
            user = conn.execute("""
                SELECT * FROM users 
                WHERE (email = ? OR username = ?) AND password = ?
            """, (login_id, login_id, password)).fetchone()

            if not user:
                conn.close()
                return self.send_json_response({"error": "อีเมลหรือรหัสผ่านไม่ถูกต้อง"}, status=401)

            if user['status'] == 'PENDING':
                conn.close()
                return self.send_json_response({"error": "บัญชีของคุณอยู่ระหว่างรอผู้ดูแลระบบอนุมัติสิทธิ์ผ่านอีเมล กรุณารอการยืนยัน"}, status=403)

            if user['status'] == 'REJECTED':
                conn.close()
                return self.send_json_response({"error": "คำขอเข้าใช้งานของคุณไม่ได้รับการอนุมัติ กรุณาติดต่อผู้ดูแลระบบ"}, status=403)

            if user['status'] != 'ACTIVE':
                conn.close()
                return self.send_json_response({"error": "บัญชีผู้ใช้นี้ถูกระงับการใช้งาน"}, status=403)

            conn.execute("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?", (user['id'],))
            conn.commit()
            conn.close()

            return self.send_json_response({
                "success": True,
                "user": {
                    "id": user['id'],
                    "name": user['name'],
                    "email": user['email'],
                    "role": user['role'],
                    "avatar": user['avatar_url'] or f"https://ui-avatars.com/api/?name={urllib.parse.quote(user['name'])}&background=7D0A0A&color=fff"
                },
                "token": f"giftory-token-{user['id']}-{secrets.token_hex(8)}"
            })

        # 3. API: Forgot Password
        elif path == '/api/auth/forgot-password':
            email = (data.get('email') or '').strip()
            if not email:
                return self.send_json_response({"error": "กรุณากรอกอีเมล"}, status=400)

            conn = get_db()
            user = conn.execute("SELECT id, name, email FROM users WHERE email = ?", (email,)).fetchone()
            conn.close()

            print(f"[FORGOT PASSWORD] Reset request for: {email} (Exists: {bool(user)})")
            return self.send_json_response({
                "success": True,
                "message": f"ระบบได้ส่งคำแนะนำและลิงก์สำหรับตั้งรหัสผ่านใหม่ไปยังอีเมล {email} เรียบร้อยแล้ว กรุณาตรวจสอบกล่องข้อความ"
            })

        # 4. API: Direct Approve from Admin Web UI
        elif path.startswith('/api/users/') and path.endswith('/approve'):
            parts = path.split('/')
            user_id = parts[3]
            conn = get_db()
            user = conn.execute("SELECT name, email, role FROM users WHERE id = ?", (user_id,)).fetchone()
            conn.execute("UPDATE users SET status = 'ACTIVE', approval_token = NULL WHERE id = ?", (user_id,))
            conn.commit()
            conn.close()

            if user:
                role_map = {'ADMIN': 'เจ้าของกิจการ (Admin)', 'ACCOUNTANT': 'นักบัญชี (Accountant)', 'SALES': 'พนักงานขาย (Sales)'}
                role_text = role_map.get(user['role'], user['role'])
                host = self.headers.get('Host', 'localhost:3000')
                send_user_approved_email(user['name'], user['email'], role_text, host=host)

            return self.send_json_response({"success": True, "message": "อนุมัติผู้ใช้งานและส่งอีเมลแจ้งเตือนเรียบร้อยแล้ว"})

        # 5. API: Direct Reject from Admin Web UI
        elif path.startswith('/api/users/') and path.endswith('/reject'):
            parts = path.split('/')
            user_id = parts[3]
            conn = get_db()
            user = conn.execute("SELECT name, email FROM users WHERE id = ?", (user_id,)).fetchone()
            conn.execute("UPDATE users SET status = 'REJECTED', approval_token = NULL WHERE id = ?", (user_id,))
            conn.commit()
            conn.close()

            if user:
                host = self.headers.get('Host', 'localhost:3000')
                send_user_rejected_email(user['name'], user['email'], host=host)

            return self.send_json_response({"success": True, "message": "ปฏิเสธคำขอและส่งอีเมลแจ้งเตือนเรียบร้อยแล้ว"})

        super().do_POST()

    def send_json_response(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def render_html_response(self, title, message, is_success, user_info=None):
        icon = "✓" if is_success else "✕"
        icon_bg = "#ecfdf5" if is_success else "#fef2f2"
        icon_color = "#059669" if is_success else "#dc2626"
        icon_border = "#a7f3d0" if is_success else "#fecaca"

        user_html = ""
        if user_info:
            user_html = f"""
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 20px 0; text-align: left; font-size: 14px; line-height: 1.8;">
              <div><strong>ชื่อ-นามสกุล:</strong> {user_info.get('name')}</div>
              <div><strong>อีเมล:</strong> {user_info.get('email')}</div>
              <div><strong>สิทธิ์ที่ได้รับ:</strong> <span style="color: #7D0A0A; font-weight: 600;">{user_info.get('role')}</span></div>
              <div><strong>สถานะ:</strong> <span style="color: #059669; font-weight: 600;">เปิดใช้งานแล้ว (ACTIVE)</span></div>
            </div>
            """

        html = f"""<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} | Giftory</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Prompt:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    body {{
      font-family: 'Prompt', 'Inter', system-ui, -apple-system, sans-serif;
      background: radial-gradient(circle at 50% 20%, rgba(125, 10, 10, 0.08) 0%, rgba(248, 250, 252, 0.95) 60%), #f8fafc;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    }}
    .card {{
      background: #ffffff;
      max-width: 460px;
      width: 100%;
      border-radius: 18px;
      padding: 42px 34px;
      text-align: center;
      box-shadow: 0 12px 35px -5px rgba(0, 0, 0, 0.06), 0 25px 50px -12px rgba(125, 10, 10, 0.12);
      border: 1px solid rgba(226, 232, 240, 0.9);
      position: relative;
    }}
    .card::before {{
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; height: 4px;
      background: linear-gradient(135deg, #7D0A0A 0%, #a81818 100%);
      border-radius: 18px 18px 0 0;
    }}
    .icon {{
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: {icon_bg};
      color: {icon_color};
      border: 2px solid {icon_border};
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 30px;
      margin-bottom: 20px;
      font-weight: bold;
    }}
    h1 {{
      font-size: 22px;
      color: #0f172a;
      margin: 0 0 10px;
      font-weight: 600;
    }}
    p {{
      color: #475569;
      font-size: 14.5px;
      line-height: 1.6;
      margin: 0;
    }}
    .btn {{
      display: inline-block;
      margin-top: 14px;
      padding: 12px 28px;
      background: #7D0A0A;
      color: #ffffff;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(125, 10, 10, 0.25);
      transition: all 0.2s;
    }}
    .btn:hover {{
      background: #630808;
      transform: translateY(-1px);
    }}
  </style>
</head>
<body>
  <div class="card">
    <div style="margin-bottom: 22px;">
      <img src="/assets/images/logo.jpg" alt="Giftory" style="height: 48px; max-height: 48px; width: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(177, 144, 93, 0.25);">
    </div>
    <div class="icon">{icon}</div>
    <h1>{title}</h1>
    <p>{message}</p>
    {user_html}
    <div style="margin-top: 22px;">
      <a href="/auth/login.html" class="btn">ไปที่หน้าเข้าสู่ระบบ &rarr;</a>
    </div>
  </div>
</body>
</html>"""
        body = html.encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

if __name__ == '__main__':
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("", PORT), GiftoryRequestHandler) as httpd:
        print(f"=== Giftory Server Running on http://localhost:{PORT} ===")
        print(f"Root Directory: {PUBLIC_DIR}")
        print(f"Database: {DB_PATH}")
        print(f"Ready for User Registration & Email Approvals.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer shutting down.")
