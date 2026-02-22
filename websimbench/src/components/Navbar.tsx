import { House, ChartBar, BookOpen } from "@phosphor-icons/react";
import { APP_VERSION_LABEL } from '@/config/version';

interface NavbarProps {
  currentPage: string;
  onNavigatePage: (page: 'home' | 'reports' | 'docs') => void;
}

export const Navbar = ({ currentPage, onNavigatePage }: NavbarProps) => (
  <nav className="navbar">
    <div className="navbar-left">
      <div className="navbar-brand">
        <h1 className="navbar-brand-text">
          WebSim<span className="text-tropicalTeal">Bench</span>
        </h1>
      </div>

      <div className="navbar-nav">
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
          label="Agentyx"
        />
        <NavButton
          active={currentPage === 'reports'}
          onClick={() => onNavigatePage('reports')}
          icon={<ChartBar size={18} />}
          label="Reports"
        />
      </div>
    </div>
    <div className="navbar-version">
      <span className="navbar-version-badge">{APP_VERSION_LABEL}</span>
    </div>
  </nav>
);

const NavButton = ({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) => (
  <button
    onClick={onClick}
    className={`nav-btn ${active ? 'active' : ''}`}
  >
    {icon}
    {label}
  </button>
);
