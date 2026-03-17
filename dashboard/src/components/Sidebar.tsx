import React, { useState } from 'react';
import Image from 'next/image';
import { LayoutDashboard, Settings, LogOut, FileClock, User, ChevronRight, ChevronsLeft, Menu } from 'lucide-react';

interface SidebarSession {
  sessionId: string;
  timestamp: number;
}

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  onLogout: () => void;
  userName: string;
  userEmail: string;
  pastSessions?: SidebarSession[];
  onSessionSelect?: (sessionId: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange, onLogout, userName, userEmail, pastSessions = [], onSessionSelect }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navItems = [
    { label: 'Dashboard', icon: <LayoutDashboard size={20} />, view: 'OVERVIEW' },
  ];

  return (
    <aside className={`${isCollapsed ? 'w-20' : 'w-64 md:w-72 lg:w-80'} bg-slate-900 border-r border-slate-800 flex flex-col h-screen shrink-0 transition-all duration-300 ease-in-out relative`}>
      <div className={`h-22 border-b border-slate-800/50 flex items-center ${isCollapsed ? 'justify-center px-2' : 'justify-between px-4 sm:px-6 lg:px-8'}`}>
        {!isCollapsed && (
          <Image src="/techmed-logo-stacked.svg" alt="TechMed Logo" width={120} height={50} className="h-10 w-auto opacity-90" />
        )}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800/50 transition-colors cursor-pointer shrink-0"
          title={isCollapsed ? "Sidebar ausklappen" : "Sidebar einklappen"}
        >
          {isCollapsed ? <Menu size={20} /> : <ChevronsLeft size={20} />}
        </button>
      </div>

      <nav className="flex-1 py-6 flex flex-col gap-2 px-4">
        <div className={`px-3 mb-2 text-xs font-semibold tracking-wider text-slate-500 uppercase ${isCollapsed ? 'hidden' : ''}`}>
          Navigation
        </div>
        {navItems.map((item) => {
          const isActive = activeView === item.view;
          return (
            <button
              key={item.view}
              onClick={() => onViewChange(item.view)}
              title={isCollapsed ? item.label : undefined}
              className={`flex items-center ${isCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'} rounded-xl transition-all font-medium text-sm text-left w-full cursor-pointer ${
                isActive 
                  ? 'bg-primary/10 text-primary border border-primary/20' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
              }`}
            >
              <span className={isActive ? 'text-primary' : 'text-slate-400 group-hover:text-slate-200'}>
                {item.icon}
              </span>
              {!isCollapsed && <span>{item.label}</span>}
            </button>
          );
        })}

        <div className={`mt-6 px-3 mb-2 text-xs font-semibold tracking-wider text-slate-500 uppercase ${isCollapsed ? 'hidden' : ''}`}>
          Recent Sessions
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
          {pastSessions.slice(0, 10).map((session) => (
            <button
              key={session.sessionId}
              onClick={() => onSessionSelect && onSessionSelect(session.sessionId)}
              title={isCollapsed ? new Date(session.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : undefined}
              className={`group flex items-center ${isCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-2.5'} rounded-xl transition-all font-medium text-sm text-left w-full truncate cursor-pointer
                text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent
              `}
            >
              <span className="text-slate-500 shrink-0">
                <FileClock size={16} />
              </span>
              {!isCollapsed && (
                <>
                  <span className="truncate flex-1">
                    {new Date(session.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <ChevronRight size={14} className="text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </>
              )}
            </button>
          ))}
          {pastSessions.length === 0 && (
            <div className={`px-4 py-2 text-xs text-slate-600 italic ${isCollapsed ? 'hidden' : ''}`}>No past sessions</div>
          )}
        </div>
      </nav>

      <div className="border-t border-slate-800/50 flex flex-col gap-2 py-4 px-4">
        <button
          onClick={() => onViewChange('SETTINGS')}
          title={isCollapsed ? 'Settings' : undefined}
          className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} px-4 py-3 rounded-xl transition-all font-medium text-sm text-left w-full cursor-pointer ${
            activeView === 'SETTINGS'
              ? 'bg-primary/10 text-primary border border-primary/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
          }`}
        >
          <Settings size={20} className={activeView === 'SETTINGS' ? 'text-primary' : 'text-slate-400'} />
          {!isCollapsed && <span>Settings</span>}
        </button>

        <div 
          title={isCollapsed ? userName : undefined}
          className={`group flex items-center ${isCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'} rounded-xl font-medium text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-all w-full cursor-default`}
        >
          <User size={20} className="text-slate-400 group-hover:text-slate-200 transition-colors shrink-0" />
          {!isCollapsed && (
            <div className="flex flex-col gap-0.5 overflow-hidden">
              <span className="truncate">{userName}</span>
            </div>
          )}
        </div>

        <button
          onClick={onLogout}
          title={isCollapsed ? 'Log Out' : undefined}
          className={`flex items-center ${isCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'} text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 rounded-xl transition-all cursor-pointer text-left w-full border border-transparent`}
        >
          <LogOut size={20} className="text-slate-400 shrink-0" />
          {!isCollapsed && <span>Log Out</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;