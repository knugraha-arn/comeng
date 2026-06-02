import type { NextApiRequest, NextApiResponse } from 'next'
import { buildContext } from '@/lib/context-builder'

export const config = {
  maxDuration: 30,
}

const SYSTEM_PROMPT = `Kamu adalah AI Assistant untuk platform AMARIS — sistem monitoring komunitas agen WhatsApp milik Arranet.

SCOPE yang boleh kamu jawab:
- Pertanyaan tentang data Ranger, WAG, agen, dan metrik yang ada di konteks
- Analisis performa, tren, dan pola perilaku berdasarkan data
- Brainstorming dan ideation seputar strategi pembinaan komunitas
- Perbandingan antar Ranger, WAG, atau periode waktu

YANG TIDAK BOLEH kamu lakukan:
- Menjawab pertanyaan di luar konteks data AMARIS
- Membuat kode, script, atau artefak apapun
- Memberikan informasi yang tidak ada di data yang diberikan
- Menjawab pertanyaan umum yang tidak berkaitan dengan komunitas agen

Jika ditanya sesuatu di luar scope, tolak dengan sopan dan arahkan kembali ke topik AMARIS.

Format jawaban:
- Gunakan Bahasa Indonesia
- Ringkas dan to the point
- Gunakan angka dan data spesifik dari konteks
- Tidak perlu markdown yang berlebihan

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
        model: 'claude-sonnet-4-5',
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
