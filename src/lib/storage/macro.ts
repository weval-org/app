import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getStorageContext } from '@/lib/storageService';

export interface MacroIndexConfigEntry {
  id: string;
  title?: string;
  runLabel: string;
  timestamp: string;
  startIndex: number;
  totalPoints: number;
  mappingUrl: string;
}

export interface MacroIndexContent {
  width: number;
  height: number;
  tileSize: number;
  maxZoom: number;
  totalPoints: number;
  configs: MacroIndexConfigEntry[];
  generatedAt: string;
}

export interface MacroConfigMappingContent {
  configId: string;
  prompts: Array<{
    id: string;
    startIndex: number;
    totalPoints: number;
    mappingUrl: string;
  }>;
}

export interface MacroPromptMappingContent {
  configId: string;
  promptId: string;
  models: Array<{
    modelId: string;
    startIndex: number;
    totalPoints: number;
    pointCount: number;
  }>;
}

const MACRO_DIR = path.join('live', 'aggregates', 'macro');
const FLAT_DIR = path.join(MACRO_DIR, 'flat');
const FLAT_MODELS_DIR = path.join(FLAT_DIR, 'models');

export async function saveMacroIndex(index: MacroIndexContent): Promise<void> {
  const { storageProvider, s3Client, s3BucketName, RESULTS_DIR } = getStorageContext();
  const s3Key = path.join(MACRO_DIR, 'index.json');
  const localPath = path.join(RESULTS_DIR, s3Key);
  const body = JSON.stringify(index, null, 2);
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    await s3Client.send(new PutObjectCommand({ Bucket: s3BucketName, Key: s3Key, Body: body, ContentType: 'application/json' }));
    console.log(`[MacroStorage] Index saved to S3: ${s3Key}`);
  } else {
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, body, 'utf-8');
    console.log(`[MacroStorage] Index saved locally: ${localPath}`);
  }
}

export async function getMacroIndex(): Promise<MacroIndexContent | null> {
  const { storageProvider, s3Client, s3BucketName, RESULTS_DIR, streamToString } = getStorageContext();
  const s3Key = path.join(MACRO_DIR, 'index.json');
  const localPath = path.join(RESULTS_DIR, s3Key);
  let body: string | null = null;
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const { Body } = await s3Client.send(new GetObjectCommand({ Bucket: s3BucketName, Key: s3Key }));
      if (Body) body = await streamToString(Body as Readable);
    } catch (err: any) {
      if (err.name === 'NoSuchKey') return null;
      console.error('[MacroStorage] Error fetching index from S3:', err);
      return null;
    }
  } else {
    try {
      if (fsSync.existsSync(localPath)) body = await fs.readFile(localPath, 'utf-8'); else return null;
    } catch (err) {
      console.error('[MacroStorage] Error fetching index locally:', err);
      return null;
    }
  }
  if (!body) return null;
  try { return JSON.parse(body) as MacroIndexContent; } catch (e) { console.error('[MacroStorage] Error parsing index:', e); return null; }
}

export async function saveMacroConfigMapping(configId: string, content: MacroConfigMappingContent): Promise<void> {
  const { storageProvider, s3Client, s3BucketName, RESULTS_DIR } = getStorageContext();
  const s3Key = path.join(MACRO_DIR, 'configs', `${configId}.json`);
  const localPath = path.join(RESULTS_DIR, s3Key);
  const body = JSON.stringify(content, null, 2);
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    await s3Client.send(new PutObjectCommand({ Bucket: s3BucketName, Key: s3Key, Body: body, ContentType: 'application/json' }));
  } else {
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, body, 'utf-8');
  }
}

export async function getMacroConfigMapping(configId: string): Promise<MacroConfigMappingContent | null> {
  const { storageProvider, s3Client, s3BucketName, RESULTS_DIR, streamToString } = getStorageContext();
  const s3Key = path.join(MACRO_DIR, 'configs', `${configId}.json`);
  const localPath = path.join(RESULTS_DIR, s3Key);
  let body: string | null = null;
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const { Body } = await s3Client.send(new GetObjectCommand({ Bucket: s3BucketName, Key: s3Key }));
      if (Body) body = await streamToString(Body as Readable);
    } catch (err: any) {
      if (err.name === 'NoSuchKey') return null;
      console.error('[MacroStorage] Error fetching config mapping from S3:', err);
      return null;
    }
  } else {
    try {
      if (fsSync.existsSync(localPath)) body = await fs.readFile(localPath, 'utf-8'); else return null;
    } catch (err) {
      console.error('[MacroStorage] Error fetching config mapping locally:', err);
      return null;
    }
  }
  if (!body) return null;
  try { return JSON.parse(body) as MacroConfigMappingContent; } catch (e) { console.error('[MacroStorage] Error parsing config mapping:', e); return null; }
}

export async function saveMacroPromptMapping(configId: string, promptId: string, content: MacroPromptMappingContent): Promise<void> {
  const { storageProvider, s3Client, s3BucketName, RESULTS_DIR } = getStorageContext();
  const s3Key = path.join(MACRO_DIR, 'configs', configId, 'prompts', `${promptId}.json`);
  const localPath = path.join(RESULTS_DIR, s3Key);
  const body = JSON.stringify(content, null, 2);
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    await s3Client.send(new PutObjectCommand({ Bucket: s3BucketName, Key: s3Key, Body: body, ContentType: 'application/json' }));
  } else {
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, body, 'utf-8');
  }
}

export async function getMacroPromptMapping(configId: string, promptId: string): Promise<MacroPromptMappingContent | null> {
  const { storageProvider, s3Client, s3BucketName, RESULTS_DIR, streamToString } = getStorageContext();
  const s3Key = path.join(MACRO_DIR, 'configs', configId, 'prompts', `${promptId}.json`);
  const localPath = path.join(RESULTS_DIR, s3Key);
  let body: string | null = null;
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const { Body } = await s3Client.send(new GetObjectCommand({ Bucket: s3BucketName, Key: s3Key }));
      if (Body) body = await streamToString(Body as Readable);
    } catch (err: any) {
      if (err.name === 'NoSuchKey') return null;
      console.error('[MacroStorage] Error fetching prompt mapping from S3:', err);
      return null;
    }
  } else {
    try {
      if (fsSync.existsSync(localPath)) body = await fs.readFile(localPath, 'utf-8'); else return null;
    } catch (err) {
      console.error('[MacroStorage] Error fetching prompt mapping locally:', err);
      return null;
    }
  }
  if (!body) return null;
  try { return JSON.parse(body) as MacroPromptMappingContent; } catch (e) { console.error('[MacroStorage] Error parsing prompt mapping:', e); return null; }
}

export async function saveMacroTile(z: number, x: number, y: number, data: Uint8Array): Promise<void> {
  const { storageProvider, s3Client, s3BucketName, RESULTS_DIR } = getStorageContext();
  const keyPath = path.join(MACRO_DIR, 'tiles', String(z), String(x), `${y}.bin`);
  const localPath = path.join(RESULTS_DIR, keyPath);
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    await s3Client.send(new PutObjectCommand({ Bucket: s3BucketName, Key: keyPath, Body: Buffer.from(data), ContentType: 'application/octet-stream', CacheControl: 'public, max-age=31536000, immutable' }));
  } else {
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, Buffer.from(data));
  }
}

export async function getMacroTile(z: number, x: number, y: number): Promise<Buffer | null> {
  const { storageProvider, s3Client, s3BucketName, RESULTS_DIR, streamToBuffer } = getStorageContext();
  const keyPath = path.join(MACRO_DIR, 'tiles', String(z), String(x), `${y}.bin`);
  const localPath = path.join(RESULTS_DIR, keyPath);
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const { Body } = await s3Client.send(new GetObjectCommand({ Bucket: s3BucketName, Key: keyPath }));
      if (!Body) return null;
      return await streamToBuffer(Body as Readable);
    } catch (err: any) {
      if (err.name === 'NoSuchKey') return null;
      console.error('[MacroStorage] Error fetching tile from S3:', err);
      return null;
    }
  } else {
    try {
      if (!fsSync.existsSync(localPath)) return null;
      return await fs.readFile(localPath);
    } catch (err) {
      console.error('[MacroStorage] Error fetching tile locally:', err);
      return null;
    }
  }
}

// --- Flat macro artefacts ---
export interface MacroFlatManifest {
  width: number;
  height: number;
  totalPoints: number;
  generatedAt: string;
  headlineAverage?: number; // 0..1 average coverage across all points (inversion-adjusted)
}

export interface MacroPerModelEntry {
  modelId: string;
  width: number;
  height: number;
  totalPoints: number;
  average: number; // 0..1
}

export interface MacroPerModelManifest {
  models: MacroPerModelEntry[];
  generatedAt: string;
}

export async function saveMacroFlatManifest(m: MacroFlatManifest): Promise<void> {
  const { storageProvider, s3Client, s3BucketName, RESULTS_DIR } = getStorageContext();
  const s3Key = path.join(FLAT_DIR, 'manifest.json');
  const localPath = path.join(RESULTS_DIR, s3Key);
  const body = JSON.stringify(m, null, 2);
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    await s3Client.send(new PutObjectCommand({ Bucket: s3BucketName, Key: s3Key, Body: body, ContentType: 'application/json' }));
  } else {
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, body, 'utf-8');
  }
}

export async function getMacroFlatManifest(): Promise<MacroFlatManifest | null> {
  const { storageProvider, s3Client, s3BucketName, RESULTS_DIR, streamToString } = getStorageContext();
  const s3Key = path.join(FLAT_DIR, 'manifest.json');
  const localPath = path.join(RESULTS_DIR, s3Key);
  let body: string | null = null;
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const { Body } = await s3Client.send(new GetObjectCommand({ Bucket: s3BucketName, Key: s3Key }));
      if (Body) body = await streamToString(Body as Readable);
    } catch (err: any) {
      if (err.name === 'NoSuchKey') return null;
      console.error('[MacroStorage] Error fetching flat manifest from S3:', err);
      return null;
    }
  } else {
    try {
      if (fsSync.existsSync(localPath)) body = await fs.readFile(localPath, 'utf-8'); else return null;
    } catch (err) {
      console.error('[MacroStorage] Error fetching flat manifest locally:', err);
      return null;
    }
  }
  if (!body) return null;
  try { return JSON.parse(body) as MacroFlatManifest; } catch (e) { console.error('[MacroStorage] Error parsing flat manifest:', e); return null; }
}

export async function saveMacroFlatData(data: Uint8Array): Promise<void> {
  const { storageProvider, s3Client, s3BucketName, RESULTS_DIR } = getStorageContext();
  const s3Key = path.join(FLAT_DIR, 'data.bin');
  const localPath = path.join(RESULTS_DIR, s3Key);
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    await s3Client.send(new PutObjectCommand({ Bucket: s3BucketName, Key: s3Key, Body: Buffer.from(data), ContentType: 'application/octet-stream' }));
  } else {
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, Buffer.from(data));
  }
}

export async function getMacroFlatData(): Promise<Buffer | null> {
  const { storageProvider, s3Client, s3BucketName, RESULTS_DIR, streamToBuffer } = getStorageContext();
  const s3Key = path.join(FLAT_DIR, 'data.bin');
  const localPath = path.join(RESULTS_DIR, s3Key);
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const { Body } = await s3Client.send(new GetObjectCommand({ Bucket: s3BucketName, Key: s3Key }));
      if (!Body) return null;
      return await streamToBuffer(Body as Readable);
    } catch (err: any) {
      if (err.name === 'NoSuchKey') return null;
      console.error('[MacroStorage] Error fetching flat data from S3:', err);
      return null;
    }
  } else {
    try {
      if (!fsSync.existsSync(localPath)) return null;
      return await fs.readFile(localPath);
    } catch (err) {
      console.error('[MacroStorage] Error fetching flat data locally:', err);
      return null;
    }
  }
}

export async function saveMacroPerModelManifest(m: MacroPerModelManifest): Promise<void> {
  const { storageProvider, s3Client, s3BucketName, RESULTS_DIR } = getStorageContext();
  const s3Key = path.join(FLAT_MODELS_DIR, 'manifest.json');
  const localPath = path.join(RESULTS_DIR, s3Key);
  const body = JSON.stringify(m, null, 2);
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    await s3Client.send(new PutObjectCommand({ Bucket: s3BucketName, Key: s3Key, Body: body, ContentType: 'application/json' }));
  } else {
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, body, 'utf-8');
  }
}

export async function getMacroPerModelManifest(): Promise<MacroPerModelManifest | null> {
  const { storageProvider, s3Client, s3BucketName, RESULTS_DIR, streamToString } = getStorageContext();
  const s3Key = path.join(FLAT_MODELS_DIR, 'manifest.json');
  const localPath = path.join(RESULTS_DIR, s3Key);
  let body: string | null = null;
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const { Body } = await s3Client.send(new GetObjectCommand({ Bucket: s3BucketName, Key: s3Key }));
      if (Body) body = await streamToString(Body as Readable);
    } catch (err: any) {
      if (err.name === 'NoSuchKey') return null;
      console.error('[MacroStorage] Error fetching per-model manifest from S3:', err);
      return null;
    }
  } else {
    try {
      if (fsSync.existsSync(localPath)) body = await fs.readFile(localPath, 'utf-8'); else return null;
    } catch (err) {
      console.error('[MacroStorage] Error fetching per-model manifest locally:', err);
      return null;
    }
  }
  if (!body) return null;
  try { return JSON.parse(body) as MacroPerModelManifest; } catch (e) { console.error('[MacroStorage] Error parsing per-model manifest:', e); return null; }
}

function safeModelId(modelId: string): string { return modelId.replace(/[:/\\?#%\[\]]/g, '_'); }

export async function saveMacroPerModelData(modelId: string, data: Uint8Array): Promise<void> {
  const { storageProvider, s3Client, s3BucketName, RESULTS_DIR } = getStorageContext();
  const s3Key = path.join(FLAT_MODELS_DIR, `${safeModelId(modelId)}.bin`);
  const localPath = path.join(RESULTS_DIR, s3Key);
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    await s3Client.send(new PutObjectCommand({ Bucket: s3BucketName, Key: s3Key, Body: Buffer.from(data), ContentType: 'application/octet-stream' }));
  } else {
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, Buffer.from(data));
  }
}

export async function getMacroPerModelData(modelId: string): Promise<Buffer | null> {
  const { storageProvider, s3Client, s3BucketName, RESULTS_DIR, streamToBuffer } = getStorageContext();
  const s3Key = path.join(FLAT_MODELS_DIR, `${safeModelId(modelId)}.bin`);
  const localPath = path.join(RESULTS_DIR, s3Key);
  if (storageProvider === 's3' && s3Client && s3BucketName) {
    try {
      const { Body } = await s3Client.send(new GetObjectCommand({ Bucket: s3BucketName, Key: s3Key }));
      if (!Body) return null;
      return await streamToBuffer(Body as Readable);
    } catch (err: any) {
      if (err.name === 'NoSuchKey') return null;
      console.error('[MacroStorage] Error fetching per-model data from S3:', err);
      return null;
    }
  } else {
    try {
      if (!fsSync.existsSync(localPath)) return null;
      return await fs.readFile(localPath);
    } catch (err) {
      console.error('[MacroStorage] Error fetching per-model data locally:', err);
      return null;
    }
  }
}


