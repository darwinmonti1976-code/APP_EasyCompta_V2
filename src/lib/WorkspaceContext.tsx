import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { Workspace, WorkspaceMember } from './types';

const ACTIVE_WS_KEY = '@easycompta_active_workspace';

interface WorkspaceContextValue {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  workspaceLoadError: string | null;
  pendingInvitations: WorkspaceMember[];
  switchWorkspace: (ws: Workspace) => void;
  refreshWorkspaces: () => Promise<void>;
  createWorkspace: (name: string, type: Workspace['type']) => Promise<Workspace | null>;
  inviteMember: (workspaceId: string, email: string) => Promise<boolean>;
  acceptInvitation: (member: WorkspaceMember) => Promise<void>;
  declineInvitation: (member: WorkspaceMember) => Promise<void>;
  leaveWorkspace: (workspaceId: string) => Promise<void>;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
  renameWorkspace: (workspaceId: string, name: string) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ userId, userEmail, children }: {
  userId: string;
  userEmail: string;
  children: ReactNode;
}) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [workspaceLoadError, setWorkspaceLoadError] = useState<string | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<WorkspaceMember[]>([]);

  useEffect(() => {
    refreshWorkspaces();
  }, [userId]);

  const refreshWorkspaces = useCallback(async () => {
    if (!userId) return;
    setWorkspaceLoadError(null);

    // Owned workspaces
    const { data: owned, error: ownedError } = await supabase
      .from('workspaces')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at');

    if (ownedError) {
      setWorkspaceLoadError(ownedError.message);
      return;
    }

    // Accepted member workspaces (workspace_members may not exist yet — ignore error)
    const { data: memberships } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)
      .eq('status', 'accepted');

    let memberWs: Workspace[] = [];
    if (memberships?.length) {
      const ids = memberships.map(m => m.workspace_id);
      const { data } = await supabase.from('workspaces').select('*').in('id', ids);
      memberWs = (data as Workspace[]) || [];
    }

    const all: Workspace[] = [...(owned as Workspace[] || []), ...memberWs];
    const unique = all.filter((ws, i, arr) => arr.findIndex(w => w.id === ws.id) === i);
    setWorkspaces(unique);

    // Restore or set active workspace
    const savedId = await AsyncStorage.getItem(ACTIVE_WS_KEY);
    const saved = unique.find(w => w.id === savedId);
    if (saved) {
      setActiveWorkspace(saved);
    } else if (unique.length > 0) {
      setActiveWorkspace(unique[0]);
      AsyncStorage.setItem(ACTIVE_WS_KEY, unique[0].id);
    }

    // Pending invitations (workspace_members may not exist yet — ignore error)
    const { data: pending } = await supabase
      .from('workspace_members')
      .select('*, workspaces(*)')
      .eq('invited_email', userEmail)
      .eq('status', 'pending');

    setPendingInvitations((pending as WorkspaceMember[]) || []);
  }, [userId, userEmail]);

  function switchWorkspace(ws: Workspace) {
    setActiveWorkspace(ws);
    AsyncStorage.setItem(ACTIVE_WS_KEY, ws.id);
  }

  async function createWorkspace(name: string, type: Workspace['type']): Promise<Workspace | null> {
    const { data, error } = await supabase
      .from('workspaces')
      .insert({ name, type, owner_id: userId })
      .select()
      .single();
    if (error || !data) return null;
    await refreshWorkspaces();
    return data as Workspace;
  }

  async function inviteMember(workspaceId: string, email: string): Promise<boolean> {
    const { error } = await supabase.from('workspace_members').insert({
      workspace_id: workspaceId,
      invited_email: email.toLowerCase().trim(),
      role: 'member',
      status: 'pending',
    });
    return !error;
  }

  async function acceptInvitation(member: WorkspaceMember) {
    await supabase
      .from('workspace_members')
      .update({ user_id: userId, status: 'accepted' })
      .eq('id', member.id);
    await refreshWorkspaces();
  }

  async function declineInvitation(member: WorkspaceMember) {
    await supabase.from('workspace_members').delete().eq('id', member.id);
    setPendingInvitations(prev => prev.filter(i => i.id !== member.id));
  }

  async function leaveWorkspace(workspaceId: string) {
    await supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId);
    await refreshWorkspaces();
  }

  async function deleteWorkspace(workspaceId: string) {
    await supabase.from('workspaces').delete().eq('id', workspaceId);
    await refreshWorkspaces();
  }

  async function removeMember(memberId: string) {
    await supabase.from('workspace_members').delete().eq('id', memberId);
  }

  async function renameWorkspace(workspaceId: string, name: string) {
    await supabase.from('workspaces').update({ name }).eq('id', workspaceId);
    await refreshWorkspaces();
  }

  return (
    <WorkspaceContext.Provider value={{
      workspaces,
      activeWorkspace,
      workspaceLoadError,
      pendingInvitations,
      switchWorkspace,
      refreshWorkspaces,
      createWorkspace,
      inviteMember,
      acceptInvitation,
      declineInvitation,
      leaveWorkspace,
      deleteWorkspace,
      removeMember,
      renameWorkspace,
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return ctx;
}
