import { Factory } from '../../generated/schema'
import { Address } from '@graphprotocol/graph-ts'
import { BIG_INT_ZERO } from 'const'

export function getFactory(factoryAddress: Address): Factory {
  let factory = Factory.load(factoryAddress.toHexString())
  if (!factory) {
    factory = new Factory(factoryAddress.toHexString())
    factory.poolCount = BIG_INT_ZERO
    factory.save()
  }
  return factory
}
