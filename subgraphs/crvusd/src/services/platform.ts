import { BigInt, Bytes } from '@graphprotocol/graph-ts'
import { Platform } from '../../generated/schema'


export function getPlatform(): Platform {
  let platform = Platform.load('0')
  if (!platform) {
    platform = new Platform('0')
    platform.ammAddresses = new Array<Bytes>()
    platform.latestSnapshot = BigInt.zero()
    platform.save()
  }
  return platform
}