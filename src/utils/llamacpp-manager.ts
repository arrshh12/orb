import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { platform, arch } from 'node:os';
import { execa } from 'execa';
import { getOrbDir, ensureDir } from './fs.js';

/**
 * Maps Node.js platform/arch to llama.cpp GitHub release asset keywords
 */
function getAssetKeywords(): string[] {
  const p = platform();
  const a = arch();

  if (p === 'win32' && a === 'x64') return ['bin', 'win', 'x64', 'avx2'];
  if (p === 'darwin' && a === 'arm64') return ['bin', 'macos', 'arm64'];
  if (p === 'darwin' && a === 'x64') return ['bin', 'macos', 'x64'];
  if (p === 'linux' && a === 'x64') return ['bin', 'ubuntu', 'x64'];
  if (p === 'linux' && a === 'arm64') return ['bin', 'ubuntu', 'aarch64'];
  
  throw new Error(`Unsupported platform/architecture for pre-compiled llama.cpp: ${p} ${a}`);
}

/**
 * Downloads and extracts the llama.cpp training binary for the current OS.
 * Returns the path to the executable.
 */
export async function getOrDownloadLlamaCpp(): Promise<string> {
  const binDir = path.join(getOrbDir(), 'bin');
  await ensureDir(binDir);
  
  const exeName = platform() === 'win32' ? 'llama-train.exe' : 'llama-train';
  // Note: newer versions of llama.cpp renamed finetune to llama-train, but fallback may be needed.
  const exePath = path.join(binDir, exeName);
  
  if (existsSync(exePath)) {
    return exePath;
  }

  // Find the latest release
  const response = await fetch('https://api.github.com/repos/ggerganov/llama.cpp/releases/latest');
  if (!response.ok) {
    throw new Error(`Failed to fetch llama.cpp releases: ${response.statusText}`);
  }
  
  const release = await response.json();
  const keywords = getAssetKeywords();
  
  // Find the correct asset
  const asset = release.assets.find((a: any) => {
    const name = a.name.toLowerCase();
    return keywords.every(kw => name.includes(kw));
  });

  if (!asset) {
    throw new Error('Could not find a compatible pre-compiled llama.cpp binary for your system.');
  }

  // Download the asset
  const zipPath = path.join(binDir, asset.name);
  const downloadRes = await fetch(asset.browser_download_url);
  if (!downloadRes.ok) {
    throw new Error('Failed to download llama.cpp binary archive.');
  }
  
  const buffer = await downloadRes.arrayBuffer();
  await fs.writeFile(zipPath, Buffer.from(buffer));

  // Extract using system tar
  try {
    await execa('tar', ['-xf', zipPath, '-C', binDir]);
    await fs.unlink(zipPath).catch(() => {});
  } catch (err) {
    throw new Error(`Failed to extract llama.cpp archive: ${err}`);
  }

  // Find the executable (it might be in a subfolder or named 'finetune')
  const files = await fs.readdir(binDir, { recursive: true });
  const foundExe = files.find(f => 
    f.toLowerCase().includes('llama-train') || 
    f.toLowerCase().includes('finetune')
  );

  if (!foundExe) {
    throw new Error('Successfully downloaded but could not find llama-train or finetune executable in the archive.');
  }

  const finalPath = path.join(binDir, foundExe);
  
  // Ensure it's executable on unix
  if (platform() !== 'win32') {
    await fs.chmod(finalPath, 0o755);
  }

  return finalPath;
}
