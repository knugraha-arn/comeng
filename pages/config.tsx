import { useState, useEffect } from 'react'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'

type MatchingResult = {
  member_name: string
  r_wag_name: string
  cleaned_name: string
  match_status: 'matched' | 'ambiguous' | 'no_match'
  matched_merchant: string | null
  r_serial_number: string | null
  candidate_count: number
  match_type: string
}

type Wag = { id: string; name: string; description: string; status: string; created_at: string }
type Ranger = { id: string; wag_id: string; full_name: string; display_name: string; phone_number: string; status: string }
type User = { id: string; email: string; full_name: string; role: string; last_login_at: string; is_approved: boolean }
type Observer = { id: string; wag_id: string; display_name: string; note: string; created_at: string }

export default function ConfigPage() {
  const [tab, setTab] = useState<'wag' | 'ranger' | 'users' | 'observer' | 'matching' | 'skill'>('wag')
  const [wags, setWags] = useState<Wag[]>([])
  const [rangers, setRangers] = useState<Ranger[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [observers, setObservers] = useState<Observer[]>([])
  const [showWagForm, setShowWagForm] = useState(false)
  const [showRangerForm, setShowRangerForm] = useState(false)
  const [showObserverForm, setShowObserverForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ text: '', type: '' })
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null)

  const [wagName, setWagName] = useState('')
  const [wagDesc, setWagDesc] = useState('')
  const [rangerFullName, setRangerFullName] = useState('')
  const [rangerDisplayName, setRangerDisplayName] = useState('')
  const [rangerPhone, setRangerPhone] = useState('')
  const [rangerWagId, setRangerWagId] = useState('')
  const [observerDisplayName, setObserverDisplayName] = useState('')
  const [observerNote, setObserverNote] = useState('')
  const [observerWagId, setObserverWagId] = useState('')

  useEffect(() => {
    fetchAll()
    loadSkill()
  }, [])

  async function loadSkill() {
    const { data } = await supabase
      .from('am_ai_skill')
      .select('id, name, content')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()
    if (data) {
      setSkillId(data.id)
      setSkillName(data.name)
      setSkillContent(data.content)
    }
  }

  async function saveSkill() {
    setSkillLoading(true)
    setSkillSaved(false)
    try {
      if (skillId) {
        await supabase.from('am_ai_skill').update({
          name: skillName,
          content: skillContent,
          updated_at: new Date().toISOString(),
        }).eq('id', skillId)
      } else {
        await supabase.from('am_ai_skill').insert({
          name: skillName || 'AMARIS Context',
          content: skillContent,
          is_active: true,
        })
      }
      setSkillSaved(true)
      setTimeout(() => setSkillSaved(false), 3000)
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Gagal menyimpan', type: 'error' })
    } finally {
      setSkillLoading(false)
    }
  }

  const fetchAll = async () => {
    const [wagRes, rangerRes, userRes, observerRes] = await Promise.all([
      supabase.from('wags').select('*').order('created_at', { ascending: false }),
      supabase.from('rangers').select('*').order('created_at', { ascending: false }),
      supabase.from('users').select('*').order('created_at', { ascending: false }),
      supabase.from('observers').select('*').order('created_at', { ascending: false }),
    ])
    if (wagRes.data) setWags(wagRes.data)
    if (rangerRes.data) setRangers(rangerRes.data)
    if (userRes.data) setUsers(userRes.data)
    if (observerRes.data) setObservers(observerRes.data)
  }

  const showMsg = (text: string, type: string) => {
    setMessage({ text, type })
    setTimeout(() => setMessage({ text: '', type: '' }), 4000)
  }

  const handleAddWag = async () => {
    if (!wagName.trim()) { showMsg('Nama WAG wajib diisi', 'error'); return }
    setLoading(true)
    const { error } = await supabase.from('wags').insert({ name: wagName.trim(), description: wagDesc.trim(), status: 'active' })
    setLoading(false)
    if (error) { showMsg(error.message, 'error'); return }
    showMsg('WAG berhasil ditambahkan', 'success')
    setWagName(''); setWagDesc(''); setShowWagForm(false); fetchAll()
  }

  const handleAddRanger = async () => {
    if (!rangerFullName.trim()) { showMsg('Nama lengkap wajib diisi', 'error'); return }
    if (!rangerDisplayName.trim()) { showMsg('Nama display wajib diisi', 'error'); return }
    if (!rangerPhone.trim()) { showMsg('No HP wajib diisi', 'error'); return }
    if (!rangerWagId) { showMsg('Pilih WAG terlebih dahulu', 'error'); return }
    setLoading(true)
    const { error } = await supabase.from('rangers').insert({
      full_name: rangerFullName.trim(),
      display_name: rangerDisplayName.trim(),
      phone_number: rangerPhone.trim(),
      wag_id: rangerWagId,
      status: 'active',
    })
    setLoading(false)
    if (error) { showMsg(error.message, 'error'); return }
    showMsg('Ranger berhasil ditambahkan', 'success')
    setRangerFullName(''); setRangerDisplayName(''); setRangerPhone(''); setRangerWagId('')
    setShowRangerForm(false); fetchAll()
  }

  const handleAddObserver = async () => {
    if (!observerDisplayName.trim()) { showMsg('Nama display wajib diisi', 'error'); return }
    if (!observerWagId) { showMsg('Pilih WAG terlebih dahulu', 'error'); return }
    setLoading(true)
    const { error } = await supabase.from('observers').insert({
      display_name: observerDisplayName.trim(),
      note: observerNote.trim(),
      wag_id: observerWagId,
    })
    setLoading(false)
    if (error) { showMsg(error.message, 'error'); return }
    showMsg('Observer berhasil ditambahkan', 'success')
    setObserverDisplayName(''); setObserverNote(''); setObserverWagId('')
    setShowObserverForm(false); fetchAll()
  }

  const handleArchiveWag = async (id: string) => {
    await supabase.from('wags').update({ status: 'inactive' }).eq('id', id)
    setConfirmArchive(null)
    showMsg('WAG berhasil diarsipkan', 'success')
    fetchAll()
  }

  const handleActivateWag = async (id: string) => {
    await supabase.from('wags').update({ status: 'active' }).eq('id', id)
    showMsg('WAG berhasil diaktifkan kembali', 'success')
    fetchAll()
  }

  const handleDeactivateRanger = async (id: string) => {
    await supabase.from('rangers').update({ status: 'inactive' }).eq('id', id)
    showMsg('Ranger berhasil dinonaktifkan', 'success')
    fetchAll()
  }

  const handleActivateRanger = async (id: string) => {
    await supabase.from('rangers').update({ status: 'active' }).eq('id', id)
    showMsg('Ranger berhasil diaktifkan kembali', 'success')
    fetchAll()
  }

  const handleDeleteObserver = async (id: string) => {
    await supabase.from('observers').delete().eq('id', id)
    showMsg('Observer berhasil dihapus', 'success')
    fetchAll()
  }

  const handleToggleApprove = async (id: string, current: boolean) => {
    await supabase.from('users').update({ is_approved: !current }).eq('id', id)
    showMsg(`Akses ${!current ? 'diberikan' : 'dicabut'}`, !current ? 'success' : 'error')
    fetchAll()
  }

  const inputStyle = {
    width: '100%', padding: '8px 12px', borderRadius: '8px',
    border: '1px solid #e5e5e5', fontSize: '13px', outline: 'none',
    boxSizing: 'border-box' as const,
  }

  const [matchingResults, setMatchingResults] = useState<MatchingResult[]>([])
  const [matchingLoading, setMatchingLoading] = useState(false)
  const [matchingDone, setMatchingDone] = useState(false)

  const [skillContent, setSkillContent] = useState('')
  const [skillName, setSkillName] = useState('')
  const [skillId, setSkillId] = useState('')
  const [skillLoading, setSkillLoading] = useState(false)
  const [skillSaved, setSkillSaved] = useState(false)

  const tabs = [
    { key: 'wag', label: 'WAG' },
    { key: 'ranger', label: 'Ranger' },
    { key: 'observer', label: 'Observer' },
    { key: 'users', label: 'Akun Pengguna' },
    { key: 'matching', label: 'Agent Matching' },
    { key: 'skill', label: 'AI Skill File' },
  ]

  async function runMatching() {
    setMatchingLoading(true)
    setMatchingDone(false)
    try {
      const { data, error } = await supabase.rpc('match_wag_members_to_agents')
      if (error) throw error
      setMatchingResults(data ?? [])
      setMatchingDone(true)
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Gagal menjalankan matching', type: 'error' })
    } finally {
      setMatchingLoading(false)
    }
  }

  function exportMatchingCSV() {
    const headers = ['Member Name (WAG)', 'WAG', 'Cleaned Name', 'Status', 'Matched Merchant', 'Serial Number', 'Kandidat', 'Tipe Match']
    const rows = matchingResults
      .filter(r => r.match_status !== 'no_match')
      .map(r => [
        r.member_name, r.r_wag_name, r.cleaned_name,
        r.match_status, r.matched_merchant || '', r.r_serial_number || '',
        String(r.candidate_count), r.match_type,
      ])
    const escape = (s: string) => s.includes(',') || s.includes('\n') ? ('"' + s.replace(/"/g, '""') + '"') : s
    const csv = [headers, ...rows].map(row => row.map(escape).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const date = new Date().toISOString().slice(0, 10)
    a.href = url
    a.download = 'agent_matching_' + date + '.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const matchedCount   = matchingResults.filter(r => r.match_status === 'matched').length
  const ambiguousCount = matchingResults.filter(r => r.match_status === 'ambiguous').length
  const noMatchCount   = matchingResults.filter(r => r.match_status === 'no_match').length
  const matchStatusConfig = {
    matched:   { label: 'Matched',   bg: '#EAF3DE', color: '#27500A', border: '#C0DD97' },
    ambiguous: { label: 'Ambiguous', bg: '#FFF3CD', color: '#856404', border: '#FAC775' },
    no_match:  { label: 'No Match',  bg: '#F8F9FB', color: '#999',    border: '#e5e5e5' },
  }

  const activeWags = wags.filter(w => w.status === 'active')
  const archivedWags = wags.filter(w => w.status !== 'active')

  return (
    <Layout>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: '#F8F9FB', padding: '4px', borderRadius: '10px', width: 'fit-content', border: '1px solid #e5e5e5' }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
            style={{ padding: '7px 20px', borderRadius: '8px', border: 'none', background: tab === t.key ? '#FFFFFF' : 'transparent', color: tab === t.key ? '#000000' : '#999', fontSize: '13px', fontWeight: tab === t.key ? '500' : '400', cursor: 'pointer', boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Message */}
      {message.text && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '12px', marginBottom: '16px', background: message.type === 'success' ? '#EAF3DE' : '#FDECEA', color: message.type === 'success' ? '#27500A' : '#B00020' }}>
          {message.text}
        </div>
      )}

      {/* WAG Tab */}
      {tab === 'wag' && (
        <div>
          <button onClick={() => setShowWagForm(!showWagForm)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', border: '1px solid #e5e5e5', background: '#FFFFFF', fontSize: '13px', cursor: 'pointer', marginBottom: '14px', fontWeight: '500' }}>
            + Tambah WAG Baru
          </button>

          {showWagForm && (
            <div style={{ background: '#F8F9FB', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '18px', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '14px' }}>Form tambah WAG</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#999', marginBottom: '5px' }}>Nama WAG <span style={{ color: '#B00020' }}>*</span></div>
                  <input style={inputStyle} placeholder="cth: Marketing Warrior" value={wagName} onChange={e => setWagName(e.target.value)} />
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#999', marginBottom: '5px' }}>Deskripsi (opsional)</div>
                  <input style={inputStyle} placeholder="cth: Komunitas agen wilayah Jakarta" value={wagDesc} onChange={e => setWagDesc(e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleAddWag} disabled={loading} style={{ padding: '8px 20px', background: '#0344D8', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
                  {loading ? 'Menyimpan...' : 'Simpan WAG'}
                </button>
                <button onClick={() => setShowWagForm(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #e5e5e5', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>Batal</button>
              </div>
            </div>
          )}

          {/* Konfirmasi archive */}
          {confirmArchive && (
            <div style={{ padding: '14px 18px', background: '#FFF3CD', border: '1px solid #FAC775', borderRadius: '10px', marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
              <div style={{ fontSize: '13px', color: '#633806' }}>
                <strong>Arsipkan WAG ini?</strong> WAG tidak akan muncul di dashboard dan tidak akan diproses saat upload. Data histori tetap tersimpan.
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button onClick={() => setConfirmArchive(null)} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #e5e5e5', background: '#FFFFFF', fontSize: '12px', cursor: 'pointer' }}>Batal</button>
                <button onClick={() => handleArchiveWag(confirmArchive)} style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: '#B00020', color: '#FFFFFF', fontSize: '12px', cursor: 'pointer', fontWeight: '500' }}>Ya, Arsipkan</button>
              </div>
            </div>
          )}

          {/* WAG Aktif */}
          <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', overflow: 'hidden', marginBottom: '14px' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e5e5', fontSize: '13px', fontWeight: '500' }}>
              WAG Aktif <span style={{ fontSize: '11px', color: '#999', fontWeight: '400', marginLeft: '6px' }}>{activeWags.length} WAG</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
                  {['Nama WAG', 'Deskripsi', 'Dibuat', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', color: '#999', fontWeight: '500' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeWags.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#999', fontSize: '13px' }}>Belum ada WAG aktif</td></tr>
                )}
                {activeWags.map(w => (
                  <tr key={w.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={{ padding: '12px 14px', fontWeight: '500' }}>{w.name}</td>
                    <td style={{ padding: '12px 14px', color: '#999' }}>{w.description || '—'}</td>
                    <td style={{ padding: '12px 14px', color: '#999', fontSize: '12px' }}>{new Date(w.created_at).toLocaleDateString('id-ID')}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <button
                        onClick={() => setConfirmArchive(w.id)}
                        style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: '1px solid #e5e5e5', background: 'transparent', color: '#856404', cursor: 'pointer' }}
                      >
                        Arsipkan
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* WAG Diarsipkan */}
          {archivedWags.length > 0 && (
            <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e5e5', fontSize: '13px', fontWeight: '500', color: '#999' }}>
                WAG Diarsipkan <span style={{ fontSize: '11px', fontWeight: '400', marginLeft: '6px' }}>{archivedWags.length} WAG</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
                    {['Nama WAG', 'Deskripsi', 'Dibuat', ''].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', color: '#bbb', fontWeight: '500' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {archivedWags.map(w => (
                    <tr key={w.id} style={{ borderBottom: '1px solid #f5f5f5', opacity: 0.7 }}>
                      <td style={{ padding: '12px 14px', color: '#999' }}>{w.name}</td>
                      <td style={{ padding: '12px 14px', color: '#bbb' }}>{w.description || '—'}</td>
                      <td style={{ padding: '12px 14px', color: '#bbb', fontSize: '12px' }}>{new Date(w.created_at).toLocaleDateString('id-ID')}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <button
                          onClick={() => handleActivateWag(w.id)}
                          style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: '1px solid #B5D4F4', background: 'transparent', color: '#0344D8', cursor: 'pointer' }}
                        >
                          Aktifkan Kembali
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Ranger Tab */}
      {tab === 'ranger' && (
        <div>
          <button onClick={() => setShowRangerForm(!showRangerForm)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', border: '1px solid #e5e5e5', background: '#FFFFFF', fontSize: '13px', cursor: 'pointer', marginBottom: '14px', fontWeight: '500' }}>
            + Tambah Ranger Baru
          </button>
          {showRangerForm && (
            <div style={{ background: '#F8F9FB', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '18px', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '14px' }}>Form tambah Ranger</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#999', marginBottom: '5px' }}>Nama lengkap <span style={{ color: '#B00020' }}>*</span></div>
                  <input style={inputStyle} placeholder="cth: Auditto Rizqullah" value={rangerFullName} onChange={e => setRangerFullName(e.target.value)} />
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#999', marginBottom: '5px' }}>Nama display di WAG <span style={{ color: '#B00020' }}>*</span></div>
                  <input style={inputStyle} placeholder="cth: ARN-Auditto" value={rangerDisplayName} onChange={e => setRangerDisplayName(e.target.value)} />
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#999', marginBottom: '5px' }}>No HP <span style={{ color: '#B00020' }}>*</span></div>
                  <input style={inputStyle} placeholder="cth: +62817800658" value={rangerPhone} onChange={e => setRangerPhone(e.target.value)} />
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#999', marginBottom: '5px' }}>WAG yang dikelola <span style={{ color: '#B00020' }}>*</span></div>
                  <select style={inputStyle} value={rangerWagId} onChange={e => setRangerWagId(e.target.value)}>
                    <option value="">— Pilih WAG —</option>
                    {wags.filter(w => w.status === 'active').map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div style={{ fontSize: '11px', color: '#856404', background: '#FFF3CD', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px' }}>
                ⚠ Nama display harus sama persis dengan nama yang muncul di export chat WhatsApp
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleAddRanger} disabled={loading} style={{ padding: '8px 20px', background: '#0344D8', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
                  {loading ? 'Menyimpan...' : 'Simpan Ranger'}
                </button>
                <button onClick={() => setShowRangerForm(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #e5e5e5', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>Batal</button>
              </div>
            </div>
          )}
          <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
                  {['Nama', 'Display WAG', 'No HP', 'WAG', 'Status', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', color: '#999', fontWeight: '500' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rangers.length === 0 && <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#999', fontSize: '13px' }}>Belum ada Ranger</td></tr>}
                {rangers.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f5f5f5', opacity: r.status !== 'active' ? 0.6 : 1 }}>
                    <td style={{ padding: '12px 14px', fontWeight: '500' }}>{r.full_name}</td>
                    <td style={{ padding: '12px 14px', color: '#555' }}>{r.display_name}</td>
                    <td style={{ padding: '12px 14px', color: '#999' }}>{r.phone_number}</td>
                    <td style={{ padding: '12px 14px', color: '#999' }}>{wags.find(w => w.id === r.wag_id)?.name || '—'}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: r.status === 'active' ? '#EAF3DE' : '#F8F9FB', color: r.status === 'active' ? '#27500A' : '#999' }}>
                        {r.status === 'active' ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {r.status === 'active' ? (
                        <button onClick={() => handleDeactivateRanger(r.id)} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: '1px solid #FDECEA', background: 'transparent', color: '#B00020', cursor: 'pointer' }}>Nonaktifkan</button>
                      ) : (
                        <button onClick={() => handleActivateRanger(r.id)} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: '1px solid #B5D4F4', background: 'transparent', color: '#0344D8', cursor: 'pointer' }}>Aktifkan</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Observer Tab */}
      {tab === 'observer' && (
        <div>
          <div style={{ fontSize: '12px', color: '#856404', marginBottom: '14px', background: '#FFF3CD', padding: '10px 14px', borderRadius: '8px', border: '1px solid #FAC775' }}>
            ⚠ Observer adalah anggota WAG yang bukan agen — pesan mereka akan di-skip saat parsing. Contoh: tim marketing, staf kantor pusat.
          </div>
          <button onClick={() => setShowObserverForm(!showObserverForm)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', border: '1px solid #e5e5e5', background: '#FFFFFF', fontSize: '13px', cursor: 'pointer', marginBottom: '14px', fontWeight: '500' }}>
            + Tambah Observer
          </button>
          {showObserverForm && (
            <div style={{ background: '#F8F9FB', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '18px', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '14px' }}>Form tambah Observer</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: '#999', marginBottom: '5px' }}>Nama display di WAG <span style={{ color: '#B00020' }}>*</span></div>
                  <input style={inputStyle} placeholder="cth: ARN-Knugraha" value={observerDisplayName} onChange={e => setObserverDisplayName(e.target.value)} />
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#999', marginBottom: '5px' }}>WAG <span style={{ color: '#B00020' }}>*</span></div>
                  <select style={inputStyle} value={observerWagId} onChange={e => setObserverWagId(e.target.value)}>
                    <option value="">— Pilih WAG —</option>
                    {wags.filter(w => w.status === 'active').map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: '#999', marginBottom: '5px' }}>Keterangan (opsional)</div>
                  <input style={inputStyle} placeholder="cth: Marketing Arranet" value={observerNote} onChange={e => setObserverNote(e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleAddObserver} disabled={loading} style={{ padding: '8px 20px', background: '#0344D8', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
                  {loading ? 'Menyimpan...' : 'Simpan Observer'}
                </button>
                <button onClick={() => setShowObserverForm(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #e5e5e5', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>Batal</button>
              </div>
            </div>
          )}
          <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
                  {['Nama Display', 'WAG', 'Keterangan', 'Ditambahkan', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', color: '#999', fontWeight: '500' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {observers.length === 0 && <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#999', fontSize: '13px' }}>Belum ada observer</td></tr>}
                {observers.map(o => (
                  <tr key={o.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={{ padding: '12px 14px', fontWeight: '500' }}>{o.display_name}</td>
                    <td style={{ padding: '12px 14px', color: '#999' }}>{wags.find(w => w.id === o.wag_id)?.name || '—'}</td>
                    <td style={{ padding: '12px 14px', color: '#999' }}>{o.note || '—'}</td>
                    <td style={{ padding: '12px 14px', color: '#999', fontSize: '12px' }}>{new Date(o.created_at).toLocaleDateString('id-ID')}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <button onClick={() => handleDeleteObserver(o.id)} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: '1px solid #FDECEA', background: 'transparent', color: '#B00020', cursor: 'pointer' }}>Hapus</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {tab === 'users' && (
        <div>
          <div style={{ fontSize: '12px', color: '#856404', marginBottom: '14px', background: '#FFF3CD', padding: '10px 14px', borderRadius: '8px', border: '1px solid #FAC775' }}>
            ⚠ User baru perlu login dulu via Google — lalu approve aksesnya di sini.
          </div>
          <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
                  {['Email', 'Nama', 'Role', 'Login Terakhir', 'Akses'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', color: '#999', fontWeight: '500' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#999', fontSize: '13px' }}>Belum ada pengguna</td></tr>}
                {users.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={{ padding: '12px 14px', fontWeight: '500' }}>{u.email}</td>
                    <td style={{ padding: '12px 14px', color: '#555' }}>{u.full_name || '—'}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: u.role === 'admin' ? '#E8F0FE' : '#F8F9FB', color: u.role === 'admin' ? '#0344D8' : '#555' }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#999', fontSize: '12px' }}>
                      {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('id-ID') : '—'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <button
                        onClick={() => handleToggleApprove(u.id, u.is_approved)}
                        style={{
                          fontSize: '11px', padding: '4px 12px', borderRadius: '6px', border: '1px solid',
                          borderColor: u.is_approved ? '#FDECEA' : '#B5D4F4',
                          background: 'transparent',
                          color: u.is_approved ? '#B00020' : '#0344D8',
                          cursor: 'pointer', fontWeight: '500',
                        }}
                      >
                        {u.is_approved ? 'Cabut Akses' : 'Approve'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Matching Tab */}
      {tab === 'matching' && (
        <div>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '4px' }}>Agent Matching — WAG ↔ Transaksi</div>
            <div style={{ fontSize: '12px', color: '#999', lineHeight: '1.6' }}>
              Cocokkan nama member di WAG dengan merchant di data transaksi menggunakan exact/partial match.
              Hasil hanya untuk referensi — tidak mengubah data apapun di database.
              Export CSV berisi member yang berhasil di-match (matched + ambiguous).
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'center' }}>
            <button onClick={runMatching} disabled={matchingLoading}
              style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', background: matchingLoading ? '#999' : '#0344D8', color: '#fff', fontSize: '13px', fontWeight: '500', cursor: matchingLoading ? 'not-allowed' : 'pointer' }}>
              {matchingLoading ? '⟳ Menjalankan...' : matchingDone ? '↺ Jalankan Ulang' : '▶ Jalankan Matching'}
            </button>
            {matchingDone && (
              <button onClick={exportMatchingCSV}
                style={{ padding: '9px 20px', borderRadius: '8px', border: '1px solid #e5e5e5', background: '#fff', color: '#374151', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
                📥 Export CSV
              </button>
            )}
          </div>

          {matchingDone && (
            <>
              {/* Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                {[
                  { label: 'Matched', value: matchedCount, bg: '#EAF3DE', color: '#27500A' },
                  { label: 'Ambiguous', value: ambiguousCount, bg: '#FFF3CD', color: '#856404' },
                  { label: 'No Match', value: noMatchCount, bg: '#F8F9FB', color: '#999' },
                ].map(s => (
                  <div key={s.label} style={{ padding: '12px 16px', borderRadius: '8px', backgroundColor: s.bg, textAlign: 'center' }}>
                    <div style={{ fontSize: '22px', fontWeight: '700', color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: '11px', color: s.color, marginTop: '2px' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Table — hanya matched dan ambiguous */}
              <div style={{ border: '1px solid #e5e5e5', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 100px 80px', padding: '10px 16px', backgroundColor: '#F8F9FB', borderBottom: '1px solid #e5e5e5', fontSize: '11px', fontWeight: '700', color: '#999', letterSpacing: '0.05em' }}>
                  <div>MEMBER WAG</div><div>MERCHANT MATCH</div><div>WAG</div><div style={{ textAlign: 'center' }}>SERIAL</div><div style={{ textAlign: 'center' }}>STATUS</div>
                </div>
                {matchingResults.filter(r => r.match_status !== 'no_match').map((r, i) => {
                  const cfg = matchStatusConfig[r.match_status]
                  return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 100px 80px', padding: '10px 16px', borderBottom: '1px solid #f5f5f5', alignItems: 'center', fontSize: '12px' }}>
                      <div>
                        <div style={{ fontWeight: '500', color: '#111' }}>{r.member_name}</div>
                        <div style={{ color: '#bbb', fontSize: '10px', marginTop: '2px' }}>{r.cleaned_name}</div>
                      </div>
                      <div>
                        <div style={{ fontWeight: '500', color: '#111' }}>{r.matched_merchant ?? '—'}</div>
                        <div style={{ color: '#bbb', fontSize: '10px', marginTop: '2px' }}>{r.match_type} · {r.candidate_count} kandidat</div>
                      </div>
                      <div style={{ color: '#555', fontSize: '11px' }}>{r.r_wag_name}</div>
                      <div style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: '10px', color: '#555' }}>{r.r_serial_number ?? '—'}</div>
                      <div style={{ textAlign: 'center' }}>
                        <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: '600', background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                          {cfg.label}
                        </span>
                      </div>
                    </div>
                  )
                })}
                {matchingResults.filter(r => r.match_status !== 'no_match').length === 0 && (
                  <div style={{ padding: '32px', textAlign: 'center', fontSize: '13px', color: '#999' }}>Tidak ada hasil yang bisa di-match</div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* AI Skill File Tab */}
      {tab === 'skill' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '20px', alignItems: 'start' }}>

          {/* Editor */}
          <div>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '4px' }}>AI Skill File</div>
              <div style={{ fontSize: '12px', color: '#999', lineHeight: '1.6' }}>
                Konteks bisnis yang diinjeksi ke AI Assistant setiap kali ada percakapan baru.
                Edit kapan saja — berlaku langsung di percakapan berikutnya.
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '4px' }}>Nama</label>
              <input
                value={skillName}
                onChange={e => setSkillName(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e5e5', fontSize: '13px', width: '300px', outline: 'none' }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: '#999', display: 'block', marginBottom: '4px' }}>Konten (format Markdown)</label>
              <textarea
                value={skillContent}
                onChange={e => setSkillContent(e.target.value)}
                rows={28}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: '8px',
                  border: '1px solid #e5e5e5', fontSize: '12px', fontFamily: 'monospace',
                  lineHeight: '1.7', outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                onClick={saveSkill}
                disabled={skillLoading}
                style={{
                  padding: '9px 20px', borderRadius: '8px', border: 'none',
                  background: skillLoading ? '#999' : '#0344D8',
                  color: '#fff', fontSize: '13px', fontWeight: '500',
                  cursor: skillLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {skillLoading ? 'Menyimpan...' : 'Simpan'}
              </button>
              {skillSaved && (
                <span style={{ fontSize: '12px', color: '#27500A', fontWeight: '500' }}>
                  ✓ Tersimpan — berlaku di percakapan AI berikutnya
                </span>
              )}
            </div>
          </div>

          {/* Panduan */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

            <div style={{ background: '#F0F5FF', border: '1px solid #B5D4F4', borderRadius: '10px', padding: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#0C447C', marginBottom: '10px' }}>Cara Kerja</div>
              <div style={{ fontSize: '11px', color: '#0C447C', lineHeight: '1.7' }}>
                Isi skill file ini dikirimkan ke AI <strong>setiap kali ada percakapan baru</strong> — sebelum data transaksi dan data WAG. AI akan membaca konteks ini lebih dulu sebelum menjawab pertanyaan apapun.
              </div>
            </div>

            <div style={{ background: '#F8F9FB', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '10px' }}>Apa yang Sebaiknya Ditulis</div>
              {[
                { title: 'Konteks bisnis', desc: 'Siapa Arranet, bagaimana model bisnisnya, apa tujuan platform AMARIS' },
                { title: 'Definisi istilah', desc: 'Arti kata-kata internal yang spesifik: Ranger, PIC, bucket, fee, lini 3.500, dll' },
                { title: 'Struktur organisasi', desc: 'Hierarki Mitra → PIC/Ranger → Agen, siapa yang bertanggung jawab apa' },
                { title: 'Singkatan Mitra', desc: 'GMS = CV. Griya Mitra Sejahtera, MAJU = PT. Meraki Jaya Usaha, dll' },
                { title: 'Aturan interpretasi', desc: 'Kalau ditanya "agen paling produktif" artinya apa, dll' },
                { title: 'Info yang tidak ada di data', desc: 'Target bulanan, kebijakan fee baru, konteks khusus periode tertentu' },
              ].map(item => (
                <div key={item.title} style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: '#374151' }}>{item.title}</div>
                  <div style={{ fontSize: '11px', color: '#999', marginTop: '2px', lineHeight: '1.5' }}>{item.desc}</div>
                </div>
              ))}
            </div>

            <div style={{ background: '#F8F9FB', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#333', marginBottom: '10px' }}>Tips Format</div>
              <div style={{ fontSize: '11px', color: '#555', lineHeight: '1.7', fontFamily: 'monospace', background: '#fff', padding: '10px', borderRadius: '6px', border: '1px solid #e5e5e5' }}>
                {'# Judul Bagian'}<br />
                {'## Sub-bagian'}<br />
                {'- Poin penting'}<br />
                {'- **Teks tebal** untuk istilah'}<br />
                <br />
                {'Deskripsi biasa di sini...'}
              </div>
              <div style={{ fontSize: '11px', color: '#999', marginTop: '8px', lineHeight: '1.5' }}>
                Gunakan heading (#, ##) untuk struktur yang jelas. AI membaca konten ini dari atas ke bawah.
              </div>
            </div>

          </div>
        </div>
      )}

    </Layout>
  )
}
