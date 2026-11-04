/**
 * MinIO / S3 Object Storage Service
 * จัดการการอัปโหลดไฟล์, สร้าง Presigned URL สำหรับ Direct Upload, และลบไฟล์บน MinIO/S3
 */

const { S3Client, PutObjectCommand, DeleteObjectCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');
const crypto = require('crypto');
require('../config/env');

const s3Endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
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

/**
 * สุ่มชื่อไฟล์ใหม่เพื่อป้องกันชื่อซ้ำ
 */
function generateUniqueKey(originalFilename, prefix = 'uploads') {
    const ext = path.extname(originalFilename).toLowerCase();
    const timestamp = Date.now();
    const randomHex = crypto.randomBytes(6).toString('hex');
    return `${prefix}/${timestamp}-${randomHex}${ext}`;
}

/**
 * อัปโหลดไฟล์แบบ Buffer ตรงเข้าสู่ MinIO
 */
async function uploadFile({ buffer, filename, mimetype, bucket = defaultBucket, prefix = 'uploads' }) {
    const key = generateUniqueKey(filename, prefix);

    await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimetype || 'application/octet-stream'
    }));

    // URL สาธารณะสำหรับเข้าถึงไฟล์
    const publicUrl = `${s3Endpoint}/${bucket}/${key}`;
    return {
        key,
        bucket,
        publicUrl,
        size: buffer.length
    };
}

/**
 * สร้าง Presigned URL เพื่อให้ Frontend อัปโหลดไฟล์ตรงเข้า MinIO โดยไม่ต้องผ่าน RAM ของ Backend
 */
async function generatePresignedUploadUrl({ filename, mimetype, bucket = defaultBucket, prefix = 'uploads', expiresIn = 300 }) {
    const key = generateUniqueKey(filename, prefix);

    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: mimetype || 'application/octet-stream'
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn });
    const publicUrl = `${s3Endpoint}/${bucket}/${key}`;

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
    await s3.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: key
    }));
    return { success: true, key, bucket };
}

/**
 * ตรวจสอบความพร้อมของ MinIO Storage
 */
async function checkStorageHealth() {
    try {
        await s3.send(new HeadBucketCommand({ Bucket: defaultBucket }));
        return { status: 'OK', endpoint: s3Endpoint, bucket: defaultBucket };
    } catch (err) {
        return { status: 'ERROR', error: err.message };
    }
}

module.exports = {
    s3,
    uploadFile,
    generatePresignedUploadUrl,
    deleteFile,
    checkStorageHealth
};
