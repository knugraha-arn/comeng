import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Auth — sama pola dengan delete-session.ts. Endpoint ini pakai service role key
  // (bypass RLS), jadi wajib divalidasi token + role admin sebelum dieksekusi.
  const token = (req.headers.authorization ?? '').replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' })

  const { data: userData } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (!['admin', 'super_admin'].includes(userData?.role ?? '')) {
    return res.status(403).json({ error: 'Hanya admin yang dapat menjalankan compute metrics' })
  }

  try {
    // Dua mode:
    // - mode 'latest' (default, dipakai upload.tsx step 2): selalu hitung window 14 hari
    //   TERBARU via compute_agent_metrics() tanpa parameter — base population-nya lebih
    //   lengkap dan inilah yang dipakai konsisten oleh seluruh halaman analytics.
    // - mode 'specific' (dipakai trigger.tsx untuk isi gap tanggal lama): hitung window
    //   yang BERAKHIR di `date` yang diminta, via compute_agent_metrics(p_date).
    // `date` TIDAK otomatis mengubah window di mode 'latest' — sengaja dipisah eksplisit
    // lewat `mode` supaya tidak ada side-effect tak terduga kalau upload.tsx suatu saat
    // mengirim tanggal yang bukan tanggal terbaru (misal re-upload data lama).
    const { date, mode } = (req.body ?? {}) as { date?: string; mode?: 'latest' | 'specific' }
    const useSpecificDate = mode === 'specific' && !!date

    if (useSpecificDate && !/^\d{4}-\d{2}-\d{2}$/.test(date!)) {
      return res.status(400).json({ error: 'Format date tidak valid, harus YYYY-MM-DD' })
    }

    const { data: computeResult, error: computeError } = useSpecificDate
      ? await supabase.rpc('compute_agent_metrics', { p_date: date })
      : await supabase.rpc('compute_agent_metrics')
    if (computeError) throw new Error(computeError.message)

    // Window dari hasil compute itu sendiri — bukan query ulang ke am_transactions,
    // dan tidak pakai new Date(string) untuk menghindari shift timezone (semua field
    // tanggal dari RPC sudah berupa string YYYY-MM-DD).
    const windowTo = computeResult?.date ?? null
    const windowFrom = computeResult?.window_start
      ?? (windowTo ? `(${windowTo} - 13 hari)` : null) // mode specific tidak return window_start eksplisit

    return res.status(200).json({
      success: true,
      mode: useSpecificDate ? 'specific' : 'latest',
      requested_date: date ?? null,
      window: windowTo ? { from: windowFrom, to: windowTo } : null,
      summary: {
        agents_computed: computeResult?.agents ?? 0,
        mitra_computed: computeResult?.mitras ?? 0,
        pic_computed: computeResult?.pics ?? 0,
        buckets: computeResult?.buckets ?? null,
      },
    })
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Gagal menghitung metrics' })
  }
}
