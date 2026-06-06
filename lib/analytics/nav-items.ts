// Tambahkan item ini ke array navigasi di components/Layout.tsx
// Cari bagian navItems atau menu items yang sudah ada, tambahkan:
//
// { label: 'Morning Brief', href: '/analytics', icon: '📊' },
// { label: 'Upload Data', href: '/analytics/upload', icon: '⬆️', adminOnly: true },
//
// Atau lihat contoh lengkap di bawah jika ingin referensi struktur menu

export const analyticsNavItems = [
  { label: 'Morning Brief', href: '/analytics' },
  { label: 'Upload Data',   href: '/analytics/upload', adminOnly: true },
]
