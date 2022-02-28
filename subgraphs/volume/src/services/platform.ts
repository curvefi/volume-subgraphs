import { Platform } from '../../generated/schema'
import { CURVE_PLATFORM_ID } from '../../../../packages/constants'

export function getPlatform(): Platform {
  let platform = Platform.load(CURVE_PLATFORM_ID)
  if (!platform) {
    platform = new Platform(CURVE_PLATFORM_ID)
  }
  return platform
}
