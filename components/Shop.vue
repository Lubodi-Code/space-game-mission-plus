<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { appState } from '~/game/appState'
import { profile } from '~/game/meta/profile'
import { COSMETICS, COSMETIC_BY_ID, RARITY, SLOTS, owns, buyWithScrap, equip, featuredToday, unlockProgress, claimUnlocks } from '~/game/meta/cosmetics'
import { sfxUi, sfxPurchase } from '~/game/sound'
import { CRYSTAL_PACKS } from '~/shared/catalog'
import { ARSENAL, arsenalState, buyArsenal } from '~/game/meta/arsenal'
import { buildUpgradeTree } from '~/game/structures/upgrades'
import { account, initAccount, loginGoogle, loginEmail, logout, buyCosmeticWithCrystals, syncAccount } from '~/game/meta/account'

onMounted(() => { initAccount(); syncAccount(); claimUnlocks() })
const checkoutPack = ref<string | null>(null)

// ---- Arsenal: torretas que se desbloquean para siempre con Chatarra (nunca con dinero real).
const selTurret = ref<string>(ARSENAL[0]?.key || '')
const turretDef = computed(() => ARSENAL.find((s) => s.key === selTurret.value))
const turretTree = computed(() => (turretDef.value ? buildUpgradeTree(turretDef.value.role, []) : []))
const turretStats = computed(() => {
  const d: any = turretDef.value
  if (!d) return []
  const out = [`Costo en partida: ${d.cost} minerales`, `Vida: ${d.hp}`]
  if (d.damage) out.push(`Daño: ${d.damage}`)
  if (d.atkRange) out.push(`Alcance: ${d.atkRange}`)
  if (d.cooldown) out.push(`Cadencia: ${(1000 / d.cooldown).toFixed(2)}/s`)
  if (d.chains) out.push(`Saltos: ${d.chains}`)
  if (d.slowMs) out.push(`Ralentiza: ${Math.round((1 - d.slowFactor) * 100)}% por ${(d.slowMs / 1000).toFixed(1)} s`)
  if (d.pierce) out.push(`Atraviesa: ${d.pierce + 1} naves`)
  if (d.splash) out.push(`Área: ${d.splash}`)
  if (d.shieldReduce) out.push(`Reduce daño: ${Math.round(d.shieldReduce * 100)}% en ${d.shieldRange}`)
  return out
})
const turretPreview = computed(() => (tab.value === 'arsenal' && turretDef.value
  ? { role: turretDef.value.role, sides: turretDef.value.sides, color: turretDef.value.color } : null))
function hexCss(n: number) { return '#' + (n >>> 0).toString(16).padStart(6, '0') }
function pickTurret(key: string) { selTurret.value = key; sfxUi('click') }
function buyTurret() {
  const d = turretDef.value
  if (!d) return
  if (buyArsenal(d.key)) { sfxPurchase(); flash(`¡${d.label} desbloqueada! Ya aparece en tu barra de construcción`) }
  else { sfxUi('error'); flash(arsenalState(d) === 'level' ? `Necesitás nivel ${d.arsenal.level}` : 'No te alcanza la Chatarra') }
}
const TURRET_BTN: Record<string, string> = { owned: '✔ Desbloqueada', level: '🔒 Nivel', poor: 'Falta Chatarra', available: 'Desbloquear' }
const email = ref('')
const emailSent = ref(false)
async function sendLink() {
  if (await loginEmail(email.value)) emailSent.value = true
}
function buyPack(id: string) {
  if (!account.user) { sfxUi('error'); flash('Iniciá sesión para comprar Cristales'); return }
  sfxUi('click')
  checkoutPack.value = id
}

// Tienda de cosméticos estilo Fortnite / Fall Guys: destacado del día, pestañas por tipo,
// tarjetas por rareza y vitrina 3D a la izquierda. Solo aspecto: nada da ventaja en combate.
const tab = ref<string>('featured') // featured | rewards | crystals | id de slot
const selected = ref<string>(profile.cosmetics.equipped.beam)
const toast = ref('')

const featured = featuredToday()
// Recompensas: todo lo que se desbloquea jugando, primero lo más cercano a conseguirse.
const rewards = computed(() => COSMETICS.filter((c) => c.unlock)
  .map((c) => ({ c, p: unlockProgress(c) }))
  .sort((a, b) => Number(a.p.done) - Number(b.p.done) || (b.p.cur / b.p.need) - (a.p.cur / a.p.need)))
const rewardsDone = computed(() => rewards.value.filter((r) => r.p.done).length)
const items = computed(() => (tab.value === 'featured' ? featured
  : tab.value === 'rewards' ? rewards.value.map((r) => r.c)
  : tab.value === 'crystals' || tab.value === 'arsenal' ? [] : COSMETICS.filter((c) => c.slot === tab.value)))
const sel = computed(() => COSMETIC_BY_ID[selected.value])

// La vitrina muestra lo equipado, reemplazando el slot del ítem que se está mirando.
const preview = computed(() => {
  const eq = { ...profile.cosmetics.equipped }
  if (sel.value) eq[sel.value.slot] = sel.value.id
  return eq
})

// Hora UTC en la que rota el destacado.
const resetIn = computed(() => {
  const now = new Date()
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  const h = Math.floor((next - now.getTime()) / 36e5)
  return `${h} h`
})

function hex(n?: number) {
  return n == null ? '#8be9fd' : '#' + (n >>> 0).toString(16).padStart(6, '0')
}
const RAINBOW = 'linear-gradient(90deg,#ff5566,#ffd24a,#49e07a,#4fc3ff,#c77dff)'
function swatch(c: any) {
  if (c.anim === 'hue') return c.slot === 'explosion' ? 'radial-gradient(circle,#fff,#ff7ad9 35%,#4fc3ff 60%,transparent 70%)' : RAINBOW
  if (c.slot === 'hull') return hex(c.tint)
  if (c.slot === 'design') return 'linear-gradient(135deg,#8be9fd,#c77dff 60%,#ff7ad9)'
  if (c.slot === 'explosion') return c.color ? `radial-gradient(circle,#fff,${hex(c.color)} 40%,transparent 70%)` : 'radial-gradient(circle,#fff,#8aa4c8 40%,transparent 70%)'
  if (!c.color) return c.slot === 'nexus' ? '#8be9fd' : c.slot === 'turret' ? 'linear-gradient(90deg,#ff5566,#ffd24a,#5bd0ff)' : '#223'
  return hex(c.color)
}

function flash(msg: string) {
  toast.value = msg
  setTimeout(() => { if (toast.value === msg) toast.value = '' }, 2200)
}

function pick(id: string) {
  selected.value = id
  sfxUi('click')
}

async function act() {
  const c = sel.value
  if (!c) return
  if (owns(c.id)) {
    equip(c.id)
    sfxUi('click')
    flash(`${c.name} equipado`)
  } else if (c.price?.scrap) {
    if (buyWithScrap(c.id)) { equip(c.id); sfxPurchase(); flash(`¡${c.name} desbloqueado!`) }
    else { sfxUi('error'); flash('No te alcanza la Chatarra') }
  } else if (c.price?.crystals) {
    // El canje lo decide el servidor (saldo real en Supabase).
    if (!account.user) { sfxUi('error'); flash('Iniciá sesión para usar Cristales'); tab.value = 'crystals'; return }
    try {
      await buyCosmeticWithCrystals(c.id)
      equip(c.id)
      sfxPurchase()
      flash(`¡${c.name} desbloqueado!`)
    } catch (e: any) {
      sfxUi('error')
      flash(e.message)
      if (/alcanzan/.test(e.message)) tab.value = 'crystals'
    }
  }
}

const actLabel = computed(() => {
  const c = sel.value
  if (!c) return ''
  if (profile.cosmetics.equipped[c.slot] === c.id && owns(c.id)) return 'Equipado'
  if (owns(c.id)) return 'Equipar'
  if (c.price?.scrap) return `Comprar · ⚙ ${c.price.scrap}`
  if (c.price?.crystals) return `Comprar · ◆ ${c.price.crystals}`
  if (c.unlock) return `🔒 ${unlockProgress(c).label}`
  return ''
})

function back() {
  sfxUi('click')
  appState.view = 'lobby'
}
</script>

<template>
  <div class="shop">
    <img src="/assets/art/shop-bg.webp" alt="" class="shop-bg" />
    <div class="shop-shade" />

    <header class="relative z-10 flex items-center gap-3 flex-wrap">
      <button class="back-btn" @click="back">← Volver</button>
      <h1 class="shop-title">TIENDA</h1>
      <div class="ml-auto flex items-center gap-2 text-sm">
        <span class="wallet text-amber-100">⚙ <b class="tabular-nums">{{ profile.scrap }}</b></span>
        <span class="wallet text-fuchsia-100">◆ <b class="tabular-nums">{{ profile.crystals }}</b></span>
      </div>
    </header>

    <div class="relative z-10 mt-3 flex-1 min-h-0 grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <!-- Vitrina 3D -->
      <section class="showcase">
        <div class="absolute inset-0">
          <ShopPreview :hull="preview.hull" :beam="preview.beam" :trail="preview.trail" :design="COSMETIC_BY_ID[preview.design]?.design" :turret="turretPreview" />
        </div>
        <div v-if="tab === 'arsenal' && turretDef" class="showcase-info">
          <div class="text-[11px] font-bold tracking-widest text-amber-200">ARSENAL · TORRETA</div>
          <div class="text-2xl sm:text-3xl font-extrabold text-white leading-tight">{{ turretDef.label }}</div>
          <button class="act-btn" :class="{ 'act-btn--done': arsenalState(turretDef) === 'owned' }"
                  :disabled="arsenalState(turretDef) === 'owned'" @click="buyTurret">
            <template v-if="arsenalState(turretDef) === 'owned'">✔ Desbloqueada</template>
            <template v-else>Desbloquear · ⚙ {{ turretDef.arsenal.scrap }}<span v-if="arsenalState(turretDef) === 'level'"> · Nv {{ turretDef.arsenal.level }}</span></template>
          </button>
        </div>
        <div v-else-if="sel" class="showcase-info">
          <div class="text-[11px] font-bold tracking-widest" :style="{ color: RARITY[sel.rarity].css }">
            {{ RARITY[sel.rarity].label.toUpperCase() }} · {{ SLOTS.find((s) => s.id === sel.slot)?.label }}
          </div>
          <div class="text-2xl sm:text-3xl font-extrabold text-white leading-tight">{{ sel.name }}</div>
          <button
            v-if="actLabel"
            class="act-btn"
            :class="{ 'act-btn--done': actLabel === 'Equipado', 'act-btn--premium': !owns(sel.id) && sel.price?.crystals }"
            :disabled="actLabel === 'Equipado' || actLabel.startsWith('🔒')"
            @click="act"
          >
            {{ actLabel }}
          </button>
        </div>
      </section>

      <!-- Catálogo -->
      <section class="flex flex-col min-h-0">
        <nav class="flex gap-1.5 overflow-x-auto pb-1">
          <button class="tab" :class="{ 'tab--on': tab === 'featured' }" @click="tab = 'featured'; sfxUi('click')">★ Destacado</button>
          <button v-for="s in SLOTS" :key="s.id" class="tab" :class="{ 'tab--on': tab === s.id }" @click="tab = s.id; sfxUi('click')">{{ s.label }}</button>
          <button class="tab tab--arsenal" :class="{ 'tab--on': tab === 'arsenal' }" @click="tab = 'arsenal'; sfxUi('click')">⚔ Arsenal</button>
          <button class="tab tab--gift" :class="{ 'tab--on': tab === 'rewards' }" @click="tab = 'rewards'; sfxUi('click')">🎁 Recompensas {{ rewardsDone }}/{{ rewards.length }}</button>
          <button class="tab tab--gem" :class="{ 'tab--on': tab === 'crystals' }" @click="tab = 'crystals'; sfxUi('click')">◆ Cristales</button>
        </nav>

        <!-- Arsenal: torretas nuevas con su árbol de mejoras -->
        <div v-if="tab === 'arsenal'" class="mt-3 overflow-y-auto pb-4 space-y-3">
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            <button v-for="d in ARSENAL" :key="d.key" class="card" :class="{ 'card--sel': selTurret === d.key }"
                    :style="{ '--rar': hexCss(d.color) }" @click="pickTurret(d.key)">
              <span class="card-art text-4xl" :style="{ color: hexCss(d.color), textShadow: `0 0 16px ${hexCss(d.color)}` }">{{ d.glyph }}</span>
              <span class="card-foot">
                <span class="block text-[12px] font-bold text-white truncate">{{ d.label }}</span>
                <span class="card-price">
                  <template v-if="arsenalState(d) === 'owned'">✔ Tuya</template>
                  <template v-else>⚙ {{ d.arsenal.scrap }} · Nv {{ d.arsenal.level }}</template>
                </span>
              </span>
            </button>
          </div>
          <div v-if="turretDef" class="p-3 rounded-xl bg-black/55 ring-1 ring-white/10 text-sm space-y-2">
            <p class="text-cyan-100/85">{{ turretDef.desc }}</p>
            <div class="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-cyan-200/70">
              <span v-for="st in turretStats" :key="st">{{ st }}</span>
            </div>
            <div class="grid sm:grid-cols-2 gap-2 pt-1">
              <div v-for="br in turretTree" :key="br.branch" class="rounded-lg bg-white/5 ring-1 ring-white/10 p-2">
                <div class="text-[11px] font-bold text-amber-200 mb-1">Rama {{ br.branch }} · {{ br.name }}</div>
                <div v-for="(n, i) in br.nodes" :key="n.id" class="text-[11px] leading-snug mb-1">
                  <b class="text-white">{{ i + 1 }}. {{ n.label }}</b> <span class="text-amber-300/80">({{ n.cost }})</span>
                  <span class="block text-cyan-100/60">{{ n.effects.join(' · ') }}</span>
                </div>
              </div>
            </div>
            <p class="text-[10px] text-cyan-200/40">Las dos ramas son excluyentes en cada torreta. Las mejoras se compran con minerales durante la partida.</p>
          </div>
        </div>

        <!-- Cristales: cuenta + paquetes (dinero real vía ONVO) -->
        <div v-if="tab === 'crystals'" class="mt-3 overflow-y-auto pb-4 space-y-3">
          <div class="p-3 rounded-xl bg-black/50 ring-1 ring-white/10 text-sm">
            <template v-if="!account.configured">Las cuentas todavía no están configuradas en este servidor.</template>
            <template v-else-if="account.user">
              Sesión: <b>{{ account.user.email }}</b> · saldo ◆ {{ profile.crystals }}
              <button class="ml-2 underline opacity-70" @click="logout">Salir</button>
            </template>
            <template v-else>
              <div class="font-bold mb-2">Iniciá sesión para comprar y conservar tus Cristales</div>
              <div class="flex flex-wrap gap-2">
                <button class="tab tab--on" @click="loginGoogle">Continuar con Google</button>
                <input v-model="email" type="email" placeholder="tu@correo.com" class="flex-1 min-w-[10rem] px-3 py-1.5 rounded-full bg-white/10 ring-1 ring-white/15 outline-none" />
                <button class="tab" :disabled="account.busy || !email" @click="sendLink">Enviar enlace</button>
              </div>
              <div v-if="emailSent" class="mt-2 text-emerald-200 text-xs">Revisá tu correo y abrí el enlace.</div>
            </template>
            <div v-if="account.error" class="mt-1 text-xs text-red-300">{{ account.error }}</div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <button v-for="p in CRYSTAL_PACKS" :key="p.id" class="card pack" style="--rar: #ff7ad9" @click="buyPack(p.id)">
              <span v-if="p.tag" class="pack-tag">{{ p.tag }}</span>
              <span class="card-art text-4xl text-fuchsia-200">◆</span>
              <span class="card-foot">
                <span class="block text-[13px] font-bold text-white">{{ p.label }}</span>
                <span class="block text-[12px] text-fuchsia-200">◆ {{ p.crystals }}<template v-if="p.bonus"> + {{ p.bonus }} extra</template></span>
                <span class="card-price text-[13px]">₡{{ p.priceCRC.toLocaleString('es-CR') }}</span>
              </span>
            </button>
          </div>
        </div>
        <div v-if="tab === 'featured'" class="text-[11px] text-cyan-200/70 mt-1">Rota en {{ resetIn }}</div>

        <div class="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2.5 overflow-y-auto pr-1 pb-4" :class="{ 'featured-grid': tab === 'featured' }">
          <button
            v-for="c in items"
            :key="c.id"
            class="card"
            :class="{ 'card--sel': selected === c.id }"
            :style="{ '--rar': RARITY[c.rarity].css }"
            @click="pick(c.id)"
          >
            <span class="card-art">
              <span class="card-swatch" :class="'card-swatch--' + c.slot" :style="{ background: swatch(c) }" />
            </span>
            <span class="card-foot">
              <span class="block text-[12px] font-bold text-white truncate">{{ c.name }}</span>
              <span class="block text-[10px]" :style="{ color: RARITY[c.rarity].css }">{{ RARITY[c.rarity].label }}</span>
              <span class="card-price">
                <template v-if="profile.cosmetics.equipped[c.slot] === c.id && owns(c.id)">✔ Equipado</template>
                <template v-else-if="owns(c.id)">Tuyo</template>
                <template v-else-if="c.price?.scrap">⚙ {{ c.price.scrap }}</template>
                <template v-else-if="c.price?.crystals">◆ {{ c.price.crystals }}</template>
                <template v-else-if="c.unlock">🔒 {{ unlockProgress(c).label }}</template>
              </span>
              <span v-if="c.unlock && !owns(c.id)" class="unlock-bar"><span :style="{ width: (100 * unlockProgress(c).cur / unlockProgress(c).need) + '%' }" /></span>
            </span>
          </button>
        </div>
      </section>
    </div>

    <CheckoutModal v-if="checkoutPack" :pack-id="checkoutPack" @close="checkoutPack = null" />

    <transition name="toast">
      <div v-if="toast" class="toast">{{ toast }}</div>
    </transition>
  </div>
</template>

<style scoped>
@reference 'tailwindcss';

.shop {
  @apply absolute inset-0 flex flex-col px-4 sm:px-6 pt-4 text-cyan-100 overflow-hidden;
  padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
  background: #05070f;
}
.shop-bg { @apply absolute inset-0 w-full h-full object-cover opacity-70; }
.shop-shade {
  @apply absolute inset-0;
  background: linear-gradient(90deg, rgba(5, 7, 15, 0.15), rgba(5, 7, 15, 0.85) 60%);
}
.shop-title {
  @apply text-3xl sm:text-4xl font-black tracking-[0.2em] text-white italic;
  text-shadow: 0 0 18px rgba(255, 122, 217, 0.7), 3px 3px 0 #6a1b9a;
}
.back-btn { @apply px-3 py-1.5 rounded-lg text-sm bg-black/40 ring-1 ring-cyan-400/30 hover:bg-cyan-400/15; }
.wallet { @apply px-3 py-1 rounded-full bg-black/50 ring-1 ring-white/15; }
.showcase { @apply relative min-h-[16rem] lg:min-h-0 rounded-2xl overflow-hidden; }
.showcase-info {
  @apply absolute left-0 right-0 bottom-0 p-4;
  background: linear-gradient(to top, rgba(5, 7, 15, 0.9), transparent);
}
.act-btn {
  @apply mt-2 px-6 py-2.5 rounded-xl font-extrabold tracking-wide text-[#05070f] bg-amber-300
         hover:bg-amber-200 active:scale-95 transition-all;
  box-shadow: 0 0 22px rgba(255, 210, 74, 0.5);
}
.act-btn--premium { @apply bg-fuchsia-300 hover:bg-fuchsia-200; box-shadow: 0 0 22px rgba(255, 122, 217, 0.5); }
.act-btn--done { @apply bg-white/10 text-cyan-100 cursor-default; box-shadow: none; }
.tab {
  @apply shrink-0 px-4 py-1.5 rounded-full text-sm font-bold bg-black/40 ring-1 ring-white/15 text-cyan-100/80
         hover:bg-white/10 transition-colors;
}
.tab--on { @apply bg-white text-[#05070f] ring-white; }
.tab--gem { @apply ring-fuchsia-300/50 text-fuchsia-100; }
.tab--gift { @apply ring-amber-300/50 text-amber-100; }
.tab--arsenal { @apply ring-orange-300/50 text-orange-100; }
.unlock-bar { @apply block mt-1 h-1 rounded-full bg-white/10 overflow-hidden; }
.unlock-bar > span { @apply block h-full bg-amber-300; }
.card-swatch--explosion { width: 4rem; height: 4rem; }
.card-swatch--design { width: 4rem; height: 4rem; clip-path: polygon(100% 50%, 20% 0, 35% 50%, 20% 100%); border-radius: 0; }
.card-swatch--nexus { clip-path: polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%); border-radius: 0; }
.card-swatch--turret { width: 80%; height: 0.4rem; }
.pack-tag { @apply absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-300 text-[#05070f]; }
.card {
  @apply relative flex flex-col rounded-xl overflow-hidden text-left transition-transform active:scale-95;
  background: linear-gradient(160deg, color-mix(in srgb, var(--rar) 55%, #0a0f1c), #0a0f1c 75%);
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--rar) 60%, transparent);
  min-height: 9.5rem;
}
.card:hover { transform: translateY(-2px); }
.card--sel { box-shadow: inset 0 0 0 3px #fff, 0 0 18px var(--rar); }
.featured-grid .card { min-height: 12rem; }
.card-art { @apply flex-1 flex items-center justify-center; }
.card-swatch { @apply block rounded-full; width: 3.5rem; height: 3.5rem; box-shadow: 0 0 22px currentColor; }
.card-swatch--beam { width: 80%; height: 0.5rem; }
.card-swatch--hull { clip-path: polygon(50% 0, 100% 100%, 50% 78%, 0 100%); border-radius: 0; }
.card-swatch--trail { width: 70%; height: 1.2rem; border-radius: 999px; opacity: 0.85; }
.card-foot { @apply block px-2.5 py-2 bg-black/55; }
.card-price { @apply block mt-1 text-[11px] font-bold text-amber-100; }
.toast {
  @apply fixed left-1/2 -translate-x-1/2 bottom-6 z-50 px-4 py-2 rounded-xl bg-black/80 ring-1 ring-amber-300/40 text-sm text-amber-100;
}
.toast-enter-active, .toast-leave-active { transition: all 0.25s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, 10px); }
</style>
