import Videos from '../models/Videos.js';
import {S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand} from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
dotenv.config();


// Initialize S3
const s3 = new S3Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  region: process.env.AWS_REGION
});

export const deleteVideo = async (req, res) => {

    const videoId = req?.query?.videoId || null;
    const id = req?.user?.id;

    if (!videoId || !id) {
        return res.status(404).json({ success: false, message: 'No tree found' });
    }

    let usersFileTree = await Videos.findOne({userid: id }) || null;

    if (!usersFileTree) {
        usersFileTree = new Videos({
              id,
              videoArr: JSON.stringify([])
            });

        await usersFileTree.save();
        return res.status(404).json({ success: false, message: 'No tree found' });
    }
    
        const params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: videoId,
        };
    
        const command = new DeleteObjectCommand(params);
    
        try {
            await s3.send(command);
            const updatedArr = JSON.parse(usersFileTree.videoArr).filter((el) => el.title !== videoId);
    usersFileTree.videoArr = JSON.stringify(updatedArr);

    await usersFileTree.save();
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }

    res.send({
        success: true,
        videoArr: usersFileTree.videoArr,
    });
};

export const getVideos = async (req, res) => {

    const id = req?.user?.id || null;

    if (!id) {
        return res.status(404).json({ success: false, message: 'No tree found 1' });
    }

    let usersFileTree = await Videos.findOne({userid: id }) || null;

    if (!usersFileTree) {
        usersFileTree = new Videos({
            id,
            videoArr: JSON.stringify([])
          });

      await usersFileTree.save();
    }

    res.send({
        success: true,
        videoArr: usersFileTree.videoArr,
    });
};