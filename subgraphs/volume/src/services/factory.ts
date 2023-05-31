import { Factory } from '../../generated/schema'
import { Address } from '@graphprotocol/graph-ts'
import { BIG_INT_ZERO } from 'const'

// eslint-disable-next-line @typescript-eslint/no-inferrable-types
export function getFactory(factoryAddress: Address, crvUsd: boolean = false): Factory {
  let factory = Factory.load(factoryAddress.toHexString())
  if (!factory) {
    factory = new Factory(factoryAddress.toHexString())
    factory.poolCount = BIG_INT_ZERO
    factory.crvUsd = crvUsd
    factory.save()
  }
  return factory
}
