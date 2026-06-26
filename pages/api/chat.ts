import type { NextApiRequest, NextApiResponse } from 'next'
import { buildContext } from '@/lib/context-builder'

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

// Simple in-memory rate limiter per session
const rateLimiter = new Map<string, { count: number; resetAt: number }>()
const MAX_PER_DAY = 30

function checkRateLimit(userId: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const midnight = new Date()
  midnight.setHours(24, 0, 0, 0)
  const resetAt = midnight.getTime()

  const existing = rateLimiter.get(userId)
  if (!existing || existing.resetAt < now) {
    rateLimiter.set(userId, { count: 1, resetAt })
    return { allowed: true, remaining: MAX_PER_DAY - 1 }
  }

  if (existing.count >= MAX_PER_DAY) {
    return { allowed: false, remaining: 0 }
  }

  existing.count += 1
  return { allowed: true, remaining: MAX_PER_DAY - existing.count }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { messages, userId, wagId } = req.body
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages required' })
  }

  // Rate limit check
  const uid = userId || req.headers['x-forwarded-for'] || 'anonymous'
  const { allowed, remaining } = checkRateLimit(uid as string)
  if (!allowed) {
    return res.status(429).json({ error: 'Batas pertanyaan harian (30) sudah tercapai. Coba lagi besok.' })
  }

  try {
    // Build context dari database
    const context = await buildContext(wagId)
    const systemPrompt = SYSTEM_PROMPT.replace('{{CONTEXT}}', context)

    // Call Claude
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
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
