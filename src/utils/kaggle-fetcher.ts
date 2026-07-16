import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execa } from 'execa';
import { ensureDir } from './fs.js';
import { PlainLanguageError } from './errors.js';

// ─── Auth Types ──────────────────────────────────────────────────────────────

interface KaggleAuthBearer {
  type: 'bearer';
  token: string;
}

interface KaggleAuthBasic {
  type: 'basic';
  username: string;
  key: string;
}

type KaggleAuth = KaggleAuthBearer | KaggleAuthBasic;

// ─── Search Result Type ──────────────────────────────────────────────────────

export interface KaggleDatasetResult {
  id: string;
  title: string;
  size: number;
  downloadCount: number;
  description: string;
}

// ─── Auth Detection ──────────────────────────────────────────────────────────

/**
 * Read and parse ~/.kaggle/kaggle.json if it exists.
 */
async function readKaggleJson(): Promise<Record<string, string> | null> {
  const kaggleJsonPath = path.join(os.homedir(), '.kaggle', 'kaggle.json');
  try {
    const content = await fs.readFile(kaggleJsonPath, 'utf8');
    return JSON.parse(content) as Record<string, string>;
  } catch {
    return null;
  }
}

/**
 * Read and parse ~/.kaggle/access_token if it exists (Kaggle's new token format).
 */
async function readKaggleTokenFile(): Promise<string | null> {
  const kaggleTokenPath = path.join(os.homedir(), '.kaggle', 'access_token');
  try {
    const content = await fs.readFile(kaggleTokenPath, 'utf8');
    return content.trim();
  } catch {
    return null;
  }
}

/**
 * Auto-detect Kaggle authentication.
 *
 * Checks in order of priority:
 *  1. KGAT token — env vars `KAGGLE_API_TOKEN` or `KAGGLE_TOKEN`
 *  2. KGAT token file — `~/.kaggle/access_token`
 *  3. KGAT token from kaggle.json
 *  4. Basic auth — env vars `KAGGLE_USERNAME` + `KAGGLE_KEY`
 *  5. Basic auth — `~/.kaggle/kaggle.json`
 */
export async function getKaggleAuth(): Promise<KaggleAuth | null> {
  // 1. KGAT bearer token from environment
  const envToken = process.env.KAGGLE_API_TOKEN || process.env.KAGGLE_TOKEN;
  if (envToken && envToken.startsWith('KGAT_')) {
    return { type: 'bearer', token: envToken };
  }

  // 2. KGAT bearer token from access_token file
  const fileToken = await readKaggleTokenFile();
  if (fileToken && fileToken.startsWith('KGAT_')) {
    return { type: 'bearer', token: fileToken };
  }

  // 3. KGAT bearer token from kaggle.json
  const kaggleJson = await readKaggleJson();
  if (kaggleJson?.token && typeof kaggleJson.token === 'string' && kaggleJson.token.startsWith('KGAT_')) {
    return { type: 'bearer', token: kaggleJson.token };
  }

  // 4. Basic auth from environment variables
  if (process.env.KAGGLE_USERNAME && process.env.KAGGLE_KEY) {
    return { type: 'basic', username: process.env.KAGGLE_USERNAME, key: process.env.KAGGLE_KEY };
  }

  // 5. Basic auth from kaggle.json
  if (kaggleJson?.username && kaggleJson?.key) {
    return { type: 'basic', username: kaggleJson.username, key: kaggleJson.key };
  }

  return null;
}

/**
 * Build the Authorization header value from a KaggleAuth object.
 */
function buildAuthHeader(auth: KaggleAuth): string {
  if (auth.type === 'bearer') {
    return `Bearer ${auth.token}`;
  }
  return 'Basic ' + Buffer.from(`${auth.username}:${auth.key}`).toString('base64');
}

/**
 * Ensures Kaggle credentials exist in environment or ~/.kaggle/kaggle.json.
 * @deprecated Use `getKaggleAuth()` instead for full auth support.
 */
export async function getKaggleCredentials(): Promise<{ username: string; key: string } | null> {
  // Check environment variables first
  if (process.env.KAGGLE_USERNAME && process.env.KAGGLE_KEY) {
    return {
      username: process.env.KAGGLE_USERNAME,
      key: process.env.KAGGLE_KEY,
    };
  }

  // Check ~/.kaggle/kaggle.json
  const kaggleJson = await readKaggleJson();
  if (kaggleJson?.username && kaggleJson?.key) {
    return { username: kaggleJson.username, key: kaggleJson.key };
  }

  return null;
}

/**
 * Save Kaggle API credentials.
 * If key is a bearer token starting with KGAT_, saves to ~/.kaggle/access_token.
 * Otherwise, saves username and key to ~/.kaggle/kaggle.json.
 */
export async function saveKaggleCredentials(username: string, key: string): Promise<void> {
  const kaggleDir = path.join(os.homedir(), '.kaggle');
  await ensureDir(kaggleDir);
  
  if (key.startsWith('KGAT_')) {
    const kaggleTokenPath = path.join(kaggleDir, 'access_token');
    await fs.writeFile(kaggleTokenPath, key, { mode: 0o600 });
  } else {
    const kaggleJsonPath = path.join(kaggleDir, 'kaggle.json');
    const credentials = { username, key };
    await fs.writeFile(kaggleJsonPath, JSON.stringify(credentials, null, 2), { mode: 0o600 });
  }
}

// ─── Search ──────────────────────────────────────────────────────────────────

/**
 * Search for Kaggle datasets matching a query.
 * Returns up to 10 results sorted by hottest, filtered to < 500 MB.
 */
export async function searchKaggleDatasets(query: string): Promise<KaggleDatasetResult[]> {
  const auth = await getKaggleAuth();
  if (!auth) {
    throw new PlainLanguageError({
      userMessage: 'Kaggle credentials not found.',
      guidance:
        'Set KAGGLE_TOKEN (KGAT bearer token), or KAGGLE_USERNAME + KAGGLE_KEY environment variables, or place kaggle.json in ~/.kaggle/',
    });
  }

  const params = new URLSearchParams({
    search: query,
    sortBy: 'hottest',
    maxSize: '500000000',
  });

  const url = `https://www.kaggle.com/api/v1/datasets/list?${params.toString()}`;

  const response = await fetch(url, {
    headers: { Authorization: buildAuthHeader(auth) },
    redirect: 'follow',
  });

  if (!response.ok) {
    throw new PlainLanguageError({
      userMessage: `Kaggle dataset search failed (HTTP ${response.status}).`,
      guidance: 'Check your Kaggle credentials and try again.',
      technicalDetail: `${response.status} ${response.statusText}`,
    });
  }

  const data = (await response.json()) as Array<Record<string, unknown>>;

  return data.slice(0, 10).map((item) => ({
    id: String(item.ref ?? ''),
    title: String(item.title ?? ''),
    size: Number(item.totalBytes ?? 0),
    downloadCount: Number(item.downloadCount ?? 0),
    description: String(item.subtitle ?? item.description ?? ''),
  }));
}

// ─── Download ────────────────────────────────────────────────────────────────

/**
 * Downloads a Kaggle dataset given its identifier (e.g. "username/dataset-name")
 * @param datasetId The Kaggle dataset ID
 * @param outputDir The directory to extract the dataset to
 * @returns Path to the extracted dataset directory
 */
export async function downloadKaggleDataset(datasetId: string, outputDir: string): Promise<string> {
  const auth = await getKaggleAuth();
  if (!auth) {
    throw new PlainLanguageError({
      userMessage: 'Kaggle credentials not found.',
      guidance:
        'Set KAGGLE_TOKEN (KGAT bearer token), or KAGGLE_USERNAME + KAGGLE_KEY environment variables, or place kaggle.json in ~/.kaggle/',
    });
  }

  const authHeader = buildAuthHeader(auth);

  // Create dataset specific directory
  const safeId = datasetId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const targetDir = path.join(outputDir, safeId);
  await ensureDir(targetDir);

  const zipPath = path.join(targetDir, 'dataset.zip');

  // Fetch from Kaggle API
  const url = `https://www.kaggle.com/api/v1/datasets/download/${datasetId}`;
  
  const response = await fetch(url, {
    headers: {
      Authorization: authHeader,
    },
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new PlainLanguageError({
      userMessage: `Failed to download Kaggle dataset "${datasetId}".`,
      guidance: 'Check that the dataset ID is correct and your credentials have access.',
      technicalDetail: `${response.status} ${response.statusText}`,
    });
  }

  const buffer = await response.arrayBuffer();
  await fs.writeFile(zipPath, Buffer.from(buffer));

  // Extract the zip file using the system's tar command (works on Windows 10+ and unix)
  try {
    await execa('tar', ['-xf', zipPath, '-C', targetDir]);
    // Optionally remove the zip file after extraction
    await fs.unlink(zipPath).catch(() => {});
  } catch (err) {
    throw new PlainLanguageError({
      userMessage: 'Failed to extract the dataset archive.',
      guidance: 'Make sure you have tar/unzip available on your system.',
      technicalDetail: err instanceof Error ? err.message : String(err),
    });
  }

  return targetDir;
}
