#!/usr/bin/env python3
"""Word geometry for local synthetic PDF QA; stdout is consumed privately by the test runner."""
import json
from pathlib import Path
import sys
import pdfplumber

path = Path(sys.argv[1]).resolve()
if not path.is_relative_to((Path.cwd() / '.private/pdf').resolve()):
    raise SystemExit('Synthetic PDF QA directory required.')
with pdfplumber.open(path) as document:
    pages = [[{'x': word['x0'], 'y': word['top'], 'right': word['x1'],
               'bottom': word['bottom'], 'text': word['text']}
              for word in page.extract_words(x_tolerance=1, y_tolerance=2)]
             for page in document.pages]
print(json.dumps(pages, ensure_ascii=False))
