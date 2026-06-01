import { useState, useEffect } from 'react'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'

type Wag = { id: string; name: string; description: string; status: string; created_at: string }
type Ranger = { id: string; wag_id: string; full_name: string; display_name: string; phone_number: string; status: string }
type User = { id: string; email: string; full_name: string; role: string; last_login_at: string }

export default function ConfigPage() {
  const [tab, setTab] = useState<'wag' | 'ranger' | 'users'>('wag')
  const [wags, setWags] = useState<Wag[]>([])
  const [rangers, setRangers] = useState<Ranger[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [showWagForm, setShowWagForm] = useState(false)
  const [showRangerForm, setShowRangerForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState({ text: '', type: '' })

  // WAG form
  const [wagName, setWagName] = useState('')
  const [wagDesc, setWagDesc] = useState('')

  // Ranger form
  const [rangerFullName, setRangerFullName] = useState('')
  const [rangerDisplayName, setRangerDisplayName] = useState('')
  const [rangerPhone, setRangerPhone] = useState('')
  const [rangerWagId, setRangerWagId] = useState('')

  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    const [wagRes, rangerRes, userRes] = await Promise.all([
      supabase.from('wags').select('*').order('created_at', { ascending: false }),
      supabase.from('rangers').select('*').order('created_at', { ascending: false }),
      supabase.from('users').select('*').order('created_at', { ascending: false }),
    ])
    if (wagRes.data) setWags(wagRes.data)
    if (rangerRes.data) setRangers(rangerRes.data)
    if (userRes.data) setUsers(userRes.data)
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
    setWagName(''); setWagDesc(''); setShowWagForm(false)
    fetchAll()
  }

  const handleAddRanger = async () => {
    if (!rangerFullName.trim()) { showMsg('Nama lengkap wajib diisi', 'error'); return }
    if (!rangerDisplayName.trim()) { showMsg('Nama display di WAG wajib diisi', 'error'); return }
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
    setShowRangerForm(false)
    fetchAll()
  }

  const handleDeactivateWag = async (id: string) => {
    await supabase.from('wags').update({ status: 'inactive' }).eq('id', id)
    fetchAll()
  }

  const handleDeactivateRanger = async (id: string) => {
    await supabase.from('rangers').update({ status: 'inactive' }).eq('id', id)
    fetchAll()
  }

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #e5e5e5',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  }

  const tabs = [
    { key: 'wag', label: 'WAG' },
    { key: 'ranger', label: 'Ranger' },
    { key: 'users', label: 'Akun Pengguna' },
  ]

  return (
    <Layout title="Konfigurasi">

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: '#F8F9FB', padding: '4px', borderRadius: '10px', width: 'fit-content', border: '1px solid #e5e5e5' }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as 'wag' | 'ranger' | 'users')}
            style={{
              padding: '7px 20px',
              borderRadius: '8px',
              border: 'none',
              background: tab === t.key ? '#FFFFFF' : 'transparent',
              color: tab === t.key ? '#000000' : '#999',
              fontSize: '13px',
              fontWeight: tab === t.key ? '500' : '400',
              cursor: 'pointer',
              boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Message */}
      {message.text && (
        <div style={{
          padding: '10px 14px',
          borderRadius: '8px',
          fontSize: '12px',
          marginBottom: '16px',
          background: message.type === 'success' ? '#EAF3DE' : '#FDECEA',
          color: message.type === 'success' ? '#27500A' : '#B00020',
        }}>
          {message.text}
        </div>
      )}

      {/* WAG Tab */}
      {tab === 'wag' && (
        <div>
          <button
            onClick={() => setShowWagForm(!showWagForm)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', border: '1px solid #e5e5e5', background: '#FFFFFF', fontSize: '13px', cursor: 'pointer', marginBottom: '14px', fontWeight: '500' }}
          >
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
                <button onClick={() => setShowWagForm(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #e5e5e5', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
                  Batal
                </button>
              </div>
            </div>
          )}

          <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
                  {['Nama WAG', 'Deskripsi', 'Status', 'Dibuat', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', color: '#999', fontWeight: '500' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {wags.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: '#999', fontSize: '13px' }}>Belum ada WAG — tambahkan WAG pertama</td></tr>
                )}
                {wags.map(w => (
                  <tr key={w.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={{ padding: '12px 14px', fontWeight: '500' }}>{w.name}</td>
                    <td style={{ padding: '12px 14px', color: '#999' }}>{w.description || '—'}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '999px', background: w.status === 'active' ? '#EAF3DE' : '#F8F9FB', color: w.status === 'active' ? '#27500A' : '#999' }}>
                        {w.status === 'active' ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#999', fontSize: '12px' }}>{new Date(w.created_at).toLocaleDateString('id-ID')}</td>
                    <td style={{ padding: '12px 14px' }}>
                      {w.status === 'active' && (
                        <button onClick={() => handleDeactivateWag(w.id)} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: '1px solid #FDECEA', background: 'transparent', color: '#B00020', cursor: 'pointer' }}>
                          Nonaktifkan
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ranger Tab */}
      {tab === 'ranger' && (
        <div>
          <button
            onClick={() => setShowRangerForm(!showRangerForm)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', border: '1px solid #e5e5e5', background: '#FFFFFF', fontSize: '13px', cursor: 'pointer', marginBottom: '14px', fontWeight: '500' }}
          >
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
                  <input style={inputStyle} placeholder="cth: Auditto" value={rangerDisplayName} onChange={e => setRangerDisplayName(e.target.value)} />
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
              <div style={{ fontSize: '11px', color: '#FFC128', background: '#FFF8E1', padding: '8px 12px', borderRadius: '6px', marginBottom: '12px' }}>
                ⚠ Nama display harus sama persis dengan nama yang muncul di export chat WhatsApp
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleAddRanger} disabled={loading} style={{ padding: '8px 20px', background: '#0344D8', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
                  {loading ? 'Menyimpan...' : 'Simpan Ranger'}
                </button>
                <button onClick={() => setShowRangerForm(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #e5e5e5', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
                  Batal
                </button>
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
                {rangers.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: '#999', fontSize: '13px' }}>Belum ada Ranger — tambahkan Ranger pertama</td></tr>
                )}
                {rangers.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
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
                      {r.status === 'active' && (
                        <button onClick={() => handleDeactivateRanger(r.id)} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: '1px solid #FDECEA', background: 'transparent', color: '#B00020', cursor: 'pointer' }}>
                          Nonaktifkan
                        </button>
                      )}
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
          <div style={{ background: '#FFFFFF', border: '1px solid #e5e5e5', borderRadius: '10px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e5e5e5' }}>
                  {['Email', 'Nama', 'Role', 'Login Terakhir'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', color: '#999', fontWeight: '500' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: '12px', color: '#999', marginTop: '12px' }}>
            Untuk menambah pengguna baru: minta mereka login dulu via Google, lalu update role di Supabase SQL Editor.
          </div>
        </div>
      )}

    </Layout>
  )
}
