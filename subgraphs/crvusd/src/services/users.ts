import { DepositedCollateral, User } from '../../generated/schema'
import { Address, BigInt } from '@graphprotocol/graph-ts'

export function getOrCreateUser(user: Address, block: BigInt): User {
  let entity = User.load(user)
  if (!entity) {
    entity = new User(user)
    entity.firstActionBlock = block
    entity.save()
  }
  return entity
}

export function getOrCreateDeposit(user: Address, market: Address): DepositedCollateral {
  const id = user.toHexString() + '-' + market.toHexString()
  let entity = DepositedCollateral.load(id)
  if (!entity) {
    entity = new DepositedCollateral(id)
    entity.depositedCollateral = BigInt.zero()
    entity.user = user
    entity.market = market
    entity.save()
  }
  return entity
}
