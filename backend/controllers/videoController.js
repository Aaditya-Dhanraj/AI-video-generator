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

// Dynamically set FFmpeg path based on environment
const getFfmpegPath = () => {
  try {
    // Try to get the path from ffmpeg-static
    const ffmpegStatic = require('ffmpeg-static');
    logger.info(`FFmpeg static path: ${ffmpegStatic}`);
    
    // Check if the file exists at this path
    if (fs.existsSync(ffmpegStatic)) {
      logger.info(`FFmpeg binary exists at static path`);
      return ffmpegStatic;
    } else {
      logger.warn(`FFmpeg binary not found at static path, checking alternatives`);
    }
  } catch (err) {
    logger.warn(`Could not load ffmpeg-static module: ${err.message}`);
  }
  
  // Check environment-specific paths
  const possiblePaths = [
    // Standard ffmpeg-static path
    '/var/task/node_modules/ffmpeg-static/ffmpeg',
    // Common Vercel serverless location
    '/tmp/ffmpeg',
    // Current working directory
    path.join(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg'),
    // Global PATH lookup (may not work in serverless)
    'ffmpeg'
  ];
  
  for (const binPath of possiblePaths) {
    try {
      if (fs.existsSync(binPath)) {
        logger.info(`Found FFmpeg binary at ${binPath}`);
        return binPath;
      }
    } catch (err) {
      logger.debug(`Error checking path ${binPath}: ${err.message}`);
    }
  }
  
  logger.error(`Could not find FFmpeg binary in any location`);
  throw new Error('FFmpeg binary not found in any expected location');
};

// Ensure tmp directory exists (for Vercel serverless functions)
const ensureTmpDirectoryExists = () => {
  try {
    if (!fs.existsSync('/tmp')) {
      fs.mkdirSync('/tmp', { recursive: true });
      logger.info('Created /tmp directory');
    }
  } catch (error) {
    logger.error('Error ensuring /tmp directory exists', error);
    // If we can't create /tmp, we're in a serious environment issue
    throw new Error('Cannot create /tmp directory for file operations');
  }
};

// Helper to create a folder in /tmp
const createTmpFolder = (folderName) => {
  const fullPath = path.join('/tmp', folderName);
  try {
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      logger.debug(`Created folder ${fullPath}`);
    }
    return fullPath;
  } catch (error) {
    logger.error(`Error creating folder ${fullPath}`, error);
    throw error;
  }
};

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
  try {
    logger.info(`Generating content prompt for ${celebName} in ${sports}`);
    
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
    
    if (!response?.candidates?.[0]?.content?.parts?.[0]?.text) {
      logger.error('Empty or invalid response from Gemini API', null, { 
        celebName, 
        sports,
        responseStructure: response ? JSON.stringify(Object.keys(response), null, 2) : 'null' 
      });
      return null;
    }
    
    try {
      const script = JSON.parse(response.candidates[0].content.parts[0].text)?.scenes || null;
      
      if (!script) {
        logger.error('Failed to parse JSON from Gemini response', null, { 
          responseText: response.candidates[0].content.parts[0].text.substring(0, 1000) + '...' 
        });
        return null;
      }
      
      logger.info(`Successfully generated script with ${script.length} scenes`);
      return script;
    } catch (parseError) {
      logger.error('JSON parsing error in Gemini response', parseError, { 
        responseText: response.candidates[0].content.parts[0].text.substring(0, 1000) + '...' 
      });
      return null;
    }
  } catch (error) {
    logger.error('Error in getImageAndContentPrompt', error, { celebName, sports });
    return null;
  }
}

async function convertTextToSpeech(contentText, fileId, key) {
    const text = contentText || null;

    if(!text) {
        logger.warn(`Empty text content for speech conversion`, { fileId, key });
        return null;
    }

    // Create folder in /tmp
    const folderName = `assets_${fileId}`;
    const tmpFolderPath = createTmpFolder(folderName);
    logger.debug(`Converting text to speech`, { fileId, key, textLength: text.length });

    try {
        const request = {
          input: {text: text},
          voice: {languageCode: 'en-US', ssmlGender: 'FEMALE'},
          audioConfig: {audioEncoding: 'MP3'},
        };
      
        const [response] = await textToSpeechClient.synthesizeSpeech(request);

        const filePath = path.join(tmpFolderPath, `${fileId}_${key}.mp3`);
        logger.debug(`Speech synthesis complete, writing to ${filePath}`);

        const writeFile = util.promisify(fs.writeFile);
        await writeFile(filePath, response.audioContent, 'binary');
        logger.info(`Successfully created speech file`, { filePath });
        return true;
    } catch (error) {
        logger.error('Error in convertTextToSpeech', error, { fileId, key, text: text.substring(0, 100) });
        return null;
    }
}

async function convertSpeechToCaption(fileId, i) {
    // Use /tmp for all file operations
    const folderName = `assets_${fileId}`;
    const tmpFolderPath = path.join('/tmp', folderName);
    const audioFilePath = path.join(tmpFolderPath, `${fileId}_${i}.mp3`);
    const jsonFilePath = path.join(tmpFolderPath, `${fileId}_${i}.json`);
    
    logger.debug(`Starting speech to caption conversion`, { fileId, index: i });
    
    try {
        if (!fs.existsSync(tmpFolderPath)) {
            logger.error(`Folder not found for caption generation`, null, { tmpFolderPath });
            return null;
        }
        
        if (!fs.existsSync(audioFilePath)) {
            logger.error(`Audio file not found for caption generation`, null, { audioFilePath });
            return null;
        }
        
        logger.debug(`Audio file exists, proceeding with transcription`, { audioFilePath });
        
        const params = {
            audio: audioFilePath,
        };
        
        try {
            logger.info(`Starting transcription with AssemblyAI`, { fileId, index: i });
            const transcript = await captionGenerationClient.transcripts.transcribe(params);
            logger.info(`Transcription complete`, { fileId, index: i });
            
            if (!transcript || !transcript.words) {
                logger.error(`No transcript or words in AssemblyAI response`, null, { 
                  fileId, 
                  index: i,
                  transcriptStructure: transcript ? JSON.stringify(Object.keys(transcript), null, 2) : 'null' 
                });
                return null;
            }
            
            try {
                const jsonContent = JSON.stringify(transcript.words, null, 2);
                
                await fs.promises.writeFile(jsonFilePath, jsonContent, 'utf8');
                logger.info(`Caption file written successfully`, { jsonFilePath });
                return true;
            } catch (writeError) {
                logger.error(`Failed to write caption file`, writeError, { jsonFilePath });
                return null;
            }
        } catch (transcriptionError) {
            logger.error(`Transcription failed with AssemblyAI`, transcriptionError, { fileId, index: i });
            return null;
        }
    } catch (error) {
        logger.error(`Overall error in convertSpeechToCaption`, error, { fileId, index: i });
        return null;
    }
}

async function generateImages(prompt, fileId, idx) {
    // Use /tmp for all file operations
    const folderName = `assets_${fileId}`;
    const tmpFolderPath = createTmpFolder(folderName);
    const imagePath = path.join(tmpFolderPath, `${fileId}_${idx}.png`);
    
    logger.debug(`Starting image generation`, { fileId, index: idx, promptLength: prompt.length });
    
    try {
        logger.info(`Calling Nebius API for image generation`, { fileId, index: idx });
        
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
            logger.error(`Invalid or empty response from Nebius API`, null, { 
              fileId, 
              index: idx,
              responseStructure: response ? JSON.stringify(Object.keys(response), null, 2) : 'null' 
            });
            return null;
        }
        
        const imageData = response.data[0].b64_json;
        logger.debug(`Image data received, base64 length: ${imageData.length}`);
        
        const buffer = Buffer.from(imageData, 'base64');
        
        const writeFile = util.promisify(fs.writeFile);
        await writeFile(imagePath, buffer);
        
        logger.info(`Successfully created image file`, { imagePath });
        return true;
    } catch (error) {
        logger.error(`Error in generateImages`, error, { fileId, index: idx });
        return null;
    }
}

async function deleteFolder(fileId) {
    // Use /tmp for all file operations
    const folderName = `assets_${fileId}`;
    const tmpFolderPath = path.join('/tmp', folderName);
    logger.debug(`Attempting to delete folder`, { tmpFolderPath });
    
    try {
        if (fs.existsSync(tmpFolderPath)) {
            fs.rmSync(tmpFolderPath, { recursive: true, force: true });
            logger.info(`Successfully deleted folder`, { tmpFolderPath });            
        } else {
            logger.debug(`Folder not found for deletion`, { tmpFolderPath });
        }
    } catch (deleteError) {
        logger.error(`Error while deleting folder`, deleteError, { tmpFolderPath });
    }
}

async function buildVideo(userid) {
    // Use /tmp for all file operations
    const folderName = `assets_${userid}`;
    const tmpDir = path.join('/tmp', folderName);
    logger.info(`Starting video build process`, { userid, directory: tmpDir });
    
    try {
        // Try to set FFmpeg path dynamically
        try {
            const ffmpegBinaryPath = getFfmpegPath();
            logger.info(`Using FFmpeg binary at: ${ffmpegBinaryPath}`);
            ffmpeg.setFfmpegPath(ffmpegBinaryPath);
        } catch (error) {
            logger.error(`Failed to set FFmpeg path`, error);
            throw new Error(`FFmpeg binary not found: ${error.message}`);
        }
        
        if (!fs.existsSync(path.join(tmpDir, '1.png'))) {
          logger.debug(`Renaming files for video production`, { userid });
          try {
            fs.renameSync(path.join(tmpDir, `${userid}_0.png`), path.join(tmpDir, '1.png'));
            fs.renameSync(path.join(tmpDir, `${userid}_1.png`), path.join(tmpDir, '2.png'));
            fs.renameSync(path.join(tmpDir, `${userid}_2.png`), path.join(tmpDir, '3.png'));
            fs.renameSync(path.join(tmpDir, `${userid}_0.mp3`), path.join(tmpDir, '1.mp3'));
            fs.renameSync(path.join(tmpDir, `${userid}_1.mp3`), path.join(tmpDir, '2.mp3'));
            fs.renameSync(path.join(tmpDir, `${userid}_2.mp3`), path.join(tmpDir, '3.mp3'));
            fs.renameSync(path.join(tmpDir, `${userid}_0.json`), path.join(tmpDir, 'transcription-1.json'));
            fs.renameSync(path.join(tmpDir, `${userid}_1.json`), path.join(tmpDir, 'transcription-2.json'));
            fs.renameSync(path.join(tmpDir, `${userid}_2.json`), path.join(tmpDir, 'transcription-3.json'));
          } catch (renameError) {
            logger.error(`Error renaming files for video production`, renameError, { userid, directory: tmpDir });
            throw renameError; // Rethrow to be caught by the outer try-catch
          }
        }
      
        const images = ['1.png', '2.png', '3.png'];
        const audio = ['1.mp3', '2.mp3', '3.mp3'];
        const transcriptions = [
          'transcription-1.json',
          'transcription-2.json',
          'transcription-3.json'
        ];
        
        // Validate all required files exist
        for (const file of [...images, ...audio, ...transcriptions]) {
          const filePath = path.join(tmpDir, file);
          if (!fs.existsSync(filePath)) {
            logger.error(`Required file missing for video production`, null, { missingFile: filePath });
            return null;
          }
        }
        
        logger.info(`All required files verified for video production`, { userid });
        
        // Create a directory for video segments
        const segmentsDir = path.join(tmpDir, 'segments');
        if (!fs.existsSync(segmentsDir)) {
          fs.mkdirSync(segmentsDir, { recursive: true });
        }
        
        // Generate each segment separately
        const segmentPromises = [];
        
        for (let i = 0; i < images.length; i++) {
          segmentPromises.push(
            new Promise(async (resolve, reject) => {
              try {
                const inputImage = path.join(tmpDir, images[i]);
                const inputAudio = path.join(tmpDir, audio[i]);
                const inputTranscription = path.join(tmpDir, transcriptions[i]);
                const outputVideo = path.join(segmentsDir, `segment_${i}.mp4`);
                
                logger.debug(`Processing segment ${i+1}/3`, { inputImage, inputAudio, inputTranscription });
            
                // Read the transcription file
                const transcriptionContent = fs.readFileSync(inputTranscription, 'utf8');
                const transcription = JSON.parse(transcriptionContent);
                const words = [...transcription];
                
                if (!words.length || !words[words.length - 1]?.end) {
                  logger.error(`Invalid transcription format`, null, { 
                    inputTranscription, 
                    transcriptionSample: transcriptionContent.substring(0, 500) + '...'
                  });
                  return reject(new Error(`Invalid transcription format for segment ${i+1}`));
                }
                
                const duration = parseFloat((transcription[transcription.length - 1].end)/1000).toFixed(2);
                logger.debug(`Segment ${i+1} duration calculated: ${duration}s`, { words: words.length });
                  
                // Create subtitle file - simplify to plain SRT without fancy styling
                const subtitlePath = path.join(tmpDir, `subtitles_${i}.srt`);
                let subtitleContent = '';
                let subtitleIndex = 1;
                
                // Group words into phrases for subtitles - larger groups of 10 words instead of 5
                let currentPhrase = [];
                let currentStartTime = 0;
                let currentEndTime = 0;
                
                for (let j = 0; j < words.length; j++) {
                  const word = words[j];
                  
                  if (currentPhrase.length === 0) {
                    currentStartTime = word.start;
                    currentPhrase.push(word.text);
                  } else if (currentPhrase.length < 10) { // Increased from 5 to 10 words per line
                    currentPhrase.push(word.text);
                  }
                  
                  currentEndTime = word.end;
                  
                  if (currentPhrase.length === 10 || j === words.length - 1) {
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
                logger.debug(`Subtitle file created`, { subtitlePath, lines: subtitleIndex-1 });
            
                // Simplify FFmpeg command with minimal options
                await new Promise((ffmpegResolve, ffmpegReject) => {
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
                      '-vf', `subtitles=${subtitlePath.replace(/\\/g, '\\\\').replace(/:/g, '\\:')}`
                    ])
                    .on('start', commandLine => {
                      logger.debug(`FFmpeg command for segment ${i+1}`, { commandLine });
                    })
                    .on('progress', progress => {
                      logger.debug(`FFmpeg progress for segment ${i+1}`, { 
                        percent: progress.percent || 'N/A', 
                        frames: progress.frames || 'N/A' 
                      });
                    })
                    .on('error', (err) => {
                      logger.error(`FFmpeg error for segment ${i+1}`, err, { 
                        inputImage, 
                        inputAudio, 
                        subtitlePath,
                        command: err.message 
                      });
                      ffmpegReject(err);
                    })
                    .on('end', () => {
                      logger.info(`Video segment ${i+1} created successfully`, { outputVideo });
                      ffmpegResolve();
                    })
                    .save(outputVideo);
                });
                
                resolve(outputVideo);
              } catch (error) {
                logger.error(`Error processing segment ${i+1}`, error);
                reject(error);
              }
            })
          );
        }
        
        try {
          const segmentResults = await Promise.all(segmentPromises);
          logger.info(`All segments created successfully`, { segments: segmentResults });
          
          // Create a concat file for joining segments
          const concatFilePath = path.join(tmpDir, 'concat.txt');
          let concatFileContent = '';
          
          for (let i = 0; i < segmentResults.length; i++) {
            // Use relative paths from the directory where ffmpeg will be executed
            const relativePath = path.relative(tmpDir, segmentResults[i]).replace(/\\/g, '/');
            concatFileContent += `file '${relativePath}'\n`;
          }
          
          fs.writeFileSync(concatFilePath, concatFileContent);
          logger.info(`Created concat file for merging segments`, { 
            concatFilePath, 
            content: concatFileContent 
          });
          
          // Final merge to create the full video
          const finalVideoPath = path.join(tmpDir, 'final.mp4');
          
          await new Promise((resolve, reject) => {
            // Change working directory to tmpDir before running ffmpeg
            const currentDir = process.cwd();
            process.chdir(tmpDir);
            
            ffmpeg()
              .input(concatFilePath)
              .inputOptions(['-f', 'concat', '-safe', '0'])
              .outputOptions(['-c', 'copy'])
              .on('start', commandLine => {
                logger.debug(`FFmpeg merge command`, { commandLine });
              })
              .on('error', (err) => {
                process.chdir(currentDir); // Change back to original directory
                logger.error(`Final merge error`, err, { 
                  concatFilePath,
                  command: err.message
                });
                reject(err);
              })
              .on('end', () => {
                process.chdir(currentDir); // Change back to original directory
                logger.info(`Final video merge completed successfully`, { finalVideoPath });
                resolve();
              })
              .save(finalVideoPath);
          });
          
          logger.info(`Video build process completed successfully`, { finalVideoPath });
          return finalVideoPath;
        } catch (error) {
          logger.error(`Error processing video segments`, error);
          throw error;
        }
    } catch (err) {
      logger.error('Video build process failed', err, { userid });
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
    logger.info('createVideo function called', { 
      requestBody: { 
        ...req.body, 
        // Don't log sensitive data if present
        celebName: req.body?.celebName,
        sports: req.body?.sports
      },
      userId: req.user?.id
    });

    // Ensure /tmp directory exists before anything else
    try {
      ensureTmpDirectoryExists();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Server configuration error: Cannot use temporary storage',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

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
            logger.error('Invalid user ID provided', null, { userid });
            return res.status(400).json({ success: false, message: 'Invalid user ID' });
        }
        
        if (!celebName || !sports) {
            logger.error('Missing required fields', null, { celebName: !!celebName, sports: !!sports });
            return res.status(400).json({ 
                success: false, 
                message: 'Must include celebName or sports' 
            });
        }

        logger.info('Starting script generation', { celebName, sports });
        const getScript = await getImageAndContentPrompt(celebName, sports) || null;

        if (!getScript) {
            logger.error('Script generation failed', null, { celebName, sports });
            return res.status(500).json({
                success: false,
                message: 'Error creating video: Failed to generate script',
            });
        }

        logger.info(`Script generation successful, processing ${getScript.length} scenes`);
        const promises = [];

        getScript.forEach((el, key) => {
            logger.debug(`Setting up scene ${key+1} processing`, { 
              contentTextLength: el.contentText?.length, 
              imagePromptLength: el.imagePrompt?.length 
            });
            
            promises.push(new Promise(async (resolve) => {
                try {
                    const result = await convertTextToSpeech(el.contentText, userid, key);
                    resolve(result);
                } catch (error) {
                    logger.error(`Text-to-speech processing failed for scene ${key+1}`, error, { 
                      sceneIndex: key, 
                      contentTextSample: el.contentText?.substring(0, 100) + '...' 
                    });
                    resolve(null);
                }
            }));

            promises.push(new Promise(async (resolve) => {
                try {
                    const result = await generateImages(el.imagePrompt, userid, key);
                    resolve(result);
                } catch (error) {
                    logger.error(`Image generation failed for scene ${key+1}`, error, { 
                      sceneIndex: key, 
                      promptSample: el.imagePrompt?.substring(0, 100) + '...' 
                    });
                    resolve(null);
                }
            }));
        });

        logger.info(`Processing ${promises.length} total jobs for speech and images`);
        Promise.all(promises)
        .then(async(results) => {
            logger.debug(`All speech and image generation jobs completed`, { resultsCount: results.length });
            
            // Check if any job failed
            const failedJobs = results.filter(result => !result).length;
            if (failedJobs > 0) {
                logger.error(`${failedJobs} speech/image generation jobs failed`, null, { totalJobs: results.length });
                await deleteFolder(userid);
                return res.status(500).json({
                    success: false,
                    message: 'Error creating video: Failed to generate speech or images',
                });
            }

            logger.info(`Starting caption generation for ${getScript.length} scenes`);
            const captionPromises = [];

            for(let i = 0; i < 3; i++) {
                captionPromises.push(new Promise(async (resolve) => {
                    try {
                        const result = await convertSpeechToCaption(userid, i);
                        resolve(result);
                    } catch (error) {
                        logger.error(`Caption generation failed for scene ${i+1}`, error, { sceneIndex: i });
                        resolve(null);
                    }
                }));
            }
      
            logger.debug(`Processing ${captionPromises.length} caption generation jobs`);
            Promise.all(captionPromises)
            .then(async(results) => {
                logger.debug(`All caption generation jobs completed`, { resultsCount: results.length });
                
                // Check if any caption job failed
                const failedCaptionJobs = results.filter(result => !result).length;
                if (failedCaptionJobs > 0) {
                    logger.error(`${failedCaptionJobs} caption generation jobs failed`, null, { totalJobs: results.length });
                    await deleteFolder(userid);
                    return res.status(500).json({
                        success: false,
                        message: 'Error creating video: Failed to generate captions',
                    });
                }

                logger.info(`Starting video build process`, { userid });
                const videoBuilt = await buildVideo(userid);

                if(!videoBuilt) {
                    logger.error(`Video build process failed`, null, { userid });
                    await deleteFolder(userid);
                    return res.status(500).json({
                        success: false,
                        message: 'Error creating video: Failed to build final video',
                    });
                }

                logger.info(`Video build successful, preparing for S3 upload`, { videoPath: videoBuilt });
                const videoFileName = `${createRandomHex(32)}_videoFile`;
                const thumbnailFileName = `${createRandomHex(32)}_thumbnailFile`;

                // Store a meaningful title
                newVideo.title = `${celebName} - ${sports}` || 'Untitled Video'; 

                try {
                    logger.debug(`Reading video and thumbnail files`, { 
                      videoFile: videoBuilt, 
                      thumbnailFile: path.join('/tmp', `assets_${userid}`, '1.png') 
                    });
                    
                    const videoFilePath = videoBuilt;
                    const thumbnailFilePath = path.join('/tmp', `assets_${userid}`, '1.png');
                    
                    if (!fs.existsSync(videoFilePath) || !fs.existsSync(thumbnailFilePath)) {
                        throw new Error(`Required files missing: video=${fs.existsSync(videoFilePath)}, thumbnail=${fs.existsSync(thumbnailFilePath)}`);
                    }
                    
                    const videoFile = fs.readFileSync(videoFilePath);
                    const thumbnailFile = fs.readFileSync(thumbnailFilePath);
                    
                    logger.debug(`Files read successfully`, { 
                      videoSize: videoFile.length, 
                      thumbnailSize: thumbnailFile.length 
                    });
                    
                    // Fix: Set proper content types explicitly
                    const videoParams = {
                        Bucket: process.env.AWS_BUCKET_NAME,
                        Key: videoFileName,
                        Body: videoFile,
                        ContentType: 'video/mp4'
                    };
                
                    const thumbnailParams = {
                        Bucket: process.env.AWS_BUCKET_NAME,
                        Key: thumbnailFileName,
                        Body: thumbnailFile,
                        ContentType: 'image/png'
                    };
                
                    // Upload files to S3
                    logger.info(`Uploading files to S3`, { 
                      bucket: process.env.AWS_BUCKET_NAME, 
                      videoKey: videoFileName, 
                      thumbnailKey: thumbnailFileName 
                    });
                    
                    const putVideoCommand = new PutObjectCommand(videoParams);
                    const putThumbnailCommand = new PutObjectCommand(thumbnailParams);
                
                    try {
                        await s3.send(putVideoCommand);
                        logger.info(`Video uploaded to S3 successfully`, { key: videoFileName });
                    } catch (uploadError) {
                        logger.error(`Failed to upload video to S3`, uploadError, { key: videoFileName });
                        throw uploadError;
                    }
                    
                    try {
                        await s3.send(putThumbnailCommand);
                        logger.info(`Thumbnail uploaded to S3 successfully`, { key: thumbnailFileName });
                    } catch (uploadError) {
                        logger.error(`Failed to upload thumbnail to S3`, uploadError, { key: thumbnailFileName });
                        throw uploadError;
                    }
                
                    logger.debug(`Cleaning up temporary files`);
                    await deleteFolder(userid);
                
                    logger.info(`Generating signed URLs for S3 objects`);
                    const getVideoCommand = new GetObjectCommand({
                        Bucket: process.env.AWS_BUCKET_NAME,
                        Key: videoFileName,
                    });
                    
                    const getThumbnailCommand = new GetObjectCommand({
                        Bucket: process.env.AWS_BUCKET_NAME,
                        Key: thumbnailFileName,
                    });
                
                    try {
                        // Get signed URLs
                        const videoUrl = await getSignedUrl(s3, getVideoCommand, { expiresIn: 6*24*60*60 });
                        const thumbnailUrl = await getSignedUrl(s3, getThumbnailCommand, { expiresIn: 6*24*60*60 });
                        
                        logger.debug(`Generated signed URLs successfully`);
                        newVideo.url = videoUrl;
                        newVideo.thumbnail = thumbnailUrl;
                    } catch (signedUrlError) {
                        logger.error(`Failed to generate signed URLs`, signedUrlError, { 
                          videoKey: videoFileName, 
                          thumbnailKey: thumbnailFileName 
                        });
                        throw signedUrlError;
                    }
                
                    // Validate the video object
                    if (!newVideo?.title || !newVideo?.url || !newVideo?.thumbnail) {
                        logger.error(`Missing required video properties`, null, { 
                          hasTitle: !!newVideo?.title, 
                          hasUrl: !!newVideo?.url, 
                          hasThumbnail: !!newVideo?.thumbnail 
                        });
                        throw new Error('Missing required video properties');
                    }
                
                    logger.info(`Storing video in database for user`, { userid });
                    // Fix: Store video objects directly without stringification
                    let videoCollection = await Videos.findOne({ userid });
            
                    if (videoCollection) {
                        logger.debug(`Found existing video collection for user`, { userid });
                        // Parse the existing array, add the new video, then stringify again
                        let videoArr = [];
                        try {
                            videoArr = JSON.parse(videoCollection.videoArr || '[]');
                            logger.debug(`Successfully parsed existing video array`, { existingVideos: videoArr.length });
                        } catch (parseError) {
                            logger.error(`Failed to parse existing video array`, parseError, { 
                              videoArrSample: videoCollection.videoArr?.substring(0, 200) + '...' 
                            });
                            videoArr = [];
                        }
                        
                        videoArr.push(newVideo);
                        
                        // Fix: Store as stringified JSON to match schema expectation
                        videoCollection.videoArr = JSON.stringify(videoArr);
                        
                        try {
                            await videoCollection.save();
                            logger.info(`Successfully updated video collection for user`, { 
                              userid, 
                              totalVideos: videoArr.length 
                            });
                        } catch (saveError) {
                            logger.error(`Failed to save updated video collection`, saveError, { userid });
                            throw saveError;
                        }
                        
                        return res.status(200).json({
                            success: true,
                            message: 'Video added to collection',
                            data: newVideo // Return the new video
                        });
                    } else {
                        logger.debug(`No existing collection found, creating new one`, { userid });
                        // Create new collection for user
                        videoCollection = new Videos({
                            userid,
                            videoArr: JSON.stringify([newVideo]) // Keep as string to match schema
                        });
                        
                        try {
                            await videoCollection.save();
                            logger.info(`Successfully created new video collection for user`, { userid });
                        } catch (saveError) {
                            logger.error(`Failed to create new video collection`, saveError, { userid });
                            throw saveError;
                        }
                        
                        return res.status(201).json({
                            success: true,
                            message: 'New video collection created',
                            data: newVideo // Return just the new video
                        });
                    }
                } catch (error) {
                    logger.error(`S3 upload or database operation failed`, error, { 
                      userid,
                      videoFileName,
                      thumbnailFileName
                    });
                    
                    // Ensure cleanup happens even on error
                    await deleteFolder(userid);
                    
                    return res.status(500).json({
                        success: false,
                        message: 'Error processing video: ' + (error.message || 'Unknown error'),
                        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
                    });
                }
            })
            .catch(async(error) => {
                logger.error(`Caption generation promise chain failed`, error, { userid });
                await deleteFolder(userid);
                return res.status(500).json({
                    success: false,
                    message: 'Error creating video: Failed during caption generation',
                    error: process.env.NODE_ENV === 'development' ? error.stack : undefined
                });
            });
        })
        .catch(async(error) => {
            logger.error(`Speech/image generation promise chain failed`, error, { userid });
            await deleteFolder(userid);
            return res.status(500).json({
                success: false,
                message: 'Error creating video: Failed during speech or image generation',
                error: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        });
    } catch (error) {
        logger.error(`Top-level error in createVideo function`, error, { 
          userid: req?.user?.id,
          body: { celebName: req.body?.celebName, sports: req.body?.sports }
        });
        
        try {
            await deleteFolder(req?.user?.id);
        } catch (cleanupError) {
            logger.error(`Failed to clean up after top-level error`, cleanupError, { userid: req?.user?.id });
        }
        
        return res.status(500).json({
            success: false,
            message: 'Error creating video: ' + (error.message || 'Unexpected error occurred'),
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};