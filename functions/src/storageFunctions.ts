import { getStorage } from "firebase-admin/storage";
import { onObjectFinalized } from "firebase-functions/storage";
import { basename, join, dirname } from "path";
import * as os from "os";
import * as fs from "fs";
import * as ffmpeg from "fluent-ffmpeg";
import * as ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

async function _getFrameFromVideo(
  videoPath: string,
  time: number
): Promise<string> {
  const thumbnailPath = join(os.tmpdir(), `${basename(videoPath)}_thumb.png`);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .screenshots({
        timestamps: [time],
        filename: basename(thumbnailPath),
        folder: os.tmpdir(),
        size: "320x240",
      })
      .on("end", () => resolve())
      .on("error", reject);
  });

  return thumbnailPath;
}

async function _compressVideo(videoPath: string): Promise<string> {
  const compressedVideoPath = join(os.tmpdir(), `comp_${basename(videoPath)}`);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .output(compressedVideoPath)
      .videoCodec("libx265") // Use libx265 for better compression
      .outputOptions(["-crf 26", "-preset fast"]) // Adjust CRF for quality vs size tradeoff
      .audioCodec("aac")
      .audioBitrate("128k")
      .size("1280x720") // Resize to 720p (adjust as needed)
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });

  return compressedVideoPath;
}

export const processVideoUpload = onObjectFinalized(async (event) => {
  const fileBucket = event.data.bucket;
  const filePath = event.data.name;
  const fileName = basename(filePath);
  const contentType = event.data.contentType;

  if (!contentType || !contentType.startsWith("video/")) {
    console.log("Ignoring non-video file", filePath);
    return;
  }

  if (fileName.startsWith("comp_")) {
    console.log("Ignoring already compressed file", filePath);
    return;
  }

  console.log("Processing video upload:", filePath);

  const tempVideoPath = join(os.tmpdir(), fileName);
  const bucket = getStorage().bucket(fileBucket);

  await bucket.file(filePath).download({ destination: tempVideoPath });
  console.log(`Video downloaded to ${tempVideoPath}`);

  // Generate Thumbnail
  const thumbnailPath = await _getFrameFromVideo(tempVideoPath, 1);
  console.log(`Thumbnail generated at ${thumbnailPath}`);

  // Compress Video
  const compressedVideoPath = await _compressVideo(tempVideoPath);
  console.log(`Compressed video created at ${compressedVideoPath}`);

  const compressedVideoFileName = `comp_${fileName}`;
  const compressedVideoStoragePath = join(
    dirname(filePath),
    compressedVideoFileName
  );
  const thumbnailFileName = `thumb_${fileName}.png`;
  const thumbnailStoragePath = join(dirname(filePath), thumbnailFileName);

  // Upload Compressed Video
  await bucket.upload(compressedVideoPath, {
    destination: compressedVideoStoragePath,
    metadata: { contentType },
  });
  console.log(`Compressed video uploaded to ${compressedVideoStoragePath}`);

  // Upload Thumbnail
  await bucket.upload(thumbnailPath, {
    destination: thumbnailStoragePath,
    metadata: { contentType: "image/png" },
  });
  console.log(`Thumbnail uploaded to ${thumbnailStoragePath}`);

  // Cleanup Temporary Files
  fs.unlinkSync(tempVideoPath);
  fs.unlinkSync(thumbnailPath);
  fs.unlinkSync(compressedVideoPath);
});
