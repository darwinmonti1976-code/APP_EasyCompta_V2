import { useState, useEffect } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useWorkspace } from '../lib/WorkspaceContext';
import { Colors } from '../constants/colors';
import { Workspace, WorkspaceMember } from '../lib/types';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';

interface Props {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Settings'>;
}

const WS_TYPE_LABELS: Record<Workspace['type'], string> = {
  personal: '👤 Personnel',
  family: '👨‍👩‍👧 Famille',
  business: '💼 Pro',
};

const WS_TYPE_COLORS: Record<Workspace['type'], string> = {
  personal: Colors.primaryLight,
  family: Colors.successLight,
  business: Colors.debtLight,
};

export function SettingsScreen({ navigation }: Props) {
  const { workspaces, activeWorkspace, pendingInvitations, switchWorkspace,
    createWorkspace, inviteMember, acceptInvitation, declineInvitation,
    leaveWorkspace, deleteWorkspace, removeMember, refreshWorkspaces } = useWorkspace();

  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteWorkspaceId, setInviteWorkspaceId] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newWsType, setNewWsType] = useState<Workspace['type']>('family');
  const [newWsName, setNewWsName] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email ?? '');
      setUserId(user?.id ?? '');
    });
    if (workspaces.length > 0 && !inviteWorkspaceId) {
      setInviteWorkspaceId(activeWorkspace?.id ?? workspaces[0].id);
    }
  }, [workspaces, activeWorkspace]);

  useEffect(() => {
    if (!activeWorkspace || activeWorkspace.type === 'personal') {
      setMembers([]);
      return;
    }
    supabase
      .from('workspace_members')
      .select('*')
      .eq('workspace_id', activeWorkspace.id)
      .eq('status', 'accepted')
      .then(({ data }) => setMembers((data as WorkspaceMember[]) || []));
  }, [activeWorkspace]);

  async function handleCreateWorkspace() {
    const label = newWsName.trim() || (newWsType === 'family' ? 'Famille' : 'Pro');
    const ws = await createWorkspace(label, newWsType);
    if (ws) {
      switchWorkspace(ws);
      setShowCreateModal(false);
      setNewWsName('');
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim() || !inviteWorkspaceId) return;
    setInviting(true);
    setInviteMsg(null);
    const ok = await inviteMember(inviteWorkspaceId, inviteEmail.trim());
    setInviteMsg(ok
      ? { text: `Invitation envoyée à ${inviteEmail} ✓`, ok: true }
      : { text: "Oups, vérifie l'email et réessaie", ok: false }
    );
    if (ok) setInviteEmail('');
    setInviting(false);
  }

  async function handleAcceptInvitation(member: WorkspaceMember) {
    await acceptInvitation(member);
  }

  async function handleDeclineInvitation(member: WorkspaceMember) {
    await declineInvitation(member);
  }

  function handleLeaveWorkspace(ws: Workspace) {
    Alert.alert(
      'Quitter l\'espace',
      `Quitter "${ws.name}" ? Tu perdras l'accès aux transactions de cet espace.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Quitter', style: 'destructive', onPress: () => leaveWorkspace(ws.id) },
      ]
    );
  }

  function handleRemoveMember(member: WorkspaceMember) {
    Alert.alert(
      'Retirer le membre',
      `Retirer ${member.invited_email} de cet espace ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer', style: 'destructive',
          onPress: async () => {
            await removeMember(member.id);
            setMembers(prev => prev.filter(m => m.id !== member.id));
          },
        },
      ]
    );
  }

  function handleDeleteWorkspace(ws: Workspace) {
    Alert.alert(
      'Supprimer l\'espace',
      `Supprimer "${ws.name}" définitivement ? Toutes les transactions associées seront perdues.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => deleteWorkspace(ws.id) },
      ]
    );
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Réglages</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* User info */}
          <Section title="Compte">
            <View style={styles.emailRow}>
              <Text style={styles.emailIcon}>✉</Text>
              <Text style={styles.emailText} numberOfLines={1}>{userEmail}</Text>
            </View>
          </Section>

          {/* Pending invitations */}
          {pendingInvitations.length > 0 && (
            <Section title="Invitations en attente">
              {pendingInvitations.map(inv => (
                <View key={inv.id} style={styles.invitationRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.invitationWsName}>
                      {(inv.workspaces as Workspace | undefined)?.name ?? 'Espace partagé'}
                    </Text>
                    <Text style={styles.invitationMeta}>
                      {WS_TYPE_LABELS[(inv.workspaces as Workspace | undefined)?.type ?? 'personal']}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.declineButton}
                    onPress={() => handleDeclineInvitation(inv)}
                  >
                    <Text style={styles.declineButtonText}>Refuser</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.acceptButton}
                    onPress={() => handleAcceptInvitation(inv)}
                  >
                    <Text style={styles.acceptButtonText}>Accepter</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </Section>
          )}

          {/* Workspace switcher */}
          <Section title="Espaces de travail">
            {workspaces.map(ws => {
              const isActive = activeWorkspace?.id === ws.id;
              return (
                <TouchableOpacity
                  key={ws.id}
                  style={[styles.workspaceRow, isActive && styles.workspaceRowActive]}
                  onPress={() => switchWorkspace(ws)}
                >
                  <View style={[styles.wsTypeBadge, { backgroundColor: WS_TYPE_COLORS[ws.type] }]}>
                    <Text style={styles.wsTypeText}>{WS_TYPE_LABELS[ws.type]}</Text>
                  </View>
                  <Text style={[styles.wsName, isActive && styles.wsNameActive]}>{ws.name}</Text>
                  {isActive && <Text style={styles.activeCheck}>✓</Text>}
                  {ws.owner_id === userId && workspaces.length > 1 && (
                    <TouchableOpacity
                      style={styles.deleteWsButton}
                      onPress={() => handleDeleteWorkspace(ws)}
                    >
                      <Text style={styles.deleteWsButtonText}>🗑</Text>
                    </TouchableOpacity>
                  )}
                  {ws.owner_id !== userId && (
                    <TouchableOpacity
                      style={styles.leaveButton}
                      onPress={() => handleLeaveWorkspace(ws)}
                    >
                      <Text style={styles.leaveButtonText}>Quitter</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })}

            {!showCreateModal ? (
              <TouchableOpacity style={styles.addWsButton} onPress={() => setShowCreateModal(true)}>
                <Text style={styles.addWsButtonText}>+ Nouvel espace</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.createModal}>
                <Text style={styles.createModalTitle}>Quel type d'espace ?</Text>
                <TextInput
                  style={styles.inviteInput}
                  placeholder="Nom de l'espace (optionnel)"
                  placeholderTextColor={Colors.textMuted}
                  value={newWsName}
                  onChangeText={setNewWsName}
                  maxLength={40}
                />
                <View style={styles.typeRow}>
                  {(['family', 'business'] as Workspace['type'][]).map(t => (
                    <TouchableOpacity
                      key={t}
                      style={[styles.typeChip, newWsType === t && styles.typeChipActive]}
                      onPress={() => setNewWsType(t)}
                    >
                      <Text style={[styles.typeChipText, newWsType === t && styles.typeChipTextActive]}>
                        {WS_TYPE_LABELS[t]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.createActions}>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => { setShowCreateModal(false); setNewWsName(''); }}
                  >
                    <Text style={styles.cancelButtonText}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmButton} onPress={handleCreateWorkspace}>
                    <Text style={styles.confirmButtonText}>Créer</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </Section>

          {/* Members of active shared workspace */}
          {activeWorkspace && activeWorkspace.type !== 'personal' && members.length > 0 && (
            <Section title={`Membres — ${activeWorkspace.name}`}>
              {members.map(m => (
                <View key={m.id} style={styles.memberRow}>
                  <Text style={styles.memberEmail} numberOfLines={1}>{m.invited_email}</Text>
                  <Text style={styles.memberRole}>Membre</Text>
                  {activeWorkspace?.owner_id === userId && (
                    <TouchableOpacity
                      style={styles.removeMemberBtn}
                      onPress={() => handleRemoveMember(m)}
                    >
                      <Text style={styles.removeMemberText}>Retirer</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </Section>
          )}

          {/* Invite member */}
          <Section title="Inviter quelqu'un">
            <Text style={styles.inviteHint}>
              La personne invitée recevra l'accès à l'espace sélectionné.
            </Text>

            {workspaces.length > 1 && (
              <View style={styles.wsSelector}>
                {workspaces.map(ws => (
                  <TouchableOpacity
                    key={ws.id}
                    style={[
                      styles.wsSelectorChip,
                      inviteWorkspaceId === ws.id && styles.wsSelectorChipActive,
                    ]}
                    onPress={() => setInviteWorkspaceId(ws.id)}
                  >
                    <Text
                      style={[
                        styles.wsSelectorText,
                        inviteWorkspaceId === ws.id && styles.wsSelectorTextActive,
                      ]}
                    >
                      {ws.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.inviteRow}>
              <TextInput
                style={styles.inviteInput}
                placeholder="Email de la personne"
                placeholderTextColor={Colors.textMuted}
                value={inviteEmail}
                onChangeText={setInviteEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={[styles.sendButton, inviting && { opacity: 0.6 }]}
                onPress={handleInvite}
                disabled={inviting}
              >
                <Text style={styles.sendButtonText}>{inviting ? '···' : 'Inviter'}</Text>
              </TouchableOpacity>
            </View>

            {inviteMsg && (
              <Text style={[styles.inviteMsgText, { color: inviteMsg.ok ? '#2D7A4F' : '#D64545' }]}>
                {inviteMsg.text}
              </Text>
            )}
          </Section>

          {/* Logout */}
          <TouchableOpacity style={styles.logoutButton} onPress={handleSignOut}>
            <Text style={styles.logoutText}>Se déconnecter</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { fontSize: 20, color: Colors.text },
  title: { fontSize: 18, fontWeight: '700', color: Colors.text },
  scroll: { padding: 16, paddingBottom: 48, gap: 20 },

  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 4 },
  sectionCard: { backgroundColor: Colors.surface, borderRadius: 20, padding: 16, gap: 12 },

  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emailIcon: { fontSize: 18 },
  emailText: { fontSize: 15, color: Colors.text, fontWeight: '500', flex: 1 },

  invitationRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  invitationWsName: { fontSize: 14, fontWeight: '600', color: Colors.text },
  invitationMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  acceptButton: {
    backgroundColor: Colors.successLight,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10,
  },
  acceptButtonText: { fontSize: 13, fontWeight: '700', color: '#2D7A4F' },
  declineButton: {
    backgroundColor: Colors.expenseLight,
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10,
  },
  declineButtonText: { fontSize: 13, fontWeight: '700', color: Colors.expense },
  leaveButton: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.expenseLight,
  },
  leaveButtonText: { fontSize: 11, fontWeight: '600', color: Colors.expense },
  deleteWsButton: {
    paddingHorizontal: 8, paddingVertical: 6,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.expenseLight,
  },
  deleteWsButtonText: { fontSize: 13 },
  memberRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  memberEmail: { fontSize: 14, color: Colors.text, flex: 1 },
  memberRole: { fontSize: 12, color: Colors.textMuted, fontWeight: '500' },
  removeMemberBtn: {
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1, borderColor: Colors.expenseLight,
  },
  removeMemberText: { fontSize: 11, fontWeight: '600', color: Colors.expense },

  workspaceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 10, borderRadius: 12,
  },
  workspaceRowActive: { backgroundColor: Colors.primaryLight },
  wsTypeBadge: {
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 8,
  },
  wsTypeText: { fontSize: 12, fontWeight: '600', color: Colors.text },
  wsName: { flex: 1, fontSize: 14, fontWeight: '500', color: Colors.textSecondary },
  wsNameActive: { color: Colors.primary, fontWeight: '700' },
  activeCheck: { fontSize: 16, color: Colors.primary, fontWeight: '700' },

  addWsButton: {
    paddingVertical: 10, alignItems: 'center',
    borderRadius: 10, borderWidth: 1.5,
    borderColor: Colors.border, borderStyle: 'dashed',
  },
  addWsButtonText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },

  createModal: { gap: 12 },
  createModalTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeChip: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    borderRadius: 10, backgroundColor: Colors.surfaceAlt,
  },
  typeChipActive: { backgroundColor: Colors.primaryLight },
  typeChipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  typeChipTextActive: { color: Colors.primary },
  createActions: { flexDirection: 'row', gap: 8 },
  cancelButton: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderRadius: 10, backgroundColor: Colors.surfaceAlt,
  },
  cancelButtonText: { fontSize: 14, fontWeight: '600', color: Colors.textSecondary },
  confirmButton: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderRadius: 10, backgroundColor: Colors.primary,
  },
  confirmButtonText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },

  inviteHint: { fontSize: 13, color: Colors.textMuted, lineHeight: 18 },
  wsSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wsSelectorChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 10, backgroundColor: Colors.surfaceAlt,
  },
  wsSelectorChipActive: { backgroundColor: Colors.primaryLight },
  wsSelectorText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  wsSelectorTextActive: { color: Colors.primary },
  inviteRow: { flexDirection: 'row', gap: 8 },
  inviteInput: {
    flex: 1, backgroundColor: Colors.surfaceAlt,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: Colors.text,
  },
  sendButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  sendButtonText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  inviteMsgText: { fontSize: 13, textAlign: 'center', fontWeight: '500' },

  logoutButton: {
    backgroundColor: Colors.surface, borderRadius: 16,
    paddingVertical: 16, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.expenseLight,
  },
  logoutText: { fontSize: 16, fontWeight: '700', color: '#D64545' },
});
