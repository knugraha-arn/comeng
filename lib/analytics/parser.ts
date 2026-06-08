import ExcelJS from 'exceljs'
import { Readable } from 'stream'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TransactionRow {
  transaction_date:      string
  datetime_tran:         string
  refnum:                string
  trntype:               string | null
  jenis_transaksi:       string | null
  tipe_penggunaan_kartu: string | null
  amount:                number
  sharing_fee:           number
  qris_amount:           number
  serial_number:         string
  merchant_name:         string | null
  alamat_struk:          string | null
  brand:                 string | null
  tipe_mesin:            string | null
  source_app:            string | null
  terminal_data_source:  string | null
  mitra:                 string | null
  pic:                   string | null
  from_account:          string | null
  to_account:            string | null
  private_data:          string | null
}

export interface ParseResult {
  rows:   TransactionRow[]
  dates:  string[]
  errors: string[]
}

// ─── Required columns ─────────────────────────────────────────────────────────

const REQUIRED_COLUMNS = [
  'refnum', 'datetime_tran', 'serial_number',
  'trntype', 'sharing_fee', 'Mitra', 'PIC',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function str(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null
  if (val instanceof Date) return val.toISOString()
  return String(val).trim() || null
}

function num(val: unknown): number {
  const n = Number(val)
  return isNaN(n) ? 0 : n
}

function toISODatetime(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null
  if (val instanceof Date && !isNaN(val.getTime())) return val.toISOString()
  if (typeof val === 'string') {
    const d = new Date(val.trim())
    if (!isNaN(d.getTime())) return d.toISOString()
  }
  return null
}

// ─── XLSX Parser (ExcelJS streaming) ─────────────────────────────────────────

export async function parseTransactions(buffer: Buffer, filename = 'data.xlsx'): Promise<ParseResult> {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'csv') {
    return parseCSV(buffer)
  }
  return parseXLSX(buffer)
}

async function parseXLSX(buffer: Buffer): Promise<ParseResult> {
  const errors: string[] = []
  const rows: TransactionRow[] = []
  const dateSet = new Set<string>()

  const workbook = new ExcelJS.Workbook()

  // Load via stream untuk support file besar
  const stream = Readable.from(buffer)
  await workbook.xlsx.read(stream)

  const ws = workbook.worksheets[0]
  if (!ws) {
    return { rows, dates: [], errors: ['File tidak memiliki worksheet'] }
  }

  // Ambil headers dari row pertama
  const headers: string[] = []
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, colNum) => {
    headers[colNum - 1] = str(cell.value) ?? ''
  })

  // Validasi kolom wajib
  const missingCols = REQUIRED_COLUMNS.filter(col => !headers.includes(col))
  if (missingCols.length > 0) {
    return {
      rows, dates: [],
      errors: [`Kolom wajib tidak ditemukan: ${missingCols.join(', ')}`]
    }
  }

  // Validasi minimal rows
  if (ws.rowCount < 11) {
    return {
      rows, dates: [],
      errors: [`File hanya berisi ${ws.rowCount - 1} baris data — kemungkinan file salah`]
    }
  }

  // Parse setiap baris
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return // skip header

    const get = (colName: string): unknown => {
      const idx = headers.indexOf(colName)
      if (idx === -1) return null
      return row.getCell(idx + 1).value
    }

    const refnum = str(get('refnum'))
    const serial_number = str(get('serial_number'))
    if (!refnum || !serial_number) return

    const datetime_tran = toISODatetime(get('datetime_tran'))
    if (!datetime_tran) {
      errors.push(`Row ${rowNumber}: datetime_tran tidak valid`)
      return
    }

    const transaction_date = datetime_tran.split('T')[0]
    dateSet.add(transaction_date)

    rows.push({
      transaction_date,
      datetime_tran,
      refnum,
      trntype:               str(get('trntype')),
      jenis_transaksi:       str(get('JenisTransaksi')),
      tipe_penggunaan_kartu: str(get('tipe_penggunaan_kartu')),
      amount:                num(get('amount')),
      sharing_fee:           num(get('sharing_fee')),
      qris_amount:           0,
      serial_number,
      merchant_name:         str(get('merchant_name')),
      alamat_struk:          str(get('alamat_struk')),
      brand:                 str(get('brand')),
      tipe_mesin:            str(get('tipe_mesin')),
      source_app:            str(get('source_app')),
      terminal_data_source:  str(get('terminal_data_source')),
      mitra:                 str(get('Mitra')),
      pic:                   str(get('PIC'))?.toUpperCase().trim() ?? null,
      from_account:          str(get('from_account')),
      to_account:            str(get('to_account')),
      private_data:          str(get('private_data')),
    })
  })

  if (rows.length === 0) {
    errors.push('Tidak ada baris valid ditemukan')
  }

  return { rows, dates: Array.from(dateSet).sort(), errors }
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

async function parseCSV(buffer: Buffer): Promise<ParseResult> {
  const errors: string[] = []
  const rows: TransactionRow[] = []
  const dateSet = new Set<string>()

  const content = buffer.toString('utf-8')
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean)

  if (lines.length < 2) {
    return { rows, dates: [], errors: ['File CSV kosong atau tidak valid'] }
  }

  // Parse header — handle quoted CSV
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        inQuotes = !inQuotes
      } else if (line[i] === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += line[i]
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = parseCSVLine(lines[0])

  // Validasi kolom wajib
  const missingCols = REQUIRED_COLUMNS.filter(col => !headers.includes(col))
  if (missingCols.length > 0) {
    return {
      rows, dates: [],
      errors: [`Kolom wajib tidak ditemukan: ${missingCols.join(', ')}`]
    }
  }

  if (lines.length < 11) {
    return {
      rows, dates: [],
      errors: [`File hanya berisi ${lines.length - 1} baris data`]
    }
  }

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    const get = (colName: string): string | null => {
      const idx = headers.indexOf(colName)
      if (idx === -1) return null
      return values[idx]?.trim() || null
    }

    const refnum = get('refnum')
    const serial_number = get('serial_number')
    if (!refnum || !serial_number) continue

    const datetime_tran = toISODatetime(get('datetime_tran'))
    if (!datetime_tran) {
      errors.push(`Row ${i + 1}: datetime_tran tidak valid`)
      continue
    }

    const transaction_date = datetime_tran.split('T')[0]
    dateSet.add(transaction_date)

    rows.push({
      transaction_date,
      datetime_tran,
      refnum,
      trntype:               get('trntype'),
      jenis_transaksi:       get('JenisTransaksi'),
      tipe_penggunaan_kartu: get('tipe_penggunaan_kartu'),
      amount:                num(get('amount')),
      sharing_fee:           num(get('sharing_fee')),
      qris_amount:           0,
      serial_number,
      merchant_name:         get('merchant_name'),
      alamat_struk:          get('alamat_struk'),
      brand:                 get('brand'),
      tipe_mesin:            get('tipe_mesin'),
      source_app:            get('source_app'),
      terminal_data_source:  get('terminal_data_source'),
      mitra:                 get('Mitra'),
      pic:                   get('PIC')?.toUpperCase().trim() ?? null,
      from_account:          get('from_account'),
      to_account:            get('to_account'),
      private_data:          get('private_data'),
    })
  }

  if (rows.length === 0) errors.push('Tidak ada baris valid ditemukan')
  return { rows, dates: Array.from(dateSet).sort(), errors }
}
