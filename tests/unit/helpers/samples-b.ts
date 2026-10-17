/**
 * Builders for test documents in formats that no installed tool writes (OpenOffice.org 1.x,
 * AbiWord, KWord, HWPX, Pages). Each follows the published format description closely enough
 * to exercise the importers; they are not copies of third-party files.
 */
import JSZip from 'jszip';

export const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAABgAAAAQCAIAAACDRijCAAAAUUlEQVR4nO3MEQKAQBQA0T1OGAYDYRiGYRiGYbgYhmEYhoNh2FE6RPrfAV6ywBIrrLHBFjvsccARJ5xxwYwrbrjjgSdeKN744EuKKKKIIvoXfcfJTB+0EAsJAAAAAElFTkSuQmCC';
export const pngBytes = () => Uint8Array.from(atob(PNG_B64), (c) => c.charCodeAt(0));

const OOO_NS = 'xmlns:office="http://openoffice.org/2000/office" xmlns:style="http://openoffice.org/2000/style" xmlns:text="http://openoffice.org/2000/text" xmlns:table="http://openoffice.org/2000/table" xmlns:draw="http://openoffice.org/2000/drawing" xmlns:fo="http://www.w3.org/1999/XSL/Format" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:number="http://openoffice.org/2000/datastyle" xmlns:svg="http://www.w3.org/2000/svg" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:meta="http://openoffice.org/2000/meta"';

/** An OpenOffice.org 1.1 Writer document (.sxw). */
export async function buildSxw(): Promise<Uint8Array> {
  const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE office:document-content PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "office.dtd">
<office:document-content ${OOO_NS} office:class="text" office:version="1.0">
 <office:script/>
 <office:font-decls>
  <style:font-decl style:name="Thorndale" fo:font-family="Thorndale" style:font-family-generic="roman" style:font-pitch="variable"/>
  <style:font-decl style:name="Albany" fo:font-family="Albany" style:font-family-generic="swiss" style:font-pitch="variable"/>
 </office:font-decls>
 <office:automatic-styles>
  <style:style style:name="P1" style:family="paragraph" style:parent-style-name="Text body"><style:properties fo:text-align="center" fo:font-weight="bold" fo:color="#ff0000"/></style:style>
  <style:style style:name="P2" style:family="paragraph" style:parent-style-name="Standard"><style:properties fo:break-before="page"/></style:style>
  <style:style style:name="T1" style:family="text"><style:properties fo:font-style="italic" style:text-underline="double" style:text-underline-color="font-color"/></style:style>
  <style:style style:name="T2" style:family="text"><style:properties style:text-crossing-out="single-line" style:text-position="super 58%" style:font-name="Albany" fo:font-size="14pt"/></style:style>
  <style:style style:name="Table1" style:family="table"><style:properties style:width="6in" table:align="margins"/></style:style>
  <style:style style:name="Table1.A1" style:family="table-cell"><style:properties fo:background-color="#ccffcc" fo:padding="0.04in" fo:border="0.002cm solid #000000"/></style:style>
  <style:style style:name="fr1" style:family="graphics"><style:properties style:wrap="none" style:horizontal-pos="center"/></style:style>
  <text:list-style style:name="L1">
   <text:list-level-style-bullet text:level="1" text:style-name="Bullet Symbols" text:bullet-char="●"><style:properties text:min-label-width="0.25in" style:font-name="StarSymbol"/></text:list-level-style-bullet>
   <text:list-level-style-bullet text:level="2" text:style-name="Bullet Symbols" text:bullet-char="○"><style:properties text:space-before="0.25in" text:min-label-width="0.25in"/></text:list-level-style-bullet>
  </text:list-style>
  <text:list-style style:name="L2">
   <text:list-level-style-number text:level="1" style:num-suffix="." style:num-format="I"><style:properties text:min-label-width="0.25in"/></text:list-level-style-number>
  </text:list-style>
 </office:automatic-styles>
 <office:body>
  <text:tracked-changes>
   <text:changed-region text:id="ct1"><text:insertion><office:change-info office:chg-author="Ann Editor" office:chg-date-time="2004-05-06T07:08:09"/></text:insertion></text:changed-region>
  </text:tracked-changes>
  <text:sequence-decls><text:sequence-decl text:display-outline-level="0" text:name="Illustration"/></text:sequence-decls>
  <text:h text:style-name="Heading 1" text:level="1">Old Writer Heading</text:h>
  <text:p text:style-name="P1">Centered red bold</text:p>
  <text:p text:style-name="Text body">Plain <text:span text:style-name="T1">double underlined italic</text:span> and <text:span text:style-name="T2">struck super</text:span><text:tab-stop/>tab<text:s text:c="3"/>spaces<text:line-break/>line two<text:footnote text:id="ftn0"><text:footnote-citation>1</text:footnote-citation><text:footnote-body><text:p text:style-name="Footnote">Old footnote.</text:p></text:footnote-body></text:footnote> <text:a xlink:type="simple" xlink:href="http://www.openoffice.org/">OpenOffice.org</text:a><office:annotation office:author="Reviewer" office:create-date="2004-01-02"><text:p>An old note</text:p></office:annotation> <text:change-start text:change-id="ct1"/>added<text:change-end text:change-id="ct1"/></text:p>
  <text:unordered-list text:style-name="L1">
   <text:list-item><text:p text:style-name="Text body">Bullet A</text:p>
    <text:unordered-list><text:list-item><text:p text:style-name="Text body">Bullet A.1</text:p></text:list-item></text:unordered-list>
   </text:list-item>
   <text:list-item><text:p text:style-name="Text body">Bullet B</text:p></text:list-item>
  </text:unordered-list>
  <text:ordered-list text:style-name="L2">
   <text:list-item><text:p text:style-name="Text body">Roman one</text:p></text:list-item>
   <text:list-item><text:p text:style-name="Text body">Roman two</text:p></text:list-item>
  </text:ordered-list>
  <table:table table:name="Table1" table:style-name="Table1">
   <table:table-column table:number-columns-repeated="2"/>
   <table:table-header-rows><table:table-row><table:table-cell table:style-name="Table1.A1" table:number-columns-spanned="2" table:value-type="string"><text:p text:style-name="Table Heading">Wide header</text:p></table:table-cell><table:covered-table-cell/></table:table-row></table:table-header-rows>
   <table:table-row><table:table-cell table:value-type="string"><text:p text:style-name="Table Contents">c1</text:p></table:table-cell><table:table-cell table:value-type="string"><text:p text:style-name="Table Contents">c2</text:p></table:table-cell></table:table-row>
  </table:table>
  <text:p text:style-name="Standard">Image: <draw:image draw:style-name="fr1" draw:name="Graphic1" text:anchor-type="as-char" svg:width="0.5in" svg:height="0.333in" draw:z-index="0" xlink:href="#Pictures/10000000000000180000001055E9D2B3.png" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></text:p>
  <text:p text:style-name="Standard"><draw:text-box draw:style-name="fr1" draw:name="Text Frame 1" text:anchor-type="paragraph" svg:width="2in" fo:min-height="0.5in" draw:z-index="1"><text:p text:style-name="Frame contents">Inside frame</text:p></draw:text-box>After frame</text:p>
  <text:p text:style-name="P2">New page</text:p>
 </office:body>
</office:document-content>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE office:document-styles PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "office.dtd">
<office:document-styles ${OOO_NS} office:version="1.0">
 <office:font-decls><style:font-decl style:name="Thorndale" fo:font-family="Thorndale" style:font-family-generic="roman" style:font-pitch="variable"/></office:font-decls>
 <office:styles>
  <style:default-style style:family="paragraph"><style:properties style:font-name="Thorndale" fo:font-size="12pt" fo:language="en" fo:country="US"/></style:default-style>
  <style:style style:name="Standard" style:family="paragraph" style:class="text"/>
  <style:style style:name="Heading" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Text body" style:class="text"><style:properties fo:margin-top="0.1665in" fo:margin-bottom="0.0835in" style:font-name="Albany" fo:font-size="14pt" fo:keep-with-next="true"/></style:style>
  <style:style style:name="Text body" style:family="paragraph" style:parent-style-name="Standard" style:class="text"><style:properties fo:margin-top="0in" fo:margin-bottom="0.0835in"/></style:style>
  <style:style style:name="Heading 1" style:family="paragraph" style:parent-style-name="Heading" style:next-style-name="Text body" style:class="text" style:default-outline-level="1"><style:properties fo:font-size="115%" fo:font-weight="bold"/></style:style>
  <style:style style:name="Footnote" style:family="paragraph" style:parent-style-name="Standard" style:class="extra"><style:properties fo:margin-left="0.1965in" fo:text-indent="-0.1965in" fo:font-size="10pt"/></style:style>
  <text:footnotes-configuration style:num-format="1" text:start-value="0" text:footnotes-position="page" text:start-numbering-at="document"/>
 </office:styles>
 <office:automatic-styles>
  <style:page-master style:name="pm1">
   <style:properties fo:page-width="21.001cm" fo:page-height="29.7cm" style:num-format="1" style:print-orientation="portrait" fo:margin-top="2cm" fo:margin-bottom="2cm" fo:margin-left="2.5cm" fo:margin-right="2cm"/>
   <style:header-style><style:properties fo:min-height="0in" fo:margin-bottom="0.1965in"/></style:header-style>
   <style:footer-style/>
  </style:page-master>
 </office:automatic-styles>
 <office:master-styles>
  <style:master-page style:name="Standard" style:page-master-name="pm1"><style:header><text:p text:style-name="Header">Old header <text:page-number text:select-page="current">1</text:page-number></text:p></style:header></style:master-page>
 </office:master-styles>
</office:document-styles>`;
  const meta = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta ${OOO_NS} office:version="1.0"><office:meta><meta:generator>OpenOffice.org 1.1.5 (Linux)</meta:generator><dc:title>Old Document</dc:title><meta:initial-creator>Sam Writer</meta:initial-creator></office:meta></office:document-meta>`;
  const zip = new JSZip();
  zip.file('mimetype', 'application/vnd.sun.xml.writer', { compression: 'STORE' });
  zip.file('content.xml', content);
  zip.file('styles.xml', styles);
  zip.file('meta.xml', meta);
  zip.file('Pictures/10000000000000180000001055E9D2B3.png', pngBytes());
  zip.file('META-INF/manifest.xml', '<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="http://openoffice.org/2001/manifest"><manifest:file-entry manifest:media-type="application/vnd.sun.xml.writer" manifest:full-path="/"/></manifest:manifest>');
  return zip.generateAsync({ type: 'uint8array' });
}

/** An AbiWord 2.x document (.abw). */
export function abwXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE abiword PUBLIC "-//ABISOURCE//DTD AWML 1.0 Strict//EN" "http://www.abisource.com/awml.dtd">
<abiword template="false" xmlns:fo="http://www.w3.org/1999/XSL/Format" xmlns:svg="http://www.w3.org/2000/svg" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:ct="http://www.abisource.com/changetracking.dtd" xmlns="http://www.abisource.com/awml.dtd" xmlns:xlink="http://www.w3.org/1999/xlink" xid-max="40" version="2.8.6" fileformat="1.1" styles="unlocked">
<metadata>
<m key="abiword.generator">AbiWord</m>
<m key="dc.creator">Abi Author</m>
<m key="dc.format">application/x-abiword</m>
<m key="dc.title">Abi Title</m>
</metadata>
<revisions show="1" mark="1" show-level="0" auto="0">
<r id="1" time-started="1262304000" version="0">Rev Person</r>
</revisions>
<history version="1" edit-time="60" last-saved="1262304000" uid="x"/>
<styles>
<s type="P" name="Normal" followedby="Current Settings" props="font-family:Liberation Serif; margin-top:0pt; color:000000; margin-left:0pt; text-position:normal; widows:2; font-style:normal; text-indent:0in; font-variant:normal; font-weight:normal; margin-right:0pt; font-size:12pt; text-decoration:none; margin-bottom:0pt; line-height:1.0; bgcolor:transparent; text-align:left; font-stretch:normal"/>
<s type="P" name="Heading 1" basedon="Normal" followedby="Normal" props="font-family:Liberation Sans; margin-top:22pt; font-weight:bold; margin-bottom:3pt; font-size:17pt; keep-with-next:yes"/>
<s type="P" name="Bullet List" basedon="Normal" followedby="Current Settings" props="start-value:1; list-style:Bullet List; margin-left:0.5in; text-indent:-0.3in; field-font:Symbol; list-delim:%L; list-decimal:."/>
<s type="P" name="Numbered List" basedon="Normal" followedby="Current Settings" props="start-value:1; list-style:Numbered List; margin-left:0.5in; text-indent:-0.3in; list-delim:%L.; list-decimal:."/>
<s type="P" name="Footnote Text" basedon="Normal" followedby="Current Settings" props="font-size:10pt"/>
<s type="C" name="Emphasis" props="font-style:italic"/>
</styles>
<lists>
<l id="1" parentid="0" type="5" start-value="0" list-delim="%L" list-decimal="NULL"/>
<l id="2" parentid="1" type="5" start-value="0" list-delim="%L" list-decimal="NULL"/>
<l id="3" parentid="0" type="4" start-value="1" list-delim="%L." list-decimal="."/>
</lists>
<pagesize pagetype="A4" orientation="portrait" width="210.000000" height="297.000000" units="mm" page-scale="1.000000"/>
<section xid="1" props="page-margin-footer:0.5in; page-margin-header:0.5in; page-margin-right:1in; page-margin-left:1.25in; page-margin-top:1in; page-margin-bottom:1in" header="hdr1" footer="ftr1">
<p style="Heading 1" xid="2">Abi Heading</p>
<p style="Normal" xid="3" props="text-align:center; margin-bottom:6pt">Centered with <c props="font-weight:bold">bold</c>, <c style="Emphasis">emphasis</c>, <c props="text-decoration:underline line-through">under-strike</c>, x<c props="text-position:superscript">2</c>, <c props="color:ff0000; bgcolor:ffff00; font-size:16pt; font-family:Courier New">big red</c>.</p>
<p style="Normal" xid="4">Link <a xlink:href="https://abisource.com/"><c props="color:0000ff; text-decoration:underline">AbiSource</c></a> and note<field footnote-id="0" type="footnote_ref" props="text-position:superscript"/><foot footnote-id="0"><p style="Footnote Text"><field footnote-id="0" type="footnote_anchor" props="text-position:superscript"/>Abi footnote text.</p></foot> and <c revision="+1">inserted</c> <c revision="-1">deleted</c>.<br/>Second line	tabbed</p>
<p style="Bullet List" level="1" listid="1" parentid="0" props="list-style:Bullet List"><field type="list_label" props="list-style:Bullet List"/><c props="list-tag:1">	</c>Bullet one</p>
<p style="Bullet List" level="2" listid="2" parentid="1" props="list-style:Bullet List"><field type="list_label" props="list-style:Bullet List"/><c props="list-tag:1">	</c>Bullet nested</p>
<p style="Numbered List" level="1" listid="3" parentid="0" props="list-style:Upper Roman List"><field type="list_label"/>Roman item</p>
<table props="table-column-props:1.5in/2in/; table-column-leftpos:0in">
<cell props="left-attach:0; right-attach:2; top-attach:0; bot-attach:1; bg-style:1; background-color:c0c0ff"><p style="Normal">Spanning</p></cell>
<cell props="left-attach:0; right-attach:1; top-attach:1; bot-attach:2"><p style="Normal">a</p></cell>
<cell props="left-attach:1; right-attach:2; top-attach:1; bot-attach:2"><p style="Normal">b</p></cell>
</table>
<p style="Normal"><image dataid="image_0" props="width:0.5in; height:0.33in"/><pbr/></p>
<p style="Normal">After page break</p>
</section>
<section id="hdr1" type="header" xid="20"><p style="Normal" props="text-align:right">Abi header</p></section>
<section id="ftr1" type="footer" xid="21"><p style="Normal" props="text-align:center">Page <field type="page_number">1</field></p></section>
<data>
<d name="image_0" mime-type="image/png" base64="yes">
${PNG_B64}
</d>
</data>
</abiword>
`;
}
export const buildAbw = () => new TextEncoder().encode(abwXml());

/** A KWord 1.3 document (.kwd, ZIP store with maindoc.xml). */
export async function buildKwd(): Promise<Uint8Array> {
  const fmt = (pos: number, len: number, inner: string) => `<FORMAT id="1" pos="${pos}" len="${len}">${inner}</FORMAT>`;
  const layout = (name: string, extra = '') => `<LAYOUT><NAME value="${name}"/><FLOW align="left"/>${extra}<FORMAT id="1"><COLOR red="0" green="0" blue="0"/><FONT name="${name === 'Head 1' ? 'Arial' : 'Times New Roman'}"/><SIZE value="${name === 'Head 1' ? 16 : 12}"/><WEIGHT value="${name === 'Head 1' ? 75 : 50}"/><ITALIC value="0"/><UNDERLINE value="0"/><STRIKEOUT value="0"/><VERTALIGN value="0"/></FORMAT></LAYOUT>`;
  const t1 = 'Body with bold and italic and red, see note';
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE DOC PUBLIC "-//KDE//DTD kword 1.3//EN" "http://www.koffice.org/DTD/kword-1.3.dtd">
<DOC xmlns="http://www.koffice.org/DTD/kword" mime="application/x-kword" syntaxVersion="3" editor="KWord">
 <PAPER format="1" width="595" height="841" orientation="0" columns="1" columnspacing="2" hType="0" fType="0" spHeadBody="9" spFootBody="9" zoom="100">
  <PAPERBORDERS left="56" right="42" top="42" bottom="42"/>
 </PAPER>
 <ATTRIBUTES processing="0" standardpage="1" hasHeader="1" hasFooter="0" unit="mm"/>
 <FRAMESETS>
  <FRAMESET frameType="1" frameInfo="0" name="Text Frameset 1" visible="1">
   <FRAME left="56" top="42" right="553" bottom="799" runaround="1" autoCreateNewFrame="1" newFrameBehavior="0"/>
   <PARAGRAPH><TEXT xml:space="preserve">KWord Heading</TEXT>${layout('Head 1', '<COUNTER type="0" depth="0" numberingtype="1"/>')}</PARAGRAPH>
   <PARAGRAPH><TEXT xml:space="preserve">${t1}#</TEXT><FORMATS>${fmt(10, 4, '<WEIGHT value="75"/>')}${fmt(19, 6, '<ITALIC value="1"/>')}${fmt(30, 3, '<COLOR red="255" green="0" blue="0"/>')}<FORMAT id="4" pos="${t1.length}" len="1"><VARIABLE><TYPE key="STRING" type="11" text="1"/><FOOTNOTE value="auto" notetype="footnote" numberingtype="auto" frameset="Footnote 1"/></VARIABLE></FORMAT></FORMATS>${layout('Standard', '<INDENTS first="14" left="0" right="0"/><OFFSETS before="0" after="6"/>')}</PARAGRAPH>
   <PARAGRAPH><TEXT xml:space="preserve">First bullet</TEXT>${layout('Bullet List', '<COUNTER type="10" depth="0" bullet="183" start="1" numberingtype="0" lefttext="" righttext="" bulletfont="Symbol"/>')}</PARAGRAPH>
   <PARAGRAPH><TEXT xml:space="preserve">Second bullet</TEXT>${layout('Bullet List', '<COUNTER type="10" depth="0" bullet="183" start="1" numberingtype="0" lefttext="" righttext="" bulletfont="Symbol"/>')}</PARAGRAPH>
   <PARAGRAPH><TEXT xml:space="preserve">Numbered</TEXT>${layout('Enumerated List', '<COUNTER type="1" depth="0" start="1" numberingtype="0" lefttext="" righttext="."/>')}</PARAGRAPH>
   <PARAGRAPH><TEXT xml:space="preserve">#</TEXT><FORMATS><FORMAT id="6" pos="0" len="1"><ANCHOR type="frameset" instance="Table 1"/></FORMAT></FORMATS>${layout('Standard')}</PARAGRAPH>
   <PARAGRAPH><TEXT xml:space="preserve">Picture # here</TEXT><FORMATS><FORMAT id="6" pos="8" len="1"><ANCHOR type="frameset" instance="Picture 1"/></FORMAT></FORMATS>${layout('Standard', '<FLOW align="center"/>')}</PARAGRAPH>
  </FRAMESET>
  <FRAMESET frameType="1" frameInfo="3" name="Odd Pages Header" visible="1">
   <FRAME left="56" top="20" right="553" bottom="35"/>
   <PARAGRAPH><TEXT xml:space="preserve">KWord header #</TEXT><FORMATS><FORMAT id="4" pos="13" len="1"><VARIABLE><TYPE key="NUMBER" type="4" text="1"/><PGNUM subtype="0" value="1"/></VARIABLE></FORMAT></FORMATS>${layout('Standard')}</PARAGRAPH>
  </FRAMESET>
  <FRAMESET frameType="1" frameInfo="7" name="Footnote 1" visible="1">
   <FRAME left="56" top="780" right="553" bottom="799"/>
   <PARAGRAPH><TEXT xml:space="preserve">KWord footnote.</TEXT>${layout('Standard')}</PARAGRAPH>
  </FRAMESET>
  <FRAMESET frameType="1" frameInfo="0" name="Table 1 Cell 1,1" grpMgr="Table 1" row="0" col="0" rows="1" cols="2" removable="0" visible="1">
   <FRAME left="56" top="200" right="300" bottom="220" bkRed="204" bkGreen="204" bkBlue="255"/>
   <PARAGRAPH><TEXT xml:space="preserve">Wide cell</TEXT>${layout('Standard')}</PARAGRAPH>
  </FRAMESET>
  <FRAMESET frameType="1" frameInfo="0" name="Table 1 Cell 2,1" grpMgr="Table 1" row="1" col="0" rows="1" cols="1" removable="0" visible="1">
   <FRAME left="56" top="220" right="178" bottom="240"/>
   <PARAGRAPH><TEXT xml:space="preserve">x1</TEXT>${layout('Standard')}</PARAGRAPH>
  </FRAMESET>
  <FRAMESET frameType="1" frameInfo="0" name="Table 1 Cell 2,2" grpMgr="Table 1" row="1" col="1" rows="1" cols="1" removable="0" visible="1">
   <FRAME left="178" top="220" right="300" bottom="240"/>
   <PARAGRAPH><TEXT xml:space="preserve">x2</TEXT>${layout('Standard')}</PARAGRAPH>
  </FRAMESET>
  <FRAMESET frameType="2" frameInfo="0" name="Picture 1" visible="1">
   <FRAME left="100" top="300" right="136" bottom="324" runaround="1"/>
   <PICTURE keepAspectRatio="true"><KEY msec="0" second="0" minute="0" hour="0" day="1" month="1" year="2004" filename="/home/user/swatch.png"/></PICTURE>
  </FRAMESET>
 </FRAMESETS>
 <STYLES>
  <STYLE><NAME value="Standard"/><FOLLOWING name="Standard"/><FLOW align="left"/><FORMAT id="1"><COLOR red="0" green="0" blue="0"/><FONT name="Times New Roman"/><SIZE value="12"/><WEIGHT value="50"/></FORMAT></STYLE>
  <STYLE><NAME value="Head 1"/><FOLLOWING name="Standard"/><OFFSETS before="12" after="6"/><FORMAT id="1"><FONT name="Arial"/><SIZE value="16"/><WEIGHT value="75"/></FORMAT></STYLE>
 </STYLES>
 <PICTURES><KEY msec="0" second="0" minute="0" hour="0" day="1" month="1" year="2004" filename="/home/user/swatch.png" name="pictures/picture1.png"/></PICTURES>
</DOC>`;
  const zip = new JSZip();
  zip.file('mimetype', 'application/x-kword', { compression: 'STORE' });
  zip.file('maindoc.xml', xml);
  zip.file('documentinfo.xml', '<?xml version="1.0" encoding="UTF-8"?><document-info><about><title>KWord Title</title></about><author><full-name>K Author</full-name></author></document-info>');
  zip.file('pictures/picture1.png', pngBytes());
  return zip.generateAsync({ type: 'uint8array' });
}

/** A Hangul OWPML document (.hwpx) following KS X 6101. */
export async function buildHwpx(): Promise<Uint8Array> {
  const NS = 'xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph" xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hc="http://www.hancom.co.kr/hwpml/2011/core" xmlns:hh="http://www.hancom.co.kr/hwpml/2011/head"';
  const header = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hh:head ${NS} version="1.4" secCnt="1">
 <hh:beginNum page="1" footnote="1" endnote="1" pic="1" tbl="1" equation="1"/>
 <hh:refList>
  <hh:fontfaces itemCnt="2">
   <hh:fontface lang="HANGUL" fontCnt="2"><hh:font id="0" face="함초롬바탕" type="TTF" isEmbedded="0"/><hh:font id="1" face="함초롬돋움" type="TTF" isEmbedded="0"/></hh:fontface>
   <hh:fontface lang="LATIN" fontCnt="2"><hh:font id="0" face="Times New Roman" type="TTF" isEmbedded="0"/><hh:font id="1" face="Arial" type="TTF" isEmbedded="0"/></hh:fontface>
  </hh:fontfaces>
  <hh:borderFills itemCnt="2">
   <hh:borderFill id="1" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:leftBorder type="NONE" width="0.1 mm" color="#000000"/></hh:borderFill>
   <hh:borderFill id="2" threeD="0" shadow="0" centerLine="NONE" breakCellSeparateLine="0"><hh:leftBorder type="SOLID" width="0.12 mm" color="#000000"/><hc:fillBrush><hc:winBrush faceColor="#FFE0E0" hatchColor="#999999" alpha="0"/></hc:fillBrush></hh:borderFill>
  </hh:borderFills>
  <hh:charProperties itemCnt="4">
   <hh:charPr id="0" height="1000" textColor="#000000" shadeColor="none" useFontSpace="0" useKerning="0" symMark="NONE" borderFillIDRef="1"><hh:fontRef hangul="0" latin="0" hanja="0" japanese="0" other="0" symbol="0" user="0"/><hh:ratio hangul="100" latin="100"/><hh:underline type="NONE" shape="SOLID" color="#000000"/><hh:strikeout shape="NONE" color="#000000"/></hh:charPr>
   <hh:charPr id="1" height="1000" textColor="#000000" shadeColor="none" borderFillIDRef="1"><hh:fontRef hangul="0" latin="0"/><hh:bold/><hh:underline type="NONE" shape="SOLID" color="#000000"/></hh:charPr>
   <hh:charPr id="2" height="1400" textColor="#0000FF" shadeColor="none" borderFillIDRef="1"><hh:fontRef hangul="1" latin="1"/><hh:italic/><hh:underline type="BOTTOM" shape="SOLID" color="#000000"/><hh:strikeout shape="SOLID" color="#000000"/></hh:charPr>
   <hh:charPr id="3" height="1600" textColor="#000000" shadeColor="none" borderFillIDRef="1"><hh:fontRef hangul="1" latin="1"/><hh:bold/></hh:charPr>
  </hh:charProperties>
  <hh:numberings itemCnt="1"><hh:numbering id="1" start="0"><hh:paraHead start="1" level="1" align="LEFT" useInstWidth="1" autoIndent="1" widthAdjust="0" textOffsetType="PERCENT" textOffset="50" numFormat="DIGIT" charPrIDRef="4294967295" checkable="0">^1.</hh:paraHead><hh:paraHead start="1" level="2" numFormat="LATIN_SMALL">^2)</hh:paraHead></hh:numbering></hh:numberings>
  <hh:bullets itemCnt="1"><hh:bullet id="1" char="●" useImage="0"><hh:paraHead level="0" align="LEFT"/></hh:bullet></hh:bullets>
  <hh:paraProperties itemCnt="4">
   <hh:paraPr id="0" tabPrIDRef="0" condense="0"><hh:align horizontal="JUSTIFY" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/><hp:switch><hp:case hp:required-namespace="http://www.hancom.co.kr/hwpml/2016/HwpUnitChar"><hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin></hp:case><hp:default><hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="0" unit="HWPUNIT"/><hc:next value="0" unit="HWPUNIT"/></hh:margin></hp:default></hp:switch><hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/></hh:paraPr>
   <hh:paraPr id="1"><hh:align horizontal="CENTER" vertical="BASELINE"/><hh:heading type="NONE" idRef="0" level="0"/><hh:margin><hc:intent value="0" unit="HWPUNIT"/><hc:left value="0" unit="HWPUNIT"/><hc:right value="0" unit="HWPUNIT"/><hc:prev value="1000" unit="HWPUNIT"/><hc:next value="600" unit="HWPUNIT"/></hh:margin><hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/></hh:paraPr>
   <hh:paraPr id="2"><hh:align horizontal="LEFT" vertical="BASELINE"/><hh:heading type="NUMBER" idRef="1" level="0"/><hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/></hh:paraPr>
   <hh:paraPr id="3"><hh:align horizontal="LEFT" vertical="BASELINE"/><hh:heading type="BULLET" idRef="1" level="0"/><hh:lineSpacing type="PERCENT" value="160" unit="HWPUNIT"/></hh:paraPr>
  </hh:paraProperties>
  <hh:styles itemCnt="3">
   <hh:style id="0" type="PARA" name="바탕글" engName="Normal" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="0" langID="1042" lockForm="0"/>
   <hh:style id="1" type="PARA" name="본문" engName="Body" paraPrIDRef="0" charPrIDRef="0" nextStyleIDRef="1" langID="1042" lockForm="0"/>
   <hh:style id="2" type="PARA" name="개요 1" engName="Outline 1" paraPrIDRef="1" charPrIDRef="3" nextStyleIDRef="2" langID="1042" lockForm="0"/>
  </hh:styles>
 </hh:refList>
</hh:head>`;
  const run = (cp: number, inner: string) => `<hp:run charPrIDRef="${cp}">${inner}</hp:run>`;
  const p = (pp: number, st: number, inner: string, extra = '') => `<hp:p id="0" paraPrIDRef="${pp}" styleIDRef="${st}" pageBreak="0" columnBreak="0" merged="0"${extra}>${inner}</hp:p>`;
  const cell = (col: number, row: number, cs: number, rs: number, text: string, fill = 1) => `<hp:tc name="" header="${row === 0 ? 1 : 0}" hasMargin="0" protect="0" editable="0" dirty="0" borderFillIDRef="${fill}"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="CENTER">${p(0, 0, run(0, `<hp:t>${text}</hp:t>`))}</hp:subList><hp:cellAddr colAddr="${col}" rowAddr="${row}"/><hp:cellSpan colSpan="${cs}" rowSpan="${rs}"/><hp:cellSz width="${cs * 14000}" height="1000"/><hp:cellMargin left="510" right="510" top="141" bottom="141"/></hp:tc>`;
  const section = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<hs:sec ${NS}>
 ${p(0, 0, run(0, `<hp:secPr id="" textDirection="HORIZONTAL" spaceColumns="1134" tabStop="8000" outlineShapeIDRef="1" memoShapeIDRef="0" textVerticalWidthHead="0"><hp:grid lineGrid="0" charGrid="0" wonggojiFormat="0"/><hp:startNum pageStartsOn="BOTH" page="0" pic="0" tbl="0" equation="0"/><hp:visibility hideFirstHeader="0" hideFirstFooter="0"/><hp:pagePr landscape="WIDELY" width="59528" height="84186" gutterType="LEFT_ONLY"><hp:margin header="4252" footer="4252" gutter="0" left="8504" right="8504" top="5668" bottom="4252"/></hp:pagePr></hp:secPr><hp:ctrl><hp:colPr id="" type="NEWSPAPER" layout="LEFT" colCount="1" sameSz="1" sameGap="0"/></hp:ctrl><hp:ctrl><hp:header id="1" applyPageType="BOTH"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP">${p(1, 0, run(0, '<hp:t>한글 머리말</hp:t>'))}</hp:subList></hp:header></hp:ctrl>`) + run(0, ''))}
 ${p(1, 2, run(3, '<hp:t>제목 Heading</hp:t>'))}
 ${p(0, 1, run(0, '<hp:t>보통 텍스트 plain, </hp:t>') + run(1, '<hp:t>굵게 bold</hp:t>') + run(0, '<hp:t>, </hp:t>') + run(2, '<hp:t>blue italic<hp:tab width="4000" leader="0" type="1"/>tabbed</hp:t>') + run(0, '<hp:t>.</hp:t><hp:ctrl><hp:footNote number="1" suffixChar="41" instId="1"><hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="TOP">' + p(0, 0, run(0, '<hp:t>각주 footnote text</hp:t>')) + '</hp:subList></hp:footNote></hp:ctrl>') + run(0, '<hp:ctrl><hp:fieldBegin id="1" type="HYPERLINK" name="" editable="0" dirty="0"><hp:parameters cnt="1" name=""><hp:stringParam name="Command">https\\://www.hancom.com;1;0;0;</hp:stringParam></hp:parameters></hp:fieldBegin></hp:ctrl><hp:t> 한컴</hp:t><hp:ctrl><hp:fieldEnd beginIDRef="1" fieldid="0"/></hp:ctrl>'))}
 ${p(2, 0, run(0, '<hp:t>Numbered one</hp:t>'))}
 ${p(2, 0, run(0, '<hp:t>Numbered two</hp:t>'))}
 ${p(3, 0, run(0, '<hp:t>Bulleted</hp:t>'))}
 ${p(0, 0, run(0, `<hp:tbl id="1" zOrder="0" numberingType="TABLE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" pageBreak="CELL" repeatHeader="1" rowCnt="2" colCnt="2" cellSpacing="0" borderFillIDRef="1" noAdjust="0"><hp:sz width="28000" widthRelTo="ABSOLUTE" height="2000" heightRelTo="ABSOLUTE" protect="0"/><hp:tr>${cell(0, 0, 2, 1, '병합 merged', 2)}</hp:tr><hp:tr>${cell(0, 1, 1, 1, 'A')}${cell(1, 1, 1, 1, 'B')}</hp:tr></hp:tbl>`) + run(0, '<hp:t/>'))}
 ${p(1, 0, run(0, '<hp:pic id="2" zOrder="1" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" lock="0" dropcapstyle="None" href="" groupLevel="0" instid="2" reverse="0"><hp:sz width="3600" widthRelTo="ABSOLUTE" height="2400" heightRelTo="ABSOLUTE" protect="0"/><hc:img binaryItemIDRef="image1" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/></hp:pic>'))}
 ${p(0, 0, run(0, '<hp:t>Second page</hp:t>'), '').replace('pageBreak="0"', 'pageBreak="1"')}
</hs:sec>`;
  const hpf = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<opf:package xmlns:opf="http://www.idpf.org/2007/opf/" version="" unique-identifier="" id=""><opf:metadata><opf:title>HWPX 문서</opf:title><opf:language>ko</opf:language><opf:meta name="creator" content="text">홍길동</opf:meta></opf:metadata>
<opf:manifest><opf:item id="header" href="Contents/header.xml" media-type="application/xml"/><opf:item id="image1" href="BinData/image1.png" media-type="image/png" isEmbeded="1"/><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/></opf:manifest>
<opf:spine><opf:itemref idref="header" linear="yes"/><opf:itemref idref="section0" linear="yes"/></opf:spine></opf:package>`;
  const zip = new JSZip();
  zip.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
  zip.file('version.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="0" buildNumber="1" os="1" xmlVersion="1.4" application="Hancom Office Hangul" appVersion="11, 0, 0, 0"/>');
  zip.file('META-INF/container.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf"><ocf:rootfiles><ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/></ocf:rootfiles></ocf:container>');
  zip.file('Contents/content.hpf', hpf);
  zip.file('Contents/header.xml', header);
  zip.file('Contents/section0.xml', section);
  zip.file('BinData/image1.png', pngBytes());
  return zip.generateAsync({ type: 'uint8array' });
}

// ---------------------------------------------------------------------------------------------
// Apple Pages

/** A Pages '09 package (index.xml in the SL vocabulary). */
export async function buildPages09(): Promise<Uint8Array> {
  const NS = 'xmlns:sl="http://developer.apple.com/namespaces/sl" xmlns:sf="http://developer.apple.com/namespaces/sf" xmlns:sfa="http://developer.apple.com/namespaces/sfa" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"';
  const pm = (inner: string) => `<sf:property-map>${inner}</sf:property-map>`;
  const num = (name: string, v: number) => `<sf:${name}><sf:number sfa:number="${v}" sfa:type="f"/></sf:${name}>`;
  const str = (name: string, v: string) => `<sf:${name}><sf:string sfa:string="${v}"/></sf:${name}>`;
  const xml = `<?xml version="1.0"?>
<sl:document ${NS} sl:version="92008102400">
<sl:metadata><sf:title><sf:string sfa:string="Pages Sample"/></sf:title><sf:authors><sf:array><sf:string sfa:string="Page Author"/></sf:array></sf:authors></sl:metadata>
<sl:slprint-info sl:page-width="612" sl:page-height="792"><sf:page-margins sf:top="54" sf:left="60" sf:bottom="54" sf:right="60" sf:header="36" sf:footer="36"/></sl:slprint-info>
<sf:stylesheet sfa:ID="SFSStylesheet-0"><sf:styles>
 <sf:paragraphstyle sf:name="Free Form" sf:ident="paragraph-style-default">${pm(num('fontSize', 12) + str('fontName', 'Helvetica') + '<sf:fontColor><sf:color xsi:type="sfa:calibrated-rgb-color-type" sfa:r="0" sfa:g="0" sfa:b="0" sfa:a="1"/></sf:fontColor>')}</sf:paragraphstyle>
 <sf:paragraphstyle sf:name="Body" sf:ident="paragraph-style-32" sf:parent-ident="paragraph-style-default">${pm(num('spaceAfter', 6))}</sf:paragraphstyle>
 <sf:paragraphstyle sf:name="Heading 1" sf:ident="paragraph-style-35" sf:parent-ident="paragraph-style-default">${pm(num('fontSize', 18) + num('bold', 1) + str('fontName', 'Helvetica-Bold') + num('keepWithNext', 1))}</sf:paragraphstyle>
 <sf:paragraphstyle sf:name="Bullet" sf:ident="paragraph-style-bullet" sf:parent-ident="paragraph-style-32">${pm('<sf:listStyle><sf:liststyle-ref sfa:IDREF="SFWPListStyle-1"/></sf:listStyle>')}</sf:paragraphstyle>
 <sf:characterstyle sf:name="Emphasis" sf:ident="character-style-0">${pm(num('italic', 1))}</sf:characterstyle>
 <sf:liststyle sf:name="Bullet" sf:ident="list-style-bullet" sfa:ID="SFWPListStyle-1">${pm('<sf:listLabelTypes><sf:array><sf:list-label-typeinfo sf:type="text"><sf:text-label sf:type="bullet" sf:format="&#x2022;" sf:first="0"/></sf:list-label-typeinfo></sf:array></sf:listLabelTypes>')}</sf:liststyle>
</sf:styles><sf:anon-styles>
 <sf:paragraphstyle sf:parent-ident="paragraph-style-32" sfa:ID="SFWPParagraphStyle-50">${pm(num('alignment', 2))}</sf:paragraphstyle>
 <sf:characterstyle sf:parent-ident="character-style-null" sfa:ID="SFWPCharacterStyle-5">${pm(num('bold', 1) + '<sf:fontColor><sf:color xsi:type="sfa:calibrated-rgb-color-type" sfa:r="1" sfa:g="0" sfa:b="0" sfa:a="1"/></sf:fontColor>')}</sf:characterstyle>
</sf:anon-styles></sf:stylesheet>
<sf:headers><sf:header sf:name="SFWPDefaultOddHeaderIdentifier"><sf:text-storage sf:kind="header"><sf:text-body><sf:p sf:style="paragraph-style-32">Pages header<sf:tab/><sf:page-number sf:format="decimal" sf:value="1"/></sf:p></sf:text-body></sf:text-storage></sf:header></sf:headers>
<sf:annotations><sf:annotation sf:target="SFWPAnnotatedField-0"><sf:text><sf:text-storage sf:kind="textbox"><sf:text-body><sf:p sf:style="paragraph-style-32">A Pages comment</sf:p></sf:text-body></sf:text-storage></sf:text></sf:annotation></sf:annotations>
<sf:text-storage sf:kind="body" sfa:ID="SFWPStorage-1">
 <sf:footnotes><sf:text-storage sf:kind="footnote"><sf:text-body><sf:p sf:style="paragraph-style-32"><sf:footnote-mark sf:mark="1"/> Pages footnote.<sf:footnotebr/></sf:p></sf:text-body></sf:text-storage></sf:footnotes>
 <sf:attachments>
  <sf:attachment sfa:ID="SFTTableAttachment-0" sf:kind="tabular-attachment"><sf:tabular-info><sf:tabular-model sf:num-header-rows="1"><sf:grid sf:numcols="2" sf:numrows="2"><sf:datasource><sf:t sf:ct="0"><sf:ct sfa:s="Key"/></sf:t><sf:t><sf:ct sfa:s="Value"/></sf:t><sf:t><sf:ct sfa:s="Pi"/></sf:t><sf:n sf:v="3.14"/></sf:datasource></sf:grid></sf:tabular-model></sf:tabular-info></sf:attachment>
  <sf:attachment sfa:ID="SFDImageAttachment-0" sf:kind="drawable-attachment"><sf:media><sf:geometry><sf:size sfa:w="36" sfa:h="24"/></sf:geometry><sf:content><sf:image-media><sf:filtered-image><sf:unfiltered><sf:data sf:path="swatch.png"/></sf:unfiltered></sf:filtered-image></sf:image-media></sf:content></sf:media></sf:attachment>
 </sf:attachments>
 <sf:text-body><sf:section sf:name="Text Page"><sf:layout>
  <sf:p sf:style="paragraph-style-35">Pages Heading<sf:br/></sf:p>
  <sf:p sf:style="SFWPParagraphStyle-50">Centered <sf:span sf:style="SFWPCharacterStyle-5">red bold</sf:span> and <sf:span sf:style="character-style-0">emphasis</sf:span>, a <sf:link href="https://www.apple.com/">link</sf:link>, <sf:annotation-field sfa:ID="SFWPAnnotatedField-0">annotated</sf:annotation-field> text<sf:footnote sf:index="0" sf:autonumber="1"/>.<sf:lnbr/>Second line<sf:br/></sf:p>
  <sf:p sf:style="paragraph-style-bullet">First bullet<sf:br/></sf:p>
  <sf:p sf:style="paragraph-style-bullet">Second bullet<sf:br/></sf:p>
  <sf:p sf:style="paragraph-style-32"><sf:attachment-ref sfa:IDREF="SFTTableAttachment-0" sf:kind="tabular-attachment"/><sf:br/></sf:p>
  <sf:p sf:style="paragraph-style-32">Picture <sf:attachment-ref sfa:IDREF="SFDImageAttachment-0" sf:kind="drawable-attachment"/><sf:pgbr/></sf:p>
  <sf:p sf:style="paragraph-style-32"><sf:ghost-text>Placeholder text</sf:ghost-text>Last page<sf:br/></sf:p>
 </sf:layout></sf:section></sf:text-body>
</sf:text-storage>
</sl:document>`;
  const zip = new JSZip();
  zip.file('index.xml', xml);
  zip.file('swatch.png', pngBytes());
  zip.file('QuickLook/Thumbnail.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
  return zip.generateAsync({ type: 'uint8array' });
}

// Minimal protobuf / Snappy / IWA writers (for building Pages 5+ test documents).
type PbVal = number | string | Uint8Array | PbVal[] | { f32: number } | { msg: [number, PbVal][] };
function varint(n: number): number[] { const out: number[] = []; let v = n; while (v > 127) { out.push((v & 127) | 128); v = Math.floor(v / 128); } out.push(v); return out; }
export function pb(fields: [number, PbVal][]): Uint8Array {
  const out: number[] = [];
  for (const [n, v] of fields) {
    if (Array.isArray(v)) { for (const x of v) out.push(...pb([[n, x]])); continue; }
    if (typeof v === 'number') { out.push(...varint(n * 8), ...varint(v)); continue; }
    if (typeof v === 'object' && 'f32' in v) { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, v.f32, true); out.push(...varint(n * 8 + 5), ...b); continue; }
    const bytes = typeof v === 'string' ? new TextEncoder().encode(v) : v instanceof Uint8Array ? v : pb((v as { msg: [number, PbVal][] }).msg);
    out.push(...varint(n * 8 + 2), ...varint(bytes.length), ...bytes);
  }
  return Uint8Array.from(out);
}
const msg = (f: [number, PbVal][]) => ({ msg: f });
const ref = (id: number) => msg([[1, id]]);
function snappyLiteral(data: Uint8Array): Uint8Array {
  const out: number[] = [...varint(data.length)];
  for (let i = 0; i < data.length; i += 256) {
    const chunk = data.subarray(i, i + 256);
    if (chunk.length <= 60) out.push((chunk.length - 1) << 2); else out.push(60 << 2, chunk.length - 1);
    out.push(...chunk);
  }
  return Uint8Array.from(out);
}
export function iwaFile(objects: { id: number; type: number; body: Uint8Array }[]): Uint8Array {
  const parts: number[] = [];
  for (const o of objects) {
    const info = pb([[1, o.id], [2, msg([[1, o.type], [3, o.body.length]])]]);
    parts.push(...varint(info.length), ...info, ...o.body);
  }
  const snappy = snappyLiteral(Uint8Array.from(parts));
  return Uint8Array.from([0, snappy.length & 255, (snappy.length >> 8) & 255, (snappy.length >> 16) & 255, ...snappy]);
}

/** A Pages 5+ (IWA) package with a body storage, paragraph/character styles and a table. */
export async function buildPagesIwa(): Promise<Uint8Array> {
  const text = 'Iwa Title\nBody with bold words.\nSecond paragraph\n\ufffc\n';
  const ATTACH_AT = text.indexOf(String.fromCharCode(0xfffc));
  const storage = pb([[1, 0], [3, text],
    [5, msg([[1, [msg([[1, 0], [2, ref(20)]]), msg([[1, 10], [2, ref(21)]])]]])],
    [8, msg([[1, [msg([[1, 20], [2, ref(22)]]), msg([[1, 25]])]]])],
    [9, msg([[1, [msg([[1, ATTACH_AT], [2, ref(30)]])]]])],
  ]);
  const title = pb([[1, msg([[1, 'Title'], [2, 'paragraph-style-38']])], [11, msg([[1, 1], [3, { f32: 24 }], [5, 'Helvetica-Bold']])], [12, msg([[1, 2]])]]);
  const body = pb([[1, msg([[1, 'Body'], [2, 'paragraph-style-32']])], [11, msg([[3, { f32: 12 }], [5, 'Helvetica']])], [12, msg([[20, { f32: 6 }]])]]);
  const bold = pb([[1, msg([[1, 'Strong']])], [11, msg([[1, 1], [7, msg([[1, 1], [3, { f32: 1 }], [4, { f32: 0 }], [5, { f32: 0 }], [6, { f32: 1 }]])]])]]);
  // Table: attachment → table info → model (2 rows × 2 columns, string table, one tile).
  const cell = (sid: number) => { const b = new Uint8Array(20); const dv = new DataView(b.buffer); b[0] = 4; b[1] = 3; dv.setUint32(4, 0x10, true); dv.setUint32(12, sid, true); return b.subarray(0, 16); };
  const row = (r: number, a: number, b: number) => { const c1 = cell(a), c2 = cell(b); const buf = new Uint8Array(c1.length + c2.length); buf.set(c1); buf.set(c2, c1.length); const offs = Uint8Array.from([0, 0, c1.length, 0]); return msg([[1, r], [2, 2], [3, buf], [4, offs], [5, 4]]); };
  const objs = [
    { id: 10, type: 2001, body: storage },
    { id: 30, type: 2003, body: pb([[1, ref(31)]]) },
    { id: 31, type: 6000, body: pb([[2, ref(32)]]) },
    { id: 32, type: 6001, body: pb([[4, msg([[3, msg([[1, msg([[1, 0], [2, ref(33)]])]])], [4, ref(34)]])], [6, 2], [7, 2], [8, 'Table 1'], [9, 1]]) },
    { id: 33, type: 6002, body: pb([[5, [row(0, 1, 2), row(1, 3, 4)]]]) },
    { id: 34, type: 6005, body: pb([[1, 1], [3, [msg([[1, 1], [2, 1], [3, 'Name']]), msg([[1, 2], [2, 1], [3, 'Size']]), msg([[1, 3], [2, 1], [3, 'Alpha']]), msg([[1, 4], [2, 1], [3, 'Ten']])]]]) },
  ];
  const zip = new JSZip();
  zip.file('Index/Document.iwa', iwaFile(objs));
  zip.file('Index/DocumentStylesheet.iwa', iwaFile([{ id: 20, type: 2022, body: title }, { id: 21, type: 2022, body: body }, { id: 22, type: 2021, body: bold }]));
  zip.file('Metadata/DocumentIdentifier', 'x');
  zip.file('preview.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
  return zip.generateAsync({ type: 'uint8array' });
}

/** A password-protected Pages package: encrypted IWA payloads plus a preview image. */
export async function buildPagesProtected(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('.iwph', 'hint');
  zip.file('Index/Document.iwa', Uint8Array.from({ length: 64 }, (_, i) => (i * 37 + 11) & 255));
  zip.file('preview.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
  return zip.generateAsync({ type: 'uint8array' });
}

// ---------------------------------------------------------------------------------------------
// MHTML and Word 2003 XML

export function buildMht(): Uint8Array {
  const html = '<html><head><meta charset="windows-1252"><style>p.MsoTitle{font-size:20pt;color:#1f3864}</style></head><body><p class=3DMsoTitle>Archived =\r\nPage</p><p>Caf=E9 caf=E9 <b>bold</b></p><p><img src=3D"page_files/image001.png" alt=3D"pic"></p></body></html>';
  const mime = [
    'From: <Saved by Windows Internet Explorer 8>',
    'Subject: Archived Page',
    'MIME-Version: 1.0',
    'Content-Type: multipart/related; type="text/html"; boundary="----=_NextPart_000_0000"',
    '',
    'This is a multi-part message in MIME format.',
    '',
    '------=_NextPart_000_0000',
    'Content-Type: text/html; charset="windows-1252"',
    'Content-Transfer-Encoding: quoted-printable',
    'Content-Location: file:///C:/page.htm',
    '',
    html,
    '',
    '------=_NextPart_000_0000',
    'Content-Type: image/png',
    'Content-Transfer-Encoding: base64',
    'Content-Location: file:///C:/page_files/image001.png',
    '',
    PNG_B64,
    '',
    '------=_NextPart_000_0000--',
    '',
  ].join('\r\n');
  return Uint8Array.from(mime, (c) => c.charCodeAt(0) & 255);
}

/** Word 2003 XML as Word itself writes it (styles, lists, sections with inline headers, notes, revisions). */
export function wordml2003Xml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<?mso-application progid="Word.Document"?>
<w:wordDocument xmlns:w="http://schemas.microsoft.com/office/word/2003/wordml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:sl="http://schemas.microsoft.com/schemaLibrary/2003/core" xmlns:aml="http://schemas.microsoft.com/aml/2001/core" xmlns:wx="http://schemas.microsoft.com/office/word/2003/auxHint" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:dt="uuid:C2F41010-65B3-11d1-A29F-00AA00C14882" w:macrosPresent="no" w:embeddedObjPresent="no" w:ocxPresent="no" xml:space="preserve">
 <o:DocumentProperties><o:Title>Word 2003 Sample</o:Title><o:Author>Office User</o:Author><o:Company>Contoso</o:Company></o:DocumentProperties>
 <w:fonts><w:defaultFonts w:ascii="Times New Roman" w:fareast="Times New Roman" w:h-ansi="Times New Roman" w:cs="Times New Roman"/></w:fonts>
 <w:lists>
  <w:listDef w:listDefId="0"><w:lsid w:val="1A2B3C4D"/><w:plt w:val="HybridMultilevel"/>
   <w:lvl w:ilvl="0"><w:start w:val="1"/><w:nfc w:val="23"/><w:lvlText w:val="·"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Symbol" w:h-ansi="Symbol" w:hint="default"/></w:rPr></w:lvl>
  </w:listDef>
  <w:listDef w:listDefId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:nfc w:val="2"/><w:lvlText w:val="%1."/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:listDef>
  <w:list w:ilfo="1"><w:ilst w:val="0"/></w:list>
  <w:list w:ilfo="2"><w:ilst w:val="1"/></w:list>
 </w:lists>
 <w:styles>
  <w:versionOfBuiltInStylenames w:val="4"/>
  <w:style w:type="paragraph" w:default="on" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><wx:font wx:val="Times New Roman"/><w:sz w:val="24"/><w:sz-cs w:val="24"/><w:lang w:val="EN-US"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><wx:uiName wx:val="Heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:pStyle w:val="Heading1"/><w:keepNext/><w:spacing w:before="240" w:after="60"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:h-ansi="Arial" w:cs="Arial"/><wx:font wx:val="Arial"/><w:b/><w:kern w:val="32"/><w:sz w:val="32"/></w:rPr></w:style>
  <w:style w:type="character" w:default="on" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:semiHidden/></w:style>
  <w:style w:type="paragraph" w:styleId="Callout"><w:name w:val="Callout Text"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="567"/><w:jc w:val="center"/></w:pPr><w:rPr><w:i/><w:color w:val="0000FF"/></w:rPr></w:style>
 </w:styles>
 <w:docPr><w:view w:val="print"/><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:footnotePr><w:footnote w:type="separator"><w:p><w:r><w:separator/></w:r></w:p></w:footnote></w:footnotePr></w:docPr>
 <w:body>
  <wx:sect>
   <wx:sub-section>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Word 2003 Heading</w:t></w:r></w:p>
    <w:p><w:r><w:t>Plain </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t></w:r><w:r><w:t> </w:t></w:r><w:r><w:rPr><w:i/><w:u w:val="double"/></w:rPr><w:t>italic double</w:t></w:r><w:r><w:t> </w:t></w:r><w:r><w:rPr><w:color w:val="FF0000"/><w:highlight w:val="yellow"/><w:sz w:val="32"/></w:rPr><w:t>big red</w:t></w:r><w:r><w:t> </w:t></w:r><w:hlink w:dest="http://www.example.com/"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>link</w:t></w:r></w:hlink><w:r><w:t> note</w:t></w:r><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnote><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t> Word 2003 footnote.</w:t></w:r></w:p></w:footnote></w:r><w:r><w:t>.</w:t></w:r></w:p>
    <w:p><aml:annotation aml:id="0" w:type="Word.Comment.Start"/><w:r><w:t>Commented</w:t></w:r><aml:annotation aml:id="0" w:type="Word.Comment.End"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><aml:annotation aml:id="0" aml:author="Reviewer" aml:createdate="2005-02-03T10:00:00Z" w:type="Word.Comment" w:initials="R"><aml:content><w:p><w:r><w:t>Check this</w:t></w:r></w:p></aml:content></aml:annotation></w:r><w:r><w:t> and </w:t></w:r><aml:annotation aml:id="1" aml:author="Editor" aml:createdate="2005-02-03T11:00:00Z" w:type="Word.Insertion"><aml:content><w:r><w:t>added</w:t></w:r></aml:content></aml:annotation><w:r><w:t> </w:t></w:r><aml:annotation aml:id="2" aml:author="Editor" aml:createdate="2005-02-03T11:05:00Z" w:type="Word.Deletion"><aml:content><w:r><w:delText>removed</w:delText></w:r></aml:content></aml:annotation></w:p>
    <w:p><w:pPr><w:pStyle w:val="Callout"/></w:pPr><w:r><w:t>Custom style paragraph</w:t></w:r></w:p>
    <w:p><w:pPr><w:listPr><w:ilvl w:val="0"/><w:ilfo w:val="1"/><wx:t wx:val="·"/><wx:font wx:val="Symbol"/></w:listPr></w:pPr><w:r><w:t>Bullet item</w:t></w:r></w:p>
    <w:p><w:pPr><w:listPr><w:ilvl w:val="0"/><w:ilfo w:val="2"/><wx:t wx:val="i."/></w:listPr></w:pPr><w:r><w:t>Roman item</w:t></w:r></w:p>
    <w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="single" w:sz="4" wx:bdrwidth="10" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="2000"/><w:gridCol w:w="2000"/></w:tblGrid>
     <w:tr><w:tc><w:tcPr><w:tcW w:w="4000" w:type="dxa"/><w:gridSpan w:val="2"/><w:shd w:val="clear" w:color="auto" w:fill="CCFFCC"/></w:tcPr><w:p><w:r><w:t>Merged</w:t></w:r></w:p></w:tc></w:tr>
     <w:tr><w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/><w:vmerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>Tall</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>b</w:t></w:r></w:p></w:tc></w:tr>
     <w:tr><w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/><w:vmerge/></w:tcPr><w:p/></w:tc><w:tc><w:tcPr><w:tcW w:w="2000" w:type="dxa"/></w:tcPr><w:p><w:r><w:t>c</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:p><w:r><w:pict><w:binData w:name="wordml://03000001.png">${PNG_B64}</w:binData><v:shape id="_x0000_i1025" type="#_x0000_t75" style="width:18pt;height:12pt"><v:imagedata src="wordml://03000001.png" o:title="swatch"/></v:shape></w:pict></w:r></w:p>
    <w:sectPr><w:hdr w:type="odd"><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:t>Word 2003 header</w:t></w:r></w:p></w:hdr><w:ftr w:type="odd"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1134" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/><w:cols w:space="708"/></w:sectPr>
   </wx:sub-section>
  </wx:sect>
 </w:body>
</w:wordDocument>`;
}

// ---------------------------------------------------------------------------------------------
// Small binary builders

/** Text samples in legacy encodings: [encoding, text, base64 of the encoded bytes]. */
export const ENCODING_SAMPLES: [string, string, string][] = [
  ["windows-1252", "Les élèves ont été très étonnés à la fête de Noël. Ça coûte 20 € — vraiment ?", "TGVzIOls6HZlcyBvbnQg6XTpIHRy6HMg6XRvbm7pcyDgIGxhIGbqdGUgZGUgTm/rbC4gx2EgY2/7dGUgMjAggCCXIHZyYWltZW50ID8="],
  ["macintosh", "Les élèves ont été très étonnés à la fête de Noël. Ça coûte cher, n'est-ce pas ?", "TGVzII5sj3ZlcyBvbnQgjnSOIHRyj3MgjnRvbm6OcyCIIGxhIGaQdGUgZGUgTm+RbC4ggmEgY2+edGUgY2hlciwgbidlc3QtY2UgcGFzID8="],
  ["cp437", "┌──────────┐\r\n│ Menü     │\r\n└──────────┘\r\nÜberschrift für die Größe und Straße", "2sTExMTExMTExMS/DQqzIE1lboEgICAgILMNCsDExMTExMTExMTE2Q0KmmJlcnNjaHJpZnQgZoFyIGRpZSBHcpThZSB1bmQgU3RyYeFl"],
  ["cp850", "Configuración del módem: señal débil. Año 1994, versión española. Él está aquí.", "Q29uZmlndXJhY2mibiBkZWwgbaJkZW06IHNlpGFsIGSCYmlsLiBBpG8gMTk5NCwgdmVyc2mibiBlc3BhpG9sYS4gkGwgZXN0oCBhcXWhLg=="],
  ["shift_jis", "日本語のテキストです。これはテストの文章で、ひらがなとカタカナを含みます。", "k/qWe4zqgsyDZYNMg1iDZ4LFgreBQoKxguqCzYNlg1iDZ4LMlbaPzYLFgUGC0ILngqqCyILGg0qDXoNKg2mC8Ircgt2C3IK3gUI="],
  ["euc-jp", "日本語のテキストです。これはテストの文章で、ひらがなとカタカナを含みます。", "xvzL3LjspM6lxqWtpbmlyKTHpLmho6SzpOykz6XGpbmlyKTOyri+z6THoaKk0qTppKykyqTIpaulv6Wrpcqk8rTepN+k3qS5oaM="],
  ["gbk", "这是一个中文测试文件，我们在这里写一些常用的汉字，看看能不能正确识别编码。", "1eLKx9K7uPbW0M7EsuLK1M7EvP6jrM7Sw8fU2tXiwO/QtNK70Kmzo9PDtcS6utfWo6y/tL+0xNyyu8Tc1f3It8q2sfCx4MLroaM="],
  ["big5", "這是一個中文測試文件，我們在這裡寫一些常用的漢字，看看能不能正確識別編碼。", "s2+sT6RArdOkpKTltPq41aTlpfOhQafarcymYrNvuMy8Z6RAqMexYKXOqrq6fqZyoUGs3azdr+Cko6/gpb+9VMPRp0+9c71YoUM="],
  ["euc-kr", "이것은 한국어 텍스트입니다. 인코딩을 올바르게 감지하는지 확인합니다.", "wMywzcC6IMfRsbm+7iDF2L26xq7A1LTPtNkuIMDOxNq1+cC7IL/Dudm4o7DUILCowfbHz7TCwfYgyK7AzsfVtM+02S4="],
  ["koi8-r", "Это проверочный текст на русском языке, чтобы определить кодировку файла.", "/NTPINDSz9fF0s/eztnKINTFy9PUIM7BINLV09PLz80g0drZy8UsIN7Uz8LZIM/Q0sXExczJ1Nggy8/EydLP18vVIMbByszBLg=="],
  ["windows-1251", "Это проверочный текст на русском языке, чтобы определить кодировку файла.", "3fLuIO/w7uLl8O737fvpIPLl6vHyIO3gIPDz8fHq7uwg/+f76uUsIPfy7uH7IO7v8OXk5evo8vwg6u7k6PDu4urzIPTg6evgLg=="],
  ["windows-1250", "Příliš žluťoučký kůň úpěl ďábelské ódy. Zażółć gęślą jaźń, łódź się śpieszy.", "UPjtbGmaIJ5sdZ1vdehr/SBr+fIg+nDsbCDv4WJlbHNr6SDzZHkuIFphv/Oz5iBn6pxsuSBqYZ/xLCCz82SfIHNp6iCccGllc3p5Lg=="],
  ["windows-1253", "Αυτό είναι ένα δοκιμαστικό κείμενο στα ελληνικά για την κωδικοποίηση.", "wfX0/CDl3+3h6SDd7eEg5O/q6ezh8/Tp6vwg6uXf7OXt7yDz9OEg5evr5+3p6twg4+nhIPTn7SDq+eTp6u/w79/n8+cu"],
  ["ibm866", "Это проверочный текст на русском языке, чтобы определить кодировку файла.", "neKuIK/grqKl4K7nreupIOKlquHiIK2gIODj4eGqrqwg76frqqUsIOfirqHrIK6v4KWkpauo4uwgqq6kqOCuoqrjIOSgqaugLg=="],
  ["utf-16le", "Plain ASCII text saved as UTF-16 without a byte order mark.", "UABsAGEAaQBuACAAQQBTAEMASQBJACAAdABlAHgAdAAgAHMAYQB2AGUAZAAgAGEAcwAgAFUAVABGAC0AMQA2ACAAdwBpAHQAaABvAHUAdAAgAGEAIABiAHkAdABlACAAbwByAGQAZQByACAAbQBhAHIAawAuAA=="],
];

/** gzip with stored (uncompressed) deflate blocks. */
export function gzipStored(data: Uint8Array): Uint8Array {
  const out: number[] = [0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3];
  for (let i = 0; i < data.length || i === 0; i += 65535) {
    const chunk = data.subarray(i, i + 65535);
    const last = i + 65535 >= data.length;
    out.push(last ? 1 : 0, chunk.length & 255, chunk.length >> 8, ~chunk.length & 255, (~chunk.length >> 8) & 255, ...chunk);
    if (last) break;
  }
  let crc = ~0;
  for (const b of data) { crc ^= b; for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1; }
  crc = ~crc >>> 0;
  out.push(crc & 255, (crc >>> 8) & 255, (crc >>> 16) & 255, crc >>> 24, data.length & 255, (data.length >>> 8) & 255, (data.length >>> 16) & 255, data.length >>> 24);
  return Uint8Array.from(out);
}

export async function zipOf(name: string, data: Uint8Array): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(name, data);
  return zip.generateAsync({ type: 'uint8array' });
}

/** An uncompressed RGB baseline TIFF (little-endian) with a colour gradient. */
export function tiffRgb(w: number, h: number): Uint8Array {
  const pixels = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) pixels.set([(i * 40) & 255, 120, 200], i * 3);
  const entries: [number, number, number, number][] = [[256, 3, 1, w], [257, 3, 1, h], [258, 3, 3, 0], [259, 3, 1, 1], [262, 3, 1, 2], [273, 4, 1, 0], [277, 3, 1, 3], [278, 3, 1, h], [279, 4, 1, pixels.length]];
  const ifdSize = 2 + entries.length * 12 + 4;
  const bpsAt = 8 + ifdSize, dataAt = bpsAt + 6;
  const out = new Uint8Array(dataAt + pixels.length);
  const dv = new DataView(out.buffer);
  out.set([0x49, 0x49, 42, 0]); dv.setUint32(4, 8, true);
  dv.setUint16(8, entries.length, true);
  entries.forEach(([tag, type, count, value], k) => {
    const e = 10 + k * 12;
    dv.setUint16(e, tag, true); dv.setUint16(e + 2, type, true); dv.setUint32(e + 4, count, true);
    const v = tag === 258 ? bpsAt : tag === 273 ? dataAt : value;
    if (type === 3 && count === 1) dv.setUint16(e + 8, v, true); else dv.setUint32(e + 8, v, true);
  });
  dv.setUint16(bpsAt, 8, true); dv.setUint16(bpsAt + 2, 8, true); dv.setUint16(bpsAt + 4, 8, true);
  out.set(pixels, dataAt);
  return out;
}
