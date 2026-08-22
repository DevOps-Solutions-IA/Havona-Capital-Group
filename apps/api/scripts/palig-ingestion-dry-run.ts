import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain', '.md': 'text/markdown',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
};

async function files(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  }));
  return nested.flat().sort();
}

function proposal(filename: string) {
  const name = filename.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const contractual = /poliza|clausulado|condiciones/.test(name);
  const training = /capacitacion|presentacion/.test(name);
  const commercial = /postal|factsheet/.test(name);
  const need = /accidente|tarifario ap/.test(name) ? ['ACCIDENT_PROTECTION']
    : /cancer/.test(name) ? ['CANCER_PROTECTION']
      : /enfermedades graves|enf\. graves/.test(name) ? ['CRITICAL_ILLNESS']
        : /pension/.test(name) ? ['RETIREMENT_PENSION_GAP']
          : /vida flex/.test(name) ? ['CAPITAL_ACCUMULATION'] : [];
  return {
    sourceType: contractual ? 'CONTRACTUAL' : training ? 'CAPACITACION' : commercial ? 'COMERCIAL' : 'CORPORATIVO',
    currentStatus: 'UNKNOWN', publicAllowed: false,
    carrier: 'PAN_AMERICAN_LIFE_COLOMBIA', customerNeeds: need,
    reviewRequired: true,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf('--output');
  const output = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
  if (outputIndex >= 0 && !output) throw new Error('OUTPUT_PATH_REQUIRED');
  const positional = args.filter((item, index) =>
    !item.startsWith('--') && index !== outputIndex + 1,
  );
  if (positional.length > 1) throw new Error('TOO_MANY_SOURCE_PATHS');
  const root = resolve(positional[0] ?? '/mnt/d/Herry');
  const paths = await files(root);
  const seen = new Map<string, string>();
  const entries = [];
  for (const path of paths) {
    const metadata = await stat(path);
    const content = await readFile(path);
    const sha256 = createHash('sha256').update(content).digest('hex');
    const filename = path.slice(root.length + 1);
    const duplicateOf = seen.get(sha256) ?? null;
    if (!duplicateOf) seen.set(sha256, filename);
    entries.push({
      originalFilename: filename,
      extension: extname(filename).toLowerCase(),
      mimeType: MIME[extname(filename).toLowerCase()] ?? 'application/octet-stream',
      size: metadata.size,
      sha256,
      duplicate: Boolean(duplicateOf),
      duplicateOf,
      proposed: proposal(filename),
    });
  }
  const manifest = {
    dryRun: true, sourceFilesModified: false, recordsCreated: false, filesCopied: false,
    generatedAt: new Date().toISOString(), fileCount: entries.length,
    uniqueHashes: seen.size, duplicateCount: entries.length - seen.size, entries,
  };
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  if (output) await writeFile(resolve(output), serialized, { mode: 0o600, flag: 'w' });
  else process.stdout.write(serialized);
}

void main().catch((error) => {
  process.stderr.write(`PALIG_DRY_RUN_FAILED:${error instanceof Error ? error.message : 'UNKNOWN'}\n`);
  process.exitCode = 1;
});
