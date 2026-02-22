import { House, ChartBar, BookOpen } from "@phosphor-icons/react";
import { APP_VERSION_LABEL } from '@/config/version';

interface NavbarProps {
  currentPage: string;
  onNavigatePage: (page: 'home' | 'reports' | 'docs') => void;
}

export const Navbar = ({ currentPage, onNavigatePage }: NavbarProps) => (
  <nav className="h-12 flex items-center justify-between px-6 border-b border-white/[0.06] bg-[#000000] z-50">
    <div className="flex items-center gap-8">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold text-white tracking-tight">
          WebSim<span className="text-tropicalTeal">Bench</span>
        </h1>
      </div>

      <div className="flex items-center gap-1">
        <NavButton
          active={currentPage === 'home'}
          onClick={() => onNavigatePage('home')}
          icon={<House size={18} />}
          label="Home"
        />
        <NavButton
          active={currentPage === 'docs'}
          onClick={() => onNavigatePage('docs')}
          icon={<BookOpen size={18} />}
          label="Docs"
        />
        <NavButton
          active={currentPage === 'reports'}
          onClick={() => onNavigatePage('reports')}
          icon={<ChartBar size={18} />}
          label="Reports"
        />
      </div>
    </div>
    <div className="flex items-center gap-4 text-xs font-medium text-gray-400">
      <span className="bg-white/[0.04] px-2 py-1 rounded">{APP_VERSION_LABEL}</span>
    </div>
  </nav>
);

const NavButton = ({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all duration-200 text-sm font-medium ${active
      ? 'bg-tropicalTeal/10 text-tropicalTeal'
      : 'text-gray-400 hover:text-white hover:bg-white/5'
      }`}
  >
    {icon}
    {label}
  </button>
);
