import { BASE_URL, SUPPORTED_LOCALES } from "./sitemapXml";

export const INDEXNOW_KEY = "82fdb2d7e4c14ed3b16a03f9fe6d3295";
export const INDEXNOW_KEY_LOCATION = `${BASE_URL}/${INDEXNOW_KEY}.txt`;
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

const INDEXNOW_HOST = new URL(BASE_URL).hostname;
const INDEXNOW_BATCH_SIZE = 10000;

export function buildLocalizedIndexNowUrls(path: string): string[] {
  return SUPPORTED_LOCALES.map((locale) => `${BASE_URL}/${locale}${path}`);
}

function chunkUrls(urls: string[]): string[][] {
  const chunks: string[][] = [];

  for (let index = 0; index < urls.length; index += INDEXNOW_BATCH_SIZE) {
    chunks.push(urls.slice(index, index + INDEXNOW_BATCH_SIZE));
  }

  return chunks;
}

function uniqueUrls(urls: string[]): string[] {
  return Array.from(new Set(urls));
}

export async function submitUrlsToIndexNow(urls: string[]): Promise<void> {
  const uniqueUrlList = uniqueUrls(urls);
  if (uniqueUrlList.length === 0) {
    return;
  }

  for (const urlList of chunkUrls(uniqueUrlList)) {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        host: INDEXNOW_HOST,
        key: INDEXNOW_KEY,
        keyLocation: INDEXNOW_KEY_LOCATION,
        urlList,
      }),
    });

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(
        `IndexNow submission failed with ${response.status}: ${responseText}`
      );
    }
  }
}
