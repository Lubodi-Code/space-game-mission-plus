<script setup lang="ts">
import { computed, ref } from 'vue'
import { appState } from '~/game/appState'
import { account, displayName, isGuest, logout } from '~/game/meta/account'
import { cloud } from '~/game/meta/cloudSave'
import { friends, sendRequest, respond, removeFriend, inviteFriend, refreshFriends } from '~/game/meta/friends'
import { profile, levelFromXp } from '~/game/meta/profile'
import { COSMETICS, owns } from '~/game/meta/cosmetics'
import { ARSENAL } from '~/game/meta/arsenal'
import { SECTORS } from '~/game/meta/sectors'
import { MODES } from '~/game/modes/index'
import GameIcon from './GameIcon.vue'
import LoginSheet from './LoginSheet.vue'

type Tab = 'stats' | 'collection' | 'friends'
type Stats = Record<string, number>
interface Friend {
  user_id: string; display_name: string; avatar_url: string | null; friend_code: string
  level: number | null; stats: Stats | null; online: boolean; status: 'pending' | 'accepted'; direction: 'in' | 'out'
}

const tab = ref<Tab>('stats')
const loginOpen = ref(false)
const name = computed(() => (account.user ? displayName(account.user) : '') || 'Invitado')
const avatar = computed(() => account.user?.user_metadata?.avatar_url || '')
const lvl = computed(() => levelFromXp(profile.xp))
const s = computed<Stats>(() => profile.stats as Stats)

function fmtTime(ms: number) {
  const m = Math.floor((ms || 0) / 60000)
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`
}
const winRate = computed(() => (s.value.runs ? Math.round((s.value.wins / s.value.runs) * 100) : 0))

// Tarjetas de estadísticas: icono, valor y etiqueta. `hero` = las dos grandes de arriba.
const cards = computed(() => [
  { icon: 'wave', label: 'Partidas', value: s.value.runs || 0 },
  { icon: 'xp', label: 'Victorias', value: `${s.value.wins || 0}`, sub: `${winRate.value}%` },
  { icon: 'damage', label: 'Bajas', value: (s.value.kills || 0).toLocaleString('es-CR') },
  { icon: 'boss', label: 'Jefes', value: s.value.bosses || 0 },
  { icon: 'range', label: 'Mejor oleada', value: s.value.bestWaveAll || 0 },
  { icon: 'time', label: 'Tiempo jugado', value: fmtTime(s.value.playtimeMs) },
  { icon: 'node', label: 'Edificios', value: s.value.structuresBuilt || 0 },
  { icon: 'energy', label: 'Habilidades', value: s.value.abilitiesUsed || 0 },
  { icon: 'mining', label: 'Gigantes minados', value: s.value.giantsMined || 0 },
  { icon: 'commander', label: 'Co-op', value: s.value.coopRuns || 0 },
])

const records = computed(() =>
  Object.entries(profile.bestWave || {})
    .map(([k, wave]) => {
      const [mode, sector] = k.split(':')
      return { key: k, mode: MODES[mode]?.label || mode, sector: SECTORS[Number(sector) - 1]?.name || `Sector ${sector}`, wave: Number(wave) }
    })
    .sort((a, b) => b.wave - a.wave),
)

const collection = computed(() => {
  // owns() incluye los premium confirmados por el servidor (premium.owned) y los 'default'.
  const cos = COSMETICS.filter((c) => owns(c.id)).length
  const ars = ARSENAL.filter((d) => profile.arsenal.includes(d.key)).length
  return [
    { label: 'Cosméticos', have: cos, total: COSMETICS.length, color: '#ff6ad5' },
    { label: 'Torretas del Arsenal', have: ars, total: ARSENAL.length, color: '#ffcc55' },
    { label: 'Investigación', have: profile.research.length, total: Math.max(profile.research.length, 1), color: '#50fa7b', open: true },
    { label: 'Sectores desbloqueados', have: profile.sectorUnlocked, total: SECTORS.length, color: '#8be9fd' },
  ]
})
const ownedCosmetics = computed(() => COSMETICS.filter((c) => owns(c.id)))

// ------------------------------------------------------------------ amigos
const list = computed(() => friends.list as Friend[])
const accepted = computed(() => list.value.filter((f) => f.status === 'accepted'))
const incoming = computed(() => list.value.filter((f) => f.status === 'pending' && f.direction === 'in'))
const outgoing = computed(() => list.value.filter((f) => f.status === 'pending' && f.direction === 'out'))
const code = ref('')
const msg = ref('')
const busy = ref(false)
const compare = ref<Friend | null>(null)
const copied = ref(false)
const hosting = computed(() => appState.mp.role === 'host' && !!appState.mp.code)

async function run(fn: () => Promise<unknown>, ok = '') {
  busy.value = true
  msg.value = ''
  try { await fn(); if (ok) msg.value = ok } catch (e) { msg.value = e instanceof Error ? e.message : 'Algo salió mal' }
  busy.value = false
}
async function add() {
  const c = code.value.trim().toUpperCase()
  if (!c) return
  await run(async () => {
    const r = await sendRequest(c)
    msg.value = r === 'accepted' ? '¡Ya son amigos!' : r === 'already' ? 'Ya estaba agregado' : 'Solicitud enviada'
    code.value = ''
  })
}
async function copyCode() {
  if (!cloud.friendCode) return
  try { await navigator.clipboard.writeText(cloud.friendCode); copied.value = true; setTimeout(() => (copied.value = false), 1500) } catch { /* sin portapapeles */ }
}
function openTab(t: Tab) {
  tab.value = t
  if (t === 'friends' && !isGuest.value) void refreshFriends()
}
const compareRows = computed(() => {
  const f = compare.value?.stats || {}
  return [
    ['Nivel', lvl.value.level, compare.value?.level || 1],
    ['Partidas', s.value.runs || 0, f.runs || 0],
    ['Victorias', s.value.wins || 0, f.wins || 0],
    ['Bajas', s.value.kills || 0, f.kills || 0],
    ['Jefes', s.value.bosses || 0, f.bosses || 0],
    ['Mejor oleada', s.value.bestWaveAll || 0, f.bestWaveAll || 0],
  ] as [string, number, number][]
})

async function signOut() {
  await logout()
  appState.view = 'lobby'
}
</script>

<template>
  <div class="profile">
    <div class="profile-bg" aria-hidden="true" />
    <div class="wrap">
      <header class="top">
        <button type="button" class="back" @click="appState.view = 'lobby'">‹ Menú</button>
        <span class="sync" :data-state="isGuest ? 'guest' : cloud.status">
          <i aria-hidden="true" />
          {{ isGuest ? 'Solo en este dispositivo' : cloud.status === 'saved' ? 'Guardado en la nube' : cloud.status === 'error' ? 'Sin conexión · reintentando' : 'Sincronizando…' }}
        </span>
      </header>

      <section class="hero">
        <div class="hero-avatar">
          <img v-if="avatar" :src="avatar" alt="" referrerpolicy="no-referrer" />
          <span v-else>{{ isGuest ? '?' : name.charAt(0).toUpperCase() }}</span>
        </div>
        <div class="hero-main">
          <h1 class="hero-name">{{ name }}</h1>
          <div class="hero-lvl">
            <span class="lvl-badge">Nivel {{ lvl.level }}</span>
            <span class="xp-text">{{ lvl.into }} / {{ lvl.need }} XP</span>
          </div>
          <div class="xp-bar"><span :style="{ width: `${(lvl.into / lvl.need) * 100}%` }" /></div>
          <div class="wallet">
            <span><GameIcon name="scrap" :size="15" /> {{ profile.scrap }}</span>
            <span><GameIcon name="crystals" :size="15" /> {{ profile.crystals }}</span>
          </div>
        </div>
        <button v-if="cloud.friendCode" type="button" class="code" :title="'Copiar código de amigo'" @click="copyCode">
          <span class="code-label">{{ copied ? '¡Copiado!' : 'Tu código' }}</span>
          <span class="code-value">{{ cloud.friendCode }}</span>
        </button>
      </section>

      <button v-if="isGuest && account.configured" type="button" class="save-cta" @click="loginOpen = true">
        <span><b>Guardá tu progreso en la nube</b><small>Con una cuenta tu nivel y tu colección te siguen a cualquier dispositivo.</small></span>
        <span class="save-cta-btn">Iniciar sesión</span>
      </button>

      <nav class="tabs" role="tablist">
        <button v-for="t in ([['stats', 'Estadísticas'], ['collection', 'Colección'], ['friends', 'Amigos']] as [Tab, string][])" :key="t[0]"
                type="button" role="tab" :aria-selected="tab === t[0]" class="tab" :class="{ 'tab--on': tab === t[0] }" @click="openTab(t[0])">
          {{ t[1] }}<span v-if="t[0] === 'friends' && incoming.length" class="tab-dot">{{ incoming.length }}</span>
        </button>
      </nav>

      <!-- Estadísticas -->
      <section v-if="tab === 'stats'" class="panel">
        <div class="grid">
          <div v-for="c in cards" :key="c.label" class="card">
            <GameIcon :name="c.icon" :size="20" class="card-icon" />
            <div class="card-value">{{ c.value }}<small v-if="c.sub">{{ c.sub }}</small></div>
            <div class="card-label">{{ c.label }}</div>
          </div>
        </div>
        <h2 class="h2">Récords por modo y sector</h2>
        <p v-if="!records.length" class="empty">Todavía no hay récords: jugá una partida.</p>
        <ul v-else class="records">
          <li v-for="r in records" :key="r.key">
            <span class="rec-mode">{{ r.mode }}</span><span class="rec-sector">{{ r.sector }}</span>
            <span class="rec-wave">Oleada {{ r.wave }}</span>
          </li>
        </ul>
      </section>

      <!-- Colección -->
      <section v-else-if="tab === 'collection'" class="panel">
        <div class="coll">
          <div v-for="c in collection" :key="c.label" class="coll-row">
            <div class="coll-head"><span>{{ c.label }}</span><b>{{ c.have }}<template v-if="!c.open"> / {{ c.total }}</template></b></div>
            <div v-if="!c.open" class="coll-bar"><span :style="{ width: `${(c.have / c.total) * 100}%`, background: c.color }" /></div>
          </div>
        </div>
        <h2 class="h2">Tus cosméticos</h2>
        <div class="chips">
          <span v-for="c in ownedCosmetics" :key="c.id" class="cos" :data-rarity="c.rarity">{{ c.name }}</span>
        </div>
      </section>

      <!-- Amigos -->
      <section v-else class="panel">
        <div v-if="isGuest" class="guest">
          <p>Iniciá sesión para agregar amigos, ver quién está en línea e invitarlos a tu sala.</p>
          <button v-if="account.configured" type="button" class="btn-primary" @click="loginOpen = true">Iniciar sesión</button>
        </div>
        <template v-else>
          <form class="add" @submit.prevent="add">
            <label class="sr-only" for="friend-code">Código de amigo</label>
            <input id="friend-code" v-model="code" placeholder="Código de amigo (ej. WACH-4821)" maxlength="9" autocomplete="off" />
            <button type="submit" class="btn-primary" :disabled="busy || !code.trim()">Agregar</button>
          </form>
          <p v-if="msg" class="msg" role="status">{{ msg }}</p>
          <p v-if="friends.error" class="msg msg--err" role="alert">{{ friends.error }}</p>

          <template v-if="incoming.length">
            <h2 class="h2">Solicitudes</h2>
            <ul class="flist">
              <li v-for="f in incoming" :key="f.user_id" class="fitem">
                <span class="favatar"><img v-if="f.avatar_url" :src="f.avatar_url" alt="" referrerpolicy="no-referrer" /><span v-else>{{ f.display_name.charAt(0) }}</span></span>
                <span class="fname">{{ f.display_name }}<small>{{ f.friend_code }}</small></span>
                <button type="button" class="btn-small btn-ok" :disabled="busy" @click="run(() => respond(f.user_id, true), '¡Nuevo amigo!')">Aceptar</button>
                <button type="button" class="btn-small" :disabled="busy" @click="run(() => respond(f.user_id, false))">✕</button>
              </li>
            </ul>
          </template>

          <h2 class="h2">Amigos <small>{{ accepted.filter((f) => f.online).length }} en línea</small></h2>
          <p v-if="!accepted.length" class="empty">Compartí tu código <b>{{ cloud.friendCode }}</b> o agregá el de un amigo.</p>
          <ul v-else class="flist">
            <li v-for="f in accepted" :key="f.user_id" class="fitem">
              <span class="favatar" :class="{ 'favatar--on': f.online }"><img v-if="f.avatar_url" :src="f.avatar_url" alt="" referrerpolicy="no-referrer" /><span v-else>{{ f.display_name.charAt(0) }}</span></span>
              <span class="fname">{{ f.display_name }}<small>Nivel {{ f.level }} · {{ f.online ? 'En línea' : 'Desconectado' }}</small></span>
              <button v-if="hosting" type="button" class="btn-small btn-ok" :disabled="busy || !f.online" @click="run(() => inviteFriend(f.user_id, appState.mp.code!), 'Invitación enviada')">Invitar</button>
              <button type="button" class="btn-small" @click="compare = f">Comparar</button>
            </li>
          </ul>
          <p v-if="accepted.length && !hosting" class="hint">Para invitar, creá una sala en el menú (Multijugador → Crear partida).</p>

          <template v-if="outgoing.length">
            <h2 class="h2">Enviadas</h2>
            <ul class="flist">
              <li v-for="f in outgoing" :key="f.user_id" class="fitem fitem--dim">
                <span class="fname">{{ f.display_name }}<small>{{ f.friend_code }} · esperando</small></span>
                <button type="button" class="btn-small" :disabled="busy" @click="run(() => removeFriend(f.user_id))">Cancelar</button>
              </li>
            </ul>
          </template>
        </template>
      </section>

      <button v-if="!isGuest" type="button" class="logout" @click="signOut">Cerrar sesión</button>
    </div>

    <LoginSheet :open="loginOpen" @close="loginOpen = false" />

    <!-- Comparar con un amigo -->
    <Teleport to="body">
      <div v-if="compare" class="cmp-backdrop" @click.self="compare = null">
        <section class="cmp" role="dialog" aria-modal="true" aria-label="Comparar estadísticas">
          <div class="cmp-head"><span>Vos</span><b>vs</b><span>{{ compare.display_name }}</span></div>
          <div v-for="[label, mine, theirs] in compareRows" :key="label" class="cmp-row">
            <span :class="{ win: mine > theirs }">{{ mine.toLocaleString('es-CR') }}</span>
            <small>{{ label }}</small>
            <span :class="{ win: theirs > mine }">{{ theirs.toLocaleString('es-CR') }}</span>
          </div>
          <div class="cmp-actions">
            <button type="button" class="btn-small" @click="compare = null">Cerrar</button>
            <button type="button" class="btn-small btn-danger" @click="run(() => removeFriend(compare!.user_id)); compare = null">Eliminar amigo</button>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.profile { position: absolute; inset: 0; overflow-y: auto; background: #05070f; color: #cfe8ff; }
.profile-bg { position: fixed; inset: 0; pointer-events: none; background: radial-gradient(80% 50% at 50% 0%, rgba(40,80,160,0.35), transparent 70%), radial-gradient(60% 40% at 90% 100%, rgba(255,106,213,0.12), transparent 70%); }
.wrap { position: relative; max-width: 44rem; margin: 0 auto; padding: max(1rem, env(safe-area-inset-top)) 1rem max(2rem, env(safe-area-inset-bottom)); }
.top { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
.back { min-height: 2.5rem; padding: 0 0.9rem; border-radius: 999px; color: #8be9fd; box-shadow: inset 0 0 0 1px rgba(139,233,253,0.3); font-weight: 600; }
.sync { display: flex; align-items: center; gap: 0.4rem; font-size: 0.75rem; color: rgba(139,233,253,0.75); }
.sync i { width: 0.5rem; height: 0.5rem; border-radius: 999px; background: #50fa7b; }
.sync[data-state='guest'] i { background: #ffcc55; }
.sync[data-state='syncing'] i, .sync[data-state='off'] i { background: #8be9fd; animation: pulse 1s infinite; }
.sync[data-state='error'] i { background: #ff5566; }
@keyframes pulse { 50% { opacity: 0.3; } }

.hero { margin-top: 1.25rem; display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; padding: 1.1rem; border-radius: 1.25rem;
  background: linear-gradient(135deg, rgba(139,233,253,0.10), rgba(10,15,28,0.9) 60%); box-shadow: inset 0 0 0 1px rgba(139,233,253,0.2); }
.hero-avatar { width: 4.5rem; height: 4.5rem; flex: none; border-radius: 999px; overflow: hidden; display: grid; place-items: center;
  background: #111a2e; color: #ffcc55; font-size: 1.8rem; font-weight: 800; box-shadow: 0 0 0 3px #0a0f1c, 0 0 0 5px rgba(139,233,253,0.6), 0 0 24px rgba(139,233,253,0.35); }
.hero-avatar img { width: 100%; height: 100%; object-fit: cover; }
.hero-main { flex: 1; min-width: 12rem; }
.hero-name { font-size: 1.5rem; font-weight: 800; color: #fff; line-height: 1.1; }
.hero-lvl { margin-top: 0.4rem; display: flex; align-items: center; gap: 0.6rem; font-size: 0.8rem; }
.lvl-badge { padding: 0.1rem 0.55rem; border-radius: 999px; background: #ffcc55; color: #05070f; font-weight: 800; }
.xp-text { color: rgba(139,233,253,0.7); font-variant-numeric: tabular-nums; }
.xp-bar { margin-top: 0.45rem; height: 0.45rem; border-radius: 999px; background: rgba(139,233,253,0.12); overflow: hidden; }
.xp-bar span { display: block; height: 100%; background: linear-gradient(90deg, #6cc8ff, #8be9fd); box-shadow: 0 0 10px rgba(139,233,253,0.7); }
.wallet { margin-top: 0.6rem; display: flex; gap: 1rem; font-size: 0.85rem; font-variant-numeric: tabular-nums; }
.wallet span { display: inline-flex; align-items: center; gap: 0.3rem; }
.code { display: flex; flex-direction: column; align-items: center; padding: 0.55rem 0.9rem; border-radius: 0.9rem; background: rgba(255,204,85,0.08); box-shadow: inset 0 0 0 1px rgba(255,204,85,0.4); }
.code-label { font-size: 0.65rem; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,204,85,0.8); }
.code-value { font-family: ui-monospace, monospace; font-size: 1.05rem; font-weight: 800; color: #ffcc55; letter-spacing: 0.05em; }

.save-cta { margin-top: 0.9rem; width: 100%; display: flex; align-items: center; gap: 0.75rem; padding: 0.8rem 0.9rem; border-radius: 1rem; text-align: left;
  background: linear-gradient(135deg, rgba(255,204,85,0.14), rgba(10,15,28,0.9) 65%); box-shadow: inset 0 0 0 1px rgba(255,204,85,0.4); }
.save-cta > span:first-child { flex: 1; display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.9rem; color: #fff; }
.save-cta small { font-size: 0.75rem; color: rgba(207,232,255,0.7); }
.save-cta-btn { flex: none; padding: 0.5rem 0.85rem; border-radius: 999px; background: #ffcc55; color: #05070f; font-weight: 800; font-size: 0.8rem; }
.tabs { margin-top: 1.25rem; display: flex; gap: 0.35rem; padding: 0.3rem; border-radius: 999px; background: rgba(255,255,255,0.04); }
.tab { position: relative; flex: 1; min-height: 2.5rem; border-radius: 999px; font-size: 0.85rem; font-weight: 700; color: rgba(139,233,253,0.65); }
.tab--on { background: rgba(139,233,253,0.16); color: #fff; box-shadow: inset 0 0 0 1px rgba(139,233,253,0.4); }
.tab-dot { position: absolute; top: 0.25rem; right: 0.6rem; min-width: 1.1rem; height: 1.1rem; border-radius: 999px; background: #ff6ad5; color: #05070f; font-size: 0.65rem; display: grid; place-items: center; }

.panel { margin-top: 1rem; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); gap: 0.6rem; }
.card { padding: 0.8rem; border-radius: 1rem; background: rgba(10,15,28,0.85); box-shadow: inset 0 0 0 1px rgba(139,233,253,0.14); }
.card-icon { color: #8be9fd; }
.card-value { margin-top: 0.4rem; font-size: 1.35rem; font-weight: 800; color: #fff; font-variant-numeric: tabular-nums; }
.card-value small { margin-left: 0.35rem; font-size: 0.75rem; color: #50fa7b; }
.card-label { font-size: 0.72rem; color: rgba(139,233,253,0.65); }
.h2 { margin: 1.5rem 0 0.6rem; font-size: 0.75rem; font-weight: 800; letter-spacing: 0.15em; text-transform: uppercase; color: #8be9fd; }
.h2 small { margin-left: 0.5rem; letter-spacing: normal; text-transform: none; font-weight: 600; color: #50fa7b; }
.empty, .hint { font-size: 0.85rem; color: rgba(207,232,255,0.6); }
.hint { margin-top: 0.5rem; font-size: 0.75rem; }
.records { display: flex; flex-direction: column; gap: 0.4rem; }
.records li { display: flex; align-items: center; gap: 0.6rem; padding: 0.6rem 0.8rem; border-radius: 0.8rem; background: rgba(255,255,255,0.03); font-size: 0.85rem; }
.rec-mode { padding: 0.05rem 0.5rem; border-radius: 999px; background: rgba(139,233,253,0.12); color: #8be9fd; font-size: 0.72rem; font-weight: 700; }
.rec-sector { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rec-wave { color: #ffcc55; font-weight: 700; font-variant-numeric: tabular-nums; }

.coll { display: flex; flex-direction: column; gap: 0.8rem; }
.coll-head { display: flex; justify-content: space-between; font-size: 0.85rem; }
.coll-head b { color: #fff; font-variant-numeric: tabular-nums; }
.coll-bar { margin-top: 0.35rem; height: 0.5rem; border-radius: 999px; background: rgba(255,255,255,0.06); overflow: hidden; }
.coll-bar span { display: block; height: 100%; border-radius: 999px; }
.chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.cos { padding: 0.3rem 0.65rem; border-radius: 999px; font-size: 0.75rem; background: rgba(255,255,255,0.05); box-shadow: inset 0 0 0 1px rgba(139,233,253,0.2); }
.cos[data-rarity='rare'] { box-shadow: inset 0 0 0 1px rgba(108,200,255,0.6); color: #6cc8ff; }
.cos[data-rarity='epic'] { box-shadow: inset 0 0 0 1px rgba(255,106,213,0.6); color: #ff6ad5; }
.cos[data-rarity='legendary'] { box-shadow: inset 0 0 0 1px rgba(255,204,85,0.7); color: #ffcc55; }

.guest { padding: 1.25rem; border-radius: 1rem; text-align: center; background: rgba(255,204,85,0.06); box-shadow: inset 0 0 0 1px rgba(255,204,85,0.3); font-size: 0.9rem; }
.guest .btn-primary { margin-top: 0.8rem; }
.add { display: flex; gap: 0.5rem; }
.add input { flex: 1; min-width: 0; min-height: 2.75rem; padding: 0 0.85rem; border-radius: 0.8rem; background: rgba(255,255,255,0.06); color: #fff; text-transform: uppercase; box-shadow: inset 0 0 0 1px rgba(139,233,253,0.3); }
.add input::placeholder { text-transform: none; color: rgba(139,233,253,0.4); }
.add input:focus { outline: none; box-shadow: inset 0 0 0 1.5px #8be9fd; }
.btn-primary { min-height: 2.75rem; padding: 0 1.1rem; border-radius: 0.8rem; background: #8be9fd; color: #05070f; font-weight: 800; }
.btn-primary:disabled { opacity: 0.5; }
.msg { margin-top: 0.5rem; font-size: 0.8rem; color: #50fa7b; }
.msg--err { color: #ff8a95; }
.flist { display: flex; flex-direction: column; gap: 0.45rem; }
.fitem { display: flex; align-items: center; gap: 0.65rem; padding: 0.55rem 0.7rem; border-radius: 0.9rem; background: rgba(10,15,28,0.85); box-shadow: inset 0 0 0 1px rgba(139,233,253,0.14); }
.fitem--dim { opacity: 0.7; }
.favatar { position: relative; width: 2.4rem; height: 2.4rem; flex: none; border-radius: 999px; overflow: hidden; display: grid; place-items: center; background: #111a2e; color: #ffcc55; font-weight: 800; }
.favatar img { width: 100%; height: 100%; object-fit: cover; }
.favatar--on { box-shadow: 0 0 0 2px #50fa7b; }
.fname { flex: 1; min-width: 0; display: flex; flex-direction: column; font-weight: 700; color: #fff; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fname small { font-weight: 500; font-size: 0.72rem; color: rgba(139,233,253,0.65); }
.btn-small { min-height: 2.25rem; padding: 0 0.75rem; border-radius: 0.7rem; font-size: 0.78rem; font-weight: 700; color: #8be9fd; box-shadow: inset 0 0 0 1px rgba(139,233,253,0.3); }
.btn-small:disabled { opacity: 0.45; }
.btn-ok { background: #50fa7b; color: #05070f; box-shadow: none; }
.btn-danger { color: #ff8a95; box-shadow: inset 0 0 0 1px rgba(255,85,102,0.45); }
.logout { display: block; margin: 2rem auto 0; font-size: 0.8rem; color: rgba(255,138,149,0.8); text-decoration: underline; text-underline-offset: 3px; }

.cmp-backdrop { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; padding: 1rem; background: rgba(2,4,10,0.75); }
.cmp { width: 100%; max-width: 22rem; padding: 1.25rem; border-radius: 1.25rem; background: #0a0f1c; box-shadow: 0 0 0 1px rgba(139,233,253,0.3); color: #cfe8ff; }
.cmp-head { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; text-align: center; font-weight: 800; color: #fff; margin-bottom: 0.75rem; }
.cmp-head b { color: #ffcc55; font-size: 0.8rem; }
.cmp-row { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; text-align: center; padding: 0.45rem 0; border-top: 1px solid rgba(139,233,253,0.1); font-variant-numeric: tabular-nums; }
.cmp-row small { font-size: 0.7rem; color: rgba(139,233,253,0.6); }
.cmp-row .win { color: #50fa7b; font-weight: 800; }
.cmp-actions { margin-top: 1rem; display: flex; justify-content: space-between; }
button:focus-visible, input:focus-visible { outline: 2px solid #ffcc55; outline-offset: 2px; }
</style>
