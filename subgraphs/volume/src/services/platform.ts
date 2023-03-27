import { Platform } from '../../generated/schema'
import { BIG_INT_ZERO, CURVE_PLATFORM_ID } from 'const'
import { Bytes } from '@graphprotocol/graph-ts'

export function getPlatform(): Platform {
  let platform = Platform.load(CURVE_PLATFORM_ID)
  if (!platform) {
    platform = new Platform(CURVE_PLATFORM_ID)
    platform.poolAddresses = new Array<Bytes>()
    platform.latestPoolSnapshot = BIG_INT_ZERO
    platform.save()
  }
  return platform
}
