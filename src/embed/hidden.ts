/**
 * Commands that open, save, close, print or send files: hidden in the embedded editor (docs/EMBED.md), where
 * the embedding app owns the document. They disappear from the ribbon, Quick Access Bar, menus and command
 * search, and running one (a shortcut or macro) only explains why it is unavailable.
 */
const HIDDEN = /^file\.(new|newFromTemplate|open\w*|recover\w*|clearRecent|save\w*|autosave|print|quickPrint|printPreview|exportPdf|export\..+|share|email|close\w*|revert|exit|encrypt|versions|snapshot)$/;

export function embedHidden(id: string): boolean {
  return HIDDEN.test(id);
}
