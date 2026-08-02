/**
 * Fails the build when any route's first-load JavaScript exceeds the budget in
 * docs/05-architecture.md § Performance budget.
 *
 * A performance budget that is not enforced is a wish. This runs in CI so a PR
 * that quietly adds 200 KB of charting library gets caught at review time
 * rather than on someone's phone.
 *
 * "First load" is measured the way the browser experiences it: the union of the
 * chunks Next lists for a route, gzipped. Chunks are counted once per route
 * even when shared, and legacy-only polyfills are excluded — they are served
 * exclusively to browsers we do not target.
 */
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

/** Kilobytes, gzipped, per route. */
const BUDGET_KB = 180;

const NEXT_DIR = join(process.cwd(), '.next');
const MANIFEST = join(NEXT_DIR, 'app-build-manifest.json');

const isPolyfill = (file) => file.includes('polyfills');

async function gzippedSize(file) {
  return gzipSync(await readFile(join(NEXT_DIR, file))).length;
}

async function main() {
  try {
    await stat(MANIFEST);
  } catch {
    console.error(`No build manifest at ${MANIFEST}. Run \`pnpm build\` first.`);
    process.exit(1);
  }

  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
  const routes = Object.entries(manifest.pages ?? {});

  if (routes.length === 0) {
    console.error('The build manifest lists no routes — something is wrong with the build.');
    process.exit(1);
  }

  const sizeCache = new Map();
  const measured = [];

  for (const [route, files] of routes) {
    const jsFiles = [...new Set(files)].filter((f) => f.endsWith('.js') && !isPolyfill(f));
    let total = 0;
    for (const file of jsFiles) {
      if (!sizeCache.has(file)) sizeCache.set(file, await gzippedSize(file));
      total += sizeCache.get(file);
    }
    measured.push({ route, kb: total / 1024, chunks: jsFiles.length });
  }

  measured.sort((a, b) => b.kb - a.kb);

  console.log(`First-load JS per route (gzipped, budget ${BUDGET_KB} KB):`);
  for (const { route, kb, chunks } of measured) {
    const flag = kb > BUDGET_KB ? ' OVER' : '';
    console.log(`  ${kb.toFixed(1).padStart(7)} KB  ${route}  (${chunks} chunks)${flag}`);
  }

  const worst = measured[0];
  if (worst.kb > BUDGET_KB) {
    console.error(
      `\n"${worst.route}" is over budget by ${(worst.kb - BUDGET_KB).toFixed(1)} KB.\n` +
        'Either trim a dependency or change the budget deliberately in\n' +
        'docs/05-architecture.md and this script — but not silently.',
    );
    process.exit(1);
  }

  console.log(`\nWorst route is ${worst.kb.toFixed(1)} KB. Within budget.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
