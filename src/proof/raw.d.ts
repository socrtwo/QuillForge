declare module '*?raw' { const s: string; export default s; }

/** Package version injected by Vite (vite.config.ts define). */
declare const __APP_VERSION__: string;

/** hunspell-asm's CommonJS build (see spell.worker.ts for why it is used). */
declare module 'hunspell-asm/dist/cjs/index.js' { export * from 'hunspell-asm'; }
