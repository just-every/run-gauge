/** A one-page PDF of a past Harvest invoice, kept as a historical document the way
 * a Harvest move-in keeps one. Built here so the demo carries real, valid bytes. */
export function historicalInvoice(lines: string[]) {
 const text = lines.map((line, n) => `BT /F1 ${n ? 11 : 16} Tf 56 ${780 - n * 22} Td (${line.replace(/[()\\]/g, '\\$&')}) Tj ET`).join('\n')
 const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${text.length} >>\nstream\n${text}\nendstream`]
 let pdf = '%PDF-1.4\n'
 const offsets = objects.map((body, n) => { const at = pdf.length; pdf += `${n + 1} 0 obj\n${body}\nendobj\n`; return at })
 const xref = pdf.length
 pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
 return btoa(pdf)
}
