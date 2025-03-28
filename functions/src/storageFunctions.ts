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
  const thumbnailPath = join(os.tmpdir(), `thumb_${basename(videoPath)}.png`);

  await new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions("-pred mixed")
      .screenshots({
        timestamps: [time],
        filename: basename(thumbnailPath),
        folder: os.tmpdir(),
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
      .size("1280x?")
      .on("end", () => resolve())
      .on("error", reject)
      .run();
  });

  return compressedVideoPath;
}

export const processVideoUpload = onObjectFinalized(
  {
    cpu: 2,
    region: "europe-west1",
    timeoutSeconds: 300,
    memory: "1GiB",
    maxInstances: 10,
  },
  async (event) => {
    const fileBucket = event.data.bucket;
    const filePath = event.data.name;
    const fileNameWithExtension = basename(filePath);
    const fileName = fileNameWithExtension.replace(/\.[^/.]+$/, "");
    const contentType = event.data.contentType;
    const originalMetadata = event.data.metadata;

    if (!contentType || !contentType.startsWith("video/")) {
      console.log("Ignoring non-video file", filePath);
      return;
    }

    if (fileNameWithExtension.startsWith("comp_")) {
      console.log("Ignoring already compressed file", filePath);
      return;
    }

    console.log("Processing video upload:", filePath);

    const tempVideoPath = join(os.tmpdir(), fileNameWithExtension);
    const bucket = getStorage().bucket(fileBucket);

    await bucket.file(filePath).download({ destination: tempVideoPath });
    console.log(`Video downloaded to ${tempVideoPath}`);

    // Compress Video
    const compressedVideoPath = await _compressVideo(tempVideoPath);
    console.log(`Compressed video created at ${compressedVideoPath}`);

    // Generate Thumbnail
    const thumbnailPath = await _getFrameFromVideo(compressedVideoPath, 1);
    console.log(`Thumbnail generated at ${thumbnailPath}`);

    const compressedVideoFileName = `comp_${fileName}.mp4`;
    const compressedVideoStoragePath = join(
      dirname(filePath),
      compressedVideoFileName
    );
    const thumbnailFileName = `thumb_${fileName}.png`;
    const thumbnailStoragePath = join(dirname(filePath), thumbnailFileName);

    // Upload Compressed Video with access token in metadata
    await bucket.upload(compressedVideoPath, {
      destination: compressedVideoStoragePath,
      metadata: {
        contentType,
        metadata: originalMetadata,
      },
    });
    console.log(`Compressed video uploaded to ${compressedVideoStoragePath}`);

    // Upload Thumbnail with token in metadata
    await bucket.upload(thumbnailPath, {
      destination: thumbnailStoragePath,
      metadata: {
        contentType: "image/png",
        metadata: originalMetadata,
      },
    });
    console.log(`Thumbnail uploaded to ${thumbnailStoragePath}`);

    // Cleanup Temporary Files
    fs.unlinkSync(tempVideoPath);
    fs.unlinkSync(thumbnailPath);
    fs.unlinkSync(compressedVideoPath);

    // delte original file
    await bucket.file(filePath).delete();
  }
);
