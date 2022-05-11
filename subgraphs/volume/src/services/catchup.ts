// This is designed to make up for an issue with the way the current main
// registry was added to the address provider. Several pools were registered
// before the registry itself was indexed on the address provider and are
// therefore invisible to the subgraph. We can't backtrack automatically as
// we'd need information that we normally parsed from the event/registry.
// Issue may appear again in the future or on sidechain, so more functions
// might be added in the future.

import { Address, Bytes, log } from '@graphprotocol/graph-ts'
import {
ADDRESS_ZERO, UNKNOWN_METAPOOLS
} from '../../../../packages/constants'
import { createNewFactoryPool } from './pools'
import { MetaPool } from '../../generated/templates/RegistryTemplate/MetaPool'
import { BigInt } from '@graphprotocol/graph-ts/index'
import {
  MainRegistry
} from '../../generated/AddressProvider/MainRegistry'
import { Pool } from '../../generated/schema'
import { addRegistryPool } from '../mapping'
import { addCryptoRegistryPool } from '../mappingV2'
import { CryptoFactory } from '../../generated/AddressProvider/CryptoFactory'

export function catchUp(registryAddress: Address,
                                    factory: boolean,
                                    version: i32,
                                    block: BigInt,
                                    timestamp: BigInt,
                                    hash: Bytes): void {
  log.info("Adding missing pools on registry {} at block {}", [registryAddress.toHexString(), block.toString()])
  // ABI should also work for factories since we're only using pool_count/pool_list
  const registry = MainRegistry.bind(registryAddress)
  const cryptoFactory = CryptoFactory.bind(registryAddress)
  const poolCount = registry.try_pool_count()
  if (poolCount.reverted) {
    log.error("Error calling pool count on registry {}", [registryAddress.toHexString()])
    return
  }
  log.error("Found {} pools when registry added to address provider", [poolCount.value.toString()])
  for (let i = 0; i < poolCount.value.toI32(); i++) {
    const poolAddress = registry.try_pool_list(BigInt.fromI32(i))
    if (poolAddress.reverted) {
      log.error("Unable to get pool {} on registry {}", [i.toString(), registryAddress.toHexString()])
      continue
    }
    const pool = Pool.load(poolAddress.value.toHexString())
    if (pool || poolAddress.value == ADDRESS_ZERO) {
      log.warning("Pool {} already exists {} or is zero", [poolAddress.value.toHexString(), pool ? "y" : "n"])
      continue
    }
    if (!factory) {
      if (version == 1) {
        log.info("Retro adding stable registry pool: {}", [poolAddress.value.toHexString()])
        addRegistryPool(poolAddress.value,
          registryAddress,
          block,
          timestamp,
          hash)
      }
      else {
        log.info("Retro adding crypto registry pool: {}", [poolAddress.value.toHexString()])
        addCryptoRegistryPool(poolAddress.value,
          registryAddress,
          block,
          timestamp,
          hash)
      }
    }
    else {
      // crypto factories are straightforward
      if (version == 2) {
        log.info("Retro adding crypto factory pool: {}", [poolAddress.value.toHexString()])
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
      }
      else {
        log.info("Retro adding stable factory pool: {}", [poolAddress.value.toHexString()])
        const testMetaPool = MetaPool.bind(poolAddress.value)
        const testMetaPoolResult = testMetaPool.try_base_pool()
        const unknownMetapool = UNKNOWN_METAPOOLS.has(poolAddress.value.toHexString())
        const basePool = unknownMetapool ? UNKNOWN_METAPOOLS[poolAddress.value.toHexString()] : testMetaPoolResult.reverted ? ADDRESS_ZERO : testMetaPoolResult.value
        createNewFactoryPool(
          1,
          registryAddress,
          (!testMetaPoolResult.reverted || unknownMetapool),
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