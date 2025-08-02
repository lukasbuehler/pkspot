import * as admin from "firebase-admin";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
// TODO: Install canvas package: npm install canvas @types/node
// import { createCanvas, loadImage } from 'canvas';
import { Storage } from "@google-cloud/storage";

const storage = new Storage();
// TODO: Replace with your actual bucket name
const bucket = storage.bucket("pkspot-social-cards");

interface UserProfile {
  uid: string;
  displayName: string;
  username: string;
  profilePicture?: string;
  followerCount: number;
  followingCount: number;
  location?: string;
  cardNeedsUpdate: boolean; // Flag to track if card needs regeneration
  lastCardUpdate?: admin.firestore.Timestamp;
}

/**
 * Cloud Function: Generate social media cards for profiles that need updates
 * Runs daily at 2 AM
 */
export const generateSocialCards = onSchedule("0 2 * * *", async (event) => {
  console.log("Starting social card generation...");

  try {
    // Get all profiles that need card updates
    const profilesSnapshot = await admin
      .firestore()
      .collection("users")
      .where("cardNeedsUpdate", "==", true)
      .limit(100) // Process in batches
      .get();

    const promises = profilesSnapshot.docs.map(async (doc) => {
      const profile = doc.data() as UserProfile;

      try {
        await generateProfileCard(profile);

        // Mark card as updated
        await doc.ref.update({
          cardNeedsUpdate: false,
          lastCardUpdate: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`Generated card for user: ${profile.username}`);
      } catch (error) {
        console.error(
          `Failed to generate card for ${profile.username}:`,
          error
        );
      }
    });

    await Promise.all(promises);
    console.log(`Generated ${promises.length} social cards`);
  } catch (error) {
    console.error("Error in generateSocialCards:", error);
  }
});

/**
 * Cloud Function: Mark user card for regeneration when profile data changes
 */
export const onUserProfileUpdate = onDocumentUpdated(
  "users/{userId}",
  async (event) => {
    if (!event.data) return;

    const before = event.data.before.data() as UserProfile;
    const after = event.data.after.data() as UserProfile;

    // Check if card-relevant fields changed
    const cardFields: (keyof UserProfile)[] = [
      "displayName",
      "username",
      "profilePicture",
      "followerCount",
      "followingCount",
      "location",
    ];
    const cardNeedsUpdate = cardFields.some(
      (field) => before[field] !== after[field]
    );

    if (cardNeedsUpdate && !after.cardNeedsUpdate) {
      // Mark for regeneration
      await event.data.after.ref.update({
        cardNeedsUpdate: true,
      });

      console.log(`Marked card for regeneration: ${after.username}`);
    }
  }
);

/**
 * Generate a profile card image and upload to Cloud Storage
 */
async function generateProfileCard(profile: UserProfile): Promise<string> {
  // TODO: Implement canvas-based image generation
  // Requires: npm install canvas @types/node in functions directory

  console.log(`TODO: Generate card for ${profile.username}`);

  // For now, return a placeholder URL
  const fileName = `social-cards/profiles/${profile.uid}.png`;
  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

  return publicUrl;

  /* TODO: Uncomment when canvas is installed
  const { createCanvas, loadImage } = require('canvas');
  const canvas = createCanvas(1200, 630);
  const ctx = canvas.getContext('2d');

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, 1200, 630);
  gradient.addColorStop(0, '#667eea');
  gradient.addColorStop(1, '#764ba2');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1200, 630);

  // White card background
  ctx.fillStyle = 'white';
  ctx.roundRect(60, 60, 1080, 510, 20);
  ctx.fill();

  // Profile picture
  const avatarSize = 120;
  const avatarX = 120;
  const avatarY = 255;

  if (profile.profilePicture) {
    try {
      const avatar = await loadImage(profile.profilePicture);
      
      // Create circular clip
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2, 0, 2 * Math.PI);
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();
      
      // Border around avatar
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize/2, avatarY + avatarSize/2, avatarSize/2, 0, 2 * Math.PI);
      ctx.stroke();
    } catch (error) {
      console.warn('Failed to load profile picture:', error);
      drawDefaultAvatar(ctx, avatarX, avatarY, avatarSize);
    }
  } else {
    drawDefaultAvatar(ctx, avatarX, avatarY, avatarSize);
  }

  // Text content
  const textX = avatarX + avatarSize + 40;
  const textStartY = 285;
  
  // Display name
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 48px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(profile.displayName, textX, textStartY);
  
  // Username
  ctx.fillStyle = '#666';
  ctx.font = '32px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(`@${profile.username}`, textX, textStartY + 50);
  
  // Stats
  const statsText = `${profile.followerCount} followers • ${profile.followingCount} following`;
  ctx.fillStyle = '#888';
  ctx.font = '28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText(statsText, textX, textStartY + 100);
  
  // Location
  if (profile.location) {
    ctx.fillStyle = '#888';
    ctx.font = '28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(`📍 ${profile.location}`, textX, textStartY + 140);
  }

  // PK Spot branding
  ctx.fillStyle = '#999';
  ctx.font = '24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('PK Spot', 1140, 550);

  // Convert to buffer and upload
  const buffer = canvas.toBuffer('image/png');
  const fileName = `social-cards/profiles/${profile.uid}.png`;
  
  const file = bucket.file(fileName);
  await file.save(buffer, {
    metadata: {
      contentType: 'image/png',
      cacheControl: 'public, max-age=86400' // Cache for 1 day
    }
  });

  // Make file publicly accessible
  await file.makePublic();
  
  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
  console.log(`Uploaded profile card: ${publicUrl}`);
  
  return publicUrl;
  */
}

/* TODO: Uncomment when canvas is implemented
function drawDefaultAvatar(ctx: any, x: number, y: number, size: number): void {
  // Gray circle background
  ctx.fillStyle = '#e0e0e0';
  ctx.beginPath();
  ctx.arc(x + size/2, y + size/2, size/2, 0, 2 * Math.PI);
  ctx.fill();
  
  // Simple person icon
  ctx.fillStyle = '#999';
  ctx.font = `${size * 0.5}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('👤', x + size/2, y + size/2);
}
*/
