function exportRowsToCSV(rows, filename = 'anomalies-planning.csv') {
  if (!rows.length) {
    alert('Aucune anomalie à exporter.');
    return;
  }

  const headers = [
    'Apprenant',
    'Email',
    'Formation',
    'Session',
    'Créneaux',
    'Statut',
    'Action recommandée'
  ];

  const csvRows = rows.map((row) => [
    row.fullName,
    row.email,
    row.formation,
    row.session,
    row.slotsCount,
    row.statusLabel,
    row.recommendedAction
  ]);

  const csvContent = [
    headers,
    ...csvRows
  ]
    .map((line) => line.map(escapeCSVValue).join(';'))
    .join('\n');

  const blob = new Blob([csvContent], {
    type: 'text/csv;charset=utf-8;'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

function escapeCSVValue(value) {
  const stringValue = String(value || '');

  if (
    stringValue.includes(';') ||
    stringValue.includes('"') ||
    stringValue.includes('\n')
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}