/**
 * Shows an image inline in the terminal with iTerm2's inline images protocol
 * (OSC 1337) supported by iTerm2 and VS Code.
 */
import sharp from 'sharp';

/** Downscaled before sending: the full image is 2000 px and up to 2 MB. */
const PREVIEW_WIDTH_PX = 512;

/** In character cells, which are about twice as tall as wide. */
const PREVIEW_WIDTH_CELLS = 40;

const OSC = '\u001B]';
const BEL = '\u0007';

const SUPPORTED_TERM_PROGRAMS = new Set(['iTerm.app', 'vscode']);

/**
 * - `iTerm2`: set by iTerm2.
 * - `vscode`: set only when VS Code opens this repo's workspace
 *   (`terminal.integrated.env.*`), since VS Code itself sets none.
 */
const SUPPORTED_LC_TERMINALS = new Set(['iTerm2', 'vscode']);

/**
 * Whether the terminal draws OSC 1337 images. `LC_TERMINAL` survives SSH,
 * which forwards `LC_*` with the locale, unlike `TERM_PROGRAM`. tmux swallows
 * the sequence without a passthrough wrapper, so it's skipped.
 * @pure
 */
export function supportsInlineImages(env: NodeJS.ProcessEnv, isTTY: boolean): boolean {
  if (!isTTY || env.TMUX !== undefined) return false;
  return (
    SUPPORTED_TERM_PROGRAMS.has(env.TERM_PROGRAM ?? '') ||
    SUPPORTED_LC_TERMINALS.has(env.LC_TERMINAL ?? '')
  );
}

/**
 * The escape sequence that draws `jpeg`, downscaled, at the cursor.
 */
export async function renderInlineImage(jpeg: Uint8Array): Promise<string> {
  const preview = await sharp(jpeg)
    .resize({ width: PREVIEW_WIDTH_PX, withoutEnlargement: true })
    .jpeg()
    .toBuffer();
  const args = `inline=1;size=${preview.byteLength};width=${PREVIEW_WIDTH_CELLS};preserveAspectRatio=1`;
  return `${OSC}1337;File=${args}:${preview.toString('base64')}${BEL}`;
}
