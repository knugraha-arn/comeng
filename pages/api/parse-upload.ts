import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

function parseWhatsAppLine(line: string): { timestamp: Date; sender: string; content: string } | null {
  // Format iOS: [DD/MM/YY, HH.MM.SS] Nama: pesan
  const iosMatch = line.match(/^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s(\d{1,2})\.(\d{2})\.(\d{2})\]\s(.+?):\s(.*)$/)
  if (iosMatch) {
    const [, day, month, year, hour, min, sec, sender, content] = iosMatch
    const fullYear = year.length === 2 ? `20${year}` : year
    const timestamp = new Date(`${fullYear}-${month.padStart(2,'0')}-${day.padStart(2,'0')}T${hour.padStart(2,'0')}:${min}:${sec}`)
    return { timestamp, sender: sender.trim(), content: content.trim() }
  }

  // Format Android: DD/MM/YY, HH.MM - Nama: pesan
  const androidMatch = line.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s(\d{1,2})\.(\d{2})\s-\s(.+?):\s(.*)$/)
  if (androidMatch) {
    const [, day, month, year, hour, min, sender, content] = androidMatch
    const fullYear = year.length === 2 ? `20${year}` : year
    const timestamp = new Date(`${fullYear}-${month.padStart(2,'0')}-${day.padStart(2,'0')}T${hour.padStart(2,'0')}:${min}:00`)
    return { timestamp, sender: sender.trim(), content: content.trim() }
  }

  return null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { upload_id } = req.body
  if (!upload_id) return res.status(400).json({ error: 'upload_id required' })

  try {
    // 1. Ambil data upload
    const { data: upload, error: uploadError } = await supabase
      .from('uploads')
      .select('*, wags(id, name, last_processed_at)')
      .eq('id', upload_id)
      .single()

    if (uploadError || !upload) throw new Error('Upload tidak ditemukan')

    // Update status ke processing
    await supabase.from('uploads').update({ status: 'processing' }).eq('id', upload_id)

    const wag = upload.wags
    const lastProcessedAt = wag.last_processed_at ? new Date(wag.last_processed_at) : null

    // 2. Download file dari Storage
    const { data: fileData, error: fileError } = await supabase.storage
      .from('wag-exports')
      .download(upload.file_path)

    if (fileError || !fileData) throw new Error('Gagal download file dari storage')

    const text = await fileData.text()
    const lines = text.split('\n')

    // 3. Ambil daftar Ranger dan Observer untuk WAG ini
    const [rangerRes, observerRes] = await Promise.all([
      supabase.from('rangers').select('display_name').eq('wag_id', wag.id).eq('status', 'active'),
      supabase.from('observers').select('display_name').eq('wag_id', wag.id),
    ])

    const rangerNames = new Set((rangerRes.data || []).map(r => r.display_name.toLowerCase()))
    const observerNames = new Set((observerRes.data || []).map(o => o.display_name.toLowerCase()))

    // 4. Parse baris per baris
    const messages = []
    const membersSeen = new Map<string, Date>()
    let parsedCount = 0
    let skippedCount = 0
    let latestTimestamp = lastProcessedAt

    for (const line of lines) {
      const parsed = parseWhatsAppLine(line.trim())
      if (!parsed) continue

      const { timestamp, sender, content } = parsed

      // Opsi B: skip pesan lama
      if (lastProcessedAt && timestamp <= lastProcessedAt) {
        skippedCount++
        continue
      }

      // Skip pesan sistem WhatsApp
      const isSystem = !sender || content === '' ||
        content.includes('joined using this group') ||
        content.includes('left') ||
        content.includes('added') ||
        content.includes('removed') ||
        content.includes('changed the subject') ||
        content.includes('changed this group') ||
        content.includes('Messages and calls are end-to-end encrypted') ||
        content === '<Media omitted>'

      if (isSystem) continue

      const senderLower = sender.toLowerCase()
      const isRanger = rangerNames.has(senderLower)
      const isObserver = observerNames.has(senderLower)

      // Skip observer
      if (isObserver) continue

      const senderType = isRanger ? 'ranger' : 'member'
      const weekKey = getWeekKey(timestamp)

      messages.push({
        wag_id: wag.id,
        upload_id,
        sent_at: timestamp.toISOString(),
        week_key: weekKey,
        sender_name: sender,
        sender_type: senderType,
        content: content.slice(0, 500),
        is_reply: false,
      })

      // Track member activity
      if (!isRanger) {
        const existing = membersSeen.get(sender)
        if (!existing || timestamp > existing) {
          membersSeen.set(sender, timestamp)
        }
      }

      if (!latestTimestamp || timestamp > latestTimestamp) {
        latestTimestamp = timestamp
      }

      parsedCount++
    }

    // 5. Insert messages ke database (batch 100)
    if (messages.length > 0) {
      for (let i = 0; i < messages.length; i += 100) {
        const batch = messages.slice(i, i + 100)
        await supabase.from('messages').insert(batch)
      }
    }

    // 6. Upsert members
    for (const [displayName, lastActive] of membersSeen.entries()) {
      await supabase.from('members').upsert({
        wag_id: wag.id,
        display_name: displayName,
        last_active_at: lastActive.toISOString(),
        status: 'active',
      }, { onConflict: 'wag_id,display_name' })
    }

    // 7. Update wag last_processed_at dan monitored_since
    const wagUpdate: Record<string, string> = {}
    if (latestTimestamp) wagUpdate.last_processed_at = latestTimestamp.toISOString()
    if (!wag.last_processed_at) wagUpdate.monitored_since = new Date().toISOString()
    if (Object.keys(wagUpdate).length > 0) {
      await supabase.from('wags').update(wagUpdate).eq('id', wag.id)
    }

    // 8. Update upload record
    await supabase.from('uploads').update({
      status: 'done',
      messages_parsed: parsedCount,
      messages_skipped: skippedCount,
    }).eq('id', upload_id)

    return res.status(200).json({
      success: true,
      messages_parsed: parsedCount,
      messages_skipped: skippedCount,
    })

  } catch (err: unknown) {
    await supabase.from('uploads').update({
      status: 'error',
      error_message: err instanceof Error ? err.message : 'Unknown error',
    }).eq('id', upload_id)

    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' })
  }
}
