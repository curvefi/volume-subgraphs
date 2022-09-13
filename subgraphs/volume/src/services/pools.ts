import { Address, BigInt, Bytes, log } from '@graphprotocol/graph-ts/index'
import { getDecimals, getName } from '../../../../packages/utils/pricing'
import { BasePool, Pool } from '../../generated/schema'
import { CurvePoolCoin128 } from '../../generated/templates/CurvePoolTemplate/CurvePoolCoin128'
import { CurvePool } from '../../generated/templates/RegistryTemplate/CurvePool'
import {
  ADDRESS_ZERO,
  BIG_DECIMAL_ZERO,
  BIG_INT_ONE,
  BIG_INT_ZERO,
  CRYPTO_FACTORY,
  METAPOOL_FACTORY,
  METAPOOL_FACTORY_ADDRESS,
  REBASING_POOL_IMPLEMENTATION_ADDRESSES,
  STABLE_FACTORY,
} from '../../../../packages/constants'
import { CurvePoolTemplate, CurvePoolTemplateV2 } from '../../generated/templates'
import { CurveLendingPool } from '../../generated/templates/CurvePoolTemplate/CurveLendingPool'
import { CurveLendingPoolCoin128 } from '../../generated/templates/CurvePoolTemplate/CurveLendingPoolCoin128'
import { ERC20 } from '../../generated/templates/CurvePoolTemplate/ERC20'
import { getPlatform } from './platform'
import { StableFactory } from '../../generated/AddressProvider/StableFactory'
import { getFactory } from './factory'
import { CryptoFactory } from '../../generated/templates/CryptoRegistryTemplate/CryptoFactory'

export function createNewPool(
  poolAddress: Address,
  lpToken: Address,
  name: string,
  symbol: string,
  poolType: string,
  metapool: boolean,
  isV2: boolean,
  isRebasing: boolean,
  block: BigInt,
  tx: Bytes,
  timestamp: BigInt,
  basePool: Address
): void {
  const platform = getPlatform()
  const pools = platform.poolAddresses
  pools.push(poolAddress)
  platform.poolAddresses = pools
  platform.save()
  const pool = new Pool(poolAddress.toHexString())
  pool.coins = new Array<Bytes>()
  pool.coinDecimals = new Array<BigInt>()
  pool.coinNames = new Array<string>()
  const poolContract = CurvePool.bind(poolAddress)
  pool.name = name
  pool.platform = platform.id
  pool.lpToken = lpToken
  pool.symbol = symbol
  pool.metapool = metapool
  pool.isV2 = isV2
  pool.isRebasing = isRebasing
  pool.address = poolAddress
  pool.creationBlock = block
  pool.creationTx = tx
  pool.creationDate = timestamp
  pool.poolType = poolType
  pool.basePool = basePool
  pool.cumulativeVolume = BIG_DECIMAL_ZERO
  pool.cumulativeVolumeUSD = BIG_DECIMAL_ZERO
  pool.cumulativeFeesUSD = BIG_DECIMAL_ZERO
  pool.virtualPrice = BIG_DECIMAL_ZERO
  pool.baseApr = BIG_DECIMAL_ZERO

  const coins = pool.coins
  const coinDecimals = pool.coinDecimals
  const coinNames = pool.coinNames
  let i = 0
  let coinResult = poolContract.try_coins(BigInt.fromI32(i))

  if (coinResult.reverted) {
    // we have to duplicate code from getPoolCoin128 below because no type inheritance
    // not sure if possible to refactor by passing arrays as arg to single function
    // TODO: try above suggestion
    // some pools require an int128 for coins and will revert with the
    // regular abi. e.g. 0x7fc77b5c7614e1533320ea6ddc2eb61fa00a9714
    log.debug('Call to coins reverted for pool ({}), attempting 128 bytes call', [pool.id])
    const poolContract = CurvePoolCoin128.bind(poolAddress)
    const coins = pool.coins
    const coinNames = pool.coinNames
    const coinDecimals = pool.coinDecimals
    let coinResult = poolContract.try_coins(BigInt.fromI32(i))
    if (coinResult.reverted) {
      log.warning('Call to int128 coins failed for {}', [pool.id])
    }
    while (!coinResult.reverted) {
      coins.push(coinResult.value)
      coinNames.push(getName(coinResult.value))
      coinDecimals.push(getDecimals(coinResult.value))
      i += 1
      coinResult = poolContract.try_coins(BigInt.fromI32(i))
    }
    pool.coins = coins
    pool.coinNames = coinNames
    pool.coinDecimals = coinDecimals
    pool.save()
    return
  }

  while (!coinResult.reverted) {
    coins.push(coinResult.value)
    coinNames.push(getName(coinResult.value))
    coinDecimals.push(getDecimals(coinResult.value))
    i += 1
    coinResult = poolContract.try_coins(BigInt.fromI32(i))
  }
  pool.coins = coins
  pool.coinNames = coinNames
  pool.coinDecimals = coinDecimals
  pool.assetType = isV2 ? 4 : getAssetType(pool.name, pool.symbol, pool.coinNames)
  pool.save()
}

export function createNewFactoryPool(
  version: i32,
  factoryContract: Address,
  metapool: boolean,
  basePool: Address,
  lpToken: Address,
  timestamp: BigInt,
  block: BigInt,
  tx: Bytes
): void {
  let factoryPool: Address
  let poolType: string
  const factoryEntity = getFactory(factoryContract)
  const poolCount = factoryEntity.poolCount
  let isRebasing = false
  if (version == 1) {
    const factory = StableFactory.bind(factoryContract)
    poolType = factoryContract == Address.fromString(METAPOOL_FACTORY_ADDRESS) ? METAPOOL_FACTORY : STABLE_FACTORY
    factoryPool = factory.pool_list(poolCount)
    const implementationResult = factory.try_get_implementation_address(factoryPool)
    if (!implementationResult.reverted) {
      isRebasing = REBASING_POOL_IMPLEMENTATION_ADDRESSES.includes(implementationResult.value)
    }
    log.info('New factory pool (metapool: {}, base pool: {}) added {} with id {}', [
      metapool.toString(),
      basePool.toHexString(),
      factoryPool.toHexString(),
      poolCount.toString(),
    ])
  } else {
    const factory = CryptoFactory.bind(factoryContract)
    poolType = CRYPTO_FACTORY
    factoryPool = factory.pool_list(poolCount)
    log.info('New factory pool added (v2.0) {} with id {}', [factoryPool.toHexString(), poolCount.toString()])
  }
  factoryEntity.poolCount = factoryEntity.poolCount.plus(BIG_INT_ONE)
  factoryEntity.save()

  let name: string, symbol: string
  if (version == 2) {
    CurvePoolTemplateV2.create(factoryPool)
    const lpTokenContract = ERC20.bind(lpToken)
    name = lpTokenContract.name()
    symbol = lpTokenContract.symbol()
  } else {
    CurvePoolTemplate.create(factoryPool)
    const poolContract = CurvePool.bind(factoryPool)
    name = poolContract.name()
    symbol = poolContract.symbol()
  }
  createNewPool(
    factoryPool,
    lpToken == ADDRESS_ZERO ? factoryPool : lpToken,
    name,
    symbol,
    poolType,
    metapool,
    version == 2,
    isRebasing,
    block,
    tx,
    timestamp,
    basePool
  )
}

export function createNewRegistryPool(
  poolAddress: Address,
  basePool: Address,
  lpToken: Address,
  metapool: boolean,
  isV2: boolean,
  poolType: string,
  timestamp: BigInt,
  block: BigInt,
  tx: Bytes
): void {
  if (!Pool.load(poolAddress.toHexString())) {
    log.debug('Non factory pool ({}): {}, lpToken: {}, added to registry at {}', [
      isV2 ? 'v2' : 'v1',
      poolAddress.toHexString(),
      lpToken.toHexString(),
      tx.toHexString(),
    ])
    if (!isV2) {
      CurvePoolTemplate.create(poolAddress)
    } else {
      CurvePoolTemplateV2.create(poolAddress)
    }
    const lpTokenContract = ERC20.bind(lpToken)
    createNewPool(
      poolAddress,
      lpToken,
      lpTokenContract.name(),
      lpTokenContract.symbol(),
      poolType,
      metapool,
      isV2,
      false,
      block,
      tx,
      timestamp,
      basePool
    )
  } else {
    log.debug('Pool: {} added to the registry at {} but already tracked', [poolAddress.toHexString(), tx.toHexString()])
  }
}

export function getPoolCoins128(pool: BasePool): BasePool {
  const poolContract = CurvePoolCoin128.bind(Address.fromString(pool.id))
  let i = 0
  const coins = pool.coins
  const coinDecimals = pool.coinDecimals
  let coinResult = poolContract.try_coins(BigInt.fromI32(i))
  if (coinResult.reverted) {
    log.warning('Call to int128 coins failed for {}', [pool.id])
  }
  while (!coinResult.reverted) {
    coins.push(coinResult.value)
    coinDecimals.push(getDecimals(coinResult.value))
    i += 1
    coinResult = poolContract.try_coins(BigInt.fromI32(i))
  }
  pool.coins = coins
  pool.coinDecimals = coinDecimals
  pool.save()
  return pool
}

export function getBasePool(pool: Address): BasePool {
  let basePool = BasePool.load(pool.toHexString())
  if (!basePool) {
    log.info('Adding new base pool : {}', [pool.toHexString()])
    basePool = new BasePool(pool.toHexString())

    basePool.coins = new Array<Bytes>()
    basePool.coinDecimals = new Array<BigInt>()
    const poolContract = CurvePool.bind(pool)
    const coins = basePool.coins
    const coinDecimals = basePool.coinDecimals
    let i = 0
    let coinResult = poolContract.try_coins(BigInt.fromI32(i))

    if (coinResult.reverted) {
      // some pools require an int128 for coins and will revert with the
      // regular abi. e.g. 0x7fc77b5c7614e1533320ea6ddc2eb61fa00a9714
      log.debug('Call to coins reverted for pool ({}), attempting 128 bytes call', [basePool.id])
      return getPoolCoins128(basePool)
    }

    while (!coinResult.reverted) {
      coins.push(coinResult.value)
      coinDecimals.push(getDecimals(coinResult.value))
      i += 1
      coinResult = poolContract.try_coins(BigInt.fromI32(i))
    }
    basePool.coins = coins
    basePool.coinDecimals = coinDecimals
    basePool.save()
  }
  return basePool
}

export function getVirtualBaseLendingPool(pool: Address): BasePool {
  // we're creating fake base pools for lending pools just to have
  // an entity where we can store underlying coins and decimals
  let basePool = BasePool.load(pool.toHexString())
  if (!basePool) {
    log.info('Adding new virtual base lending pool : {}', [pool.toHexString()])
    basePool = new BasePool(pool.toHexString())

    basePool.coins = new Array<Bytes>()
    basePool.coinDecimals = new Array<BigInt>()
    const poolContract = CurveLendingPool.bind(pool)
    const coins = basePool.coins
    const coinDecimals = basePool.coinDecimals
    let i = 0
    let coinResult = poolContract.try_underlying_coins(BigInt.fromI32(i))

    if (coinResult.reverted) {
      // some lending pools require an int128 for underlying coins
      // e.g. 0x52ea46506b9cc5ef470c5bf89f17dc28bb35d85c
      log.debug('Call to coins reverted for pool ({}), attempting 128 bytes call', [basePool.id])
      const poolContract = CurveLendingPoolCoin128.bind(pool)
      coinResult = poolContract.try_underlying_coins(BigInt.fromI32(i))
      // needs to be repeated because can't assign a CurveLendingPoolCoin128 to
      // poolContract which is CurveLendingPool
      // TODO: see how to get around somehow
      while (!coinResult.reverted) {
        coins.push(coinResult.value)
        coinDecimals.push(getDecimals(coinResult.value))
        i += 1
        coinResult = poolContract.try_underlying_coins(BigInt.fromI32(i))
      }
      basePool.coins = coins
      basePool.coinDecimals = coinDecimals
      basePool.save()
      return basePool
    }

    while (!coinResult.reverted) {
      coins.push(coinResult.value)
      coinDecimals.push(getDecimals(coinResult.value))
      i += 1
      coinResult = poolContract.try_underlying_coins(BigInt.fromI32(i))
    }
    basePool.coins = coins
    basePool.coinDecimals = coinDecimals
    basePool.save()
  }
  return basePool
}


export function compareAgainstKnownAssetNames(name: string): i32 {
  const stables = ['USD', 'DAI', 'MIM', 'TETHER']
  for (let i = 0; i < stables.length; i++) {
    if (name.indexOf(stables[i]) >= 0) {
      return 0
    }
  }
  if (name.indexOf('BTC') >= 0) {
    return 2
  } else if (name.indexOf('ETH') >= 0) {
    return 1
  }
  return -1
}

export function getAssetType(name: string, symbol: string, coinNames: string[]): i32 {
  const description = name.toUpperCase() + '-' + symbol.toUpperCase()
  let inferredATFromDesc = compareAgainstKnownAssetNames(description)
  if (inferredATFromDesc != -1) {
    return inferredATFromDesc
  }
  for (let i = 0; i < coinNames.length; i++) {
    inferredATFromDesc = compareAgainstKnownAssetNames(coinNames[i].toUpperCase())
    if (inferredATFromDesc != -1) {
      return inferredATFromDesc
    }
  }
  return 3
}
