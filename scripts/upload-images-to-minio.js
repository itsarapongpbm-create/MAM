/**
 * Image Migration Pipeline: Local Filesystem -> MinIO Object Storage (S3)
 * Uploads all files from public/assets/images/ to MinIO bucket 'giftory-products'
 * and updates PostgreSQL products & gift_sets table image_url.
 */

const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { Client: PgClient } = require('pg');
require('../server/config/env');

const s3Endpoint = process.env.S3_ENDPOINT || 'http://localhost:9000';
const s3Bucket = process.env.MINIO_BUCKET_PRODUCTS || 'giftory-products';
const pgConnectionString = process.env.DATABASE_URL || 'postgresql://giftory_user:giftory_secret123@localhost:5432/giftory_db';

const s3 = new S3Client({
    endpoint: s3Endpoint,
    region: 'us-east-1',
    credentials: {
        accessKeyId: process.env.MINIO_ROOT_USER || 'minioadmin',
        secretAccessKey: process.env.MINIO_ROOT_PASSWORD || 'minioadmin123'
    },
    forcePathStyle: true
});

const mimeMap = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.gif': 'image/gif'
};

function getAllFiles(dirPath, arrayOfFiles = []) {
    const files = fs.readdirSync(dirPath);

    files.forEach((file) => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            getAllFiles(fullPath, arrayOfFiles);
        } else {
            arrayOfFiles.push(fullPath);
        }
    });

    return arrayOfFiles;
}

async function uploadImages() {
    console.log('===============================================================');
    console.log('   Step 3: Upload Images to MinIO Object Storage');
    console.log(`   Target Bucket: ${s3Bucket}`);
    console.log(`   MinIO Endpoint: ${s3Endpoint}`);
    console.log('===============================================================\n');

    const baseDir = path.resolve(__dirname, '../public/assets/images');
    if (!fs.existsSync(baseDir)) {
        console.error('Directory not found:', baseDir);
        process.exit(1);
    }

    const allFiles = getAllFiles(baseDir);
    console.log(`Found ${allFiles.length} image files to upload.\n`);

    let uploadedCount = 0;

    for (const filePath of allFiles) {
        // Calculate S3 Key relative to assets/images
        const relativePath = path.relative(baseDir, filePath).replace(/\\/g, '/');
        const ext = path.extname(filePath).toLowerCase();
        const contentType = mimeMap[ext] || 'application/octet-stream';
        const fileBuffer = fs.readFileSync(filePath);

        try {
            await s3.send(new PutObjectCommand({
                Bucket: s3Bucket,
                Key: relativePath,
                Body: fileBuffer,
                ContentType: contentType
            }));
            uploadedCount++;
            if (uploadedCount % 50 === 0 || uploadedCount === allFiles.length) {
                console.log(`Uploaded ${uploadedCount} / ${allFiles.length} files...`);
            }
        } catch (err) {
            console.error(`Failed to upload ${relativePath}:`, err.message);
        }
    }

    console.log(`\nSuccessfully uploaded all ${uploadedCount} files to MinIO!\n`);

    // Now update PostgreSQL image_url columns
    console.log('Updating PostgreSQL image_url references...');
    const pg = new PgClient({ connectionString: pgConnectionString });
    await pg.connect();

    const publicBaseUrl = `${s3Endpoint}/${s3Bucket}`;

    // Update products image_url
    // e.g. /assets/images/products/snack_002.png -> http://localhost:9000/giftory-products/products/snack_002.png
    const updateProductsRes = await pg.query(`
        UPDATE products
        SET image_url = REPLACE(image_url, '/assets/images/', '${publicBaseUrl}/')
        WHERE image_url LIKE '/assets/images/%';
    `);
    console.log(`Updated ${updateProductsRes.rowCount} product image URLs in PostgreSQL.`);

    // Update gift_sets image_url
    // e.g. /assets/images/hampers/page_1_img_4.png -> http://localhost:9000/giftory-products/hampers/page_1_img_4.png
    const updateGiftSetsRes = await pg.query(`
        UPDATE gift_sets
        SET image_url = REPLACE(image_url, '/assets/images/', '${publicBaseUrl}/')
        WHERE image_url LIKE '/assets/images/%';
    `);
    console.log(`Updated ${updateGiftSetsRes.rowCount} gift set image URLs in PostgreSQL.`);

    await pg.end();

    console.log('\n===============================================================');
    console.log('Step 3 Complete! All files are now in MinIO Object Storage.');
    console.log('===============================================================');
}

uploadImages().catch(err => {
    console.error('Fatal error during image upload:', err);
    process.exit(1);
});
