import {
  TricryptoPoolDeployed
} from '../generated/templates/TriCryptoFactoryTemplate/TriCryptoFactory'
import { log } from '@graphprotocol/graph-ts'
import { TriCryptoOptimizedTemplateV2 } from '../generated/templates'
import { createNewPool } from './services/pools'
import { ADDRESS_ZERO, BIG_INT_ZERO, TRICRYPTO_FACTORY } from 'const'
import {
  TokenExchange
} from '../generated/templates/TriCryptoOptimizedTemplateV2/CurveTricryptoOptimized'
import { handleExchange } from './services/swaps'


export function handleTriCryptoPoolDeployed(event: TricryptoPoolDeployed): void {
  log.debug('New tricrypto factory crypto pool deployed at {}', [event.transaction.hash.toHexString()])
  TriCryptoOptimizedTemplateV2.create(event.params.pool)
  createNewPool(
    event.params.pool,
    event.params.pool,
    event.params.name,
    event.params.symbol,
    TRICRYPTO_FACTORY,
    false,
    true,
    false,
    event.block.number,
    event.transaction.hash,
    event.block.timestamp,
    ADDRESS_ZERO
  )
}

export function handleTokenExchangeTriCrypto(event: TokenExchange): void {
  log.debug('swap for tricrypto factory pool: {} at {}', [event.address.toHexString(), event.transaction.hash.toHexString()])
  const trade = event.params
  const receipt = event.receipt
  const gasUsed = receipt ? receipt.gasUsed : BIG_INT_ZERO
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
    event.transaction.gasLimit,
    gasUsed,
    false
  )
}