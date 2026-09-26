import { reactive } from 'vue'

// Cosméticos premium (canjeados con Cristales) de la cuenta con sesión. NO se persiste en
// localStorage: se deriva siempre del inventario del servidor (account.syncAccount) y se
// vacía al cerrar o cambiar de sesión. Así no se hereda entre cuentas ni se falsifica.
export const premium = reactive({ userId: null, owned: [] })

export function setPremium(userId, items) {
  premium.userId = userId
  premium.owned = [...items]
}

export function clearPremium() {
  premium.userId = null
  premium.owned = []
}
