// Faster drop-in for csv-reader 1.0.0: run(input) returns exactly csv-reader's
// reading of {text, header} — {columns, rows, errors} — under its broken-row
// policy (BOM dropped; records end at LF or CRLF; blank lines are no record; a
// lone CR outside quotes is dropped as stray_cr; a quoted field runs to the
// next undoubled quote, "" is one quote, CRLF or a lone CR inside it is one LF;
// junk after a closing quote is appended as it stands, quote_junk; a quote that
// never closes is a literal character and the rest is re-read unquoted,
// unterminated_quote; rows are padded or cut to the first record's width with
// short_row / long_row errors).
//
// Where the reference walks a character at a time and builds every field by
// concatenation, this reader jumps between delimiters with indexOf and takes
// each clean field as one slice of the text; only the messy segments (stray
// CRs, doubled quotes, CRs inside quotes) are assembled from pieces.

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const len = text.length;
  let pos = 0;
  let line = 1;
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  let recordLine = 1;
  let recordRow = null;

  // How the last field read ended: 0 comma, 1 line break, 2 end of text.
  let fEnded = 2;
  // Whether the last field read opened with a quote (even if it never closed).
  let fQuoted = false;
  // Characters the last unquoted read appended past its initial value.
  let fAdded = 0;

  const hasCR = text.indexOf('\r') !== -1;

  // Reads unquoted characters onto `initial` up to the next comma or line
  // break; a CR not followed by LF is dropped (stray_cr). Sets fEnded/fAdded.
  function readUnquoted(initial) {
    fAdded = 0;
    if (!hasCR) {
      const ci = text.indexOf(',', pos);
      const ni = text.indexOf('\n', pos);
      if (ci !== -1 && (ni === -1 || ci < ni)) {
        const seg = text.slice(pos, ci);
        fAdded = seg.length;
        pos = ci + 1;
        fEnded = 0;
        return initial + seg;
      }
      if (ni !== -1) {
        const seg = text.slice(pos, ni);
        fAdded = seg.length;
        pos = ni + 1;
        line += 1;
        fEnded = 1;
        return initial + seg;
      }
      const seg = text.slice(pos);
      fAdded = seg.length;
      pos = len;
      fEnded = 2;
      return initial + seg;
    }
    let segStart = pos;
    let parts = null;
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 44) {
        const seg = text.slice(segStart, pos);
        fAdded += seg.length;
        pos += 1;
        fEnded = 0;
        return parts === null ? initial + seg : initial + parts.join('') + seg;
      }
      if (c === 10) {
        const seg = text.slice(segStart, pos);
        fAdded += seg.length;
        pos += 1;
        line += 1;
        fEnded = 1;
        return parts === null ? initial + seg : initial + parts.join('') + seg;
      }
      if (c === 13) {
        if (text.charCodeAt(pos + 1) === 10) {
          const seg = text.slice(segStart, pos);
          fAdded += seg.length;
          pos += 2;
          line += 1;
          fEnded = 1;
          return parts === null ? initial + seg : initial + parts.join('') + seg;
        }
        if (parts === null) parts = [];
        const seg = text.slice(segStart, pos);
        fAdded += seg.length;
        if (seg !== '') parts.push(seg);
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        pos += 1;
        segStart = pos;
        continue;
      }
      pos += 1;
    }
    const seg = text.slice(segStart, pos);
    fAdded += seg.length;
    fEnded = 2;
    return parts === null ? initial + seg : initial + parts.join('') + seg;
  }

  // Reads one field at pos. Sets fEnded/fQuoted.
  function readField() {
    fQuoted = false;
    if (text.charCodeAt(pos) !== 34) return readUnquoted('');
    fQuoted = true;
    const open = pos;
    const contentStart = open + 1;
    // Find the closing quote: the next quote that is not doubled.
    let close = -1;
    let doubled = false;
    let scan = contentStart;
    for (;;) {
      const q = text.indexOf('"', scan);
      if (q === -1) break;
      if (text.charCodeAt(q + 1) === 34) {
        doubled = true;
        scan = q + 2;
        continue;
      }
      close = q;
      break;
    }
    if (close === -1) {
      // The quote never closes: a literal character, the rest re-read unquoted.
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      pos = contentStart;
      return readUnquoted('"');
    }
    const raw = text.slice(contentStart, close);
    let value;
    if (!doubled && raw.indexOf('\r') === -1) {
      value = raw;
      let i = raw.indexOf('\n');
      while (i !== -1) {
        line += 1;
        i = raw.indexOf('\n', i + 1);
      }
    } else {
      // Assemble: "" is one quote; CRLF or a lone CR is one LF and one line.
      let out = '';
      let segStart = 0;
      let i = 0;
      while (i < raw.length) {
        const c = raw.charCodeAt(i);
        if (c === 34) {
          out += raw.slice(segStart, i) + '"';
          i += 2;
          segStart = i;
        } else if (c === 13) {
          out += raw.slice(segStart, i) + '\n';
          line += 1;
          i += raw.charCodeAt(i + 1) === 10 ? 2 : 1;
          segStart = i;
        } else {
          if (c === 10) line += 1;
          i += 1;
        }
      }
      value = out + raw.slice(segStart);
    }
    pos = close + 1;
    if (pos >= len) {
      fEnded = 2;
      return value;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fEnded = 0;
      return value;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fEnded = 1;
      return value;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fEnded = 1;
      return value;
    }
    // What follows the closing quote is appended as it stands.
    const joined = readUnquoted(value);
    if (fAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    return joined;
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let fv;
    do {
      fv = readField();
      fields.push(fv);
    } while (fEnded === 0);

    // A line that held only stray CRs is left with no characters: no record.
    if (fields.length === 1 && fields[0] === '' && !fQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
