import { Factory } from '../../generated/schema'
import { BIG_INT_ZERO, CURVE_PLATFORM_ID } from '../../../../packages/constants'
import { Address } from '@graphprotocol/graph-ts'
import { StableFactory } from '../../generated/AddressProvider/StableFactory'
import { CryptoFactory } from '../../generated/templates/CryptoRegistryTemplate/CryptoFactory'

export function getFactory(factoryAddress: Address, version: i32): Factory {
  let factory = Factory.load(factoryAddress.toHexString())
  if (!factory) {
    factory = new Factory(factoryAddress.toHexString())
    factory.save()
  }
  return factory
}
