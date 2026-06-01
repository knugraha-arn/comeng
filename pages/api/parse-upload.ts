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
  const iosMatch = line.match(/^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s(\d{1,2})\.(\d{2})\.(\d{2})\]\s(.+?):\s(.*)$/)
  if (iosMatch) {
    const [, day, month, year, hour, min, sec, sender, content] = iosMatch
    const fullYear = year.length === 2 ? `20${year}` : year
    const timestamp = new Date(`${fullYear}-${month.padStart(2,'0')}-${day.padStart(2,'0')}T${hour.padStart(2,'0')}:${min}:${sec}`)
    return { timestamp, sender: sender.trim(), content: content.trim() }
  }

  const androidMatch = line.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s(\d{1,2})\.(\d{2})\s-\s(.+?):\s(.*)$/)
  if (androidMatch) {
    const [, day, month, year, hour, min, sender, content] = androidMatch
    const fullYear = year.length === 2 ? `20${year}` : year
    const timestamp = new Date(`${fullYear}-${month.padStart(2,'0')}-${day.padStart(2,'0')}T${hour.padStart(2,'0')}:${min}:00`)
    return { timestamp, sender: sender.trim(), content: content.trim() }
  }

  return null
}

const SYSTEM_KEYWORDS = [
  'joined using this group',
  'left',
  'added',
  'removed',
  'changed the subject',
  'changed this group',
  'Messages and calls are end-to-end encrypted',
  'created group',
  'changed the group',
  'pinned a message',
  'deleted this message',
  'This message was deleted',
]

function isSystemMessage(sender: string, content: string): boolean {
  if (!sender || sender === 'You' || sender === '\u200eYou') return true
  if (content === '<Media omitted>') return false
  if (content === '') return true
  for (const kw of SYSTEM_KEYWORDS) {
    if (content.includes(kw)) return true
  }
  return false
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

    await supabase.from('uploads').update({ status: 'processing' }).eq('id', upload_id)

    const wag = upload.wags
    const lastProcessedAt = wag.last_processed_at ? new Date(wag.last_processed_at) : null

    // 2. Download file
    const { data: fileData, error: fileError } = await supabase.storage
      .from('wag-exports')
      .download(upload.file_path)

    if (fileError || !fileData) throw new Error('Gagal download file dari storage')

    const text = await fileData.text()
    const lines = text.split('\n')

    // 3. Ambil Ranger dan Observer
    const [rangerRes, observerRes] = await Promise.all([
      supabase.from('rangers').select('display_name').eq('wag_id', wag.id).eq('status', 'active'),
      supabase.from('observers').select('display_name').eq('wag_id', wag.id),
    ])

    const rangerNames = new Set((rangerRes.data || []).map(r => r.display_name.toLowerCase()))
    const observerNames = new Set((observerRes.data || []).map(o => o.display_name.toLowerCase()))

    // 4. Parse baris
    const messages: Record<string, unknown>[] = []
    const membersSeen = new Map<string, Date>()
    let parsedCount = 0
    let skippedCount = 0
    let latestTimestamp = lastProcessedAt

    for (const line of lines) {
      const parsed = parseWhatsAppLine(line.trim())
      if (!parsed) continue

      const { timestamp, sender, content } = parsed

      if (lastProcessedAt && timestamp <= lastProcessedAt) {
        skippedCount++
        continue
      }

      if (isSystemMessage(sender, content)) continue

      const senderLower = sender.toLowerCase()
      if (observerNames.has(senderLower)) continue

      const isRanger = rangerNames.has(senderLower)
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

    // 5. Insert messages (batch 100)
    if (messages.length > 0) {
      for (let i = 0; i < messages.length; i += 100) {
        await supabase.from('messages').insert(messages.slice(i, i + 100))
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

    // 7. Hitung weekly_metrics per week_key
    const weekKeys = [...new Set(messages.map(m => m.week_key as string))]
    const { data: rangerData } = await supabase
      .from('rangers')
      .select('id')
      .eq('wag_id', wag.id)
      .eq('status', 'active')
      .single()

    const { data: allMembers } = await supabase
      .from('members')
      .select('id')
      .eq('wag_id', wag.id)

    const totalMembers = allMembers?.length ?? 1

    if (rangerData) {
      for (const weekKey of weekKeys) {
        const weekMessages = messages.filter(m => m.week_key === weekKey)
        const rangerMessages = weekMessages.filter(m => m.sender_type === 'ranger')
        const memberMessages = weekMessages.filter(m => m.sender_type === 'member')

        const activeDays = new Set(
          rangerMessages.map(m => (m.sent_at as string).slice(0, 10))
        ).size

        const uniqueActiveMembers = new Set(
          memberMessages.map(m => m.sender_name as string)
        ).size

        const participationRate = Math.round((uniqueActiveMembers / totalMembers) * 100)

        const proactivePosts = rangerMessages.length
        const status = proactivePosts < 3 ? 'critical' : proactivePosts < 10 ? 'warning' : 'healthy'

        await supabase.from('weekly_metrics').upsert({
          wag_id: wag.id,
          ranger_id: rangerData.id,
          week_key: weekKey,
          active_days: activeDays,
          total_messages: rangerMessages.length,
          proactive_posts: proactivePosts,
          participation_rate: participationRate,
          status,
          computed_at: new Date().toISOString(),
        }, { onConflict: 'wag_id,week_key' })
      }
    }

    // 8. Update wag timestamps
    const wagUpdate: Record<string, string> = {}
    if (latestTimestamp) wagUpdate.last_processed_at = latestTimestamp.toISOString()
    if (!wag.last_processed_at) wagUpdate.monitored_since = new Date().toISOString()
    if (Object.keys(wagUpdate).length > 0) {
      await supabase.from('wags').update(wagUpdate).eq('id', wag.id)
    }

    // 9. Update upload record
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

    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Unknown error'
    })
  }
}
