/**
 * File & Media Upload Routes (MinIO / S3 Storage)
 * Endpoint: /api/upload
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { uploadFile, generatePresignedUploadUrl, deleteFile } = require('../services/storage.service');

// จัดเก็บไฟล์ใน RAM ชั่วคราวก่อนส่งตรงเข้า MinIO
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 15 * 1024 * 1024 // จำกัด 15 MB
    }
});

/**
 * 1. อัปโหลดไฟล์ตรงเข้า MinIO ผ่าน Backend
 * POST /api/upload
 * Content-Type: multipart/form-data
 * Field: 'file'
 * Body/Query: bucket (default: giftory-products), prefix (default: products)
 */
router.post('/', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'กรุณาแนบไฟล์ที่ต้องการอัปโหลด' });
        }

        const bucket = req.body.bucket || req.query.bucket || process.env.MINIO_BUCKET_PRODUCTS || 'giftory-products';
        const prefix = req.body.prefix || req.query.prefix || 'products';

        const result = await uploadFile({
            buffer: req.file.buffer,
            filename: req.file.originalname,
            mimetype: req.file.mimetype,
            bucket,
            prefix
        });

        res.status(201).json({
            message: 'อัปโหลดไฟล์สำเร็จ',
            ...result
        });
    } catch (err) {
        console.error('Upload Error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัปโหลดไฟล์', details: err.message });
    }
});

/**
 * 2. ขอ Presigned URL สำหรับ Direct Upload จาก Browser ตรงเข้า MinIO (ความเร็วสูงสุด)
 * POST /api/upload/presigned-url
 * Body: { filename: "product.png", mimetype: "image/png", bucket: "giftory-products", prefix: "products" }
 */
router.post('/presigned-url', async (req, res) => {
    try {
        const { filename, mimetype, bucket, prefix } = req.body;
        if (!filename) {
            return res.status(400).json({ error: 'กรุณาระบุชื่อไฟล์ (filename)' });
        }

        const result = await generatePresignedUploadUrl({
            filename,
            mimetype,
            bucket: bucket || process.env.MINIO_BUCKET_PRODUCTS || 'giftory-products',
            prefix: prefix || 'products'
        });

        res.json(result);
    } catch (err) {
        console.error('Presigned URL Error:', err);
        res.status(500).json({ error: 'ไม่สามารถสร้าง Presigned URL ได้', details: err.message });
    }
});

/**
 * 3. ลบไฟล์ออกจาก MinIO
 * DELETE /api/upload
 * Body: { key: "products/xxx.png", bucket: "giftory-products" }
 */
router.delete('/', async (req, res) => {
    try {
        const { key, bucket } = req.body;
        if (!key) {
            return res.status(400).json({ error: 'กรุณาระบุ key ของไฟล์ที่ต้องการลบ' });
        }

        const result = await deleteFile({
            key,
            bucket: bucket || process.env.MINIO_BUCKET_PRODUCTS || 'giftory-products'
        });

        res.json({ message: 'ลบไฟล์สำเร็จ', ...result });
    } catch (err) {
        console.error('Delete File Error:', err);
        res.status(500).json({ error: 'ไม่สามารถลบไฟล์ได้', details: err.message });
    }
});

module.exports = router;
