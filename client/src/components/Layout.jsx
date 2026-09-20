import { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Award,
  Bell,
  Bot,
  BrainCircuit,
  Briefcase,
  Calendar,
  ChevronDown,
  Code2,
  Compass,
  FileBarChart,
  FolderKanban,
  GraduationCap,
  Home,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Modern Layout — EduPath 2.0
 *
 * Left Sidebar (Dark Navy #0B132B) + Top Header with Search & User Dropdown + Light Content Area.
 */

const NAV_GROUPS = [
  {
    title: 'LEARNING',
    items: [
      { to: '/home', label: 'Home', icon: Home },
      { to: '/skill-passport', label: 'Skill Passport', icon: ShieldCheck },
      { to: '/skill-gaps', label: 'Skill Gaps', icon: BrainCircuit },
      { to: '/plans', label: 'Roadmap', icon: FolderKanban },
      { to: '/weekly-planner', label: 'Weekly Planner', icon: Calendar },
      { to: '/assessments', label: 'Assessments', icon: GraduationCap },
    ],
  },
  {
    title: 'AI TOOLS',
    items: [
      { to: '/ai-tutor', label: 'AI Tutor', icon: GraduationCap },
      { to: '/interview-coach', label: 'Interview Coach', icon: Briefcase },
      { to: '/project-analyzer', label: 'Projects', icon: Code2 },
      { to: '/certificate-analyzer', label: 'Certificates', icon: Award },
      { to: '/simulator', label: 'What-If Simulator', icon: Compass },
    ],
  },
  {
    title: 'PROGRESS',
    items: [
      { to: '/progress-report', label: 'Reports', icon: FileBarChart },
      { to: '/careers', label: 'Explore Careers', icon: Compass },
    ],
  },
  {
    title: 'ACCOUNT',
    items: [
      { to: '/profile', label: 'Settings', icon: Settings },
    ],
  },
];

const PUBLIC_NAV = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/careers', label: 'Explore Careers', icon: Compass },
  { to: '/about', label: 'About', icon: GraduationCap },
];

export default function Layout({ children }) {
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userDropdown, setUserDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  const closeSidebar = () => setSidebarOpen(false);

  function handleSearchSubmit(e) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    navigate(`/ai-agent?q=${encodeURIComponent(searchQuery)}`);
    setSearchQuery('');
  }

  // Public visitor view
  if (!user) {
    return (
      <div className="min-h-screen bg-paper flex flex-col">
        <header className="sticky top-0 z-30 border-b border-rule bg-card/90 backdrop-blur">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
            <Link to="/" className="flex items-center gap-2.5 font-display text-xl font-bold text-ink">
              <div className="w-9 h-9 rounded-xl bg-effort flex items-center justify-center text-white shadow-sm">
                <GraduationCap size={20} />
              </div>
              <span>Edu<span className="text-effort">Path</span></span>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              {PUBLIC_NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `px-3.5 py-2 rounded-lg font-display text-sm font-medium transition-colors ${
                      isActive ? 'bg-panel text-effort font-semibold' : 'text-ink-soft hover:text-ink'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="flex items-center gap-3">
              <Link to="/sign-in" className="btn-quiet">Login</Link>
              <Link to="/sign-up" className="btn-accent">Get Started</Link>
            </div>
          </div>
        </header>

        <main key={location.pathname} className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
          {children}
        </main>

        <footer className="border-t border-rule bg-card py-6 text-center text-xs text-ink-faint">
          <p>EduPath 2.0 — Your adaptive AI learning journey.</p>
        </footer>
      </div>
    );
  }

  // Authenticated Learner Dashboard View
  return (
    <div className="min-h-screen bg-paper text-ink flex flex-col md:flex-row">
      {/* Mobile Drawer Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-navy/60 backdrop-blur-sm md:hidden"
          onClick={closeSidebar}
        />
      )}

      {/* LEFT SIDEBAR (Dark Navy #0B132B) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-navy text-slate-300 border-r border-navy-rule flex flex-col transition-transform duration-200 ease-in-out md:static md:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-6 border-b border-navy-rule flex items-center justify-between">
          <Link to="/home" className="flex items-center gap-2.5 font-display text-xl font-bold text-white" onClick={closeSidebar}>
            <div className="w-8 h-8 rounded-lg bg-effort flex items-center justify-center text-white">
              <GraduationCap size={18} />
            </div>
            <span>Edu<span className="text-effort">Path</span></span>
          </Link>
          <button
            type="button"
            onClick={closeSidebar}
            className="md:hidden text-slate-400 hover:text-white p-1"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="px-3 text-[11px] font-mono font-semibold text-slate-400 uppercase tracking-wider mb-2">
                {group.title}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      onClick={closeSidebar}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                          isActive
                            ? 'bg-effort text-white font-semibold shadow-sm'
                            : 'text-slate-300 hover:bg-navy-soft hover:text-white'
                        }`
                      }
                    >
                      <Icon size={16} className="shrink-0" />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom AI Assistant Widget */}
        <div className="p-4 m-3 rounded-xl bg-gradient-to-br from-navy-card to-navy-soft border border-navy-rule text-slate-200">
          <div className="flex items-center gap-2 text-xs font-semibold text-white mb-1">
            <Sparkles size={14} className="text-effort shrink-0" />
            <span>AI Learning Agent</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-normal mb-3">
            Ask anything about your roadmap, skill gaps, or learning steps.
          </p>
          <Link
            to="/ai-agent"
            onClick={closeSidebar}
            className="btn-accent text-xs w-full py-1.5 font-semibold text-center block rounded-md"
          >
            Ask AI Agent &rarr;
          </Link>
        </div>
      </aside>

      {/* MAIN CONTAINER */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* TOP HEADER */}
        <header className="sticky top-0 z-30 h-16 bg-card border-b border-rule px-4 sm:px-6 flex items-center justify-between gap-4 shadow-sm">
          {/* Left: Mobile Toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="md:hidden text-ink-soft hover:text-ink p-1.5 rounded-lg hover:bg-panel"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
          </div>

          {/* Center: Global Search Box */}
          <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md mx-auto hidden sm:block">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search skills, resources, or ask EduPath..."
                className="w-full bg-paper border border-rule rounded-xl pl-9 pr-4 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-effort focus:outline-none"
              />
            </div>
          </form>

          {/* Right: Notifications & Profile Dropdown */}
          <div className="flex items-center gap-3">
            <Link
              to="/ai-agent"
              className="relative p-2 rounded-lg text-ink-soft hover:text-ink hover:bg-panel transition-colors"
              title="Notifications"
            >
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-effort" />
            </Link>

            {/* Profile Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserDropdown((prev) => !prev)}
                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-panel transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-full bg-effort/10 border border-effort/20 flex items-center justify-center font-display text-xs font-bold text-effort">
                  {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <div className="hidden lg:block min-w-0">
                  <p className="text-xs font-semibold text-ink leading-tight truncate">{user.name}</p>
                  <p className="text-[10px] text-ink-faint truncate">{user.email}</p>
                </div>
                <ChevronDown size={14} className="text-ink-faint" />
              </button>

              {userDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-card border border-rule rounded-xl shadow-lg py-1.5 z-50 text-xs">
                  <div className="px-3 py-2 border-b border-rule lg:hidden">
                    <p className="font-semibold text-ink">{user.name}</p>
                    <p className="text-[10px] text-ink-faint">{user.email}</p>
                  </div>
                  <Link
                    to="/profile"
                    onClick={() => setUserDropdown(false)}
                    className="flex items-center gap-2 px-3 py-2 text-ink-soft hover:text-ink hover:bg-panel"
                  >
                    <Settings size={14} />
                    Settings & Profile
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setUserDropdown(false);
                      signOut();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-warn hover:bg-panel text-left"
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* MAIN PAGE CONTENT */}
        <main key={location.pathname} className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
          {children}
        </main>

        <footer className="border-t border-rule bg-card py-4">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap gap-x-6 gap-y-2 justify-between text-xs text-ink-faint">
            <p>EduPath 2.0 — Deterministic Prerequisite Graph + Adaptive AI Engine</p>
            <Link to="/about" className="hover:text-ink">
              How it works
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
