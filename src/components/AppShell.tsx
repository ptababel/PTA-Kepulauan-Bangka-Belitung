import { useEffect, useState, type ReactNode } from 'react';
import {
  FileSpreadsheet,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Users,
  Utensils,
  X,
} from 'lucide-react';
import type { AuthUser, NavTab } from '../types';
import { formatIndonesianDate, getWibDateString, getWibDateTimeString } from '../utils/wib';
import { LogoBadge } from './LogoBadge';

interface AppShellProps {
  user: AuthUser;
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onLogout: () => void;
  children: ReactNode;
}

interface NavItemConfig {
  id: NavTab;
  label: string;
  adminOnly?: boolean;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: NavItemConfig[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'penerimaan', label: 'Penerimaan Makanan', icon: Utensils },
  { id: 'pegawai', label: 'Kelola Pegawai', adminOnly: true, icon: Users },
  { id: 'riwayat', label: 'Riwayat Penerimaan', icon: History },
  { id: 'rekapitulasi', label: 'Rekapitulasi & Ekspor', icon: FileSpreadsheet },
];

export function AppShell({
  user,
  activeTab,
  onSelectTab,
  onLogout,
  children,
}: AppShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [wibClock, setWibClock] = useState(() => {
    const dt = getWibDateTimeString();
    return {
      date: formatIndonesianDate(getWibDateString()),
      time: dt.split(' ')[1] ?? '00:00:00',
    };
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const dt = getWibDateTimeString();
      setWibClock({
        date: formatIndonesianDate(getWibDateString()),
        time: dt.split(' ')[1] ?? '00:00:00',
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const visibleNav = NAV_ITEMS.filter((item) => !item.adminOnly || user.role === 'admin');
  const currentTitle = visibleNav.find((n) => n.id === activeTab)?.label ?? 'Dashboard';

  function handleNavClick(tab: NavTab) {
    onSelectTab(tab);
    setMobileMenuOpen(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white border-r border-slate-200 z-30">
        <div className="px-5 py-5 border-b border-slate-200 flex items-center gap-3">
          <LogoBadge size="sm" />
          <div className="min-w-0">
            <div className="font-display font-bold text-base text-slate-900 truncate">
              Absen MBB
            </div>
            <div className="text-xs text-slate-500 truncate">PTA Kep. Bangka Belitung</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Menu Utama">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-emerald-800 text-white'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 bg-slate-50/70">
          <div className="mb-3">
            <div className="text-sm font-semibold text-slate-900 truncate">{user.nama_lengkap}</div>
            <div className="text-xs text-slate-500">
              {user.role === 'admin' ? 'Administrator' : 'Petugas Pembagian'} · @{user.username}
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="w-full min-h-[40px] flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Keluar
          </button>
        </div>
      </aside>

      {/* Mobile / Tablet Slide-over Navigation */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-72 max-w-[85vw] bg-white h-full flex flex-col border-r border-slate-200 z-10">
            <div className="px-4 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <LogoBadge size="sm" />
                <div className="min-w-0">
                  <div className="font-display font-bold text-sm text-slate-900 truncate">
                    Absen MBB
                  </div>
                  <div className="text-xs text-slate-500 truncate">PTA Kep. Babel</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Tutup menu navigasi"
                className="p-2 text-slate-500 hover:text-slate-900 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Menu Mobile">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full min-h-[44px] flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-emerald-800 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="p-4 border-t border-slate-200">
              <div className="mb-3">
                <div className="text-sm font-semibold text-slate-900 truncate">
                  {user.nama_lengkap}
                </div>
                <div className="text-xs text-slate-500">
                  {user.role === 'admin' ? 'Administrator' : 'Petugas Pembagian'}
                </div>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Keluar
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar (3-zone contract, <= 56px on mobile) */}
        <header className="sticky top-0 z-20 h-14 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Buka menu navigasi"
              className="lg:hidden p-2 -ml-2 text-slate-700 hover:bg-slate-100 rounded-lg min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-display font-semibold text-base sm:text-lg text-slate-900 truncate">
              {currentTitle}
            </h1>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-slate-600 font-mono tabular-nums whitespace-nowrap shrink-0">
            <span>{wibClock.date}</span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-slate-900">{wibClock.time} WIB</span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline text-xs text-slate-600 whitespace-nowrap">
              {user.role === 'admin' ? 'Admin' : 'Petugas'}:{' '}
              <strong className="text-slate-900">{user.nama_lengkap}</strong>
            </span>
            <button
              type="button"
              onClick={onLogout}
              className="lg:hidden px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 whitespace-nowrap shrink-0"
            >
              Keluar
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
