import { NewAddressIdentifier, AddressModified } from '../generated/AddressProvider/AddressProvider'
import {
  ADDRESS_ZERO,
  BIG_INT_ZERO,
  CURVE_PLATFORM_ID,
  EARLY_V2_POOLS,
  LENDING,
  TRIPOOL_ADDRESS,
} from '../../../packages/constants'
import { BigInt } from '@graphprotocol/graph-ts/index'
import { Factory, Registry } from '../generated/schema'
import {
  CryptoRegistryTemplate,
  CurvePoolTemplate,
  RegistryTemplate,
  StableFactoryTemplate,
} from '../generated/templates'
import { Address, log } from '@graphprotocol/graph-ts'
import { MainRegistry, PoolAdded } from '../generated/AddressProvider/MainRegistry'
import { createNewPool } from './services/pools'
import { createNewRegistryPool } from './services/pools'
import { MetaPool } from '../generated/templates/RegistryTemplate/MetaPool'
import { ERC20 } from '../generated/templates/CurvePoolTemplate/ERC20'
import { CurveLendingPool } from '../generated/templates/RegistryTemplate/CurveLendingPool'
import { TokenExchange, TokenExchangeUnderlying } from '../generated/templates/CurvePoolTemplate/CurvePool'
import { handleExchange } from './services/swaps'

export function addAddress(providedId: BigInt, addedAddress: Address): void {
  if (providedId == BIG_INT_ZERO) {
    let mainRegistry = Registry.load(addedAddress.toHexString())
    if (!mainRegistry) {
      log.info('New main registry added: {}', [addedAddress.toHexString()])
      mainRegistry = new Registry(addedAddress.toHexString())
      mainRegistry.save()
      RegistryTemplate.create(addedAddress)
    }
  } else if (providedId == BigInt.fromString('3')) {
    let stableFactory = Factory.load(addedAddress.toHexString())
    if (!stableFactory) {
      log.info('New stable factory added: {}', [addedAddress.toHexString()])
      stableFactory = new Factory(addedAddress.toHexString())
      stableFactory.save()
      StableFactoryTemplate.create(addedAddress)
    }
  } else if (providedId == BigInt.fromString('5')) {
    let cryptoRegistry = Factory.load(addedAddress.toHexString())
    if (!cryptoRegistry) {
      log.info('New crypto factory added: {}', [addedAddress.toHexString()])
      cryptoRegistry = new Factory(addedAddress.toHexString())
      cryptoRegistry.save()
      CryptoRegistryTemplate.create(addedAddress)
    }
  }
}

export function handleNewAddressIdentifier(event: NewAddressIdentifier): void {
  const providedId = event.params.id
  const addedAddress = event.params.addr
  addAddress(providedId, addedAddress)
}

export function handleAddressModified(event: AddressModified): void {
  const providedId = event.params.id
  const addedAddress = event.params.new_address
  addAddress(providedId, addedAddress)
}

export function getLpToken(pool: Address, registryAddress: Address): Address {
  const registry = MainRegistry.bind(registryAddress)
  const lpTokenResult = registry.try_get_lp_token(pool)
  return lpTokenResult.reverted ? pool : lpTokenResult.value
}

export function handleMainRegistryPoolAdded(event: PoolAdded): void {
  const pool = event.params.pool
  const testLending = CurveLendingPool.bind(pool)
  const testLendingResult = testLending.try_offpeg_fee_multiplier()
  if (!testLendingResult.reverted) {
    // Lending pool
    log.debug('New lending pool {} added from registry at {}', [
      pool.toHexString(),
      event.transaction.hash.toHexString(),
    ])
    CurvePoolTemplate.create(pool)
    const lpToken = getLpToken(pool, event.address)
    const lpTokenContract = ERC20.bind(lpToken)
    createNewPool(
      pool,
      lpToken,
      lpTokenContract.name(),
      lpTokenContract.symbol(),
      LENDING,
      false,
      false,
      event.block.number,
      event.transaction.hash,
      event.block.timestamp,
      pool
    )
  }

  const testMetaPool = MetaPool.bind(pool)
  const testMetaPoolResult = testMetaPool.try_base_pool()
  if (!testMetaPoolResult.reverted) {
    log.debug('New meta pool {} added from registry at {}', [pool.toHexString(), event.transaction.hash.toHexString()])
    const basePool = testMetaPoolResult.value
    createNewRegistryPool(
      pool,
      basePool,
      getLpToken(pool, event.address),
      true,
      EARLY_V2_POOLS.includes(pool) ? true : false,
      event.block.timestamp,
      event.block.number,
      event.transaction.hash
    )
  } else {
    log.debug('New plain pool {} added from registry at {}', [pool.toHexString(), event.transaction.hash.toHexString()])
    createNewRegistryPool(
      pool,
      ADDRESS_ZERO,
      getLpToken(pool, event.address),
      false,
      EARLY_V2_POOLS.includes(pool) ? true : false,
      event.block.timestamp,
      event.block.number,
      event.transaction.hash
    )
  }
}

export function handleTokenExchange(event: TokenExchange): void {
  log.debug('Plain swap for pool: {} at {}', [event.address.toHexString(), event.transaction.hash.toHexString()])
  const trade = event.params
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
}

export function handleTokenExchangeUnderlying(event: TokenExchangeUnderlying): void {
  log.debug('Underlying swap for pool: {} at {}', [event.address.toHexString(), event.transaction.hash.toHexString()])
  const trade = event.params
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
    true
  )
}
