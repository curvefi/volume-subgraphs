import { DailyPoolSnapshot, Pool } from '../../generated/schema'
import { BIG_INT_ZERO, MULTICALL } from 'const'
import { Multicall } from '../../generated/AddressProvider/Multicall'
import { Address, Bytes, ethereum, log } from '@graphprotocol/graph-ts'
import { BigInt } from '@graphprotocol/graph-ts/index'

export function fillV2PoolParamsSnapshot(snapshot: DailyPoolSnapshot, pool: Pool): void {
  const multicall = Multicall.bind(Address.fromString(MULTICALL))
  const callAddress = ethereum.Value.fromAddress(Address.fromBytes(pool.address))

  const signatures = [
    '0xb1373929', // gamma
    '0x92526c0c', // mid_fee
    '0xee8de675', // out_fee
    '0x49fe9e77', // allowed_extra_profit
    '0x72d4f0e2', // fee_gamma
    '0x083812e5', // adjustment_step
    '0x662b6274', // ma_half_time
    '0xb9e8c9fd', // price_scale
    '0x86fc88d3', // price_oracle
    '0xc146bf94', // last_prices
    '0x6112c747', // last_prices_timestamp
  ]

  const params: Array<ethereum.Tuple> = []
  for (let i = 0; i < signatures.length; i++) {
    params.push(changetype<ethereum.Tuple>([callAddress, ethereum.Value.fromBytes(Bytes.fromHexString(signatures[i]))]))
  }
  // need a low level call, can't call aggregate due to typing issues
  const callResult = multicall.tryCall('aggregate', 'aggregate((address,bytes)[]):(uint256,bytes[])', [
    ethereum.Value.fromTupleArray(params),
  ])
  if (callResult.reverted) {
    log.error('Multicall failed for pool {}', [pool.id])
    return
  }
  const multiResults = callResult.value[1].toBytesArray()
  const intResults: Array<BigInt> = []
  for (let i = 0; i < multiResults.length; i++) {
    const res = ethereum.decode('uint256', multiResults[i])
    intResults.push(res ? res.toBigInt() : BIG_INT_ZERO)
  }
  snapshot.gamma = intResults[0]
  snapshot.midFee = intResults[1]
  snapshot.outFee = intResults[2]
  snapshot.allowedExtraProfit = intResults[3]
  snapshot.feeGamma = intResults[4]
  snapshot.adjustmentStep = intResults[5]
  snapshot.maHalfTime = intResults[6]
  snapshot.priceScale = intResults[7]
  snapshot.priceOracle = intResults[8]
  snapshot.lastPrices = intResults[9]
  snapshot.lastPricesTimestamp = intResults[10]
  snapshot.save()
}
