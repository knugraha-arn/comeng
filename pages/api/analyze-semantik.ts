import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

export const config = {
  maxDuration: 60,
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type MessageAnalysis = {
  message_id: string
  wag_id: string
  week_key: string
  sender_type: string
  sentiment: 'positif' | 'negatif' | 'netral'
  topic: 'keluhan_teknis' | 'pertanyaan' | 'apresiasi' | 'info_promo' | 'motivasi' | 'onboarding' | 'lainnya'
  response_quality: 'substantif' | 'generik' | 'tidak_relevan' | null
}

const BATCH_SIZE = 50

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { wag_id, week_key } = req.body

  try {
    // 1. Ambil pesan yang belum dianalisis
    let query = supabase
      .from('messages')
      .select('id, wag_id, week_key, sender_type, sender_name, content')
      .not('content', 'is', null)
      .neq('content', '')
      .neq('content', '<Media omitted>')

    if (wag_id) query = query.eq('wag_id', wag_id)
    if (week_key) query = query.eq('week_key', week_key)

    // Cek yang sudah dianalisis
    const { data: analyzed } = await supabase
      .from('message_analysis')
      .select('message_id')

    const analyzedIds = new Set((analyzed || []).map(a => a.message_id))

    const { data: messages, error } = await query
      .order('sent_at', { ascending: false })
      .limit(500)

    if (error) throw new Error(error.message)
    if (!messages || messages.length === 0) {
      return res.status(200).json({ analyzed: 0, message: 'Tidak ada pesan baru untuk dianalisis' })
    }

    // Filter yang belum dianalisis
    const unanalyzed = messages.filter(m => !analyzedIds.has(m.id))
    if (unanalyzed.length === 0) {
      return res.status(200).json({ analyzed: 0, message: 'Semua pesan sudah dianalisis' })
    }

    // 2. Proses per batch
    let totalAnalyzed = 0
    const results: MessageAnalysis[] = []

    for (let i = 0; i < unanalyzed.length; i += BATCH_SIZE) {
      const batch = unanalyzed.slice(i, i + BATCH_SIZE)

      const prompt = `Analisis setiap pesan berikut dari komunitas WhatsApp agen EDC Mini ATM.

Untuk setiap pesan, tentukan:
1. sentiment: "positif" (antusias, terima kasih, puas) | "negatif" (keluhan, frustrasi, marah) | "netral" (informasi biasa, pertanyaan datar)
2. topic: "keluhan_teknis" (masalah mesin/transaksi) | "pertanyaan" (tanya info/cara) | "apresiasi" (terima kasih/pujian) | "info_promo" (share info/promo) | "motivasi" (semangat/encourage) | "onboarding" (sambut member baru) | "lainnya"
3. response_quality (HANYA untuk pesan dari ranger): "substantif" (jawaban lengkap/solusi nyata) | "generik" (ok/siap/noted/iya saja) | "tidak_relevan" | null (untuk pesan bukan ranger)

Pesan:
${batch.map((m, idx) => `[${idx}] sender_type:${m.sender_type} | "${m.content?.slice(0, 150)}"`).join('\n')}

Respond HANYA dengan JSON array, tanpa penjelasan, tanpa backticks:
[{"idx":0,"sentiment":"...","topic":"...","response_quality":null},...]`

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 2048,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      const claudeData = await claudeRes.json()
      const text = claudeData.content?.[0]?.text || ''

      try {
        const jsonMatch = text.match(/\[[\s\S]*\]/)
        if (!jsonMatch) continue

        const parsed = JSON.parse(jsonMatch[0])

        for (const item of parsed) {
          const msg = batch[item.idx]
          if (!msg) continue

          results.push({
            message_id: msg.id,
            wag_id: msg.wag_id,
            week_key: msg.week_key,
            sender_type: msg.sender_type,
            sentiment: item.sentiment,
            topic: item.topic,
            response_quality: item.response_quality,
          })
          totalAnalyzed++
        }
      } catch {
        // Skip batch yang gagal parse
        continue
      }
    }

    // 3. Simpan ke database
    if (results.length > 0) {
      const { error: insertError } = await supabase
        .from('message_analysis')
        .upsert(results, { onConflict: 'message_id' })

      if (insertError) throw new Error(insertError.message)
    }

    return res.status(200).json({
      analyzed: totalAnalyzed,
      total_messages: unanalyzed.length,
      message: `${totalAnalyzed} pesan berhasil dianalisis`,
    })

  } catch (err: unknown) {
    console.error('Semantic analysis error:', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}
