export const RISK = {
  BRAVE: (e, ctx) => (ctx.incomingDamage >= e.hp * 0.6 ? 1 : 0),

  CAUTIOUS: () => 0.9,

  CALCULATED: (e, ctx) => {
    const dmgRatio = ctx.incomingDamage / Math.max(1, e.hp)
    const range = e.def.attackRange || 150
    const committed = ctx.distToTarget < range * 1.2 ? 0.5 : 0
    return Math.max(0, Math.min(1, dmgRatio * 1.6 - committed))
  },
}
