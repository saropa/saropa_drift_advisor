# One-time script: rebuild html_content.dart HTML shell from a monolithic source.
#
# Intended for when the Dart file is restored to a full inline HTML/CSS/JS blob
# (e.g. from git history). Line ranges (head 4-10, body 143-348) must match the
# monolithic file structure; update them if the source layout changes.
import os
base = os.path.join(os.path.dirname(__file__), '..', '..')
p = os.path.join(base, 'lib', 'src', 'server', 'html_content.dart')
with open(p, encoding='utf-8') as f:
    lines = f.readlines()
head = ''.join(lines[3:10])
body = ''.join(lines[142:348])
link = '  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/saropa/saropa_drift_advisor@v${ServerConstants.packageVersion}/assets/web/style.css">'
script = '  <script src="https://cdn.jsdelivr.net/gh/saropa/saropa_drift_advisor@v${ServerConstants.packageVersion}/assets/web/app.js"></script>'
html_inner = head + link + '\n</head>\n' + body + '\n' + script + '\n</body></html>'
out_txt = os.path.join(os.path.dirname(__file__), 'html_shell.txt')
with open(out_txt, 'w', encoding='utf-8') as f:
    f.write(html_inner)
# Write new html_content.dart
dart_header_lines = [
    "/// Inline HTML shell for the single-page viewer UI.",
    "/// CSS and JS are loaded from jsDelivr CDN (assets/web/style.css and app.js).",
    "import 'server_constants.dart';",
    "",
    "abstract final class HtmlContent {",
    "  static String get indexHtml => '''",
]
dart_header = chr(10).join(dart_header_lines) + chr(10)
# Closing triple-quote and semicolon on same line so Dart parses correctly
triple = "'" * 3
dart_footer = chr(10) + triple + ";" + chr(10) + "}"
dart_path = os.path.join(base, 'lib', 'src', 'server', 'html_content.dart')
with open(dart_path, 'w', encoding='utf-8', newline='') as f:
    f.write(dart_header)
    f.write(html_inner)
    f.write(dart_footer)
print('Wrote', out_txt, 'and', dart_path)
