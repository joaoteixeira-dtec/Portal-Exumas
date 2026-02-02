/* Helpers para operações de drag-drop e manipulação de arrays */

export const dragDataSet = (e, payload) => {
  try {
    e.dataTransfer.setData('application/json', JSON.stringify(payload))
  } catch {
    e.dataTransfer.setData('text/plain', JSON.stringify(payload))
  }
}

export const dragDataGet = (e) => {
  const t = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain') || ''
  try {
    return JSON.parse(t)
  } catch {
    return {}
  }
}

/* Array manipulation helpers */
export const insertAt = (arr, i, v) => {
  const n = arr.slice()
  const x = Math.max(0, Math.min(i, n.length))
  n.splice(x, 0, v)
  return n
}

export const moveWithin = (arr, from, to) => {
  if (from === to) return arr
  const n = arr.slice()
  const [v] = n.splice(from, 1)
  n.splice(Math.max(0, Math.min(to, n.length)), 0, v)
  return n
}

export const removeItem = (arr, item) => arr.filter(x => x !== item)

export const moveUp = (arr, item) => {
  const i = arr.indexOf(item)
  if (i <= 0) return arr
  return moveWithin(arr, i, i - 1)
}

export const moveDown = (arr, item) => {
  const i = arr.indexOf(item)
  if (i === -1 || i >= arr.length - 1) return arr
  return moveWithin(arr, i, i + 1)
}
