'use strict';
/* global document */
(() => {
  const original = document.querySelector('.invoice-sheet');
  const sourceRows = [...original.querySelectorAll('.tabulka-polozky tbody tr')].map(
    (row, index) => {
      row.dataset.item = String(index);
      return row.cloneNode(true);
    },
  );
  const note = original.querySelector('.payment-note');
  const settlement = original.querySelector('.settlement');
  const skeleton = original.cloneNode(true);
  skeleton.querySelector('.tabulka-polozky tbody').replaceChildren();
  skeleton.querySelector('.payment-note').remove();
  skeleton.querySelector('.settlement').remove();
  document.body.replaceChildren();
  const pages = [];
  const mm = 96 / 25.4;
  const contentLimit = (sheet) =>
    sheet.querySelector('.footer-wrapper').getBoundingClientRect().top - 4 * mm;
  const fits = (sheet, element) =>
    element.getBoundingClientRect().bottom <= contentLimit(sheet) + 0.1;
  function newPage() {
    const sheet = skeleton.cloneNode(true);
    if (pages.length) {
      sheet.classList.add('continuation');
      sheet.querySelector('.invoice-party').remove();
      sheet.querySelector('.continuation-context').hidden = false;
    }
    sheet.querySelector('.page-number').textContent = 'Strana 1 z 1';
    document.body.append(sheet);
    pages.push(sheet);
    if (!fits(sheet, sheet.querySelector('.heading'))) throw new Error('PDF_HEADER_TOO_TALL');
    const parties = sheet.querySelector('.invoice-party');
    if (parties && !fits(sheet, parties)) throw new Error('PDF_PARTIES_TOO_TALL');
    return sheet;
  }
  let current = newPage();
  const tbody = (sheet) => sheet.querySelector('.tabulka-polozky tbody');
  let printedRows = 0;
  let splitItems = 0;
  for (const source of sourceRows) {
    const row = source.cloneNode(true);
    tbody(current).append(row);
    if (fits(current, row)) {
      printedRows++;
      continue;
    }
    row.remove();
    const previous = current;
    if (tbody(current).children.length || !current.classList.contains('continuation'))
      current = newPage();
    tbody(current).append(row);
    if (fits(current, row)) {
      printedRows++;
      continue;
    }
    row.remove();
    if (current !== previous) {
      current.remove();
      pages.pop();
      current = previous;
    }
    splitItems++;
    const graphemes = (value) =>
      [...new Intl.Segmenter('cs', { granularity: 'grapheme' }).segment(value)].map(
        (part) => part.segment,
      );
    const text = graphemes(source.querySelector('.description').textContent);
    let offset = 0;
    while (offset < text.length) {
      const fragment = source.cloneNode(true);
      if (offset) {
        fragment.classList.add('item-continuation');
        [...fragment.cells].slice(1).forEach((cell) => cell.replaceChildren());
      }
      const description = fragment.querySelector('.description');
      tbody(current).append(fragment);
      let lower = 0;
      let upper = text.length - offset;
      while (lower < upper) {
        const middle = Math.ceil((lower + upper) / 2);
        description.textContent = text.slice(offset, offset + middle).join('');
        if (fits(current, fragment)) lower = middle;
        else upper = middle - 1;
      }
      if (!lower) {
        fragment.remove();
        if (tbody(current).children.length || !current.classList.contains('continuation')) {
          current = newPage();
          continue;
        }
        throw new Error('PDF_ROW_CANNOT_FIT');
      }
      let length = lower;
      if (offset + length < text.length) {
        const candidate = text.slice(offset, offset + length).join('');
        const boundary = candidate.search(/\s+\S*$/u);
        if (boundary > candidate.length / 2)
          length = graphemes(candidate.slice(0, boundary + 1)).length;
      }
      description.textContent = text.slice(offset, offset + length).join('');
      if (!fits(current, fragment)) throw new Error('PDF_FRAGMENT_CANNOT_FIT');
      offset += length;
      printedRows++;
      if (offset < text.length) current = newPage();
    }
  }
  function appendSummary(sheet) {
    const main = sheet.querySelector('.main');
    main.append(note, settlement);
    return fits(sheet, settlement);
  }
  if (!appendSummary(current)) {
    note.remove();
    settlement.remove();
    current = newPage();
    current.querySelector('.polozky').hidden = true;
    if (!appendSummary(current)) throw new Error('PDF_SUMMARY_CANNOT_FIT');
  }
  // Empty first item tables are hidden if party/address information consumed a page.
  pages.forEach((sheet, i) => {
    if (!tbody(sheet).children.length) sheet.querySelector('.polozky').hidden = true;
    sheet.querySelector('.page-number').textContent =
      pages.length > 1 ? `Strana ${i + 1} z ${pages.length}` : '';
  });
  // Page numbers can increase footer height, so recheck every physical row and summary.
  for (const sheet of pages) {
    for (const element of sheet.querySelectorAll('tbody tr, .settlement, .invoice-party'))
      if (!fits(sheet, element)) throw new Error('PDF_CONTENT_OVERLAP');
    for (const cell of sheet.querySelectorAll('td, th, .footer, .invoice-id'))
      if (cell.scrollWidth > cell.clientWidth + 2) throw new Error('PDF_CONTENT_WIDTH');
  }
  // Every description must survive pagination exactly, including whitespace and long words.
  sourceRows.forEach((source, index) => {
    const printed = [...document.querySelectorAll(`[data-item="${index}"] .description`)]
      .map((element) => element.textContent)
      .join('');
    if (printed !== source.querySelector('.description').textContent)
      throw new Error('PDF_DESCRIPTION_LOSS');
  });
  const descriptions = pages.flatMap((sheet, page) =>
    [...sheet.querySelectorAll('.tabulka-polozky tbody tr')].map((row) => {
      const box = row.querySelector('.description').getBoundingClientRect(),
        sheetBox = sheet.getBoundingClientRect();
      return {
        item: Number(row.dataset.item),
        page,
        left: box.left,
        top: box.top - sheetBox.top,
        right: box.right,
        bottom: box.bottom - sheetBox.top,
        continuation: row.classList.contains('item-continuation'),
      };
    }),
  );
  return {
    pages: pages.length,
    sourceItems: sourceRows.length,
    printedRows,
    splitItems,
    descriptions,
  };
})();
