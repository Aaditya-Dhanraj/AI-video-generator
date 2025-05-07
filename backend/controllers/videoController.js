const dotenv = require('dotenv');
const { GoogleGenAI } = require("@google/genai");
const textToSpeech = require('@google-cloud/text-to-speech');
const { AssemblyAI } = require("assemblyai");
const OpenAI = require('openai');
const mongoose = require('mongoose');
const Videos = require('../models/Videos');
const fs = require('fs');
const util = require('util');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const {S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand} = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const {jimp} = require('jimp');
const child_process = require('child_process');
const sharp = require('sharp');
ffmpeg.setFfmpegPath(ffmpegPath);
dotenv.config();

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const geminiAi = new GoogleGenAI({ apiKey: process.env.GOOGLE_STUDIO_GEMINI_API_KEY });

const textToSpeechClient = new textToSpeech.TextToSpeechClient({
    apiKey: process.env.GOOGLE_CLOUD_TEXT_TO_SPEECH_API_KEY,
});

const captionGenerationClient = new AssemblyAI({
    apiKey: process.env.ASSEMBLY_AI_CAPTION_GENERATOR_API_KEY,
  });

  const openAiNebiusClient = new OpenAI({
    baseURL: 'https://api.studio.nebius.com/v1/',
    apiKey: process.env.NEBIUS_API_KEY_FOR_IMAGE_GENERATION,
});

const createRandomHex = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

const s3 = new S3Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  region: process.env.AWS_REGION
});

function imageAndContentPrompt (celebName, sports) { 
  return `Create a detailed script for a 30-second video about ${celebName} who is known for their achievements in ${sports}. The script should:

1. Include 3 distinct scenes that highlight significant moments in ${celebName}'s career and life
2. Feature interesting facts and compelling storytelling about their journey
3. For each scene, provide:
   - An image prompt that would generate a realistic AI image of ${celebName} in that scene
   - Content text that would be narrated during that scene

Format your response as a valid JSON object with the following structure:
{
  "scenes": [
    {
      "imagePrompt": "Detailed prompt for generating a realistic image of ${celebName} in scene 1 (image should be 1920x1080 pixels resolution in 16:9 aspect ratio and orientation should be portrait)",
      "contentText": "Narration text for scene 1 (within 30 words)"
    },
    {
      "imagePrompt": "Detailed prompt for generating a realistic image of ${celebName} in scene 2 (image should be 1920x1080 pixels resolution in 16:9 aspect ratio and orientation should be portrait)",
      "contentText": "Narration text for scene 2 (within 30 words)"
    },
    {
      "imagePrompt": "Detailed prompt for generating a realistic image of ${celebName} in scene 3 (image should be 1920x1080 pixels resolution in 16:9 aspect ratio and orientation should be portrait)",
      "contentText": "Narration text for scene 3 (within 30 words)"
    }
  ]
}

Each image prompt should be detailed enough to generate a photorealistic image of ${celebName} in the described scene, including specific details about their appearance, surroundings, lighting, and mood. The content text should be concise yet informative, highlighting unique facts about their career achievements, personal life, or impact on ${sports}.`;
}

async function getImageAndContentPrompt(celebName, sports) {
  const response = await geminiAi.models.generateContent({
    model: "gemini-1.5-flash",
    contents: imageAndContentPrompt(celebName, sports),
    config: {
        temperature: 1,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
        responseMimeType: "application/json"
      },
  });

  const script = JSON.parse(response?.candidates[0]?.content?.parts[0]?.text)?.scenes || null;
  return script;
}

async function convertTextToSpeech(contentText, fileId, key) {
    const text = contentText || null;

    if(!text) {
        return null;
    }

    const folderName = `assets_${fileId}`;

    try {
        if (!fs.existsSync(folderName)) {
            fs.mkdirSync(folderName);
        }
  
    const request = {
      input: {text: text},
      voice: {languageCode: 'en-US', ssmlGender: 'FEMALE'},
      audioConfig: {audioEncoding: 'MP3'},
    };
  
    const [response] = await textToSpeechClient.synthesizeSpeech(request);

    const filePath = `${folderName}/${fileId}_${key}.mp3`;


    const writeFile = util.promisify(fs.writeFile);
    await writeFile(filePath, response.audioContent, 'binary');
    return true;
} catch (error) {
    return null;
}
  }

  async function convertSpeechToCaption(fileId, i) {
    const folderName = `assets_${fileId}`;
    const audioFilePath = `${folderName}/${fileId}_${i}.mp3`;
    const jsonFilePath = `${folderName}/${fileId}_${i}.json`;
    
    try {
        if (!fs.existsSync(folderName)) {
            console.log(`Folder ${folderName} does not exist`);
            return null;
        }
        
        if (!fs.existsSync(audioFilePath)) {
            console.log(`Audio file ${audioFilePath} does not exist`);
            return null;
        }
        
        const params = {
            audio: audioFilePath,
        };
        
        try {
            console.log("Starting transcription...");
            const transcript = await captionGenerationClient.transcripts.transcribe(params);
            console.log("Transcription complete");
            
            if (!transcript || !transcript.words) {
                console.log("No transcript or words in response");
                return null;
            }
            
            try {
                const jsonContent = JSON.stringify(transcript.words, null, 2);
                
                await fs.promises.writeFile(jsonFilePath, jsonContent, 'utf8');
                console.log(`Caption file written to ${jsonFilePath}`);
                return true;
            } catch (writeError) {
                return null;
            }
        } catch (transcriptionError) {
            return null;
        }
    } catch (error) {
        console.error("Overall function error:", error);
        return null;
    }
}

async function generateImages(prompt, fileId, idx) {
    const folderName = `assets_${fileId}`;
    const imagePath = `${folderName}/${fileId}_${idx}.png`;
    
    try {
        if (!fs.existsSync(folderName)) {
            return null;
        }
        
        const response = await openAiNebiusClient.images.generate({
            "model": "black-forest-labs/flux-schnell",
            "response_format": "b64_json",
            "extra_body": {
                "response_extension": "png",
                "width": 800,
                "height": 1200,
                "num_inference_steps": 4,
                "negative_prompt": "",
                "seed": -1
            },
            "prompt": prompt,
        });
        
        if (!response || !response.data || !response.data[0] || !response.data[0].b64_json) {
            return null;
        }
        
        const imageData = response.data[0].b64_json;
        
        const buffer = Buffer.from(imageData, 'base64');
        
        const writeFile = util.promisify(fs.writeFile);
        await writeFile(imagePath, buffer);
        
        return true;
    } catch (error) {
        return null;
    }
}

async function deleteFolder(fileId) {
    const folderName = `assets_${fileId}`;
    try {
        if (fs.existsSync(folderName)) {
            fs.rmSync(folderName, { recursive: true, force: true });            
        }
    } catch (deleteError) {
        console.error('Error while deleting folder:', deleteError);
    }
}

async function buildVideo(userid) {
    const dir = `assets_${userid}`;
    if (!fs.existsSync(dir+'/1.png')) {
      fs.renameSync(dir+`/${userid}_0.png`, dir+'/1.png');
      fs.renameSync(dir+`/${userid}_1.png`, dir+'/2.png');
      fs.renameSync(dir+`/${userid}_2.png`, dir+'/3.png');
      fs.renameSync(dir+`/${userid}_0.mp3`, dir+'/1.mp3');
      fs.renameSync(dir+`/${userid}_1.mp3`, dir+'/2.mp3');
      fs.renameSync(dir+`/${userid}_2.mp3`, dir+'/3.mp3');
      fs.renameSync(dir+`/${userid}_0.json`, dir+'/transcription-1.json');
      fs.renameSync(dir+`/${userid}_1.json`, dir+'/transcription-2.json');
      fs.renameSync(dir+`/${userid}_2.json`, dir+'/transcription-3.json');
    }
  
    const images = ['1.png', '2.png', '3.png'];
    const audio = ['1.mp3', '2.mp3', '3.mp3'];
    const transcriptions = [
      'transcription-1.json',
      'transcription-2.json',
      'transcription-3.json'
    ];
    
    for (let i = 0; i < images.length; i++) {
      const inputImage = path.join(dir, images[i]);
      const inputAudio = path.join(dir, audio[i]);
      const inputTranscription = path.join(dir, transcriptions[i]);
      const outputVideo = path.join(dir, `output_${i}.mp4`);
  
      // Read the transcription file
      const transcription = JSON.parse(fs.readFileSync(inputTranscription, 'utf8'));
      const words = [...transcription];
      const duration = parseFloat((transcription[transcription.length - 1].end)/1000).toFixed(2);
        
      // Create subtitle file
      const subtitlePath = path.join(dir, `subtitles_${i}.srt`);
      let subtitleContent = '';
      let subtitleIndex = 1;
      
      // Group words into phrases for subtitles
      let currentPhrase = [];
      let currentStartTime = 0;
      let currentEndTime = 0;
      
      for (let j = 0; j < words.length; j++) {
        const word = words[j];
        
        if (currentPhrase.length === 0) {
          currentStartTime = word.start;
          currentPhrase.push(word.text);
        } else if (currentPhrase.length < 5) {
          currentPhrase.push(word.text);
        }
        
        currentEndTime = word.end;
        
        if (currentPhrase.length === 5 || j === words.length - 1) {
          const startTimeFormatted = formatTime(currentStartTime);
          const endTimeFormatted = formatTime(currentEndTime);
          
          subtitleContent += `${subtitleIndex}\n`;
          subtitleContent += `${startTimeFormatted} --> ${endTimeFormatted}\n`;
          subtitleContent += `${currentPhrase.join(' ')}\n\n`;
          
          subtitleIndex++;
          currentPhrase = [];
        }
      }
      
      fs.writeFileSync(subtitlePath, subtitleContent);
  
      try {
        await new Promise((resolve, reject) => {
          ffmpeg()
            .input(inputImage)
            .inputOptions(['-loop 1'])
            .input(inputAudio)
            .audioCodec('copy')
            .videoCodec('libx264')
            .outputOptions([
              '-pix_fmt yuv420p',
              '-shortest',
              '-t', duration,
              '-vf', `subtitles=${subtitlePath.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}:force_style='FontSize=16,Alignment=2,BorderStyle=1,Outline=2,Shadow=1,MarginV=40'`
            ])
            .on('error', (err) => {
              console.error('FFmpeg error:', err);
              reject(err);
            })
            .on('end', () => {
              console.log(`Video ${i+1} created successfully`);
              resolve();
            })
            .save(outputVideo);
        });
      } catch (err) {
        return null;
      }
    }
  
    // Create a concat file listing the files to concatenate
    const concatFilePath = path.join(dir, 'concat.txt');
    
    // Use relative paths in the concat file to avoid path escaping issues
    let concatFileContent = '';
    for (let i = 0; i < 3; i++) {
      concatFileContent += `file 'output_${i}.mp4'\n`;
    }
    
    fs.writeFileSync(concatFilePath, concatFileContent);
        
    try {
      await new Promise((resolve, reject) => {
        const command = ffmpeg()
          .input(concatFilePath)
          .inputOptions(['-f', 'concat', '-safe', '0'])
          .outputOptions(['-c', 'copy'])
          .on('start', commandLine => {
            console.log('FFmpeg merge command:', commandLine);
          })
          .on('error', (err) => {
            console.error('Merge error:', err);
            reject(err);
          })
          .on('end', () => {
            console.log('Merge completed successfully');
            resolve();
          })
          .save(path.join(dir, 'final.mp4'));
      });
      return `${userid}/final.mp4`;
    } catch (err) {
      return null;
    }
  }
  
  function formatTime(ms) {
    const totalSeconds = ms / 1000;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = Math.floor((totalSeconds % 1) * 1000);
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
  }

exports.createVideo = async (req, res) => {

      const newVideo = {
        title: '',
        url: '',
        thumbnail: '',
        createdAt: new Date()
    };

    try {
        const { celebName, sports } = req.body;
        const userid = req?.user?.id;

        if (!userid || !isValidObjectId(userid)) {
            return res.status(400).json({ success: false, message: 'Invalid user ID' });
        }
        

        if (!celebName || !sports) {
            return res.status(400).json({ 
                success: false, 
                message: 'Must include celebName or sports' 
            });
        }


        const getScript = await getImageAndContentPrompt(celebName, sports) || null;
        // console.log(getScript);

        // const getScript = [...testPromptData];

        if (!getScript) {
            return res.status(500).json({
                success: false,
                message: 'Error creating video',
            });
        }

        const promises = [];

        getScript.forEach((el, key)=>{
            promises.push(new Promise(async (resolve) => {
                const result = await convertTextToSpeech(el.contentText, userid, key);
                resolve(result);
              }));

              promises.push(new Promise(async (resolve) => {
                const result = await generateImages(el.imagePrompt, userid, key);
                resolve(result);
              }));
        });

        Promise.all(promises)
        .then(async(results) => {
            for (let i = 0; i < results.length; i++) {
                if (!results[i]) {
                    await deleteFolder(userid);
                        return res.status(500).json({
                        success: false,
                        message: 'Error creating video',
                    });
                }
              }

              const captionPromises = [];

              for(let i = 0; i < 3; i++) {
                  captionPromises.push(new Promise(async (resolve) => {
                      const result = await convertSpeechToCaption(userid, i);
                      resolve(result);
                    }));
              }
      
              Promise.all(captionPromises)
              .then(async(results) => {
                  for (let i = 0; i < results.length; i++) {
                      if (!results[i]) {
                          await deleteFolder(userid);
                              return res.status(500).json({
                              success: false,
                              message: 'Error creating video',
                          });
                      }
                    }

                    const videoBuilt = await buildVideo(userid);

                    if(!videoBuilt) {
                      await deleteFolder(userid);
                              return res.status(500).json({
                              success: false,
                              message: 'Error creating video',
                          });
                    }

                    const videoFileName = `${createRandomHex(32)}_videoFile`;
const thumbnailFileName = `${createRandomHex(32)}_thumbnailFile`;

// Fix: Store original title from user input rather than using filename
newVideo.title = videoFileName || 'Untitled Video'; 

        try {
          const videoFile = fs.readFileSync(`assets_${userid}/final.mp4`);
          const thumbnailFile = fs.readFileSync(`assets_${userid}/1.png`);
          
          // Fix: Set proper content types explicitly
          const videoParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: videoFileName,
            Body: videoFile.buffer,
            ContentType: 'video/mp4'
          };
        
          const thumbnailParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: thumbnailFileName,
            Body: thumbnailFile.buffer,
            ContentType: 'image/png'
          };
        
          // Upload files to S3
          const putVideoCommand = new PutObjectCommand(videoParams);
          const putThumbnailCommand = new PutObjectCommand(thumbnailParams);
        
          await s3.send(putVideoCommand);
          await s3.send(putThumbnailCommand);

          await deleteFolder(userid);
        
          const getVideoCommand = new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: videoFileName,
          });
          
          const getThumbnailCommand = new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: thumbnailFileName,
          });
        
          // Get signed URLs
          newVideo.url = await getSignedUrl(s3, getVideoCommand, { expiresIn: 6*24*60*60 });
          newVideo.thumbnail = await getSignedUrl(s3, getThumbnailCommand, { expiresIn: 6*24*60*60 });
        
          // Validate the video object
          if (!newVideo?.title || !newVideo?.url || !newVideo?.thumbnail) {
            throw new Error('Missing required video properties');
          }
        
          // Fix: Store video objects directly without stringification
          let videoCollection = await Videos.findOne({ userid });
  
  if (videoCollection) {
    // Parse the existing array, add the new video, then stringify again
    const videoArr = JSON.parse(videoCollection.videoArr || '[]');
    videoArr.push(newVideo);
    
    // Fix: Store as stringified JSON to match schema expectation
    videoCollection.videoArr = JSON.stringify(videoArr);
    
    await videoCollection.save();
    
    return res.status(200).json({
      success: true,
      message: 'Video added to collection',
      data: newVideo // Return the new video
    });
  } else {
    // Create new collection for user
    videoCollection = new Videos({
      userid,
      videoArr: JSON.stringify([newVideo]) // Keep as string to match schema
    });
    
    await videoCollection.save();
    
    await deleteFolder(userid);
    return res.status(201).json({
      success: true,
      message: 'New video collection created',
      data: newVideo // Return just the new video
    });
  }
        } catch (error) {
            await deleteFolder(userid);
            return res.status(500).json({
              success: false,
              message: 'Error processing video',
              error: error.message
            });
        }


              })
              .catch(async(error) => {
                  await deleteFolder(userid);
                  return res.status(500).json({
                      success: false,
                      message: 'Error creating video caption catch',
                      error: error.message
                  });
              });
        })
        .catch(async(error) => {
            await deleteFolder(userid);
            return res.status(500).json({
                success: false,
                message: 'Error creating video in outer catch',
                error: error.message
            });
        });
    } catch (error) {
      await deleteFolder(req.user.id);
        return res.status(500).json({
            success: false,
            message: 'Error creating video in outter most catch',
            error: error.message
        });
    }
};