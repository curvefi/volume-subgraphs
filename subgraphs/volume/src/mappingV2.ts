import { log } from '@graphprotocol/graph-ts/index'
import { PoolAdded } from '../generated/AddressProvider/CryptoRegistry'
import { ADDRESS_ZERO, BIG_INT_ZERO, REGISTRY_V2 } from '../../../packages/constants'
import { TokenExchange } from '../generated/templates/RegistryTemplate/CurvePoolV2'
import { createNewFactoryPool, createNewRegistryPool } from './services/pools'
import { MetaPool } from '../generated/templates/RegistryTemplate/MetaPool'
import { getLpToken } from './mapping'
import { handleExchange } from './services/swaps'
import { CryptoPoolDeployed } from '../generated/templates/CryptoFactoryTemplate/CryptoFactory'
import { Address, BigInt, Bytes } from '@graphprotocol/graph-ts'
import { RemoveLiquidity, RemoveLiquidityOne, AddLiquidity } from '../generated/AddressProvider/CurvePoolV2'
import { Pool } from '../generated/schema'
import { processAddLiquidity, processLiquidityRemoval } from './services/liquidity'

export function addCryptoRegistryPool(
  pool: Address,
  registry: Address,
  block: BigInt,
  timestamp: BigInt,
  hash: Bytes
): void {
  log.debug('New V2 factory crypto pool {} deployed at {}', [pool.toHexString(), hash.toHexString()])

  // Useless for now, but v2 metapools may be a thing at some point
  const testMetaPool = MetaPool.bind(pool)
  const testMetaPoolResult = testMetaPool.try_base_pool()
  if (!testMetaPoolResult.reverted) {
    createNewRegistryPool(
      pool,
      testMetaPoolResult.value,
      getLpToken(pool, registry),
      true,
      true,
      REGISTRY_V2,
      timestamp,
      block,
      hash
    )
  } else {
    createNewRegistryPool(
      pool,
      ADDRESS_ZERO,
      getLpToken(pool, registry),
      false,
      true,
      REGISTRY_V2,
      timestamp,
      block,
      hash
    )
  }
}

export function handleCryptoPoolAdded(event: PoolAdded): void {
  addCryptoRegistryPool(
    event.params.pool,
    event.address,
    event.block.number,
    event.block.timestamp,
    event.transaction.hash
  )
}

export function handleCryptoPoolDeployed(event: CryptoPoolDeployed): void {
  log.debug('New V2 factory crypto pool deployed at {}', [event.transaction.hash.toHexString()])
  createNewFactoryPool(
    2,
    event.address,
    false,
    ADDRESS_ZERO,
    event.params.token,
    event.block.timestamp,
    event.block.number,
    event.transaction.hash
  )
}

export function handleTokenExchangeV2(event: TokenExchange): void {
  log.debug('swap for v2 pool: {} at {}', [event.address.toHexString(), event.transaction.hash.toHexString()])
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

export function handleRemoveLiquidity(event: RemoveLiquidity): void {
  const pool = Pool.load(event.address.toHexString())
  if (!pool) {
    return
  }
  log.info('Removed liquidity for pool: {} at {}', [event.address.toHexString(), event.transaction.hash.toHexString()])
  processLiquidityRemoval(
    pool,
    event.params.provider,
    event.params.token_amounts,
    event.block.timestamp,
    event.block.number,
    event.transaction.hash
  )
}

export function handleRemoveLiquidityOne(event: RemoveLiquidityOne): void {
  const pool = Pool.load(event.address.toHexString())
  if (!pool) {
    return
  }
  const tokenAmounts = new Array<BigInt>()
  for (let i = 0; i < pool.coins.length; i++) {
    if (i == event.params.coin_index.toI32()) {
      tokenAmounts.push(event.params.token_amount)
    }
  }
  log.info('Removed liquidity for pool: {} at {}', [event.address.toHexString(), event.transaction.hash.toHexString()])
  processLiquidityRemoval(
    pool,
    event.params.provider,
    tokenAmounts,
    event.block.timestamp,
    event.block.number,
    event.transaction.hash
  )
}

export function handleAddLiquidity(event: AddLiquidity): void {
  const pool = Pool.load(event.address.toHexString())
  if (!pool) {
    return
  }
  log.info('Added liquidity for pool: {} at {}', [event.address.toHexString(), event.transaction.hash.toHexString()])
  processAddLiquidity(
    pool,
    event.params.provider,
    event.params.token_amounts,
    event.block.timestamp,
    event.block.number,
    event.transaction.hash
  )
}
