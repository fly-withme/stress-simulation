import React, { useState } from 'react';
import { LayoutDashboard, Settings, LogOut, FileClock, User, ChevronRight, ChevronsLeft, Menu, Brain } from 'lucide-react';

interface SidebarSession {
  sessionId: string;
  timestamp: number;
  sessionName?: string;
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

const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange, onLogout, userName, pastSessions = [], onSessionSelect }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navItems = [
    { label: 'Dashboard', icon: <LayoutDashboard size={20} />, view: 'OVERVIEW' },
  ];

  return (
    <aside className={`${isCollapsed ? 'w-20' : 'w-64 md:w-72 lg:w-80'} bg-slate-50 border-r border-slate-200 flex flex-col h-screen shrink-0 transition-all duration-300 ease-in-out relative overflow-hidden`}>
      <div className={`h-(--header-height) min-h-(--header-height) border-b border-slate-200/50 flex items-center ${isCollapsed ? 'justify-center px-2' : 'justify-between px-4 sm:px-6 lg:px-8'}`}>
        {!isCollapsed && (
          <span className="inline-flex items-center gap-2 text-2xl font-extrabold tracking-tight text-primary">
            <Brain className="w-6 h-6 text-primary" />
            BioTrace
          </span>
        )}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-primary hover:text-primary-hover p-2 rounded-xl hover:bg-secondary transition-colors cursor-pointer shrink-0"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <Menu size={20} /> : <ChevronsLeft size={20} />}
        </button>
      </div>

      <nav className="flex-1 min-h-0 py-6 flex flex-col gap-2 px-4 overflow-hidden">
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
                  : 'text-primary hover:text-primary-hover hover:bg-secondary border border-transparent'
              }`}
            >
              <span className={isActive ? 'text-primary' : 'text-primary group-hover:text-primary-hover'}>
                {item.icon}
              </span>
              {!isCollapsed && <span>{item.label}</span>}
            </button>
          );
        })}

        <div className={`mt-6 px-3 mb-2 text-xs font-semibold tracking-wider text-slate-500 uppercase ${isCollapsed ? 'hidden' : ''}`}>
          Recent Sessions
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
          {pastSessions.slice(0, 10).map((session) => (
            <button
              key={session.sessionId}
              onClick={() => onSessionSelect && onSessionSelect(session.sessionId)}
              title={isCollapsed ? (session.sessionName || new Date(session.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })) : undefined}
              className={`group flex items-center ${isCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-2.5'} rounded-xl transition-all font-medium text-sm text-left w-full truncate cursor-pointer
                text-primary hover:text-primary-hover hover:bg-secondary border border-transparent
              `}
            >
              <span className="text-primary/80 shrink-0">
                <FileClock size={16} />
              </span>
              {!isCollapsed && (
                <>
                  <div className="truncate flex-1 flex flex-col leading-tight">
                    <span className="truncate">{session.sessionName || 'Session'}</span>
                    <span className="truncate text-[11px] text-primary/70 font-normal">
                      {new Date(session.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <ChevronRight size={14} className="text-primary/70 opacity-0 group-hover:opacity-100 transition-opacity" />
                </>
              )}
            </button>
          ))}
          {pastSessions.length === 0 && (
            <div className={`px-4 py-2 text-xs text-slate-600 italic ${isCollapsed ? 'hidden' : ''}`}>No past sessions</div>
          )}
        </div>
      </nav>

      <div className="border-t border-slate-200/50 flex flex-col gap-2 py-4 px-4">
        <button
          onClick={() => onViewChange('SETTINGS')}
          title={isCollapsed ? 'Settings' : undefined}
          className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} px-4 py-3 rounded-xl transition-all font-medium text-sm text-left w-full cursor-pointer ${
            activeView === 'SETTINGS'
              ? 'bg-primary/10 text-primary border border-primary/20'
              : 'text-primary hover:text-primary-hover hover:bg-secondary border border-transparent'
          }`}
        >
          <Settings size={20} className={activeView === 'SETTINGS' ? 'text-primary' : 'text-primary'} />
          {!isCollapsed && <span>Settings</span>}
        </button>

        <div 
          title={isCollapsed ? userName : undefined}
          className={`group flex items-center ${isCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'} rounded-xl font-medium text-sm text-primary hover:text-primary-hover hover:bg-secondary transition-all w-full cursor-default`}
        >
          <User size={20} className="text-primary group-hover:text-primary-hover transition-colors shrink-0" />
          {!isCollapsed && (
            <div className="flex flex-col gap-0.5 overflow-hidden">
              <span className="truncate">{userName}</span>
            </div>
          )}
        </div>

        <button
          onClick={onLogout}
          title={isCollapsed ? 'Log Out' : undefined}
          className={`flex items-center ${isCollapsed ? 'justify-center p-3' : 'gap-3 px-4 py-3'} text-sm font-medium text-primary hover:text-primary-hover hover:bg-secondary rounded-xl transition-all cursor-pointer text-left w-full border border-transparent`}
        >
          <LogOut size={20} className="text-primary shrink-0" />
          {!isCollapsed && <span>Log Out</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;