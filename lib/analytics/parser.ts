import * as XLSX from 'xlsx'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MasterAgenRow {
  terminal_id: string
  serial_number: string
  snapshot_date: string
  cif_arranet: string | null
  kode_sub_ca: string | null
  nama_sub_ca: string | null
  merchant_id: string | null
  nama_merchant: string | null
  alamat: string | null
  provinsi: string | null
  kota: string | null
  kecamatan: string | null
  kelurahan: string | null
  kode_pos: string | null
  pic: string | null
  no_telp_pic: string | null
  no_telp_merchant: string | null
  koneksi_bank: string | null
  is_test_terminal: boolean
}

export interface NobuRow {
  transaction_date: string
  reference_number: string
  terminal_id: string
  type_transaksi: string
  amount: number
  sharing_fee: number
  mti: string | null
  pcode: string | null
  respon_code: string | null
  local_time: string | null
  acquirer: string | null
  issuer: string | null
  terminal_name: string | null
  terminal_location: string | null
}

export interface EsaRow {
  transaction_date: string
  refnum: string
  terminal_id: string
  serial_number: string | null
  merchant_id: string | null
  merchant_name: string | null
  mitra: string | null
  jenis_transaksi: string | null
  amount: number
  resp_code: string | null
  datetime_tran: string | null
  agent_id: string | null
  source_app: string | null
}

// ─── Date Converters ──────────────────────────────────────────────────────────

// Konversi Excel serial number ke ISO date string
// Works untuk date-only (integer) maupun datetime (float)
function excelSerialToISODate(serial: number): string {
  const date = new Date(Date.UTC(1899, 11, 30))
  date.setUTCDate(date.getUTCDate() + Math.floor(serial))
  return date.toISOString().split('T')[0]
}

// Konversi Excel serial number ke ISO datetime string (untuk datetime fields)
function excelSerialToISODatetime(serial: number): string {
  const MS_PER_DAY = 86400000
  const epoch = Date.UTC(1899, 11, 30)
  const ms = epoch + serial * MS_PER_DAY
  return new Date(ms).toISOString()
}

// Universal date converter — handle semua format yang mungkin muncul dari XLSX
// Mengembalikan ISO date string 'YYYY-MM-DD' atau null
function toISODate(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null

  // Excel serial number (number)
  if (typeof val === 'number') {
    if (val > 1000) return excelSerialToISODate(val)  // sanity check: serial > 1000
    return null
  }

  // Date object (dari cellDates:true atau XLSX internal)
  if (val instanceof Date) {
    if (!isNaN(val.getTime())) return val.toISOString().split('T')[0]
    return null
  }

  // String — coba parse
  if (typeof val === 'string') {
    const s = val.trim()
    if (!s) return null
    // Format DD/MM/YYYY
    const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`
    // Coba native Date parse
    const d = new Date(s)
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  }

  return null
}

// Universal datetime converter — mengembalikan ISO datetime string atau null
function toISODatetime(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null

  if (typeof val === 'number') {
    if (val > 1000) return excelSerialToISODatetime(val)
    return null
  }

  if (val instanceof Date) {
    if (!isNaN(val.getTime())) return val.toISOString()
    return null
  }

  if (typeof val === 'string') {
    const s = val.trim()
    if (!s) return null
    const d = new Date(s)
    if (!isNaN(d.getTime())) return d.toISOString()
  }

  return null
}

// ─── Safe value helpers ───────────────────────────────────────────────────────

function str(val: unknown): string | null {
  if (val === null || val === undefined || val === '') return null
  if (val instanceof Date) return val.toISOString()
  return String(val).trim() || null
}

function num(val: unknown): number {
  const n = Number(val)
  return isNaN(n) ? 0 : n
}

// ─── Master Agen Parser ───────────────────────────────────────────────────────
export function parseMasterAgen(buffer: Buffer): { rows: MasterAgenRow[], errors: string[] } {
  const errors: string[] = []
  const rows: MasterAgenRow[] = []

  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  const sheetName = wb.SheetNames.find(s => s === 'Query result') ?? wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null })

  for (const row of raw) {
    const terminal_id = str(row['terminal_id'])
    const serial_number = str(row['serial_number'])
    if (!terminal_id || !serial_number) continue

    const is_test_terminal = terminal_id.startsWith('9000000')

    rows.push({
      terminal_id,
      serial_number,
      snapshot_date:    toISODate(row['date_capture']) ?? new Date().toISOString().split('T')[0],
      cif_arranet:      str(row['cif_arranet']),
      kode_sub_ca:      str(row['kode_sub_ca']),
      nama_sub_ca:      str(row['nama_sub_ca']),
      merchant_id:      str(row['merchant_id']),
      nama_merchant:    str(row['nama_merchant']),
      alamat:           str(row['alamat']),
      provinsi:         str(row['provinsi']),
      kota:             str(row['kota']),
      kecamatan:        str(row['kecamatan']),
      kelurahan:        str(row['kelurahan']),
      kode_pos:         str(row['kode_pos']),
      pic:              str(row['PIC']),
      no_telp_pic:      str(row['no_telp_pic']),
      no_telp_merchant: str(row['no_telp_merchant']),
      koneksi_bank:     str(row['koneksi_bank']),
      is_test_terminal,
    })
  }

  if (rows.length === 0) errors.push('Master Agen: tidak ada baris valid ditemukan')
  return { rows, errors }
}

// ─── NOBU Parser ─────────────────────────────────────────────────────────────
export function parseNobu(buffer: Buffer): { rows: NobuRow[], dates: string[], errors: string[] } {
  const errors: string[] = []
  const rows: NobuRow[] = []
  const dateSet = new Set<string>()

  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null })

  for (const row of raw) {
    const reference_number = str(row['Reference Number'])
    const terminal_id = str(row['Terminal ID'])
    if (!reference_number || !terminal_id) continue

    const transaction_date = toISODate(row['Local Date'])
    if (!transaction_date) {
      errors.push(`NOBU: baris dengan refnum ${reference_number} tidak memiliki Local Date valid`)
      continue
    }

    dateSet.add(transaction_date)

    rows.push({
      transaction_date,
      reference_number,
      terminal_id,
      type_transaksi:    str(row['Type Transaksi']) ?? '',
      amount:            num(row['Amount']),
      sharing_fee:       num(row['Sharing Fee']),
      mti:               str(row['MTI']),
      pcode:             str(row['Pcode']),
      respon_code:       str(row['Respon Code']),
      local_time:        str(row['Local Time']),
      acquirer:          str(row['Acquirer']),
      issuer:            str(row['Issuer']),
      terminal_name:     str(row['Terminal Name']),
      terminal_location: str(row['Terminal Location']),
    })
  }

  if (rows.length === 0) errors.push('NOBU: tidak ada baris valid ditemukan')
  return { rows, dates: Array.from(dateSet).sort(), errors }
}

// ─── ESA Parser ──────────────────────────────────────────────────────────────
export function parseEsa(buffer: Buffer): { rows: EsaRow[], errors: string[] } {
  const errors: string[] = []
  const rows: EsaRow[] = []

  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  const sheetName = wb.SheetNames.find(s => s === 'Query result') ?? wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null })

  for (const row of raw) {
    const refnum = str(row['refnum'])
    const terminal_id = str(row['terminal_id'])
    if (!refnum || !terminal_id) continue

    const datetime_tran = toISODatetime(row['datetime_tran'])
    const transaction_date = datetime_tran ? datetime_tran.split('T')[0] : null

    if (!transaction_date) {
      errors.push(`ESA: baris dengan refnum ${refnum} tidak memiliki datetime_tran valid`)
      continue
    }

    rows.push({
      transaction_date,
      refnum,
      terminal_id,
      serial_number:   str(row['serial_number']),
      merchant_id:     str(row['merchant_id']),
      merchant_name:   str(row['merchant_name']),
      mitra:           str(row['Mitra']),
      jenis_transaksi: str(row['JenisTransaksi']),
      amount:          num(row['amount']),
      resp_code:       str(row['resp_code']),
      datetime_tran,
      agent_id:        str(row['agent_id']),
      source_app:      str(row['source_app']),
    })
  }

  if (rows.length === 0) errors.push('ESA: tidak ada baris valid ditemukan')
  return { rows, errors }
}

// ─── REFNUM Match Rate ────────────────────────────────────────────────────────
export function calcRefnumMatchRate(
  nobuRows: NobuRow[],
  esaRows: EsaRow[],
  forDate: string
): number {
  const nobuRefs = new Set(
    nobuRows.filter(r => r.transaction_date === forDate).map(r => r.reference_number)
  )
  const esaRefs = new Set(
    esaRows.filter(r => r.transaction_date === forDate).map(r => r.refnum)
  )
  if (nobuRefs.size === 0) return 0
  let matched = 0
  for (const ref of nobuRefs) if (esaRefs.has(ref)) matched++
  return Math.round((matched / nobuRefs.size) * 10000) / 100
}
