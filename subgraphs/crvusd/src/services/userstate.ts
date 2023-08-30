import { Market, Snapshot, UserStateSnapshot } from '../../generated/schema'
import { Address, BigDecimal, BigInt, Bytes, ethereum, log } from '@graphprotocol/graph-ts'
import { getOrCreateDeposit, getOrCreateUser } from './users'
import { Multicall } from '../../generated/templates/Llamma/Multicall'
import { toDecimal } from './snapshot'

const MULTICALL = '0xeefba1e63905ef1d7acba5a8513c70307c1ce441'
const multicall = Multicall.bind(Address.fromString(MULTICALL))

function multiCall(targets: Address[], inputValueTypes: string[][]): (ethereum.Value | null)[] | null {
  const params: Array<ethereum.Tuple> = []
  for (let i = 0; i < inputValueTypes.length; i++) {
    params.push(
      changetype<ethereum.Tuple>([
        ethereum.Value.fromAddress(targets[i]),
        ethereum.Value.fromBytes(Bytes.fromHexString(inputValueTypes[i][0])),
      ])
    )
  }
  const callResult = multicall.tryCall('aggregate', 'aggregate((address,bytes)[]):(uint256,bytes[])', [
    ethereum.Value.fromTupleArray(params),
  ])
  if (callResult.reverted) {
    return null
  }
  const multiResults = callResult.value[1].toBytesArray()
  const valueResults: Array<ethereum.Value | null> = []
  for (let i = 0; i < multiResults.length; i++) {
    const res = ethereum.decode(inputValueTypes[i][1], multiResults[i])
    valueResults.push(res)
  }
  return valueResults
}

export function takeUserStateSnapshot(snapshot: Snapshot): void {
  const multiParamsLoansIx: string[][] = []
  const targets: Address[] = []
  const market = Market.load(snapshot.market)
  if (!market) {
    log.error('Unable to load market {} for snapshot {}', [snapshot.market.toHexString(), snapshot.id])
    return
  }
  const precision = market.collateralPrecision.toString()
  for (let i = 0; i < snapshot.nLoans.toI32(); i++) {
    const loanIx = '0xe1ec3c68' + BigInt.fromI32(i).toHexString().slice(2).padStart(64, '0')
    multiParamsLoansIx.push([loanIx, 'address'])
    targets.push(Address.fromBytes(snapshot.market))
  }
  const results = multiCall(targets, multiParamsLoansIx)
  if (!results) {
    log.error('Multicall for loans failed {}', [snapshot.id])
    return
  }
  // we'll proceed by batches of 200 users
  const batchSize = 200
  for (let i = 0; i < results.length; i += batchSize) {
    const batch = results.slice(i, i + batchSize)
    const multiParamsUserInfo: string[][] = []
    const targets: Address[] = []
    for (let j = 0; j < batch.length; j++) {
      const address = batch[j]
      if (!address) {
        continue
      }
      const userAddress = address.toAddress()
      const paddedUserAddress = userAddress.toHexString().slice(2).padStart(64, '0')
      const userState = '0xec74d0a8' + paddedUserAddress // user_state
      multiParamsUserInfo.push([userState, 'uint256[4]'])
      targets.push(Address.fromBytes(snapshot.market))
      const userHealth = '0xe2d8ebee' + paddedUserAddress // health
      multiParamsUserInfo.push([userHealth, 'uint256'])
      targets.push(Address.fromBytes(snapshot.market))
      const yUp = '0xee4c32ee' + paddedUserAddress // get_y_up
      multiParamsUserInfo.push([yUp, 'uint256'])
      targets.push(Address.fromBytes(snapshot.llamma))
      const ticks = '0xb461100d' + paddedUserAddress // read_user_tick_numbers
      multiParamsUserInfo.push([ticks, 'int256[2]'])
      targets.push(Address.fromBytes(snapshot.llamma))
    }
    const combinedResults = multiCall(targets, multiParamsUserInfo)
    if (!combinedResults) {
      log.error('Multicall for user info failed {}', [snapshot.id])
      return
    }
    for (let j = 0; j < batch.length; j++) {
      const userAddressValue = batch[j]
      if (!userAddressValue) {
        continue
      }
      const address = userAddressValue.toAddress()
      const deposit = getOrCreateDeposit(address, Address.fromBytes(market.id))
      const results = combinedResults.slice(j * 4, (j + 1) * 4)
      const userStateResults = results[0]
      const userStateValues = userStateResults
        ? userStateResults.toBigIntArray()
        : [BigInt.zero(), BigInt.zero(), BigInt.zero(), BigInt.zero()]
      const healthResults = results[1]
      const healthValues = healthResults ? healthResults.toBigInt() : BigInt.zero()
      const yUpResults = results[2]
      const yUpValues = yUpResults ? yUpResults.toBigInt() : BigInt.zero()
      const ticksResults = results[3]
      const ticksValues = ticksResults ? ticksResults.toBigIntArray() : [BigInt.zero(), BigInt.zero()]

      const userStateSnapshot = new UserStateSnapshot(snapshot.id + '-' + address.toHexString())
      userStateSnapshot.user = address
      userStateSnapshot.market = snapshot.market
      userStateSnapshot.snapshot = snapshot.id
      userStateSnapshot.collateral = toDecimal(userStateValues[0], precision)
      userStateSnapshot.depositedCollateral = toDecimal(deposit.depositedCollateral, precision)
      userStateSnapshot.collateralUp = toDecimal(yUpValues, precision)
      if (deposit.depositedCollateral.le(BigInt.zero())) {
        userStateSnapshot.loss = BigDecimal.zero()
        userStateSnapshot.lossPct = BigDecimal.zero()
      } else {
        const loss = userStateSnapshot.depositedCollateral.minus(userStateSnapshot.collateralUp)
        // rounding
        userStateSnapshot.loss = loss.le(BigDecimal.fromString('0.00000001')) ? BigDecimal.zero() : loss
        userStateSnapshot.lossPct = userStateSnapshot.loss
          .div(userStateSnapshot.depositedCollateral)
          .times(BigDecimal.fromString('100'))
      }
      userStateSnapshot.stablecoin = toDecimal(userStateValues[1], '18')
      userStateSnapshot.debt = toDecimal(userStateValues[2], '18')
      userStateSnapshot.n = userStateValues[3]
      userStateSnapshot.n1 = ticksValues[0]
      userStateSnapshot.n2 = ticksValues[1]
      userStateSnapshot.health = toDecimal(healthValues, '18')
      userStateSnapshot.timestamp = snapshot.timestamp
      userStateSnapshot.save()
    }
  }
}
