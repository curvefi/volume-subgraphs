import { NewAddressIdentifier, AddressModified } from '../generated/AddressProvider/AddressProvider'
import {
  ADDRESS_ZERO,
  UNKNOWN_METAPOOLS,
  BIG_INT_ZERO,
  EARLY_V2_POOLS,
  LENDING,
  LENDING_POOLS, BIG_INT_ONE
} from '../../../packages/constants'
import { BigInt } from '@graphprotocol/graph-ts/index'
import { Factory, Registry } from '../generated/schema'
import {
  CryptoFactoryTemplate,
  CryptoRegistryTemplate,
  CurvePoolTemplate,
  RegistryTemplate,
  StableFactoryTemplate,
} from '../generated/templates'
import { Address, log } from '@graphprotocol/graph-ts'
import { MainRegistry, PoolAdded } from '../generated/AddressProvider/MainRegistry'
import { createNewFactoryPool, createNewPool } from './services/pools'
import { createNewRegistryPool } from './services/pools'
import { MetaPool } from '../generated/templates/RegistryTemplate/MetaPool'
import { ERC20 } from '../generated/templates/CurvePoolTemplate/ERC20'
import { CurveLendingPool } from '../generated/templates/RegistryTemplate/CurveLendingPool'
import { TokenExchange, TokenExchangeUnderlying } from '../generated/templates/CurvePoolTemplate/CurvePool'
import { handleExchange } from './services/swaps'
import { MetaPoolDeployed, PlainPoolDeployed } from '../generated/AddressProvider/StableFactory'
import { getFactory } from './services/factory'
{{{ importExistingMetaPools }}}


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
      stableFactory = getFactory(addedAddress, 12)
      stableFactory.save()
      StableFactoryTemplate.create(addedAddress)
    }
  } else if (providedId == BigInt.fromString('5')) {
    let cryptoRegistry = Registry.load(addedAddress.toHexString())
    if (!cryptoRegistry) {
      log.info('New crypto registry added: {}', [addedAddress.toHexString()])
      cryptoRegistry = new Registry(addedAddress.toHexString())
      cryptoRegistry.save()
      CryptoRegistryTemplate.create(addedAddress)
    }
  } else if (providedId == BigInt.fromString('6')) {
    let cryptoFactory = Factory.load(addedAddress.toHexString())
    if (!cryptoFactory) {
      log.info('New crypto v2 factory added: {}', [addedAddress.toHexString()])
      cryptoFactory = getFactory(addedAddress, 20)
      cryptoFactory.save()
      CryptoFactoryTemplate.create(addedAddress)
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
  log.info('New pool {} added to registry at {}', [pool.toHexString(), event.transaction.hash.toHexString()])
  const testLending = CurveLendingPool.bind(pool)
  // The test would not work on mainnet because there are no
  // specific functions for lending pools there.
  const testLendingResult = testLending.try_offpeg_fee_multiplier()
  if (!testLendingResult.reverted || LENDING_POOLS.includes(pool)) {
    // Lending pool
    log.info('New lending pool {} added from registry at {}', [
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
  const unknownMetapool = UNKNOWN_METAPOOLS.has(pool.toHexString())
  if (!testMetaPoolResult.reverted || unknownMetapool) {
    log.info('New meta pool {} added from registry at {}', [pool.toHexString(), event.transaction.hash.toHexString()])
    const basePool = unknownMetapool ? UNKNOWN_METAPOOLS[pool.toHexString()] : testMetaPoolResult.value
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
    log.info('New plain pool {} added from registry at {}', [pool.toHexString(), event.transaction.hash.toHexString()])
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
  log.info('Plain swap for pool: {} at {}', [event.address.toHexString(), event.transaction.hash.toHexString()])
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
  log.info('Underlying swap for pool: {} at {}', [event.address.toHexString(), event.transaction.hash.toHexString()])
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

export function handlePlainPoolDeployed(event: PlainPoolDeployed): void {
  log.info('New factory plain pool deployed at {}', [event.transaction.hash.toHexString()])
  createNewFactoryPool(
    12,
    event.address,
    false,
    ADDRESS_ZERO,
    ADDRESS_ZERO,
    event.block.timestamp,
    event.block.number,
    event.transaction.hash
  )
}

export function handleMetaPoolDeployed(event: MetaPoolDeployed): void {
  log.info('New meta pool (version {}), basepool: {}, deployed at {}', [
    '12',
    event.params.base_pool.toHexString(),
    event.transaction.hash.toHexString(),
  ])
  createNewFactoryPool(
    12,
    event.address,
    true,
    event.params.base_pool,
    ADDRESS_ZERO,
    event.block.timestamp,
    event.block.number,
    event.transaction.hash
  )
}

// This is needed because we keep an internal count of the number of pools in
// each factory contract's pool_list. The internal accounting, in turn, is
// needed because events don't give the address of newly deployed pool and we
// can't use pool_count to grab the latest deployed pool, because several
// pools may be deployed in the same block (in which case we'd miss all the
// previous pools aand only record the last.
// When metapools are added with this function to the regitsry, there is no
// event emitted. So we need a call handler. But this is only (so far) a mainnet
// problem - and only mainnet can handle call triggers. Hence why we need to hack
// around with mustache to avoid issues
export function handleAddExistingMetaPools({{ addExistingMetaPoolsCallParams }}): void {

  const pools = {{ poolAssignedValue }}
  const factory = Factory.load({{{ factoryAddress }}})
  if (!factory) {
    return
  }
  for (let i = 0; i < pools.length; i++) {
    if (pools[i] == ADDRESS_ZERO) {
      break
    }
    factory.poolCount = factory.poolCount.plus(BIG_INT_ONE)
    log.info('Existing meta pool {} added to factory contract ({}) at {}', [
      pools[i].toHexString(),
      i.toString(),
      {{ transactionHash }}
    ])
  }
  factory.save()
}