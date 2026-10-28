// Converts the video that `node showcase/capture.mjs hero` records into
// the README's animation: a GIF built with a two pass palette, and an MP4.
//
// The GIF is 20 frames a second at 1100 pixels wide, trimmed to the part of the
// recording that shows the card being dragged and landing (capture.mjs writes
// the cut points beside the video). It must stay under 8 MB, which is what the
// README can carry without slowing the page.
//
// ffmpeg is found through FFMPEG, then the PATH.
//
// Usage, from e2e/: node showcase/gif.mjs

import { spawnSync } from 'node:child_process';
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const WORK = path.join(here, 'out');
const OUT = process.env.SHOWCASE_OUT
  ? path.resolve(process.env.SHOWCASE_OUT)
  : path.resolve(here, '..', '..', 'docs', 'assets', 'screens');

const FPS = 20;
const WIDTH = 1100;
const MAX_GIF_BYTES = 8 * 1024 * 1024;

const fail = message => {
  console.error(`FAIL ${message}`);
  process.exit(1);
};

const ffmpeg = process.env.FFMPEG || 'ffmpeg';

const probe = spawnSync(ffmpeg, ['-version'], { encoding: 'utf8' });
if (probe.error || probe.status !== 0) {
  fail(
    `ffmpeg was not found (tried "${ffmpeg}"). Install it (winget install Gyan.FFmpeg, brew install ffmpeg or apt install ffmpeg) ` +
      'and open a new terminal, or point FFMPEG at the executable.'
  );
}

/** Runs ffmpeg and stops with its last lines when it fails. */
const run = (label, args) => {
  const result = spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    fail(`ffmpeg failed while ${label}:\n${(result.stderr || result.stdout || '').trim().split('\n').slice(-8).join('\n')}`);
  }
};

const video = path.join(WORK, 'hero.webm');
let cut;

try {
  await stat(video);
  cut = JSON.parse(await readFile(path.join(WORK, 'hero.json'), 'utf8'));
} catch {
  fail(`No recording at ${video}. Record it first: node showcase/capture.mjs hero`);
}

await mkdir(OUT, { recursive: true });

const palette = path.join(WORK, 'hero-palette.png');
const gif = path.join(OUT, 'hero.gif');
const mp4 = path.join(OUT, 'hero.mp4');
const trim = ['-ss', String(cut.start), '-to', String(cut.end), '-i', video];
const filters = `fps=${FPS},scale=${WIDTH}:-1:flags=lanczos`;

// Pass one reads the whole clip and picks the 256 colours that suit it. The
// diff statistics weight the colours of what moves over the static page.
run('building the palette', [...trim, '-vf', `${filters},palettegen=stats_mode=diff`, palette]);

// Pass two draws every frame with that palette. Bayer dithering keeps the
// gradients from banding and compresses far better than error diffusion.
run('encoding the GIF', [
  ...trim,
  '-i',
  palette,
  '-lavfi',
  `${filters} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
  '-loop',
  '0',
  gif,
]);

run('encoding the MP4', [
  ...trim,
  '-vf',
  'fps=25,scale=1440:-2:flags=lanczos',
  '-c:v',
  'libx264',
  '-crf',
  '24',
  '-preset',
  'slow',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  '-an',
  mp4,
]);

const size = async file => (await stat(file)).size;
const megabytes = bytes => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

const gifBytes = await size(gif);
console.log(`OK   hero.gif  ${megabytes(gifBytes)}`);
console.log(`OK   hero.mp4  ${megabytes(await size(mp4))}`);

if (gifBytes > MAX_GIF_BYTES) {
  fail(`hero.gif is ${megabytes(gifBytes)}, over the ${megabytes(MAX_GIF_BYTES)} limit. Lower WIDTH or FPS in gif.mjs, or shorten the flow.`);
}
