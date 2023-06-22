import { MonetaryPolicy, PegKeeper } from '../../generated/schema'
import { Address, BigInt, Bytes, log } from '@graphprotocol/graph-ts'
import { MonetaryPolicy as MonetaryPolicyAbi } from '../../generated/templates/MonetaryPolicy/MonetaryPolicy'
import { PegKeeper as PegKeeperTemplate } from '../../generated/templates'
import { PegKeeper as PegKeeperAbi } from '../../generated/templates/MonetaryPolicy/PegKeeper'

export function getOrCreatePolicy(policy_address: Address): MonetaryPolicy {
  let policy = MonetaryPolicy.load(policy_address)
  if (!policy) {
    const policyContract = MonetaryPolicyAbi.bind(policy_address)
    policy = new MonetaryPolicy(policy_address)
    policy.priceOracle = policyContract.PRICE_ORACLE()
    policy.keepers = new Array<Bytes>()
    policy.keepers = getPegKeepers(policyContract, policy.keepers)
    policy.save()
  }
  return policy
}

function getPegKeepers(policyContract: MonetaryPolicyAbi, keepers: Bytes[]): Bytes[] {
  let index = 0
  while (true) {
    const pegKeeper = policyContract.try_peg_keepers(BigInt.fromI32(index))
    if (pegKeeper.reverted || pegKeeper.value == Address.zero()) {
      break
    }
    log.info('Found peg keeper {} for policy {}', [
      pegKeeper.value.toHexString(),
      policyContract._address.toHexString(),
    ])
    PegKeeperTemplate.create(pegKeeper.value)
    const keeper = new PegKeeper(pegKeeper.value)
    const keeperContract = PegKeeperAbi.bind(pegKeeper.value)
    keeper.active = true
    keeper.policy = policyContract._address
    keeper.debt = BigInt.zero()
    keeper.pool = keeperContract.pool()
    keeper.totalWithdrawn = BigInt.zero()
    keeper.totalProvided = BigInt.zero()
    keeper.totalProfit = BigInt.zero()
    keeper.save()
    // unlikely, but we don't want to risk having duplicates
    if (keepers.indexOf(pegKeeper.value) < 0) {
      keepers.push(pegKeeper.value)
    }
    index += 1
  }
  return keepers
}
