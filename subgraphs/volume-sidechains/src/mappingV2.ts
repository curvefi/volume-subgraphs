import { log } from '@graphprotocol/graph-ts/index'
import { PoolAdded } from '../generated/AddressProvider/CryptoRegistry'
import { ADDRESS_ZERO } from '../../../packages/constants'
import { TokenExchange } from '../generated/templates/RegistryTemplate/CurvePoolV2'

export function handleCryptoPoolAdded(event: PoolAdded): void {
  log.debug('New V2 factory crypto pool deployed at {}', [event.transaction.hash.toHexString()])
  /*
  createNewRegistryPool(
    20,
    false,
    ADDRESS_ZERO,
    event.params.pool,
    event.block.timestamp,
    event.block.number,
    event.transaction.hash
  )
  
   */
}

export function handleTokenExchangeV2(event: TokenExchange): void {
  log.debug('swap for v2 pool: {} at {}', [event.address.toHexString(), event.transaction.hash.toHexString()])
  const trade = event.params
  /*
  handleExchange(
    trade.buyer,
    trade.sold_id,
    trade.bought_id,
    trade.tokens_sold,
    trade.tokens_bought,
    event.block.timestamp,
    event.block.number,
    event.address,
    event.transaction.hash,
    false
  )

   */
}
