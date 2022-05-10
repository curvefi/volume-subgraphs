// This is designed to make up for an issue with the way the current main
// registry was added to the address provider. Several pools were registered
// before the registry itself was indexed on the address provider and are
// therefore invisible to the subgraph. We can't backtrack automatically as
// we'd need information that we normally parsed from the event/registry.
// Issue may appear again in the future or on sidechain, so more functions
// might be added in the future.

import { Address, Bytes, log } from '@graphprotocol/graph-ts'
import {
  LENDING,
  REGISTRY_V1,
  CATCHUP_BLOCK,
  CURVE_REGISTRY_V1,
  REGISTRY_V2,
  TRICRYPTO2_POOL_ADDRESS, ADDRESS_ZERO, UNKNOWN_METAPOOLS
} from '../../../../packages/constants'
import { createNewFactoryPool, createNewPool } from './pools'
import { MetaPool } from '../../generated/templates/RegistryTemplate/MetaPool'
import { BigInt } from '@graphprotocol/graph-ts/index'
import { CurvePoolTemplate } from '../../generated/templates'
import { getLpToken } from '../mapping'
import { ERC20 } from '../../generated/templates/CurvePoolTemplate/ERC20'
import {
  MainRegistry,
  PoolAdded
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

export function catchUpRegistryMainnet(): void {
  const POOLS = [Address.fromString('0x4ca9b3063ec5866a4b82e437059d2c43d1be596f'),
    Address.fromString('0xa2b47e3d5c44877cca798226b7b8118f9bfb7a56'),
    Address.fromString('0x79a8c46dea5ada233abaffd40f3a0a2b1e5a4f27'),
    Address.fromString('0x06364f10b501e868329afbc005b3492902d6c763'),
    Address.fromString('0x93054188d876f558f4a66b2ef1d97d16edf0895b'),
    Address.fromString('0xa5407eae9ba41422680e2e00537571bcc53efbfd'),
    Address.fromString('0x52ea46506b9cc5ef470c5bf89f17dc28bb35d85c'),
    Address.fromString('0x45f783cce6b7ff23b2ab2d70e416cdb7d6055f51'),
    Address.fromString('0x4f062658eaaf2c1ccf8c8e36d6824cdf41167956'),
    Address.fromString('0x3ef6a01a0f81d6046290f3e2a8c5b843e738e604'),
    Address.fromString('0xe7a24ef0c5e95ffb0f6684b813a78f2a3ad7d171'),
    Address.fromString('0x8474ddbe98f5aa3179b3b3f5942d724afcdec9f6'),
    Address.fromString('0xc18cc39da8b11da8c3541c598ee022258f9744da'),
    Address.fromString('0x3e01dd8a5e1fb3481f0f589056b428fc308af0fb'),
    Address.fromString('0x0f9cb53ebe405d49a0bbdbd291a65ff571bc83e1'),
    Address.fromString('0xc25099792e9349c7dd09759744ea681c7de2cb66')]
  const TYPES = [REGISTRY_V1, LENDING, LENDING, LENDING,
    REGISTRY_V1, LENDING, LENDING, LENDING,
    REGISTRY_V1, REGISTRY_V1, REGISTRY_V1, REGISTRY_V1,
    REGISTRY_V1, REGISTRY_V1, REGISTRY_V1, REGISTRY_V1
  ]
  for (let i = 0; i < POOLS.length; i++) {
    log.info('Manually adding pool {}', [POOLS[i].toHexString()])
    const testMetaPool = MetaPool.bind(POOLS[i])
    const testMetaPoolResult = testMetaPool.try_base_pool()
    const lpToken = getLpToken(POOLS[i], CURVE_REGISTRY_V1)
    const lpTokenContract = ERC20.bind(lpToken)
    CurvePoolTemplate.create(POOLS[i])
    createNewPool(
      POOLS[i],
      lpToken,
      lpTokenContract.name(),
      lpTokenContract.symbol(),
      TYPES[i],
      !testMetaPoolResult.reverted,
      false,
      CATCHUP_BLOCK,
      Bytes.fromByteArray(Bytes.fromI32(0)),
      BigInt.fromI32(1617872135),
      testMetaPoolResult.reverted ? POOLS[i] : testMetaPoolResult.value
    )
  }
}

export function catchUpAvax(): void {
  const POOLS = [Address.fromString('0xF72beaCc6fD334E14a7DDAC25c3ce1Eb8a827E10'),
    Address.fromString('0xb0D2EB3C2cA3c6916FAb8DCbf9d9c165649231AE'),
    Address.fromString('0x065f44cd602cc6680e82e516125839b9bbbbe57e'),
    Address.fromString('0x850c7cc8757ce1fa8ced709f297d842e12e61759'),
    Address.fromString('0xaea2e71b631fa93683bcf256a8689dfa0e094fcd'),
    Address.fromString('0x6041631c566eb8dc6258a75fa5370761d4873990'),
    Address.fromString('0xf92c2a3c91bf869f77f9cb221c5ab1b1ada8a586'),
    Address.fromString('0xe9dcf2d2a17ead11fab8b198578b20535370be6a'),
    Address.fromString('0x30df229cefa463e991e29d42db0bae2e122b2ac7'),
]
  for (let i = 0; i < POOLS.length; i++) {
    log.info('Manually adding pool {}', [POOLS[i].toHexString()])
    const testMetaPool = MetaPool.bind(POOLS[i])
    const testMetaPoolResult = testMetaPool.try_base_pool()
    CurvePoolTemplate.create(POOLS[i])
    createNewFactoryPool(
      1,
      Address.fromString("0xb17b674d9c5cb2e441f8e196a2f048a81355d031"),
      !testMetaPoolResult.reverted,
      testMetaPoolResult.reverted ? POOLS[i] : testMetaPoolResult.value,
      POOLS[i],
      BigInt.fromI32(1641737222),
      CATCHUP_BLOCK,
      Bytes.fromByteArray(Bytes.fromI32(0)),
    )
  }
  // Adding tricrypto because crypto registry was also added late
  // to address provider
  createNewPool(
    TRICRYPTO2_POOL_ADDRESS,
    Address.fromString("0x1daB6560494B04473A0BE3E7D83CF3Fdf3a51828"),
    "tricrypto",
    "tricrypto",
    REGISTRY_V2,
    false,
    true,
    CATCHUP_BLOCK,
    Bytes.fromByteArray(Bytes.fromI32(0)),
    BigInt.fromI32(1641737222),
    TRICRYPTO2_POOL_ADDRESS,
  )
}