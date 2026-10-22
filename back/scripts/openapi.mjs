import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { stringify } from 'yaml';
import { buildOpenApiSpec } from '../src/openapi/spec.js';

/**
 * Writes the OpenAPI document to docs/openapi.yaml, or with --check builds it
 * in memory and compares it with that file, exiting 1 when they differ.
 *
 *   npm run openapi          regenerate docs/openapi.yaml
 *   npm run openapi:check    fail when the committed file is out of date
 *
 * Line width is left unlimited so a long description stays one line, which is
 * how the repository's documents are written, and so a diff of a single word
 * is a single line.
 */
const SPEC_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/openapi.yaml');

const render = () => stringify(buildOpenApiSpec(), { lineWidth: 0 });

const checkOnly = process.argv.includes('--check');
const generated = render();

if (checkOnly) {
  // A checkout with autocrlf turns every line feed into a carriage return and
  // a line feed, which is not a difference in the document.
  const committed = fs.existsSync(SPEC_PATH) ? fs.readFileSync(SPEC_PATH, 'utf8').replaceAll('\r\n', '\n') : null;

  if (committed === generated) {
    console.log('docs/openapi.yaml is up to date.');
    process.exit(0);
  }

  console.error(
    committed === null
      ? 'docs/openapi.yaml does not exist. Run "npm run openapi" in back/ and commit the result.'
      : 'docs/openapi.yaml is out of date with the route schemas or with the version in back/package.json, which the document embeds as info.version, so a version bump alone fails this check. Run "npm run openapi" in back/ and commit the result.'
  );
  process.exit(1);
}

fs.mkdirSync(path.dirname(SPEC_PATH), { recursive: true });
fs.writeFileSync(SPEC_PATH, generated);
console.log(`Wrote ${path.relative(process.cwd(), SPEC_PATH)}`);
