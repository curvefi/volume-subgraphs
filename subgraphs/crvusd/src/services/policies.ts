import {
  MonetaryPolicy,
  PegKeeper,
  PolicyPegKeeper
} from '../../generated/schema'
import { Address, BigInt, Bytes, log } from '@graphprotocol/graph-ts'
import { MonetaryPolicy as MonetaryPolicyAbi } from '../../generated/templates/MonetaryPolicy/MonetaryPolicy'
import { PegKeeper as PegKeeperTemplate } from '../../generated/templates'
import { PegKeeper as PegKeeperAbi } from '../../generated/templates/MonetaryPolicy/PegKeeper'

export function getOrCreatePolicy(policyAddress: Address): MonetaryPolicy {
  let policy = MonetaryPolicy.load(policyAddress)
  if (!policy) {
    const policyContract = MonetaryPolicyAbi.bind(policyAddress)
    policy = new MonetaryPolicy(policyAddress)
    policy.priceOracle = policyContract.PRICE_ORACLE()
    policy.keepers = new Array<Bytes>()
    policy.keepers = getPegKeepers(policyContract, policy.keepers)
    policy.save()
  }
  return policy
}

export function getOrCreatePolicyPegKeeper(policyAddress: Address, keeperAddress: Address): PolicyPegKeeper {
  const ppkId = policyAddress.concat(keeperAddress)
  let policyPegKeeper = PolicyPegKeeper.load(ppkId)
  if (!policyPegKeeper) {
    policyPegKeeper = new PolicyPegKeeper(ppkId)
    policyPegKeeper.pegKeeper = keeperAddress
    policyPegKeeper.policy = policyAddress
    policyPegKeeper.save()
  }
  return policyPegKeeper
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
    let keeper = PegKeeper.load(pegKeeper.value)
    if (keeper) {
      log.info('Keeper {} for policy {} already exists', [      pegKeeper.value.toHexString(),
        policyContract._address.toHexString(),])
    }
    else {
      PegKeeperTemplate.create(pegKeeper.value)
      keeper = new PegKeeper(pegKeeper.value)
      const keeperContract = PegKeeperAbi.bind(pegKeeper.value)
      keeper.active = true
      keeper.debt = BigInt.zero()
      keeper.pool = keeperContract.pool()
      keeper.totalWithdrawn = BigInt.zero()
      keeper.totalProvided = BigInt.zero()
      keeper.totalProfit = BigInt.zero()
      keeper.save()
    }
    getOrCreatePolicyPegKeeper(policyContract._address, pegKeeper.value)
    // unlikely, but we don't want to risk having duplicates
    if (keepers.indexOf(pegKeeper.value) < 0) {
      keepers.push(pegKeeper.value)
    }
    index += 1
  }
  return keepers
}
