import { NewAddressIdentifier, AddressModified } from '../generated/AddressProvider/AddressProvider'
import { BIG_INT_ZERO, CURVE_PLATFORM_ID } from '../../../packages/constants'
import { BigInt } from '@graphprotocol/graph-ts/index'
import { Factory, Registry } from '../generated/schema'
import { CryptoRegistryTemplate, RegistryTemplate, StableFactoryTemplate } from '../generated/templates'
import { Address, log } from '@graphprotocol/graph-ts'

export function addAddress(providedId: BigInt, addedAddress: Address): void {
  if (providedId == BIG_INT_ZERO) {
    let mainRegistry = Registry.load(addedAddress.toHexString())
    if (!mainRegistry) {
      log.info('New main registry added: {}', [addedAddress.toHexString()])
      mainRegistry = new Registry(addedAddress.toHexString())
      mainRegistry.save()
      RegistryTemplate.create(addedAddress)
    }
  } else if (providedId == BigInt.fromString('3')) {
    let stableFactory = Factory.load(addedAddress.toHexString())
    if (!stableFactory) {
      log.info('New stable factory added: {}', [addedAddress.toHexString()])
      stableFactory = new Factory(addedAddress.toHexString())
      stableFactory.save()
      StableFactoryTemplate.create(addedAddress)
    }
  } else if (providedId == BigInt.fromString('5')) {
    let cryptoRegistry = Factory.load(addedAddress.toHexString())
    if (!cryptoRegistry) {
      log.info('New crypto factory added: {}', [addedAddress.toHexString()])
      cryptoRegistry = new Factory(addedAddress.toHexString())
      cryptoRegistry.save()
      CryptoRegistryTemplate.create(addedAddress)
    }
  }
}

export function handleNewAddressIdentifier(event: NewAddressIdentifier): void {
  const providedId = event.params.id
  const addedAddress = event.params.addr
  addAddress(providedId, addedAddress)
}

export function handleAddressModified(event: AddressModified): void {
  const providedId = event.params.id
  const addedAddress = event.params.new_address
  addAddress(providedId, addedAddress)
}
