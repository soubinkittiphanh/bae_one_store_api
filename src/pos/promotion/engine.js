// PROMOTION ENGINE — the one place promotion discounts are calculated.
// Same rules as dc_web/utils/promotionEngine.js (keep the two in sync; both are tested by the same cases).
//
// Rules
//  - A promotion applies when it is active, inside its start/end time and under its usage limit.
//  - Eligible items: the chosen products and/or categories; no choice = every item. Excluded ones are removed.
//  - Promotions are tried by priority (high first). An item unit used by one promotion is not
//    discounted again by another (no double discount on the same dish).
//  - percentage   : % of the eligible amount, optional minimum order and maximum discount.
//  - fixed_amount : fixed amount off, optional minimum order, never more than the eligible amount.
//  - buy_x_get_y  : in every group of (buy + get) eligible units, the cheapest `get` units are free.
//                   The free units must be in the cart (buy 2 get 1 needs 3 units). Optional max free units.
//  - combo_deal   : a set of products (with quantities) sold together for combo_price.
//
// Input lines: [{ key, productId, categoryId, unitPrice, quantity }]
// Result: { applied: [{ promotion, amount, description, allocations: [{ key, amount }] }], total }

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

const ids = (list) => (Array.isArray(list) ? list.map((v) => String(v)) : [])

function parseConditions(promotion) {
  let c = promotion && promotion.conditions
  if (typeof c === 'string') {
    try { c = JSON.parse(c) } catch (e) { c = {} }
  }
  return c && typeof c === 'object' ? c : {}
}

function isPromotionLive(promotion, now = new Date()) {
  if (!promotion || !promotion.is_active) return false
  if (promotion.start_date && new Date(promotion.start_date) > now) return false
  if (promotion.end_date && new Date(promotion.end_date) < now) return false
  const max = Number(promotion.max_uses) || 0
  if (max > 0 && (Number(promotion.current_uses) || 0) >= max) return false
  return true
}

function isLineEligible(promotion, line) {
  const c = parseConditions(promotion)
  const products = ids(c.applicable_products)
  const categories = ids(c.applicable_categories)
  const pid = String(line.productId)
  const cid = line.categoryId == null ? null : String(line.categoryId)

  if (promotion.type === 'combo_deal') {
    return (c.required_items || []).some((r) => String(r.product_id) === pid)
  }
  if (products.length || categories.length) {
    if (!products.includes(pid) && !(cid && categories.includes(cid))) return false
  }
  if (ids(c.excluded_products).includes(pid)) return false
  if (cid && ids(c.excluded_categories).includes(cid)) return false
  return true
}

// One entry per unit still free to be discounted
function eligibleUnits(promotion, lines, remaining) {
  const units = []
  lines.forEach((line) => {
    if (!isLineEligible(promotion, line)) return
    const left = remaining.get(line.key) || 0
    for (let i = 0; i < left; i++) units.push({ key: line.key, productId: line.productId, price: Number(line.unitPrice) || 0 })
  })
  return units
}

function allocate(units, amountFor) {
  const byKey = new Map()
  units.forEach((u) => {
    const a = amountFor(u)
    byKey.set(u.key, (byKey.get(u.key) || 0) + a)
  })
  return Array.from(byKey, ([key, amount]) => ({ key, amount: round2(amount) })).filter((a) => a.amount > 0)
}

// Spread `discount` over `units` in proportion to price; the rounding remainder goes to the last unit
function proportional(units, discount) {
  const base = units.reduce((s, u) => s + u.price, 0)
  if (base <= 0) return []
  const allocations = allocate(units, (u) => (discount * u.price) / base)
  const diff = round2(discount - allocations.reduce((s, a) => s + a.amount, 0))
  if (diff !== 0 && allocations.length) allocations[allocations.length - 1].amount = round2(allocations[allocations.length - 1].amount + diff)
  return allocations
}

function evaluate(promotion, lines, remaining) {
  const c = parseConditions(promotion)
  const units = eligibleUnits(promotion, lines, remaining)
  if (!units.length) return null
  const subtotal = units.reduce((s, u) => s + u.price, 0)

  switch (promotion.type) {
    case 'percentage': {
      const pct = Number(c.discount_percentage) || 0
      if (pct <= 0 || subtotal <= 0) return null
      if (Number(c.minimum_order) > 0 && subtotal < Number(c.minimum_order)) return null
      let amount = (subtotal * Math.min(pct, 100)) / 100
      if (Number(c.max_discount_amount) > 0) amount = Math.min(amount, Number(c.max_discount_amount))
      amount = round2(amount)
      return { amount, used: units, allocations: proportional(units, amount), description: `${pct}%` }
    }
    case 'fixed_amount': {
      const off = Number(c.discount_amount) || 0
      if (off <= 0 || subtotal <= 0) return null
      if (Number(c.minimum_order) > 0 && subtotal < Number(c.minimum_order)) return null
      const amount = round2(Math.min(off, subtotal))
      return { amount, used: units, allocations: proportional(units, amount), description: `-${amount}` }
    }
    case 'buy_x_get_y': {
      const buy = parseInt(c.buy_quantity, 10) || 0
      const get = parseInt(c.get_quantity, 10) || 0
      if (buy < 1 || get < 1) return null
      const group = buy + get
      const sorted = units.slice().sort((a, b) => b.price - a.price) // dearest first
      const groups = Math.floor(sorted.length / group)
      if (groups < 1) return null
      const maxFree = parseInt(c.max_free_items, 10) || 0
      const used = []
      const free = []
      for (let g = 0; g < groups; g++) {
        const chunk = sorted.slice(g * group, (g + 1) * group)
        const freeHere = chunk.slice(buy) // cheapest `get` of the group
        if (maxFree > 0 && free.length + freeHere.length > maxFree) {
          const room = maxFree - free.length
          if (room <= 0) break
          used.push(...chunk)
          free.push(...freeHere.slice(-room))
          break
        }
        used.push(...chunk)
        free.push(...freeHere)
      }
      if (!free.length) return null
      const amount = round2(free.reduce((s, u) => s + u.price, 0))
      return { amount, used, allocations: allocate(free, (u) => u.price), description: `${buy}+${get}`, freeItems: free.length }
    }
    case 'combo_deal': {
      const required = (c.required_items || [])
        .map((r) => ({ productId: String(r.product_id), qty: parseInt(r.quantity, 10) || 1 }))
        .filter((r) => r.productId)
      const comboPrice = Number(c.combo_price)
      if (!required.length || !(comboPrice >= 0)) return null
      // cheapest units first, so the combo never takes a pricier variant than it needs
      const pool = new Map()
      units.slice().sort((a, b) => a.price - b.price).forEach((u) => {
        const k = String(u.productId)
        if (!pool.has(k)) pool.set(k, [])
        pool.get(k).push(u)
      })
      const combos = Math.min(...required.map((r) => Math.floor((pool.get(r.productId) || []).length / r.qty)))
      if (!(combos >= 1)) return null
      const used = []
      let amount = 0
      const discounted = []
      for (let n = 0; n < combos; n++) {
        const set = []
        required.forEach((r) => set.push(...pool.get(r.productId).splice(0, r.qty)))
        const value = set.reduce((s, u) => s + u.price, 0)
        const off = Math.max(0, value - comboPrice)
        if (off <= 0) break
        used.push(...set)
        amount += off
        discounted.push({ set, off })
      }
      if (amount <= 0) return null
      const allocations = []
      discounted.forEach(({ set, off }) => proportional(set, off).forEach((a) => allocations.push(a)))
      const merged = new Map()
      allocations.forEach((a) => merged.set(a.key, round2((merged.get(a.key) || 0) + a.amount)))
      return {
        amount: round2(amount),
        used,
        allocations: Array.from(merged, ([key, amt]) => ({ key, amount: amt })),
        description: `combo ×${discounted.length}`,
      }
    }
    default:
      return null
  }
}

function calculatePromotions(lines, promotions, now = new Date()) {
  const cleanLines = (lines || []).filter((l) => l && (Number(l.quantity) || 0) > 0)
  const remaining = new Map()
  cleanLines.forEach((l) => remaining.set(l.key, (remaining.get(l.key) || 0) + Math.floor(Number(l.quantity))))

  const ordered = (promotions || [])
    .filter((p) => isPromotionLive(p, now))
    .slice()
    .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0) || (Number(a.id) || 0) - (Number(b.id) || 0))

  const applied = []
  ordered.forEach((promotion) => {
    const result = evaluate(promotion, cleanLines, remaining)
    if (!result || result.amount <= 0) return
    result.used.forEach((u) => remaining.set(u.key, (remaining.get(u.key) || 0) - 1))
    applied.push({
      promotion,
      amount: result.amount,
      description: result.description,
      freeItems: result.freeItems || 0,
      allocations: result.allocations,
    })
  })

  return { applied, total: round2(applied.reduce((s, a) => s + a.amount, 0)) }
}

module.exports = { calculatePromotions, isPromotionLive, isLineEligible, parseConditions }
