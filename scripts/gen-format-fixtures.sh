#!/bin/sh
# Regenerates the import fixtures in tests/fixtures/formats from their sources:
#   rich.fodt  (hand-written OpenDocument) → LibreOffice exports
#   source.md  (hand-written Markdown)     → pandoc exports
# Requires LibreOffice (soffice) 24.x and pandoc 3.x on PATH. Output is deterministic enough for
# the tests, which check structure rather than bytes.
set -eu
cd "$(dirname "$0")/../tests/fixtures/formats"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cp rich.fodt source.md swatch.png "$work/"
(
  cd "$work"
  profile="-env:UserInstallation=file://$work/profile"
  soffice "$profile" --headless --convert-to 'docx:MS Word 2007 XML' rich.fodt >/dev/null
  soffice "$profile" --headless --convert-to 'rtf:Rich Text Format' rich.fodt >/dev/null
  soffice "$profile" --headless --convert-to 'xml:MS Word 2003 XML' rich.fodt >/dev/null
  soffice "$profile" --headless --convert-to 'html:HTML (StarWriter)' rich.fodt >/dev/null
  pandoc -s source.md -t fb2 -o sample.fb2
  pandoc -s source.md -t docbook4 -o sample.dbk
  pandoc -s source.md -t docbook5 -o sample-docbook5.xml
  pandoc -s source.md -t latex -o sample.tex
  pandoc -s source.md -t rst -o sample.rst
  pandoc -s source.md -t textile -o sample.textile
  pandoc -s source.md -t asciidoc -o sample.adoc
  pandoc -s source.md -t org -o sample.org
  pandoc -s source.md -t man -o sample.man
  pandoc -s source.md -t gfm -o sample.gfm.md
  pandoc -s source.md -t epub2 -o sample-epub2.epub
)
cp "$work/rich.docx" "$work/rich.rtf" "$work/rich.html" .
cp "$work/rich.xml" rich-word2003.xml
for f in sample.fb2 sample.dbk sample-docbook5.xml sample.tex sample.rst sample.textile sample.adoc sample.org sample.man sample.gfm.md sample-epub2.epub; do cp "$work/$f" .; done
echo "Fixtures regenerated in $(pwd)"
