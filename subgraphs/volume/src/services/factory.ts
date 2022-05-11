import { Factory } from '../../generated/schema'
import { Address } from '@graphprotocol/graph-ts'


export function getFactory(factoryAddress: Address): Factory {
  let factory = Factory.load(factoryAddress.toHexString())
  if (!factory) {
    factory = new Factory(factoryAddress.toHexString())
    factory.save()
  }
  return factory
}
