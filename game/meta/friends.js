import { reactive } from 'vue'
import { sb } from './account.js'

export const friends = reactive({ list: [], loading: false, error: '', invite: null })

const INVITE_AGE_MS = 10 * 60 * 1000
let user = null
let generation = 0
let refreshSeq = 0
let pollTimer = null
let channel = null

function requireSession() {
  if (!user || !sb) throw new Error('Iniciá sesión primero')
}

export async function refreshFriends() {
  if (!user || !sb) return
  const current = generation
  const seq = ++refreshSeq
  friends.loading = true
  friends.error = ''
  try {
    const { data, error } = await sb.rpc('list_friends')
    if (current !== generation || seq !== refreshSeq) return
    if (error) throw error
    friends.list = data || []
  } catch (error) {
    if (current === generation && seq === refreshSeq) friends.error = error.message
  } finally {
    if (current === generation && seq === refreshSeq) friends.loading = false
  }
}

export async function sendRequest(code) {
  requireSession()
  const { data, error } = await sb.rpc('send_friend_request', { p_code: code })
  if (error) throw new Error(error.message)
  await refreshFriends()
  return data
}

export async function respond(userId, accept) {
  requireSession()
  const { error } = await sb.rpc('respond_friend_request', { p_other: userId, p_accept: accept })
  if (error) throw new Error(error.message)
  await refreshFriends()
}

export async function removeFriend(userId) {
  requireSession()
  const { error } = await sb.rpc('remove_friend', { p_other: userId })
  if (error) throw new Error(error.message)
  await refreshFriends()
}

export async function inviteFriend(userId, roomCode) {
  requireSession()
  const { error } = await sb.rpc('invite_to_room', { p_friend: userId, p_room: roomCode })
  if (error) throw new Error(error.message)
}

export function dismissInvite() {
  friends.invite = null
}

async function receiveInvite(row, current) {
  if (current !== generation || !row) return
  const at = row.created_at
  const age = Date.now() - new Date(at).getTime()
  if (!Number.isFinite(age) || age >= INVITE_AGE_MS || age < 0) return
  let sender = friends.list.find((entry) => entry.user_id === row.from_user)
  if (!sender) {
    await refreshFriends()
    if (current !== generation) return
    sender = friends.list.find((entry) => entry.user_id === row.from_user)
  }
  if (friends.invite && new Date(friends.invite.at).getTime() > new Date(at).getTime()) return
  friends.invite = {
    fromId: row.from_user,
    fromName: sender?.display_name || 'Un amigo',
    fromAvatar: sender?.avatar_url || null,
    roomCode: row.room_code,
    at,
  }
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') void refreshFriends()
}

export function startFriends(nextUser) {
  if (!nextUser || !sb || typeof window === 'undefined') return
  if (user?.id === nextUser.id) return
  stopFriends()
  user = nextUser
  const current = generation
  // Supabase Auth debe salir de onAuthStateChange antes de iniciar consultas.
  setTimeout(() => {
    if (current !== generation) return
    void refreshFriends()
    sb.from('room_invites').select('from_user, room_code, created_at')
      .order('created_at', { ascending: false }).limit(1)
      .then(({ data, error }) => {
        if (!error) void receiveInvite(data?.[0], current)
      })
    channel = sb.channel('invites-' + nextUser.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'room_invites', filter: 'to_user=eq.' + nextUser.id,
      }, (payload) => { void receiveInvite(payload.new, current) })
      .subscribe()
  }, 0)
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') void refreshFriends()
  }, 60000)
  document.addEventListener('visibilitychange', onVisibilityChange)
}

export function stopFriends() {
  generation++
  refreshSeq++
  user = null
  clearInterval(pollTimer)
  pollTimer = null
  if (channel && sb) void sb.removeChannel(channel)
  channel = null
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibilityChange)
  friends.list = []
  friends.loading = false
  friends.error = ''
  friends.invite = null
}
