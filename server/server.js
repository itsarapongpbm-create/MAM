/**
 * FlowAccount Advance - Backend REST API Server (Node.js & Express)
 * Main Server Entry Point (Modular & Token-Optimized Architecture)
 * โครงสร้างแยกโมดูลตามโฟลเดอร์ config, models, services, routes เพื่อให้อ่านง่ายและประหยัด Token สูงสุด
 */

require('./config/env');

// Process-level crash prevention (Protect against ECONNRESET, network drops, unhandled stream events)
process.on('uncaughtException', (err) => {
    console.error('[CRITICAL PROTECT] Uncaught Exception caught by server shield:', err?.message || err);
});

process.on('unhandledRejection', (reason) => {
    console.error('[CRITICAL PROTECT] Unhandled Promise Rejection caught by server shield:', reason?.message || reason);
});

const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./database');
const { publicRegistry } = require('./document-types');

// นำเข้า Routing Modules ทั้งหมด
const companyRoutes = require('./routes/company.routes');
const customerRoutes = require('./routes/customers.routes');
const vendorRoutes = require('./routes/vendors.routes');
const productRoutes = require('./routes/products.routes');
const documentRoutes = require('./routes/documents.routes');
const expenseRoutes = require('./routes/expenses.routes');
const withholdingTaxRoutes = require('./routes/withholding-taxes.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/users.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const giftSetRoutes = require('./routes/gift-sets.routes');
const emailRoutes = require('./routes/email.routes');
const uploadRoutes = require('./routes/upload.routes');
const bankingRoutes = require('./routes/banking.routes');
const { checkStorageHealth, getStorageObject } = require('./services/storage.service');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// Serve frontend static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/dashboard/assets', express.static(path.join(__dirname, '..', 'public', 'assets')));
app.use('/inventory/assets', express.static(path.join(__dirname, '..', 'public', 'assets')));
app.use('/documents/assets', express.static(path.join(__dirname, '..', 'public', 'assets')));
app.use('/email/assets', express.static(path.join(__dirname, '..', 'public', 'assets')));
app.use('/banking/assets', express.static(path.join(__dirname, '..', 'public', 'assets')));

// ==========================================================================
// Health Check Endpoint (PostgreSQL + MinIO Status)
// ==========================================================================
app.get('/api/health', async (req, res) => {
    try {
        const db = require('./config/db');
        const healthSql = db.isPostgres()
            ? 'SELECT NOW() as now, current_database() as db'
            : "SELECT datetime('now') as now, 'sqlite' as db";
        const dbCheck = await db.getAsync(healthSql);
        const storageCheck = await checkStorageHealth();
        res.json({
            status: 'HEALTHY',
            timestamp: new Date().toISOString(),
            database: {
                engine: db.isPostgres() ? 'PostgreSQL 16' : 'SQLite 3',
                connected: Boolean(dbCheck),
                current_database: dbCheck?.db,
                server_time: dbCheck?.now
            },
            storage: {
                engine: 'MinIO (S3-Compatible)',
                ...storageCheck
            }
        });
    } catch (err) {
        res.status(500).json({ status: 'UNHEALTHY', error: err.message });
    }
});

// ==========================================================================
// API Routes Registration (เชื่อมโยงเส้นทาง API ทั้งหมด)
// ==========================================================================
app.use('/api/company', companyRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/products', productRoutes);
app.use('/api/documents', documentRoutes);
app.get('/api/document-types', (req, res) => res.json(publicRegistry()));
app.use('/api/expenses', expenseRoutes);
app.use('/api/withholding-taxes', withholdingTaxRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/gift-sets', giftSetRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/banking', bankingRoutes);

// Proxy route สำหรับดึงไฟล์รูปภาพ/เอกสารจาก MinIO S3 (รองรับการเข้าถึงผ่าน LAN IP ทุกเครื่อง)
app.use('/api/storage', async (req, res) => {
    try {
        const cleanPath = req.path.replace(/^\/+/, '');
        const parts = cleanPath.split('/');
        const bucket = decodeURIComponent(parts[0] || '');
        const key = parts.slice(1).map(decodeURIComponent).join('/');
        if (!bucket || !key) {
            return res.status(400).json({ error: 'Bucket and key are required' });
        }
        const obj = await getStorageObject({ bucket, key });
        res.setHeader('Content-Type', obj.contentType || 'application/octet-stream');
        if (obj.contentLength) {
            res.setHeader('Content-Length', String(obj.contentLength));
        }
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        if (obj.stream && typeof obj.stream.pipe === 'function') {
            obj.stream.on('error', () => {
                if (!res.headersSent) res.status(404).end();
            });
            obj.stream.pipe(res);
        } else if (obj.stream && typeof obj.stream.transformToByteArray === 'function') {
            const bytes = await obj.stream.transformToByteArray();
            res.send(Buffer.from(bytes));
        } else {
            res.status(404).json({ error: 'Object stream unavailable' });
        }
    } catch (err) {
        res.status(404).json({ error: 'File not found', details: err.message });
    }
});

// Auto-redirect incorrect nested paths
app.use('/dashboard/inventory', (req, res) => {
    res.redirect(`/inventory${req.url}`);
});
app.use('/dashboard/banking', (req, res) => {
    res.redirect(`/banking${req.url}`);
});

// 404 handler for API endpoints
app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found' }));

// Fallback route (Express 5 compatible)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// เริ่มต้นฐานข้อมูลและเปิดเซิร์ฟเวอร์
initDatabase().then(() => {
    app.listen(PORT, () => {
        console.log(`=======================================================`);
        console.log(`Giftory Platform Server running on http://localhost:${PORT}`);
        console.log(`Database: PostgreSQL 16 (giftory_db on Docker port 5432)`);
        console.log(`Storage:  MinIO S3 (Buckets: giftory-products, documents, slips)`);
        console.log(`API URL:  http://localhost:${PORT}/api`);
        console.log(`Health:   http://localhost:${PORT}/api/health`);
        console.log(`Dashboard: http://localhost:${PORT}/dashboard/`);
        console.log(`=======================================================`);
    });
}).catch(err => {
    console.error('Failed to start server:', err);
});
