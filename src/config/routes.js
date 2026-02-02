/* Constantes e configurações para rotas e recolhas */

export const FLEET = ['Carro 1', 'Carro 2', 'Carrinha Frio 1', 'Carrinha 3']

export const CARRIERS = {
  INTERNO: 'interno',
  SANTOS: 'santosvale',
  STEFF: 'steff'
}

export const CARRIER_NAMES = {
  [CARRIERS.SANTOS]: 'Santos e Vale',
  [CARRIERS.STEFF]: 'STEFF (frio)',
  [CARRIERS.INTERNO]: 'Interna'
}

export const ROUTE_STATUS = {
  PLANNED: 'PLANNED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
}

export const PICKUP_STATUS = {
  SCHEDULED: 'SCHEDULED',
  PICKED_UP: 'PICKED_UP',
  CANCELLED: 'CANCELLED'
}
