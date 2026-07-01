import fs from 'node:fs';
import path from 'node:path';

/**
 * Seeds the local-filesystem storage backend (`.results/`) with deterministic
 * fixtures so the data-driven pages (homepage, /latest, /analysis/*) render
 * real content in e2e runs without S3 credentials or live LLM calls.
 *
 * In dev/test mode the app's storageService reads from `.results/` on disk
 * (STORAGE_PROVIDER defaults to `local` when NODE_ENV is development/test), so
 * dropping fixtures there is all that's needed.
 *
 * Seeding is non-destructive. The common case (CI, no local `.results/`) is
 * handled by simply removing the whole directory on teardown. When a developer
 * already has a real `.results/`, we back up any file we overwrite and restore
 * it, and remove only the files/dirs we added.
 */

const FIXTURES_ROOT = path.join(__dirname, 'results');
const RESULTS_DIR = path.resolve(process.cwd(), '.results');
const MANIFEST_PATH = path.join(RESULTS_DIR, '.e2e-fixture-manifest.json');

interface SeedManifest {
  // Whether `.results/` already existed before seeding.
  resultsPreexisted: boolean;
  // Files that already existed and were overwritten: dest path -> backup path.
  backedUp: Record<string, string>;
  // Files we created (did not exist before): absolute paths.
  createdFiles: string[];
  // Directories we created, deepest first, so they can be removed in order.
  createdDirs: string[];
}

function listFixtureFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFixtureFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

export function seedFixtures(): void {
  const resultsPreexisted = fs.existsSync(RESULTS_DIR);
  const manifest: SeedManifest = {
    resultsPreexisted,
    backedUp: {},
    createdFiles: [],
    createdDirs: [],
  };

  for (const src of listFixtureFiles(FIXTURES_ROOT)) {
    const relFromFixtures = path.relative(FIXTURES_ROOT, src);
    const dest = path.join(RESULTS_DIR, relFromFixtures);

    // Track directories we need to create (outermost first).
    const dirsToCreate: string[] = [];
    let cursor = path.dirname(dest);
    while (!fs.existsSync(cursor)) {
      dirsToCreate.unshift(cursor);
      cursor = path.dirname(cursor);
    }
    for (const d of dirsToCreate) {
      fs.mkdirSync(d);
      manifest.createdDirs.push(d);
    }

    if (fs.existsSync(dest)) {
      const backup = `${dest}.e2e-bak`;
      fs.copyFileSync(dest, backup);
      manifest.backedUp[dest] = backup;
    } else {
      manifest.createdFiles.push(dest);
    }
    fs.copyFileSync(src, dest);
  }

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf-8');
}

export function cleanupFixtures(): void {
  if (!fs.existsSync(MANIFEST_PATH)) return;

  let manifest: SeedManifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  } catch {
    return;
  }

  // Simple, bulletproof path: we created `.results/` from scratch, so remove it
  // wholesale (also cleans up anything the app wrote there during the run).
  if (!manifest.resultsPreexisted) {
    fs.rmSync(RESULTS_DIR, { recursive: true, force: true });
    return;
  }

  // Otherwise restore the pre-existing directory precisely.
  for (const [dest, backup] of Object.entries(manifest.backedUp)) {
    try {
      if (fs.existsSync(backup)) {
        fs.copyFileSync(backup, dest);
        fs.rmSync(backup);
      }
    } catch {
      /* best effort */
    }
  }

  for (const file of manifest.createdFiles) {
    try {
      if (fs.existsSync(file)) fs.rmSync(file);
    } catch {
      /* best effort */
    }
  }

  // Remove directories we created, deepest first.
  for (const dir of [...manifest.createdDirs].sort((a, b) => b.length - a.length)) {
    try {
      if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
        fs.rmdirSync(dir);
      }
    } catch {
      /* best effort */
    }
  }

  try {
    fs.rmSync(MANIFEST_PATH);
  } catch {
    /* best effort */
  }
}
