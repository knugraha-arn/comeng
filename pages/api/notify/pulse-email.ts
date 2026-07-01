import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const resend = new Resend(process.env.RESEND_API_KEY!)

// Alamat pengirim — dikonfirmasi terverifikasi di domain arranetwork.com pada Resend
const FROM_EMAIL = process.env.PULSE_NOTIFY_FROM_EMAIL ?? 'arnes-noreply@arranetwork.com'

// Daftar penerima — bisa juga dipindah ke tabel Supabase nanti kalau perlu dikelola dari UI Konfigurasi
const RECIPIENTS = (process.env.PULSE_NOTIFY_RECIPIENTS ?? '').split(',').map(s => s.trim()).filter(Boolean)

const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

function formatFee(val: number): string {
  if (val >= 1000000) return `Rp ${(val / 1000000).toFixed(1)}jt`
  if (val >= 1000) return `Rp ${(val / 1000).toFixed(0)}rb`
  return `Rp ${val}`
}

function formatNum(val: number): string {
  return Math.round(val).toLocaleString('id-ID')
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00') // timezone-safe parsing, hindari new Date(dateStr) langsung
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`
}

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`
}

interface PulseSummary {
  end_date: string
  month_start: string
  fee_mtd: number
  fee_target: number
  fee_projected: number
  fee_projected_conservative: number
  fee_projected_optimistic: number
  trx_mtd: number
  trx_avg_daily_mtd: number
  trx_avg_daily_14d: number
  dekade_number: number
}

interface HourlySlot {
  slot_name: string
  slot_emoji: string
  total_trx: number
  pct: number
}

interface CardType {
  card_type: string
  total_trx: number
  pct: number
}

interface AppDistribution {
  app_name: string
  total_trx: number
  total_fee: number
  pct_trx: number
}

interface FeeBreakdown {
  category: string
  total_trx: number
  total_fee: number
  pct: number
}

function buildEmailHtml(
  s: PulseSummary,
  hourlySlots: HourlySlot[],
  cardTypes: CardType[],
  appDistribution: AppDistribution[],
  feeBreakdown: FeeBreakdown[]
): string {
  const conservative = s.fee_projected_conservative ?? s.fee_projected
  const optimistic   = s.fee_projected_optimistic   ?? s.fee_projected
  const feeGap       = s.fee_target - conservative
  const feePct       = Math.round((s.fee_mtd / s.fee_target) * 100)
  const gapColor     = feeGap > 0 ? '#dc2626' : '#16a34a'
  const gapLabel     = feeGap > 0 ? `Gap ${formatFee(feeGap)}` : `Surplus ${formatFee(Math.abs(feeGap))}`
  const bothOnTrack  = conservative >= s.fee_target
  const onlyOptOnTrack = !bothOnTrack && optimistic >= s.fee_target

  // Baris persentase sederhana — dipakai untuk 4 section breakdown tambahan.
  // Tanpa bar/chart visual karena tidak konsisten render-nya lintas email client (Gmail/Outlook).
  function pctRow(label: string, pct: number, detail: string): string {
    return `
                <tr>
                  <td style="padding:6px 0;border-bottom:1px solid #f3f4f6;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="font-size:12px;color:#374151;">${label}</td>
                        <td align="right" style="font-size:12px;font-weight:700;color:#111827;white-space:nowrap;">${pct}%</td>
                      </tr>
                      <tr>
                        <td colspan="2" style="font-size:10px;color:#9ca3af;">${detail}</td>
                      </tr>
                    </table>
                  </td>
                </tr>`
  }

  function sectionBlock(title: string, rowsHtml: string): string {
    return `
          <tr>
            <td style="padding:6px 28px;">
              <div style="font-size:10px;font-weight:700;color:#9ca3af;letter-spacing:0.05em;margin-bottom:6px;">${title}</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:8px;padding:4px 12px;">
                ${rowsHtml}
              </table>
            </td>
          </tr>`
  }

  const hourlyRows = hourlySlots
    .map(h => pctRow(`${h.slot_emoji} ${h.slot_name}`, h.pct, `${formatNum(h.total_trx)} trx`))
    .join('')

  const cardTypeRows = cardTypes
    .map(c => pctRow(c.card_type === 'SWIPE' ? 'SWIPE (Bansos)' : c.card_type, c.pct, `${formatNum(c.total_trx)} trx`))
    .join('')

  const appRows = appDistribution
    .map(a => pctRow(a.app_name, a.pct_trx, `${formatNum(a.total_trx)} trx · ${formatFee(a.total_fee)}`))
    .join('')

  const feeRows = feeBreakdown
    .map(f => pctRow(f.category, f.pct, formatFee(f.total_fee)))
    .join('')

  // Catatan: HTML email harus pakai table-based layout + inline style untuk
  // konsistensi lintas email client (Gmail/Outlook tidak render flexbox/grid dengan baik)
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">

          <tr>
            <td style="background-color:#0f172a;padding:20px 28px;">
              <span style="font-size:18px;font-weight:700;color:#ffffff;">📊 Pulse MTD — AMARIS</span><br/>
              <span style="font-size:12px;color:#94a3b8;">Data transaksi MTD dari tanggal ${formatDateShort(s.month_start)} sampai ${formatDateFull(s.end_date)}</span>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 28px 8px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${bothOnTrack ? '#f0fdf4' : onlyOptOnTrack ? '#fefce8' : '#fef2f2'};border:1px solid ${bothOnTrack ? '#bbf7d0' : onlyOptOnTrack ? '#fde68a' : '#fecaca'};border-radius:8px;">
                <tr>
                  <td style="padding:12px 16px;font-size:13px;color:${bothOnTrack ? '#166534' : onlyOptOnTrack ? '#92400e' : '#dc2626'};font-weight:600;">
                    ${bothOnTrack ? '✓ Keduanya on track' : onlyOptOnTrack ? '⚠️ Hanya skenario optimistis on track' : '↓ Keduanya di bawah target'}
                    — Proyeksi: ${formatFee(conservative)} – ${formatFee(optimistic)} (Dekade ${s.dekade_number}-based)
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:8px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="33%" style="padding:8px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:8px;">
                      <tr><td style="padding:14px 16px;">
                        <span style="font-size:10px;color:#9ca3af;font-weight:700;letter-spacing:0.05em;">FEE MTD</span><br/>
                        <span style="font-size:18px;font-weight:800;color:#111827;">${formatFee(s.fee_mtd)}</span><br/>
                        <span style="font-size:11px;color:#6b7280;">${feePct}% dari target ${formatFee(s.fee_target)}</span>
                      </td></tr>
                    </table>
                  </td>
                  <td width="33%" style="padding:8px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:8px;">
                      <tr><td style="padding:14px 16px;">
                        <span style="font-size:10px;color:#9ca3af;font-weight:700;letter-spacing:0.05em;">PROYEKSI KONSERVATIF</span><br/>
                        <span style="font-size:16px;font-weight:800;color:${conservative >= s.fee_target ? '#166534' : '#dc2626'};">${formatFee(conservative)}</span><br/>
                        <span style="font-size:11px;color:${conservative >= s.fee_target ? '#166534' : '#dc2626'};">${conservative >= s.fee_target ? '✓ On track' : `Gap ${formatFee(s.fee_target - conservative)}`}</span>
                      </td></tr>
                    </table>
                  </td>
                  <td width="33%" style="padding:8px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:8px;">
                      <tr><td style="padding:14px 16px;">
                        <span style="font-size:10px;color:#9ca3af;font-weight:700;letter-spacing:0.05em;">PROYEKSI OPTIMISTIS</span><br/>
                        <span style="font-size:16px;font-weight:800;color:${optimistic >= s.fee_target ? '#166534' : '#92400e'};">${formatFee(optimistic)}</span><br/>
                        <span style="font-size:11px;color:${optimistic >= s.fee_target ? '#166534' : '#92400e'};">${optimistic >= s.fee_target ? '✓ On track' : `Gap ${formatFee(s.fee_target - optimistic)}`}</span>
                      </td></tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:8px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:8px;">
                <tr><td style="padding:14px 16px;">
                  <span style="font-size:10px;color:#9ca3af;font-weight:700;letter-spacing:0.05em;">TRX/HARI (MTD)</span><br/>
                  <span style="font-size:18px;font-weight:800;color:#111827;">${formatNum(s.trx_avg_daily_mtd)}</span>
                  <span style="font-size:12px;color:#6b7280;"> vs ${formatNum(s.trx_avg_daily_14d)} avg 14H</span>
                </td></tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 28px 4px 28px;">
              <span style="font-size:12px;color:#6b7280;">Total ${formatNum(s.trx_mtd)} TRX bulan ini (MTD)</span>
            </td>
          </tr>

          <tr>
            <td style="padding:12px 28px 4px 28px;">
              <hr style="border:none;border-top:1px solid #f3f4f6;margin:0;" />
            </td>
          </tr>

          ${sectionBlock('🕐 POLA WAKTU TRANSAKSI (MTD)', hourlyRows)}
          ${sectionBlock('💳 METODE KARTU: DIP vs SWIPE', cardTypeRows)}
          ${sectionBlock('📱 DISTRIBUSI APLIKASI', appRows)}
          ${sectionBlock('💰 FEE RP 3.500 vs LAINNYA', feeRows)}

          <tr><td style="padding:10px;"></td></tr>

          <tr>
            <td style="padding:14px 28px;background-color:#f9fafb;border-top:1px solid #f3f4f6;">
              <span style="font-size:11px;color:#9ca3af;">Email otomatis dari AMARIS setelah data transaksi hari ini selesai diproses. Buka dashboard untuk detail lengkap di amaris.arranetwork.com</span>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Dipanggil manual oleh admin dari halaman trigger — auth pakai token user Supabase, sama pola dengan delete-session.ts
  const token = (req.headers.authorization ?? '').replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' })

  const { data: userData } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (!['admin', 'ceo'].includes(userData?.role ?? '')) {
    return res.status(403).json({ error: 'Hanya admin yang dapat mengirim notifikasi' })
  }

  if (RECIPIENTS.length === 0) {
    return res.status(500).json({ error: 'PULSE_NOTIFY_RECIPIENTS belum dikonfigurasi' })
  }

  try {
    const [summaryRes, hourlyRes, cardTypeRes, appDistRes, feeBreakdownRes] = await Promise.all([
      supabase.rpc('get_pulse_summary'),
      supabase.rpc('get_pulse_hourly_slots'),
      supabase.rpc('get_pulse_card_types'),
      supabase.rpc('get_pulse_app_distribution'),
      supabase.rpc('get_pulse_fee_breakdown'),
    ])
    if (summaryRes.error) throw summaryRes.error
    const summary: PulseSummary = Array.isArray(summaryRes.data) ? summaryRes.data[0] : summaryRes.data
    if (!summary) return res.status(404).json({ error: 'Data Pulse MTD tidak tersedia' })

    const hourlySlots: HourlySlot[] = hourlyRes.data ?? []
    const cardTypes: CardType[] = cardTypeRes.data ?? []
    const appDistribution: AppDistribution[] = appDistRes.data ?? []
    const feeBreakdown: FeeBreakdown[] = feeBreakdownRes.data ?? []

    const html = buildEmailHtml(summary, hourlySlots, cardTypes, appDistribution, feeBreakdown)

    const { data: sendResult, error: sendError } = await resend.emails.send({
      from: `ARNES - Arranet Notification Services <${FROM_EMAIL}>`,
      to: RECIPIENTS,
      subject: `AMARIS PULSE - ${formatDateFull(summary.end_date)}`,
      html,
    })

    if (sendError) {
      console.error('[notify/pulse-email] Resend error:', sendError)
      return res.status(502).json({ error: 'Gagal kirim email', details: sendError })
    }

    return res.status(200).json({ success: true, email_id: sendResult?.id, recipients: RECIPIENTS.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[notify/pulse-email]', message)
    return res.status(500).json({ error: 'Gagal mengirim notifikasi Pulse', details: message })
  }
}
