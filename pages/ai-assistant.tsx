import { useState, useEffect, useRef } from 'react'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'

type Message = {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

type Wag = { id: string; name: string }

const SUGGESTIONS = [
  'Ranger mana yang paling konsisten minggu ini?',
  'WAG mana yang perlu perhatian segera?',
  'Bandingkan performa semua Ranger bulan ini',
  'Agen mana yang paling aktif di semua WAG?',
  'Apa tren participation rate 4 minggu terakhir?',
  'Ranger mana yang proactive posts-nya paling tinggi?',
]

export default function AiAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [remaining, setRemaining] = useState(30)
  const [userId, setUserId] = useState('')
  const [selectedWagId, setSelectedWagId] = useState('')
  const [wags, setWags] = useState<Wag[]>([])
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUserId(session.user.id)
    })
    supabase.from('wags').select('id, name').eq('status', 'active').then(({ data }) => {
      if (data) setWags(data)
    })
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (text?: string) => {
    const content = text || input.trim()
    if (!content || loading) return

    const userMsg: Message = { role: 'user', content, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setError('')

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history,
          userId,
          wagId: selectedWagId || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal mendapat respons')

      setRemaining(data.remaining)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply,
        timestamp: new Date(),
      }])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Terjadi kesalahan')
    }

    setLoading(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    setMessages([])
    setError('')
  }

  return (
    <Layout title="AI Assistant">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: '16px', height: 'calc(100vh - 100px)', alignItems: 'start' }}>

        {/* Chat area */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', overflow: 'hidden' }}>

          {/* Chat header */}
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#0344D8', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFFFFF', fontSize: '16px' }}>
                ✦
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '500' }}>AMARIS AI Assistant</div>
                <div style={{ fontSize: '11px', color: '#999' }}>Berbasis data komunitas WAG</div>
              </div>
              <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', background: '#0344D8', color: '#FFFFFF', fontWeight: '600' }}>
                ✦ AI Powered
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '11px', color: remaining <= 5 ? '#B00020' : '#999' }}>
                {remaining} pertanyaan tersisa hari ini
              </span>
              {messages.length > 0 && (
                <button onClick={clearChat}
                  style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: '1px solid #e5e5e5', background: 'transparent', cursor: 'pointer', color: '#999' }}>
                  Hapus chat
                </button>
              )}
            </div>
          </div>

          {/* Filter WAG */}
          <div style={{ padding: '10px 18px', borderBottom: '1px solid #f5f5f5', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: '#999' }}>Fokus WAG:</span>
            <select value={selectedWagId} onChange={e => setSelectedWagId(e.target.value)}
              style={{ fontSize: '12px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #e5e5e5', outline: 'none', background: '#FFFFFF' }}>
              <option value="">Semua WAG</option>
              {wags.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            {selectedWagId && (
              <span style={{ fontSize: '11px', color: '#0344D8' }}>
                Data pesan WAG ini akan di-load lebih detail
              </span>
            )}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {messages.length === 0 && (
              <div style={{ textAlign: 'center', color: '#999', marginTop: '40px' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>✦</div>
                <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>Tanya apa saja tentang komunitas WAG kamu</div>
                <div style={{ fontSize: '12px', marginBottom: '24px' }}>Berbasis data real dari sistem AMARIS</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', maxWidth: '480px', margin: '0 auto' }}>
                  {SUGGESTIONS.map(s => (
                    <button key={s} onClick={() => sendMessage(s)}
                      style={{
                        padding: '7px 14px', borderRadius: '999px', border: '1px solid #e5e5e5',
                        background: '#F8F9FB', fontSize: '12px', cursor: 'pointer', color: '#555',
                        textAlign: 'left', lineHeight: '1.4',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#F0F5FF')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#F8F9FB')}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
                {/* Avatar */}
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                  background: m.role === 'user' ? '#1A1F2E' : '#0344D8',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: m.role === 'user' ? '11px' : '14px', color: '#FFFFFF',
                }}>
                  {m.role === 'user' ? 'K' : '✦'}
                </div>

                {/* Bubble */}
                <div style={{
                  maxWidth: '75%',
                  padding: '10px 14px',
                  borderRadius: m.role === 'user' ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
                  background: m.role === 'user' ? '#1A1F2E' : '#F8F9FB',
                  color: m.role === 'user' ? '#FFFFFF' : '#333',
                  fontSize: '13px', lineHeight: '1.6',
                  border: m.role === 'assistant' ? '1px solid #e5e5e5' : 'none',
                }}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
                  <div style={{ fontSize: '10px', color: m.role === 'user' ? 'rgba(255,255,255,0.4)' : '#bbb', marginTop: '6px' }}>
                    {m.timestamp.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#0344D8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: '#FFFFFF', flexShrink: 0 }}>✦</div>
                <div style={{ padding: '12px 16px', borderRadius: '2px 12px 12px 12px', background: '#F8F9FB', border: '1px solid #e5e5e5' }}>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} style={{
                        width: '6px', height: '6px', borderRadius: '50%', background: '#0344D8',
                        animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                        opacity: 0.6,
                      }} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div style={{ padding: '10px 14px', background: '#FDECEA', border: '1px solid #F09595', borderRadius: '8px', fontSize: '12px', color: '#B00020' }}>
                {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '14px 18px', borderTop: '1px solid #e5e5e5' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Tanya tentang data komunitas WAG kamu... (Enter untuk kirim, Shift+Enter untuk baris baru)"
                disabled={loading || remaining <= 0}
                rows={1}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: '8px',
                  border: '1px solid #e5e5e5', fontSize: '13px', outline: 'none',
                  resize: 'none', fontFamily: 'system-ui, sans-serif', lineHeight: '1.5',
                  background: remaining <= 0 ? '#F8F9FB' : '#FFFFFF',
                }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading || remaining <= 0}
                style={{
                  padding: '10px 18px', borderRadius: '8px', border: 'none',
                  background: !input.trim() || loading || remaining <= 0 ? '#e5e5e5' : '#0344D8',
                  color: !input.trim() || loading || remaining <= 0 ? '#999' : '#FFFFFF',
                  fontSize: '13px', fontWeight: '500', cursor: !input.trim() || loading || remaining <= 0 ? 'not-allowed' : 'pointer',
                  flexShrink: 0,
                }}
              >
                Kirim
              </button>
            </div>
            {remaining <= 0 && (
              <div style={{ fontSize: '11px', color: '#B00020', marginTop: '6px' }}>
                Batas pertanyaan harian tercapai. Coba lagi besok.
              </div>
            )}
            <div style={{ fontSize: '10px', color: '#bbb', marginTop: '6px' }}>
              Scope terbatas pada data komunitas WAG di sistem AMARIS · Tidak dapat membuat kode atau artefak
            </div>
          </div>
        </div>

        {/* Sidebar info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Usage */}
          <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: '500', marginBottom: '10px' }}>Penggunaan Hari Ini</div>
            <div style={{ fontSize: '24px', fontWeight: '600', color: remaining <= 5 ? '#B00020' : '#0344D8', marginBottom: '4px' }}>
              {30 - remaining} / 30
            </div>
            <div style={{ fontSize: '11px', color: '#999', marginBottom: '10px' }}>pertanyaan digunakan</div>
            <div style={{ height: '6px', background: '#F8F9FB', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{
                width: `${((30 - remaining) / 30) * 100}%`, height: '100%',
                background: remaining <= 5 ? '#E24B4A' : '#0344D8', borderRadius: '3px',
                transition: 'width 0.3s',
              }} />
            </div>
          </div>

          {/* Scope */}
          <div style={{ background: '#F8F9FB', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: '500', marginBottom: '10px' }}>Scope Data</div>
            {[
              { icon: '✓', text: 'Performa Ranger', ok: true },
              { icon: '✓', text: 'Data WAG & agen', ok: true },
              { icon: '✓', text: 'Metrik mingguan', ok: true },
              { icon: '✓', text: 'Pesan chat WAG', ok: true },
              { icon: '✓', text: 'Rekomendasi AI', ok: true },
              { icon: '✗', text: 'Data di luar AMARIS', ok: false },
              { icon: '✗', text: 'Generate kode/artefak', ok: false },
            ].map(item => (
              <div key={item.text} style={{ display: 'flex', gap: '8px', marginBottom: '6px', fontSize: '12px', color: item.ok ? '#555' : '#bbb' }}>
                <span style={{ color: item.ok ? '#27500A' : '#E24B4A', fontWeight: '600' }}>{item.icon}</span>
                {item.text}
              </div>
            ))}
          </div>

          {/* Tips */}
          <div style={{ background: '#F0F5FF', border: '1px solid #B5D4F4', borderRadius: '10px', padding: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: '500', color: '#0C447C', marginBottom: '8px' }}>Tips</div>
            <div style={{ fontSize: '11px', color: '#0C447C', lineHeight: '1.7' }}>
              Pilih WAG spesifik di atas untuk analisis yang lebih detail termasuk isi percakapan.
              Tanpa filter, AI menggunakan 200 pesan terbaru dari semua WAG.
            </div>
          </div>
        </div>

      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.4; }
          40% { transform: scale(1.2); opacity: 1; }
        }
      `}</style>
    </Layout>
  )
}
