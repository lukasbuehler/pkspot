import { getStorage } from "firebase-admin/storage";
import { onObjectFinalized } from "firebase-functions/storage";
import { basename, join, dirname } from "path";
import * as os from "os";
import * as fs from "fs";
import * as ffmpeg from "fluent-ffmpeg";
import * as ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { v4 as uuidv4 } from "uuid"; // <-- add this import

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

async function _getFrameFromVideo(
  videoPath: string,
  time: number,
  uuid: string // <-- add uuid param
): Promise<string> {
  const thumbnailPath = join(os.tmpdir(), `thumb_${uuid}.png`); // <-- use uuid

  await new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .outputOptions("-pred mixed")
      .screenshots({
        timestamps: [time],
        filename: `thumb_${uuid}.png`, // <-- use uuid
        folder: os.tmpdir(),
      })
      .on("end", () => resolve())
      .on("error", reject);
  });

  return thumbnailPath;
}

async function _compressVideo(
  videoPath: string,
  uuid: string
): Promise<string> {
  // <-- add uuid param
  const compressedVideoPath = join(os.tmpdir(), `comp_${uuid}.mp4`); // <-- always .mp4 and uuid

  return new Promise<string>((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, data) => {
      if (err) {
        reject(err);
        return;
      }

      const videoStream = data.streams.find(
        (stream) => stream.codec_type === "video"
      );
      if (!videoStream) {
        reject(new Error("No video stream found"));
        return;
      }

      const width = videoStream.width;
      const height = videoStream.height;

      if (!width || !height) {
        reject(new Error("Couldn't get video dimensions"));
        return;
      }

      let size = "?x720";
      if (height > width) {
        size = "720x?";
      }

      ffmpeg(videoPath)
        .output(compressedVideoPath)
        .format("mp4") // <-- force mp4 output
        .videoCodec("libx265")
        .outputOptions([
          "-crf 24",
          "-preset slow",
          "-tag:v hvc1",
          "-loglevel debug",
        ])
        .audioCodec("aac")
        .audioBitrate("128k")
        .size(size)
        .on("end", () => resolve(compressedVideoPath))
        .on("error", (err) => {
          console.error("FFmpeg error:", err);
          reject(err);
        })
        .run();
    });
  });
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

    // Generate a uuid for this processing
    const uuid = uuidv4();

    // Compress Video
    const compressedVideoPath = await _compressVideo(tempVideoPath, uuid);
    console.log(`Compressed video created at ${compressedVideoPath}`);

    // Generate Thumbnail
    const thumbnailPath = await _getFrameFromVideo(
      compressedVideoPath,
      1,
      uuid
    );
    console.log(`Thumbnail generated at ${thumbnailPath}`);

    const compressedVideoFileName = `comp_${uuid}.mp4`; // <-- use uuid
    const compressedVideoStoragePath = join(
      dirname(filePath),
      compressedVideoFileName
    );
    const thumbnailFileName = `thumb_${uuid}.png`; // <-- use uuid
    const thumbnailStoragePath = join(dirname(filePath), thumbnailFileName);

    // Upload Compressed Video with access token in metadata
    await bucket.upload(compressedVideoPath, {
      destination: compressedVideoStoragePath,
      metadata: {
        contentType: "video/mp4", // <-- always mp4
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
