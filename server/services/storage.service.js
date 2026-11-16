/**
 * MinIO / S3 Object Storage Service
 * จัดการการอัปโหลดไฟล์, สร้าง Presigned URL สำหรับ Direct Upload, และลบไฟล์บน MinIO/S3
 */

const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadBucketCommand,
    CreateBucketCommand,
    PutBucketPolicyCommand
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('../config/env');

const rawMinioHost = process.env.MINIO_ENDPOINT || '';
const minioPort = process.env.MINIO_API_PORT || 9000;
const s3Endpoint = process.env.S3_ENDPOINT || (
    rawMinioHost
        ? (rawMinioHost.startsWith('http://') || rawMinioHost.startsWith('https://')
            ? rawMinioHost
            : `http://${rawMinioHost}:${minioPort}`)
        : 'http://localhost:9000'
);
const rootUser = process.env.MINIO_ROOT_USER || 'minioadmin';
const rootPassword = process.env.MINIO_ROOT_PASSWORD || 'minioadmin123';
const defaultBucket = process.env.MINIO_BUCKET_PRODUCTS || 'giftory-products';

const s3 = new S3Client({
    endpoint: s3Endpoint,
    region: 'us-east-1',
    credentials: {
        accessKeyId: rootUser,
        secretAccessKey: rootPassword
    },
    forcePathStyle: true
});

const ensuredBuckets = new Set();

/**
 * ตรวจสอบและสร้าง Bucket พร้อมตั้งค่า Public Read Policy อัตโนมัติหากยังไม่มี
 */
async function ensureBucket(bucket = defaultBucket) {
    if (!bucket || ensuredBuckets.has(bucket)) return;
    try {
        await s3.send(new HeadBucketCommand({ Bucket: bucket }));
        ensuredBuckets.add(bucket);
    } catch (err) {
        const statusCode = err?.$metadata?.httpStatusCode;
        const code = err?.name || err?.Code;
        if (statusCode === 404 || code === 'NotFound' || code === 'NoSuchBucket') {
            await s3.send(new CreateBucketCommand({ Bucket: bucket }));
            const policy = {
                Version: '2012-10-17',
                Statement: [
                    {
                        Effect: 'Allow',
                        Principal: { AWS: ['*'] },
                        Action: ['s3:GetObject'],
                        Resource: [`arn:aws:s3:::${bucket}/*`]
                    }
                ]
            };
            try {
                await s3.send(new PutBucketPolicyCommand({
                    Bucket: bucket,
                    Policy: JSON.stringify(policy)
                }));
            } catch (_) {}
            ensuredBuckets.add(bucket);
        } else {
            throw err;
        }
    }
}

/**
 * สุ่มชื่อไฟล์ใหม่เพื่อป้องกันชื่อซ้ำ
 */
function generateUniqueKey(originalFilename, prefix = 'uploads') {
    const ext = path.extname(originalFilename || '').toLowerCase();
    const timestamp = Date.now();
    const randomHex = crypto.randomBytes(6).toString('hex');
    return `${prefix}/${timestamp}-${randomHex}${ext}`;
}

/**
 * อัปโหลดไฟล์แบบ Buffer ตรงเข้าสู่ MinIO (พร้อม Local Fallback กรณี MinIO ปิดอยู่)
 */
async function uploadFile({ buffer, filename, mimetype, bucket = defaultBucket, prefix = 'uploads' }) {
    const key = generateUniqueKey(filename, prefix);
    const publicUrl = `/api/storage/${bucket}/${key}`;

    try {
        await ensureBucket(bucket);
        await s3.send(new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: buffer,
            ContentType: mimetype || 'application/octet-stream'
        }));
    } catch (s3Err) {
        // Fallback บันทึกลงดิสก์ในกรณีที่ไม่ได้เปิด Docker MinIO
        const fallbackPath = path.join(__dirname, '..', '..', 'public', 'assets', 'uploads', bucket, key);
        fs.mkdirSync(path.dirname(fallbackPath), { recursive: true });
        fs.writeFileSync(fallbackPath, buffer);
    }

    return {
        key,
        bucket,
        publicUrl,
        size: buffer.length
    };
}

/**
 * ดึงไฟล์จาก MinIO (หรือ Local Fallback) เพื่อส่งผ่าน Proxy Route /api/storage/:bucket/*
 */
async function getStorageObject({ bucket = defaultBucket, key }) {
    try {
        const response = await s3.send(new GetObjectCommand({
            Bucket: bucket,
            Key: key
        }));
        return {
            stream: response.Body,
            contentType: response.ContentType || 'application/octet-stream',
            contentLength: response.ContentLength
        };
    } catch (s3Err) {
        const fallbackPath = path.join(__dirname, '..', '..', 'public', 'assets', 'uploads', bucket, key);
        if (fs.existsSync(fallbackPath)) {
            const stat = fs.statSync(fallbackPath);
            const ext = path.extname(fallbackPath).toLowerCase();
            const mimeMap = {
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.webp': 'image/webp',
                '.svg': 'image/svg+xml',
                '.pdf': 'application/pdf'
            };
            return {
                stream: fs.createReadStream(fallbackPath),
                contentType: mimeMap[ext] || 'application/octet-stream',
                contentLength: stat.size
            };
        }
        throw s3Err;
    }
}

/**
 * สร้าง Presigned URL เพื่อให้ Frontend อัปโหลดไฟล์ตรงเข้า MinIO โดยไม่ต้องผ่าน RAM ของ Backend
 */
async function generatePresignedUploadUrl({ filename, mimetype, bucket = defaultBucket, prefix = 'uploads', expiresIn = 300 }) {
    const key = generateUniqueKey(filename, prefix);
    try {
        await ensureBucket(bucket);
    } catch (_) {}

    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: mimetype || 'application/octet-stream'
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn });
    const publicUrl = `/api/storage/${bucket}/${key}`;

    return {
        key,
        bucket,
        uploadUrl,
        publicUrl,
        expiresIn
    };
}

/**
 * ลบไฟล์ออกจาก MinIO
 */
async function deleteFile({ key, bucket = defaultBucket }) {
    try {
        await s3.send(new DeleteObjectCommand({
            Bucket: bucket,
            Key: key
        }));
    } catch (err) {
        const fallbackPath = path.join(__dirname, '..', '..', 'public', 'assets', 'uploads', bucket, key);
        if (fs.existsSync(fallbackPath)) {
            fs.unlinkSync(fallbackPath);
        } else {
            throw err;
        }
    }
    return { success: true, key, bucket };
}

/**
 * ตรวจสอบความพร้อมของ MinIO Storage
 */
async function checkStorageHealth() {
    try {
        await ensureBucket(defaultBucket);
        return { status: 'OK', endpoint: s3Endpoint, bucket: defaultBucket };
    } catch (err) {
        return { status: 'ERROR', error: err.message };
    }
}

module.exports = {
    s3,
    ensureBucket,
    uploadFile,
    getStorageObject,
    generatePresignedUploadUrl,
    deleteFile,
    checkStorageHealth
};
