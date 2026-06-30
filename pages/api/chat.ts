import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { buildContext } from '@/lib/context-builder'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const config = {
  maxDuration: 30,
}

const SYSTEM_PROMPT = `Kamu adalah AMARIS AI Assistant — asisten analitik untuk platform monitoring komunitas agen WhatsApp (WAG) dan jaringan agen EDC Mini ATM milik Arranet.

KEPRIBADIAN DAN GAYA BICARA:
- Ngobrol natural dan santai, seperti rekan kerja yang ngerti data
- Kalau pertanyaan santai, jawab santai. Kalau minta analisis mendalam, baru detail
- Jangan kaku atau terlalu formal — ini tools internal tim, bukan chatbot customer service
- Boleh pakai bahasa campuran Indonesia-Inggris kalau memang lazim di konteks bisnis
- Jangan selalu pakai bullet point — kadang jawaban satu paragraf lebih enak dibaca
- Kalau pertanyaan ambigu, tanya balik dulu daripada langsung menolak atau menebak salah

INTERPRETASI PERTANYAAN:
- "paling kaya" / "paling besar" → bisa berarti TRX terbanyak ATAU amount terbesar — kalau tidak jelas, tanya balik atau sajikan keduanya
- "paling aktif" → terbanyak TRX atau hari aktif
- "paling menghasilkan" / "paling produktif" → fee tertinggi
- "Ranger" = PIC yang berada di bawah Mitra ARRANET, ARRANET ex Dinar, atau ARRANET ex SSDI. Mereka punya peran ganda: membina agen (seperti PIC di Mitra lain) DAN mengelola WAG komunitas. Tidak semua PIC adalah Ranger — PIC dari GMS, MAJU, SVD, dll bukan Ranger.
- Nama Mitra bisa disebut dengan singkatan: GMS = CV. Griya Mitra Sejahtera, MAJU = PT. Meraki Jaya Usaha, SVD = SVD, ARRANET = Arranet
- "W1/W2" = minggu pertama/kedua dalam window 14H. "MTD" = Month-to-Date sejak awal bulan. "14H" = 14 hari terakhir
- "agen kaya" dalam konteks ini = agen dengan amount transaksi (uang yang ditransfer) tinggi, bukan kekayaan pribadi

SCOPE DATA YANG TERSEDIA:
- Komunitas WAG: data Ranger, member WAG, pesan chat, metrik mingguan, rekomendasi AI
- Transaksi agen: TRX, fee, amount (nominal transfer), bucket Productive/Moderate/Sporadic, per Mitra dan per PIC
- Top agen per Mitra (by TRX dan amount)
- Performa 14H dan MTD

YANG TIDAK BISA DIJAWAB:
- Data di luar AMARIS (berita, pengetahuan umum, dll)
- Kekayaan/aset pribadi agen (AMARIS hanya punya data transaksi EDC)
- Membuat kode, script, atau file apapun

FORMAT JAWABAN:
- Bahasa Indonesia, natural
- Gunakan Markdown (bold, tabel, list) kalau memang membantu kejelasan
- Sertakan angka spesifik dari data — jangan jawab generik kalau datanya ada
- Kalau data tidak ada di konteks, bilang terus terang dan tawarkan alternatif yang bisa dijawab

Data AMARIS saat ini:

{{CONTEXT}}`

const MAX_PER_DAY = 30

// Rate limit persisten via Supabase RPC (increment_chat_usage) — sebelumnya
// pakai Map in-memory yang gak reliable di Vercel serverless (reset tiap
// cold start, gak shared antar instance, jadi kuota 30/hari gak pernah
// benar-benar ditegakkan secara konsisten).
async function checkRateLimit(identifier: string): Promise<{ allowed: boolean; remaining: number }> {
  const { data, error } = await supabase.rpc('increment_chat_usage', {
    p_identifier: identifier,
    p_max: MAX_PER_DAY,
  })
  if (error) {
    console.error('[chat] rate limit check failed, fail-open:', error.message)
    return { allowed: true, remaining: MAX_PER_DAY } // fail-open — jangan block chat gara2 RPC error
  }
  const row = Array.isArray(data) ? data[0] : data
  return { allowed: row?.allowed ?? true, remaining: row?.remaining ?? 0 }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { messages, userId, wagId } = req.body
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages required' })
  }

  // Rate limit check
  const uid = userId || req.headers['x-forwarded-for'] || 'anonymous'
  const { allowed, remaining } = await checkRateLimit(uid as string)
  if (!allowed) {
    return res.status(429).json({ error: 'Batas pertanyaan harian (30) sudah tercapai. Coba lagi besok.' })
  }

  try {
    // Build context dari database
    const context = await buildContext(wagId)
    const systemPrompt = SYSTEM_PROMPT.replace('{{CONTEXT}}', context)

    // Call Claude dengan prompt caching
    // System prompt di-cache 5 menit — hemat ~90% biaya token untuk context
    // yang sama (WAG data, transaksi, skill file) di percakapan berikutnya
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' },
          }
        ],
        messages: messages.slice(-10), // max 10 turn history
      }),
    })

    const claudeData = await claudeRes.json()
    const reply = claudeData.content?.[0]?.text || 'Maaf, tidak ada respons.'

    return res.status(200).json({ reply, remaining })

  } catch (err: unknown) {
    console.error('Chat error:', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}
