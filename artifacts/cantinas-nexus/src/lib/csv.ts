/** Exportação de relatórios para CSV (compatível com Excel), sem dependências externas. */

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csvContent = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? '');
          if (value.includes(';') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        })
        .join(';'),
    )
    .join('\r\n');

  // BOM para o Excel reconhecer acentuação em UTF-8 corretamente
  const blob = new Blob(['\uFEFF' + csvContent], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
