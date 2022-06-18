import { NewAddressIdentifier, AddressModified } from '../generated/AddressProvider/AddressProvider'
import {
  ADDRESS_ZERO,
  UNKNOWN_METAPOOLS,
  BIG_INT_ZERO,
  EARLY_V2_POOLS,
  LENDING,
  METAPOOL_FACTORY,
  REGISTRY_V2,
  LENDING_POOLS, BIG_INT_ONE, REGISTRY_V1, STABLE_FACTORY, TRANSFER_TOPIC
} from '../../../packages/constants'
import { BigInt } from '@graphprotocol/graph-ts/index'
import { Factory, Pool, Registry } from '../generated/schema'
import {
  CryptoFactoryTemplate,
  CryptoRegistryTemplate,
  CurvePoolTemplate,
  RegistryTemplate,
  StableFactoryTemplate,
} from '../generated/templates'
import { Address, Bytes, ByteArray, log } from '@graphprotocol/graph-ts'
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
import { getPlatform } from './services/platform'
import { catchUp } from './services/catchup'
import {
  AddLiquidity,
  RemoveLiquidity,
  RemoveLiquidityImbalance,
  RemoveLiquidityOne
} from '../generated/AddressProvider/CurvePool'
import {
  processAddLiquidity,
  processLiquidityRemoval
} from './services/liquidity'
{{{ importExistingMetaPools }}}


export function addAddress(providedId: BigInt,
                           addedAddress: Address,
                           block: BigInt,
                           timestamp: BigInt,
                           hash: Bytes): void {
  const platform = getPlatform()

  if (providedId == BIG_INT_ZERO) {
    let mainRegistry = Registry.load(addedAddress.toHexString())
    if (!mainRegistry) {
      log.info('New main registry added: {}', [addedAddress.toHexString()])
      mainRegistry = new Registry(addedAddress.toHexString())
      mainRegistry.save()
      RegistryTemplate.create(addedAddress)
      catchUp(addedAddress, false, 1, block, timestamp, hash)
    }
  } else if (providedId == BigInt.fromString('3')) {
    let stableFactory = Factory.load(addedAddress.toHexString())
    if (!stableFactory) {
      log.info('New stable factory added: {}', [addedAddress.toHexString()])
      stableFactory = getFactory(addedAddress)
      stableFactory.save()
      StableFactoryTemplate.create(addedAddress)
      catchUp(addedAddress, true, 1, block, timestamp, hash)
    }
  } else if (providedId == BigInt.fromString('5')) {
    let cryptoRegistry = Registry.load(addedAddress.toHexString())
    if (!cryptoRegistry) {
      log.info('New crypto registry added: {}', [addedAddress.toHexString()])
      cryptoRegistry = new Registry(addedAddress.toHexString())
      cryptoRegistry.save()
      CryptoRegistryTemplate.create(addedAddress)
      catchUp(addedAddress, false, 2, block, timestamp, hash)
    }
  } else if (providedId == BigInt.fromString('6')) {
    let cryptoFactory = Factory.load(addedAddress.toHexString())
    if (!cryptoFactory) {
      log.info('New crypto v2 factory added: {}', [addedAddress.toHexString()])
      cryptoFactory = getFactory(addedAddress)
      cryptoFactory.save()
      CryptoFactoryTemplate.create(addedAddress)
      catchUp(addedAddress, true, 2, block, timestamp, hash)
    }
  }
}

export function handleNewAddressIdentifier(event: NewAddressIdentifier): void {
  const providedId = event.params.id
  const addedAddress = event.params.addr
  addAddress(providedId, addedAddress, event.block.number, event.block.timestamp, event.transaction.hash)
}

export function handleAddressModified(event: AddressModified): void {
  const providedId = event.params.id
  const addedAddress = event.params.new_address
  addAddress(providedId, addedAddress, event.block.number, event.block.timestamp, event.transaction.hash)
}

export function getLpToken(pool: Address, registryAddress: Address): Address {
  const registry = MainRegistry.bind(registryAddress)
  const lpTokenResult = registry.try_get_lp_token(pool)
  return lpTokenResult.reverted ? pool : lpTokenResult.value
}

export function addRegistryPool(pool: Address,
                                registry: Address,
                                block: BigInt,
                                timestamp: BigInt,
                                hash: Bytes): void {
  log.info('New pool {} added to registry at {}', [pool.toHexString(), hash.toHexString()])
  const testLending = CurveLendingPool.bind(pool)
  // The test would not work on mainnet because there are no
  // specific functions for lending pools there.
  const testLendingResult = testLending.try_offpeg_fee_multiplier()
  if (!testLendingResult.reverted || LENDING_POOLS.includes(pool)) {
    // Lending pool
    log.info('New lending pool {} added from registry at {}', [
      pool.toHexString(),
      hash.toHexString(),
    ])
    CurvePoolTemplate.create(pool)
    const lpToken = getLpToken(pool, registry)
    const lpTokenContract = ERC20.bind(lpToken)
    createNewPool(
      pool,
      lpToken,
      lpTokenContract.name(),
      lpTokenContract.symbol(),
      LENDING,
      false,
      false,
      block,
      hash,
      timestamp,
      pool
    )
  }

  const testMetaPool = MetaPool.bind(pool)
  const testMetaPoolResult = testMetaPool.try_base_pool()
  const unknownMetapool = UNKNOWN_METAPOOLS.has(pool.toHexString())

  if (!testMetaPoolResult.reverted || unknownMetapool) {
    log.info('New meta pool {} added from registry at {}', [pool.toHexString(), hash.toHexString()])
    const basePool = unknownMetapool ? UNKNOWN_METAPOOLS[pool.toHexString()] : testMetaPoolResult.value
    createNewRegistryPool(
      pool,
      basePool,
      getLpToken(pool, registry),
      true,
      EARLY_V2_POOLS.includes(pool) ? true : false,
      // on mainnet the unknown metapools are legacy metapools deployed before the
      // contract was added to the address indexer
      unknownMetapool ? {{ unknownMetapoolType }} : REGISTRY_V1,
      timestamp,
      block,
      hash
  )
  } else {
    log.info('New plain pool {} added from registry at {}', [pool.toHexString(), hash.toHexString()])
    createNewRegistryPool(
      pool,
      ADDRESS_ZERO,
      getLpToken(pool, registry),
      false,
      EARLY_V2_POOLS.includes(pool) ? true : false,
      REGISTRY_V1,
      timestamp,
      block,
      hash
    )
  }
}

export function handleRemoveLiquidityOne(event: RemoveLiquidityOne): void {
  // the event log doesn't give us the token or its index so we have to figure
  // it out from the tx receipt
  const receipt = event.receipt
  if (receipt) {
    for (let i=0; i<receipt.logs.length; i++) {
      const entry = receipt.logs[i]
      if (entry.topics.length == 3) {
          if ((entry.topics[0].toHexString() == TRANSFER_TOPIC.toHexString()) &&
            (entry.topics[1].toHexString().slice(26) == event.address.toHexString().slice(2)) &&
            (entry.topics[2].toHexString().slice(26) == event.params.provider.toHexString().slice(2)) &&
            (BigInt.fromUnsignedBytes(changetype<ByteArray>(entry.data.reverse())) == event.params.coin_amount)) {
            log.info("Found remove coin {} at tx {}", [entry.address.toHexString(), event.transaction.hash.toHexString()])
          }
          const coin = entry.address
          const pool = Pool.load(event.address.toHexString())
          const tokenAmounts = new Array<BigInt>()
          if (!pool) {
            return
          }
          for (let j=0; j<pool.coins.length;j++) {
            tokenAmounts.push(pool.coins[j] == coin ? event.params.coin_amount : BIG_INT_ZERO)
          }
          processLiquidityRemoval(pool,
            event.params.provider,
            tokenAmounts,
            event.block.timestamp,
            event.block.number,
            event.transaction.hash)
      }
    }
  }
}


export function handleRemoveLiquidityImbalance(event: RemoveLiquidityImbalance): void {
  const pool = Pool.load(event.address.toHexString())
  if (!pool) {
    return
  }
  log.info('Removed liquidity for pool: {} at {}', [event.address.toHexString(), event.transaction.hash.toHexString()])
  processLiquidityRemoval(pool,
    event.params.provider,
    event.params.token_amounts,
    event.block.timestamp,
    event.block.number,
    event.transaction.hash)

}

export function handleRemoveLiquidity(event: RemoveLiquidity): void {
  const pool = Pool.load(event.address.toHexString())
  if (!pool) {
    return
  }
  log.info('Removed liquidity for pool: {} at {}', [event.address.toHexString(), event.transaction.hash.toHexString()])
  processLiquidityRemoval(pool,
    event.params.provider,
    event.params.token_amounts,
    event.block.timestamp,
    event.block.number,
    event.transaction.hash)
}

export function handleAddLiquidity(event: AddLiquidity): void {
  log.debug('Added liquidity for pool: {} at {}', [event.address.toHexString(), event.transaction.hash.toHexString()])
  const pool = Pool.load(event.address.toHexString())
  if (!pool) {
    return
  }
  processAddLiquidity(pool,
    event.params.provider,
    event.params.token_amounts,
    event.block.timestamp,
    event.block.number,
    event.transaction.hash)
}

export function handleMainRegistryPoolAdded(event: PoolAdded): void {
  addRegistryPool(event.params.pool,
    event.address,
    event.block.number,
    event.block.timestamp,
    event.transaction.hash)
}

export function handleTokenExchange(event: TokenExchange): void {
  log.info('Plain swap for pool: {} at {}', [event.address.toHexString(), event.transaction.hash.toHexString()])
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

export function handleTokenExchangeUnderlying(event: TokenExchangeUnderlying): void {
  log.info('Underlying swap for pool: {} at {}', [event.address.toHexString(), event.transaction.hash.toHexString()])
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
    true
  )
}

export function handlePlainPoolDeployed(event: PlainPoolDeployed): void {
  log.info('New factory plain pool deployed at {}', [event.transaction.hash.toHexString()])
  createNewFactoryPool(
    1,
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
    '1',
    event.params.base_pool.toHexString(),
    event.transaction.hash.toHexString(),
  ])
  createNewFactoryPool(
    1,
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