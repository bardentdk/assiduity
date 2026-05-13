function parseCSV(csvText) {
  const cleanText = csvText.trim();

  if (!cleanText) {
    return [];
  }

  const separator = detectSeparator(cleanText);
  const lines = cleanText.split(/\r?\n/).filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = splitCSVLine(lines[0], separator).map(normalizeHeader);

  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line, separator);

    return headers.reduce((row, header, index) => {
      row[header] = values[index] ? values[index].trim() : '';
      return row;
    }, {});
  });
}

function detectSeparator(text) {
  const firstLine = text.split(/\r?\n/)[0];

  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;

  return semicolonCount > commaCount ? ';' : ',';
}

function splitCSVLine(line, separator) {
  const result = [];
  let current = '';
  let insideQuotes = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && nextChar === '"') {
      current += '"';
      index++;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === separator && !insideQuotes) {
      result.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  result.push(current);

  return result;
}

function normalizeHeader(header) {
  return header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('Aucun fichier sélectionné.'));
      return;
    }

    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Impossible de lire le fichier.'));

    reader.readAsText(file, 'UTF-8');
  });
}