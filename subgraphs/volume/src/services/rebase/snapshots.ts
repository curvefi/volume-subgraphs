import { Address, BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import { TokenSnapshot } from '../../../generated/schema'
import { DAY, getIntervalFromTimestamp } from 'utils/time'
import { AToken } from '../../../generated/templates/CurvePoolTemplate/AToken'
import {
  BIG_DECIMAL_ZERO,
  BIG_INT_ZERO,
  USDN_TOKEN,
  AETH_TOKEN,
  LIDO_STETH_CONTRACT,
  CBETH_ADDRESS,
  BIG_DECIMAL_ONE,
  BIG_DECIMAL_1E18,
} from 'const'
import { CBETH } from '../../../generated/AddressProvider/CBETH'

// Used to calculate rebase APR of aTokens
// We store the total supply / total supply scaled ratio as price
export function getATokenSnapshotPrice(token: Address, timestamp: BigInt): BigDecimal {
  const day = getIntervalFromTimestamp(timestamp, DAY)
  const snapshotId = token.toHexString() + '-' + day.toString() + '-rebase'
  let snapshot = TokenSnapshot.load(snapshotId)
  if (!snapshot) {
    snapshot = new TokenSnapshot(snapshotId)
    const aTokenContract = AToken.bind(token)
    const totalSupplyResult = aTokenContract.try_totalSupply()
    const scaledTotalSupplyResult = aTokenContract.try_scaledTotalSupply()
    if (totalSupplyResult.reverted || scaledTotalSupplyResult.reverted) {
      snapshot.price = BIG_DECIMAL_ZERO
    } else {
      const totalSupply = totalSupplyResult.value
      const scaledTotalSupply = scaledTotalSupplyResult.value
      snapshot.price =
        scaledTotalSupply == BIG_INT_ZERO
          ? BIG_DECIMAL_ZERO
          : totalSupply.toBigDecimal().div(scaledTotalSupply.toBigDecimal())
    }
    snapshot.token = token
    snapshot.timestamp = timestamp
    snapshot.save()
  }
  return snapshot.price
}

// Used to calculate rebase APR of CBETH
export function getCBETHSnapshotRate(timestamp: BigInt): BigDecimal {
  const day = getIntervalFromTimestamp(timestamp, DAY)
  const snapshotId = CBETH_ADDRESS.toHexString() + '-' + day.toString() + '-rebase'
  let snapshot = TokenSnapshot.load(snapshotId)
  if (!snapshot) {
    snapshot = new TokenSnapshot(snapshotId)
    const cbEthContract = CBETH.bind(CBETH_ADDRESS)
    const exchangeRateResult = cbEthContract.try_exchangeRate()
    snapshot.price = exchangeRateResult.reverted ? BIG_DECIMAL_1E18 : exchangeRateResult.value.toBigDecimal()
    snapshot.token = CBETH_ADDRESS
    snapshot.timestamp = timestamp
    snapshot.save()
  }
  return snapshot.price
}

// Used to calculate rebase APR of USDN
export function getUsdnSnapshotPrice(timestamp: BigInt): BigDecimal {
  const day = getIntervalFromTimestamp(timestamp, DAY)
  const snapshotId = USDN_TOKEN + '-' + day.toString() + '-rebase'
  const snapshot = TokenSnapshot.load(snapshotId)
  if (!snapshot) {
    return BIG_DECIMAL_ZERO
  }
  return snapshot.price
}

// Used to calculate rebase APR of Lido steth
export function getLidoSnapshotPrice(timestamp: BigInt): BigDecimal {
  const day = getIntervalFromTimestamp(timestamp, DAY)
  const snapshotId = LIDO_STETH_CONTRACT + '-' + day.toString() + '-rebase'
  const snapshot = TokenSnapshot.load(snapshotId)
  if (!snapshot) {
    return BIG_DECIMAL_ZERO
  }
  return snapshot.price
}

// Used to calculate rebase APR of AETH
export function getAethSnapshotPrice(timestamp: BigInt): BigDecimal {
  const day = getIntervalFromTimestamp(timestamp, DAY)
  const snapshotId = AETH_TOKEN + '-' + day.toString() + '-rebase'
  const snapshot = TokenSnapshot.load(snapshotId)
  if (!snapshot) {
    return BIG_DECIMAL_ZERO
  }
  return snapshot.price
}
