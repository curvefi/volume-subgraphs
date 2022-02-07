import { CurvePoolTemplate, CurvePoolTemplateV2 } from '../../generated/templates'
import { BasePool, Pool } from '../../generated/schema'
import { BigInt } from '@graphprotocol/graph-ts/index'
import { Address, Bytes, log } from '@graphprotocol/graph-ts'
import { getDecimals } from '../../../../packages/utils/pricing'
import { getPlatform } from './platform'
import {
  ADDRESS_ZERO,
  BIG_INT_ONE,
  CURVE_FACTORY_V1,
  CURVE_FACTORY_V1_2,
  CURVE_FACTORY_V2,
  CURVE_PLATFORM_ID,
  EARLY_V2_POOLS,
  FACTORY_V10,
  FACTORY_V12,
  FACTORY_V20,
  REGISTRY_V1,
  REGISTRY_V2,
} from '../../../../packages/constants'
import { CurveFactoryV12 } from '../../generated/CurveFactoryV12/CurveFactoryV12'
import { CurveFactoryV10 } from '../../generated/CurveFactoryV10/CurveFactoryV10'
import { CurvePool } from '../../generated/templates/CurvePoolTemplate/CurvePool'
import { CurvePoolCoin128 } from '../../generated/templates/CurvePoolTemplate/CurvePoolCoin128'
import { ERC20 } from '../../generated/CurveRegistryV1/ERC20'
import { CurveFactoryV20 } from '../../generated/CurveFactoryV20/CurveFactoryV20'
import { CurveLendingPool } from '../../generated/CurveRegistryV1/CurveLendingPool'
import { CurveLendingPoolCoin128 } from '../../generated/CurveRegistryV1/CurveLendingPoolCoin128'

export function createNewPool(
  poolAddress: Address,
  lpToken: Address,
  name: string,
  symbol: string,
  poolType: string,
  metapool: boolean,
  isV2: boolean,
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
  const poolContract = CurvePool.bind(poolAddress)
  pool.name = name
  pool.platform = platform.id
  pool.lpToken = lpToken
  pool.symbol = symbol
  pool.metapool = metapool
  pool.isV2 = isV2
  pool.address = poolAddress
  pool.creationBlock = block
  pool.creationTx = tx
  pool.creationDate = timestamp
  pool.poolType = poolType
  pool.assetType = isV2 ? 4 : getAssetType(pool.name, pool.symbol)
  pool.basePool = basePool

  const coins = pool.coins
  const coinDecimals = pool.coinDecimals
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
    return
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
}

export function createNewRegistryPool(
  poolAddress: Address,
  basePool: Address,
  lpToken: Address,
  metapool: boolean,
  isV2: boolean,
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
    const poolType = isV2 ? REGISTRY_V2 : REGISTRY_V1
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
      block,
      tx,
      timestamp,
      basePool
    )
  } else {
    log.debug('Pool: {} added to the registry at {} but already tracked', [poolAddress.toHexString(), tx.toHexString()])
  }
}

export function createNewFactoryPool(
  version: i32,
  metapool: boolean,
  basePool: Address,
  lpToken: Address,
  timestamp: BigInt,
  block: BigInt,
  tx: Bytes
): void {
  const platform = getPlatform()
  let poolCount: BigInt
  let factoryPool: Address
  let poolType: string
  if (version == 12) {
    const factory = CurveFactoryV12.bind(CURVE_FACTORY_V1_2)
    poolCount = platform.poolCountV12
    poolType = FACTORY_V12
    factoryPool = factory.pool_list(poolCount)
    log.info('New factory pool added (v1.2) {} with id {}', [factoryPool.toHexString(), poolCount.toString()])
    platform.poolCountV12 = platform.poolCountV12.plus(BIG_INT_ONE)
  } else if (version == 10) {
    const factory = CurveFactoryV10.bind(CURVE_FACTORY_V1)
    poolCount = platform.poolCountV10
    poolType = FACTORY_V10
    factoryPool = factory.pool_list(poolCount)
    log.info('New factory pool added (v1.0) {} with id {}', [factoryPool.toHexString(), poolCount.toString()])
    platform.poolCountV10 = platform.poolCountV10.plus(BIG_INT_ONE)
  } else {
    const factory = CurveFactoryV20.bind(CURVE_FACTORY_V2)
    poolCount = platform.poolCountV20
    poolType = FACTORY_V20
    factoryPool = factory.pool_list(poolCount)
    log.info('New factory pool added (v2.0) {} with id {}', [factoryPool.toHexString(), poolCount.toString()])
    platform.poolCountV20 = platform.poolCountV20.plus(BIG_INT_ONE)
  }
  platform.save()
  let name: string, symbol: string
  if (version == 20) {
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
    version == 20,
    block,
    tx,
    timestamp,
    basePool
  )
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

export function getAssetType(name: string, symbol: string): i32 {
  const description = name.toUpperCase() + '-' + name.toUpperCase()
  if (description.indexOf('USD') >= 0 || description.indexOf('DAI') >= 0) {
    return 0
  } else if (description.indexOf('BTC') >= 0) {
    return 2
  } else if (description.indexOf('ETH') >= 0) {
    return 1
  } else {
    return 3
  }
}
