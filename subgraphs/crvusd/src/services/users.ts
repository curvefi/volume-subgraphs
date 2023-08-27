import { User } from '../../generated/schema'
import { Address, BigInt } from '@graphprotocol/graph-ts'

export function getOrCreateUser(user: Address, timestamp: BigInt): User {
  let entity = User.load(user)
  if (!entity) {
    entity = new User(user)
    entity.depositedCollateral = BigInt.zero()
    entity.save()
  }
  return entity
}
