/**
 * Read a job description document in the browser. The limits match the backend document parser
 * (`backend/services/resume_parser.py`), so a document is accepted or rejected the same way on
 * both sides (OI-45).
 */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024
export const MAX_DOCUMENT_CHARS = 100_000
export const MAX_PDF_PAGES = 200
export const MAX_DOCX_EXPANDED_BYTES = 20 * 1024 * 1024

const TOO_LONG = `The extracted document is too long. Use at most ${MAX_DOCUMENT_CHARS.toLocaleString('en-US')} characters.`

/** Total uncompressed size of a ZIP archive (a DOCX), from its central directory. */
export function zipExpandedSize(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let end = bytes.length - 22; end >= Math.max(0, bytes.length - 65_557); end--) {
    if (view.getUint32(end, true) !== 0x06054b50) continue
    const entries = view.getUint16(end + 10, true)
    let offset = view.getUint32(end + 16, true)
    let total = 0
    for (let i = 0; i < entries; i++) {
      if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) throw new Error('This DOCX file is damaged.')
      total += view.getUint32(offset + 24, true)
      offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
    }
    return total
  }
  throw new Error('This DOCX file is damaged.')
}

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
      if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`PDFs can have at most ${MAX_PDF_PAGES} pages.`)
      const pages: string[] = []
      let length = 0
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        const pageText = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('')
        length += pageText.length
        if (length > MAX_DOCUMENT_CHARS) throw new Error(TOO_LONG) // stop early, like the backend
        pages.push(pageText)
      }
      text = pages.join('\n\n')
    } finally { await task.destroy() }
  } else if (extension === 'docx') {
    const buffer = await file.arrayBuffer()
    if (zipExpandedSize(new Uint8Array(buffer)) > MAX_DOCX_EXPANDED_BYTES) throw new Error('This DOCX expands to more than 20 MB. Paste the job description instead.')
    const mammoth = await import('mammoth/mammoth.browser')
    text = (await mammoth.extractRawText({ arrayBuffer: buffer })).value
  } else text = await file.text()
  text = text.replace(/\r\n?/g, '\n').split(String.fromCharCode(0)).join('').trim()
  if (!text) throw new Error('No readable text found. Scanned PDFs need OCR; paste the job description instead.')
  if (text.length > MAX_DOCUMENT_CHARS) throw new Error(TOO_LONG)
  return text
}
