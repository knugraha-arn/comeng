import * as XLSX from 'xlsx'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TransactionRow {
  transaction_date: string       // ISO date 'YYYY-MM-DD' dari datetime_tran
  datetime_tran:    string       // ISO datetime
  refnum:           string       // unique transaction reference
  trntype:          string | null
  jenis_transaksi:  string | null
  tipe_penggunaan_kartu: string | null
  amount:           number
  sharing_fee:      number       // selalu baca dari data
  qris_amount:      number       // siap untuk future, default 0
  serial_number:    string       // unique identifier agen
  merchant_name:    string | null
  alamat_struk:     string | null
  brand:            string | null
  tipe_mesin:       string | null
  source_app:       string | null
  terminal_data_source: string | null
  mitra:            string | null
  pic:              string | null // di-uppercase
  from_account:     string | null
  to_account:       string | null
  private_data:     string | null
}

export interface ParseResult {
  rows:   TransactionRow[]
  dates:  string[]           // unique transaction dates found
  errors: string[]
}

// ─── Required columns validation ─────────────────────────────────────────────

const REQUIRED_COLUMNS = [
  'refnum',
  'datetime_tran',
  'serial_number',
  'trntype',
  'sharing_fee',
  'Mitra',
  'PIC',
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

  // Excel serial number
  if (typeof val === 'number' && val > 1000) {
    const ms = Date.UTC(1899, 11, 30) + val * 86400000
    return new Date(ms).toISOString()
  }

  // Duck typing untuk Date object
  if (typeof val === 'object' && val !== null &&
      typeof (val as {toISOString?: unknown}).toISOString === 'function') {
    try { return (val as {toISOString: () => string}).toISOString() } catch { return null }
  }

  // String
  if (typeof val === 'string') {
    const s = val.trim()
    if (!s) return null
    const d = new Date(s)
    if (!isNaN(d.getTime())) return d.toISOString()
  }

  return null
}

// ─── Main Parser ─────────────────────────────────────────────────────────────

export function parseTransactions(buffer: Buffer): ParseResult {
  const errors: string[] = []
  const rows: TransactionRow[] = []
  const dateSet = new Set<string>()

  // Read XLSX — cellDates: false untuk handle konversi manual
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null })

  if (raw.length === 0) {
    errors.push('File tidak mengandung data')
    return { rows, dates: [], errors }
  }

  // ── Validasi struktur kolom ───────────────────────────────────────────────
  const headers = Object.keys(raw[0])
  const missingCols = REQUIRED_COLUMNS.filter(col => !headers.includes(col))
  if (missingCols.length > 0) {
    errors.push(`Kolom wajib tidak ditemukan: ${missingCols.join(', ')}`)
    return { rows, dates: [], errors }
  }

  // ── Validasi minimal row count ────────────────────────────────────────────
  if (raw.length < 10) {
    errors.push(`File hanya berisi ${raw.length} baris — kemungkinan file salah`)
    return { rows, dates: [], errors }
  }

  // ── Parse rows ────────────────────────────────────────────────────────────
  for (const row of raw) {
    const refnum = str(row['refnum'])
    const serial_number = str(row['serial_number'])

    if (!refnum || !serial_number) continue

    // Parse datetime
    const datetime_tran = toISODatetime(row['datetime_tran'])
    if (!datetime_tran) {
      errors.push(`Baris refnum ${refnum}: datetime_tran tidak valid`)
      continue
    }

    const transaction_date = datetime_tran.split('T')[0]
    dateSet.add(transaction_date)

    rows.push({
      transaction_date,
      datetime_tran,
      refnum,
      trntype:               str(row['trntype']),
      jenis_transaksi:       str(row['JenisTransaksi']),
      tipe_penggunaan_kartu: str(row['tipe_penggunaan_kartu']),
      amount:                num(row['amount']),
      sharing_fee:           num(row['sharing_fee']),
      qris_amount:           0, // siap untuk future
      serial_number,
      merchant_name:         str(row['merchant_name']),
      alamat_struk:          str(row['alamat_struk']),
      brand:                 str(row['brand']),
      tipe_mesin:            str(row['tipe_mesin']),
      source_app:            str(row['source_app']),
      terminal_data_source:  str(row['terminal_data_source']),
      mitra:                 str(row['Mitra']),
      pic:                   str(row['PIC'])?.toUpperCase().trim() ?? null,
      from_account:          str(row['from_account']),
      to_account:            str(row['to_account']),
      private_data:          str(row['private_data']),
    })
  }

  if (rows.length === 0) {
    errors.push('Tidak ada baris valid ditemukan setelah parsing')
  }

  return { rows, dates: Array.from(dateSet).sort(), errors }
}
