import { ChartLine, House, ChartBar, Gear } from "@phosphor-icons/react";

interface NavbarProps {
  currentPage: string;
  setCurrentPage: (page: string) => void;
}

export const Navbar = ({ currentPage, setCurrentPage }: NavbarProps) => (
  <nav className="h-[60px] flex items-center justify-between px-6 border-b border-white/10 bg-black/60 backdrop-blur-md z-50">
    <div className="flex items-center gap-8">
      <div className="flex items-center gap-3">
        <div className="bg-tropicalTeal p-1.5 rounded-lg shadow-lg shadow-tropicalTeal/20">
          <ChartLine size={24} weight="bold" className="text-jetBlack" />
        </div>
        <h1 className="text-xl font-bold text-white tracking-tight">
          WebSim<span className="text-tropicalTeal">Bench</span>
        </h1>
      </div>

      <div className="flex items-center gap-1">
        <NavButton
          active={currentPage === 'home'}
          onClick={() => setCurrentPage('home')}
          icon={<House size={18} />}
          label="Home"
        />
        <NavButton
          active={currentPage === 'reports'}
          onClick={() => setCurrentPage('reports')}
          icon={<ChartBar size={18} />}
          label="Reports"
        />
        <NavButton
          active={currentPage === 'options'}
          onClick={() => setCurrentPage('options')}
          icon={<Gear size={18} />}
          label="Options"
        />
      </div>
    </div>
    <div className="flex items-center gap-4 text-xs font-medium text-gray-400">
      <span className="bg-white/5 px-2 py-1 rounded">v0.1.0</span>
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
