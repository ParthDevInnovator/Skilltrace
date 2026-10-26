export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
export async function extractDocumentText(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (!['txt', 'md', 'pdf', 'docx'].includes(extension || '')) throw new Error('Use a TXT, MD, PDF or DOCX file.')
  if (!file.size) throw new Error('The selected file is empty.')
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error('Files must be 5 MB or smaller.')
  let text: string
  if (extension === 'pdf') {
    const pdfjs = await import('pdfjs-dist')
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
    const pdf = await task.promise
    try {
      const pages: string[] = []
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        pages.push(content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join(''))
      }
      text = pages.join('\n\n')
    } finally { await task.destroy() }
  } else if (extension === 'docx') {
    const mammoth = await import('mammoth/mammoth.browser')
    text = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value
  } else text = await file.text()
  text = text.replace(/\r\n?/g, '\n').split(String.fromCharCode(0)).join('').trim()
  if (!text) throw new Error('No readable text found. Scanned PDFs need OCR; paste the job description instead.')
  if (text.length > 100000) throw new Error('The extracted document is too long. Use at most 100,000 characters.')
  return text
}
