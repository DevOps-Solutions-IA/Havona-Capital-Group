'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  BriefcaseBusiness,
  CheckSquare2,
  ChevronDown,
  Columns3,
  FileClock,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  UserRound,
  UserSearch,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { BrandMark } from './brand-mark';
const links = [
  { href: '/dashboard', label: 'Resumen', icon: LayoutDashboard },
  {
    href: '/crm',
    label: 'Pulso comercial',
    icon: BriefcaseBusiness,
    permission: 'crm.read_assigned',
  },
  {
    href: '/crm/prospectos',
    label: 'Relaciones',
    icon: UserSearch,
    permission: 'crm.read_assigned',
  },
  { href: '/crm/pipeline', label: 'Pipeline', icon: Columns3, permission: 'crm.read_assigned' },
  { href: '/crm/tareas', label: 'Tareas', icon: CheckSquare2, permission: 'crm.tasks.own' },
  { href: '/usuarios', label: 'Usuarios', icon: Users, permission: 'users.read' },
  { href: '/roles', label: 'Roles y permisos', icon: ShieldCheck, permission: 'roles.read' },
  { href: '/auditoria', label: 'Auditoría', icon: FileClock, permission: 'audit.read' },
  { href: '/configuracion', label: 'Configuración', icon: Settings, permission: 'settings.read' },
];
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout, can } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(false);
  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [loading, user, router, path]);
  if (loading)
    return (
      <div className="grid min-h-screen place-items-center">
        <Activity className="size-7 animate-pulse text-brand-700" />
        <span className="sr-only">Validando sesión</span>
      </div>
    );
  if (!user) return null;
  const nav = links.filter((item) => !item.permission || can(item.permission));
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[270px_1fr]">
      <button
        onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-30 rounded-xl bg-white p-2.5 shadow lg:hidden"
        aria-label="Abrir menú"
      >
        <Menu />
      </button>
      <AnimatePresence>
        {open && (
          <motion.button
            aria-label="Cerrar menú"
            className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[270px] border-r border-white/10 bg-brand-800 p-5 text-white transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="mb-10 flex items-center justify-between">
          <BrandMark href="/dashboard" className="shell-brand" inverse />
          <button onClick={() => setOpen(false)} className="p-2 lg:hidden" aria-label="Cerrar menú">
            <X />
          </button>
        </div>
        <nav aria-label="Navegación principal" className="grid gap-1">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              onClick={() => setOpen(false)}
              key={href}
              href={href}
              aria-current={
                path === href || (href !== '/crm' && path.startsWith(href)) ? 'page' : undefined
              }
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition ${path === href || (href !== '/crm' && path.startsWith(href)) ? 'bg-white text-brand-800 shadow' : 'text-blue-100 hover:bg-white/10 hover:text-white'}`}
            >
              <Icon className="size-[18px]" />
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 lg:col-start-2">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-end border-b border-slate-200/70 bg-white/80 px-5 backdrop-blur lg:px-8">
          <div className="relative">
            <button
              onClick={() => setProfile((v) => !v)}
              aria-expanded={profile}
              className="flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-slate-100"
            >
              <span className="grid size-9 place-items-center rounded-full bg-brand-50 font-semibold text-brand-700">
                {user.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden sm:block">
                <span className="block text-sm font-semibold text-slate-900">{user.name}</span>
                <span className="block max-w-44 truncate text-xs text-slate-500">{user.email}</span>
              </span>
              <ChevronDown className="size-4" />
            </button>
            {profile && (
              <div className="absolute right-0 mt-2 w-52 rounded-xl border bg-white p-1.5 shadow-xl">
                <Link
                  onClick={() => setProfile(false)}
                  href="/perfil"
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <UserRound className="size-4" />
                  Mi perfil
                </Link>
                <button
                  onClick={() => void logout()}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                >
                  <LogOut className="size-4" />
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] p-5 pt-8 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
