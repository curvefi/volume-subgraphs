// This is designed to make up for an issue with the way the current main
// registry was added to the address provider. Several pools were registered
// before the registry itself was indexed on the address provider and are
// therefore invisible to the subgraph. We can't backtrack automatically as
// we'd need information that we normally parsed from the event/registry.
// Issue may appear again in the future or on sidechain, so more functions
// might be added in the future.

import { Address, Bytes, log } from '@graphprotocol/graph-ts'
import {
  ADDRESS_ZERO,
  BIG_INT_ONE,
  TRICRYPTO_FACTORY,
  UNKNOWN_METAPOOLS
} from 'const'
import { createNewFactoryPool, createNewPool } from './pools'
import { MetaPool } from '../../generated/templates/RegistryTemplate/MetaPool'
import { BigInt } from '@graphprotocol/graph-ts/index'
import { MainRegistry } from '../../generated/AddressProvider/MainRegistry'
import { Factory, Pool } from '../../generated/schema'
import { addRegistryPool } from '../mapping'
import { addCryptoRegistryPool } from '../mappingV2'
import { CryptoFactory } from '../../generated/AddressProvider/CryptoFactory'
import { TriCryptoOptimizedTemplateV2 } from '../../generated/templates'
import { ERC20 } from '../../generated/templates/CurvePoolTemplate/ERC20'
import {
  TriCryptoFactory
} from '../../generated/templates/TriCryptoFactoryTemplate/TriCryptoFactory'

export function catchUp(
  registryAddress: Address,
  factory: boolean,
  version: i32,
  block: BigInt,
  timestamp: BigInt,
  hash: Bytes
): void {
  log.info('Adding missing pools on registry {} at block {}', [registryAddress.toHexString(), block.toString()])
  // ABI should also work for factories since we're only using pool_count/pool_list
  const registry = MainRegistry.bind(registryAddress)
  const cryptoFactory = CryptoFactory.bind(registryAddress)
  const poolCount = registry.try_pool_count()
  if (poolCount.reverted) {
    log.error('Error calling pool count on registry {}', [registryAddress.toHexString()])
    return
  }
  log.error('Found {} pools when registry added to address provider', [poolCount.value.toString()])
  for (let i = 0; i < poolCount.value.toI32(); i++) {
    const poolAddress = registry.try_pool_list(BigInt.fromI32(i))
    if (poolAddress.reverted) {
      log.error('Unable to get pool {} on registry {}', [i.toString(), registryAddress.toHexString()])
      continue
    }
    const pool = Pool.load(poolAddress.value.toHexString())
    if (pool || poolAddress.value == ADDRESS_ZERO) {
      log.warning('Pool {} already exists {} or is zero', [poolAddress.value.toHexString(), pool ? 'y' : 'n'])
      // still need to increase pool count because pool will be registered
      if (factory) {
        const factoryEntity = Factory.load(registryAddress.toHexString())
        if (!factoryEntity) {
          return
        }
        factoryEntity.poolCount = factoryEntity.poolCount.plus(BIG_INT_ONE)
        factoryEntity.save()
      }
      continue
    }
    if (!factory) {
      if (version == 1) {
        log.info('Retro adding stable registry pool: {}', [poolAddress.value.toHexString()])
        addRegistryPool(poolAddress.value, registryAddress, block, timestamp, hash)
      } else {
        log.info('Retro adding crypto registry pool: {}', [poolAddress.value.toHexString()])
        addCryptoRegistryPool(poolAddress.value, registryAddress, block, timestamp, hash)
      }
    } else {
      // crypto factories are straightforward
      if (version == 2) {
        log.info('Retro adding crypto factory pool: {}', [poolAddress.value.toHexString()])
        createNewFactoryPool(
          2,
          registryAddress,
          false,
          ADDRESS_ZERO,
          cryptoFactory.get_token(poolAddress.value),
          timestamp,
          block,
          hash
        )
      } else {
        log.info('Retro adding stable factory pool: {}', [poolAddress.value.toHexString()])
        const testMetaPool = MetaPool.bind(poolAddress.value)
        const testMetaPoolResult = testMetaPool.try_base_pool()
        const unknownMetapool = UNKNOWN_METAPOOLS.has(poolAddress.value.toHexString())
        const basePool = unknownMetapool
          ? UNKNOWN_METAPOOLS[poolAddress.value.toHexString()]
          : testMetaPoolResult.reverted
          ? ADDRESS_ZERO
          : testMetaPoolResult.value
        createNewFactoryPool(
          1,
          registryAddress,
          !testMetaPoolResult.reverted || unknownMetapool,
          basePool,
          ADDRESS_ZERO,
          timestamp,
          block,
          hash
        )
      }
    }
  }
}

export function catchUpTriCrypto(factoryAddress: Address,
                                 block: BigInt,
                                 timestamp: BigInt,
                                 hash: Bytes): void {
  const triCryptoFactory = TriCryptoFactory.bind(factoryAddress)
  const poolCount = triCryptoFactory.try_pool_count()
  if (poolCount.reverted) {
    log.error('Error calling pool count on tricrypto factory {}', [factoryAddress.toHexString()])
    return
  }
  log.error('Found {} pools when tricrypto factory added to address provider', [poolCount.value.toString()])
  for (let i = 0; i < poolCount.value.toI32(); i++) {
    const poolAddress = triCryptoFactory.try_pool_list(BigInt.fromI32(i))
    if (poolAddress.reverted) {
      log.error('Unable to get pool {} on tricrypto factory {}', [i.toString(), factoryAddress.toHexString()])
      continue
    }
    const addedAddress = poolAddress.value
    TriCryptoOptimizedTemplateV2.create(addedAddress)
    const poolAsToken = ERC20.bind(addedAddress)
    const name = poolAsToken.name()
    const symbol = poolAsToken.symbol()
    createNewPool(
      addedAddress,
      addedAddress,
      name,
      symbol,
      TRICRYPTO_FACTORY,
      false,
      true,
      false,
      block,
      hash,
      timestamp,
      ADDRESS_ZERO
    )
  }
}