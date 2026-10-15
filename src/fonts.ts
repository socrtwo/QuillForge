/** Bundled open fonts (latin subsets) and metric-compatible aliases for common proprietary fonts. */
import tinos_400_normal from '@fontsource/tinos/files/tinos-latin-400-normal.woff2?url';
import tinos_400_italic from '@fontsource/tinos/files/tinos-latin-400-italic.woff2?url';
import tinos_700_normal from '@fontsource/tinos/files/tinos-latin-700-normal.woff2?url';
import tinos_700_italic from '@fontsource/tinos/files/tinos-latin-700-italic.woff2?url';
import arimo_400_normal from '@fontsource/arimo/files/arimo-latin-400-normal.woff2?url';
import arimo_400_italic from '@fontsource/arimo/files/arimo-latin-400-italic.woff2?url';
import arimo_700_normal from '@fontsource/arimo/files/arimo-latin-700-normal.woff2?url';
import arimo_700_italic from '@fontsource/arimo/files/arimo-latin-700-italic.woff2?url';
import cousine_400_normal from '@fontsource/cousine/files/cousine-latin-400-normal.woff2?url';
import cousine_400_italic from '@fontsource/cousine/files/cousine-latin-400-italic.woff2?url';
import cousine_700_normal from '@fontsource/cousine/files/cousine-latin-700-normal.woff2?url';
import cousine_700_italic from '@fontsource/cousine/files/cousine-latin-700-italic.woff2?url';
import carlito_400_normal from '@fontsource/carlito/files/carlito-latin-400-normal.woff2?url';
import carlito_400_italic from '@fontsource/carlito/files/carlito-latin-400-italic.woff2?url';
import carlito_700_normal from '@fontsource/carlito/files/carlito-latin-700-normal.woff2?url';
import carlito_700_italic from '@fontsource/carlito/files/carlito-latin-700-italic.woff2?url';
import caladea_400_normal from '@fontsource/caladea/files/caladea-latin-400-normal.woff2?url';
import caladea_400_italic from '@fontsource/caladea/files/caladea-latin-400-italic.woff2?url';
import caladea_700_normal from '@fontsource/caladea/files/caladea-latin-700-normal.woff2?url';
import caladea_700_italic from '@fontsource/caladea/files/caladea-latin-700-italic.woff2?url';
import gelasio_400_normal from '@fontsource/gelasio/files/gelasio-latin-400-normal.woff2?url';
import gelasio_400_italic from '@fontsource/gelasio/files/gelasio-latin-400-italic.woff2?url';
import gelasio_700_normal from '@fontsource/gelasio/files/gelasio-latin-700-normal.woff2?url';
import gelasio_700_italic from '@fontsource/gelasio/files/gelasio-latin-700-italic.woff2?url';
import eb_garamond_400_normal from '@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff2?url';
import eb_garamond_400_italic from '@fontsource/eb-garamond/files/eb-garamond-latin-400-italic.woff2?url';
import eb_garamond_700_normal from '@fontsource/eb-garamond/files/eb-garamond-latin-700-normal.woff2?url';
import eb_garamond_700_italic from '@fontsource/eb-garamond/files/eb-garamond-latin-700-italic.woff2?url';
import courier_prime_400_normal from '@fontsource/courier-prime/files/courier-prime-latin-400-normal.woff2?url';
import courier_prime_400_italic from '@fontsource/courier-prime/files/courier-prime-latin-400-italic.woff2?url';
import courier_prime_700_normal from '@fontsource/courier-prime/files/courier-prime-latin-700-normal.woff2?url';
import courier_prime_700_italic from '@fontsource/courier-prime/files/courier-prime-latin-700-italic.woff2?url';
import libre_baskerville_400_normal from '@fontsource/libre-baskerville/files/libre-baskerville-latin-400-normal.woff2?url';
import libre_baskerville_400_italic from '@fontsource/libre-baskerville/files/libre-baskerville-latin-400-italic.woff2?url';
import libre_baskerville_700_normal from '@fontsource/libre-baskerville/files/libre-baskerville-latin-700-normal.woff2?url';
import libre_baskerville_700_italic from '@fontsource/libre-baskerville/files/libre-baskerville-latin-700-italic.woff2?url';
import lato_400_normal from '@fontsource/lato/files/lato-latin-400-normal.woff2?url';
import lato_400_italic from '@fontsource/lato/files/lato-latin-400-italic.woff2?url';
import lato_700_normal from '@fontsource/lato/files/lato-latin-700-normal.woff2?url';
import lato_700_italic from '@fontsource/lato/files/lato-latin-700-italic.woff2?url';
import merriweather_400_normal from '@fontsource/merriweather/files/merriweather-latin-400-normal.woff2?url';
import merriweather_400_italic from '@fontsource/merriweather/files/merriweather-latin-400-italic.woff2?url';
import merriweather_700_normal from '@fontsource/merriweather/files/merriweather-latin-700-normal.woff2?url';
import merriweather_700_italic from '@fontsource/merriweather/files/merriweather-latin-700-italic.woff2?url';
import open_sans_400_normal from '@fontsource/open-sans/files/open-sans-latin-400-normal.woff2?url';
import open_sans_400_italic from '@fontsource/open-sans/files/open-sans-latin-400-italic.woff2?url';
import open_sans_700_normal from '@fontsource/open-sans/files/open-sans-latin-700-normal.woff2?url';
import open_sans_700_italic from '@fontsource/open-sans/files/open-sans-latin-700-italic.woff2?url';

const FACES: [string, string[], string, string, string][] = [
  ['Tinos', ['Times New Roman', 'Times', 'Liberation Serif'], '400', 'normal', tinos_400_normal],
  ['Tinos', ['Times New Roman', 'Times', 'Liberation Serif'], '400', 'italic', tinos_400_italic],
  ['Tinos', ['Times New Roman', 'Times', 'Liberation Serif'], '700', 'normal', tinos_700_normal],
  ['Tinos', ['Times New Roman', 'Times', 'Liberation Serif'], '700', 'italic', tinos_700_italic],
  ['Arimo', ['Arial', 'Helvetica', 'Liberation Sans'], '400', 'normal', arimo_400_normal],
  ['Arimo', ['Arial', 'Helvetica', 'Liberation Sans'], '400', 'italic', arimo_400_italic],
  ['Arimo', ['Arial', 'Helvetica', 'Liberation Sans'], '700', 'normal', arimo_700_normal],
  ['Arimo', ['Arial', 'Helvetica', 'Liberation Sans'], '700', 'italic', arimo_700_italic],
  ['Cousine', ['Courier New', 'Courier', 'Liberation Mono'], '400', 'normal', cousine_400_normal],
  ['Cousine', ['Courier New', 'Courier', 'Liberation Mono'], '400', 'italic', cousine_400_italic],
  ['Cousine', ['Courier New', 'Courier', 'Liberation Mono'], '700', 'normal', cousine_700_normal],
  ['Cousine', ['Courier New', 'Courier', 'Liberation Mono'], '700', 'italic', cousine_700_italic],
  ['Carlito', ['Calibri'], '400', 'normal', carlito_400_normal],
  ['Carlito', ['Calibri'], '400', 'italic', carlito_400_italic],
  ['Carlito', ['Calibri'], '700', 'normal', carlito_700_normal],
  ['Carlito', ['Calibri'], '700', 'italic', carlito_700_italic],
  ['Caladea', ['Cambria'], '400', 'normal', caladea_400_normal],
  ['Caladea', ['Cambria'], '400', 'italic', caladea_400_italic],
  ['Caladea', ['Cambria'], '700', 'normal', caladea_700_normal],
  ['Caladea', ['Cambria'], '700', 'italic', caladea_700_italic],
  ['Gelasio', ['Georgia'], '400', 'normal', gelasio_400_normal],
  ['Gelasio', ['Georgia'], '400', 'italic', gelasio_400_italic],
  ['Gelasio', ['Georgia'], '700', 'normal', gelasio_700_normal],
  ['Gelasio', ['Georgia'], '700', 'italic', gelasio_700_italic],
  ['EB Garamond', ['Garamond', 'Adobe Garamond Pro'], '400', 'normal', eb_garamond_400_normal],
  ['EB Garamond', ['Garamond', 'Adobe Garamond Pro'], '400', 'italic', eb_garamond_400_italic],
  ['EB Garamond', ['Garamond', 'Adobe Garamond Pro'], '700', 'normal', eb_garamond_700_normal],
  ['EB Garamond', ['Garamond', 'Adobe Garamond Pro'], '700', 'italic', eb_garamond_700_italic],
  ['Courier Prime', [], '400', 'normal', courier_prime_400_normal],
  ['Courier Prime', [], '400', 'italic', courier_prime_400_italic],
  ['Courier Prime', [], '700', 'normal', courier_prime_700_normal],
  ['Courier Prime', [], '700', 'italic', courier_prime_700_italic],
  ['Libre Baskerville', ['Baskerville', 'Baskerville Old Face'], '400', 'normal', libre_baskerville_400_normal],
  ['Libre Baskerville', ['Baskerville', 'Baskerville Old Face'], '400', 'italic', libre_baskerville_400_italic],
  ['Libre Baskerville', ['Baskerville', 'Baskerville Old Face'], '700', 'normal', libre_baskerville_700_normal],
  ['Libre Baskerville', ['Baskerville', 'Baskerville Old Face'], '700', 'italic', libre_baskerville_700_italic],
  ['Lato', [], '400', 'normal', lato_400_normal],
  ['Lato', [], '400', 'italic', lato_400_italic],
  ['Lato', [], '700', 'normal', lato_700_normal],
  ['Lato', [], '700', 'italic', lato_700_italic],
  ['Merriweather', [], '400', 'normal', merriweather_400_normal],
  ['Merriweather', [], '400', 'italic', merriweather_400_italic],
  ['Merriweather', [], '700', 'normal', merriweather_700_normal],
  ['Merriweather', [], '700', 'italic', merriweather_700_italic],
  ['Open Sans', [], '400', 'normal', open_sans_400_normal],
  ['Open Sans', [], '400', 'italic', open_sans_400_italic],
  ['Open Sans', [], '700', 'normal', open_sans_700_normal],
  ['Open Sans', [], '700', 'italic', open_sans_700_italic],
];

export function installFonts(): void {
  const css: string[] = [];
  for (const [fam, aliases, weight, style, url] of FACES) {
    css.push(`@font-face{font-family:"${fam}";src:url(${url}) format("woff2");font-weight:${weight};font-style:${style};font-display:swap}`);
    // Aliases prefer a locally installed original, falling back to the metric-compatible open font.
    for (const a of aliases) css.push(`@font-face{font-family:"${a}";src:local("${a}"),url(${url}) format("woff2");font-weight:${weight};font-style:${style};font-display:swap}`);
  }
  const el = document.createElement('style');
  el.id = 'qf-fonts';
  el.textContent = css.join('\n');
  document.head.appendChild(el);
}
