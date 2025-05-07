import {S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand} from '@aws-sdk/client-s3';
import crypto from 'crypto';
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import dotenv from 'dotenv';
dotenv.config();


const createRandomHex = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

// Initialize S3
const s3 = new S3Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  region: process.env.AWS_REGION
});

export const getFileUrl = async (req, res) => {

    const Key = req.params.key;

    if (!Key) {
        return res.status(404).json({ success: false, message: 'No key found' });
    }

    const getObjectParams = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key,
    };
    const command = new GetObjectCommand(getObjectParams);
    let url = null;
    try {
        url = await getSignedUrl(s3, command, { expiresIn: 2*24*60*60 });
    } catch (error) {
        return res.status(404).json({ success: false, message: error.message });
    }

    if (!url) {
        return res.status(404).json({ success: false, message: 'No url found' });
    }

    res.send({
        success: true,
        url,
    });
};

// Upload file to S3 and save file metadata in MongoDB
export const uploadFile = async (req, res) => {

    const file = req.file;  // Uploaded file

    const fileName = `${createRandomHex(32)}-${file?.originalname || file?.Name || 'unNamed File'}`;

    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        // Key: `${folderId}/${file.originalname}`,  // File name in S3 (can be based on folder and file name)
        Key: fileName,
        Body: file.buffer,
        ContentType: file.mimetype
    };

    const command = new PutObjectCommand(params);

    try {
        await s3.send(command);
    } catch (error) {
        console.log(error);
        return res.status(404).json({ success: false, message: error.message });
    }

    res.status(201).send({
        success: true,
        fileName,
    })
};

// Delete a file (from S3 and MongoDB)
export const deleteFile = async (req, res) => {
    const Key = req.params.key;

    if (!Key) {
        return res.status(404).json({ success: false, message: 'key not found' });
    }

    const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key,
    };

    const command = new DeleteObjectCommand(params);

    try {
        await s3.send(command);
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }

    res.send({
        success: true,
        message: 'File Deleted',
    });
};
