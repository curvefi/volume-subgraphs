import { Address, BigDecimal, BigInt, Bytes } from '@graphprotocol/graph-ts'
import { ADDRESS_ZERO } from 'const'

export function bytesToAddress(input: Bytes): Address {
  const inputAsStr = input.toHexString()
  if (inputAsStr.length != 42) {
    return ADDRESS_ZERO
  } else return Address.fromString(inputAsStr)
}

export function BigDecimalToBigInt(input: BigDecimal): BigInt {
  return BigInt.fromString(input.truncate(0).toString())
}

export function IntToCallData(input: i32): string {
  return BigInt.fromI32(input).toHexString().slice(2).padStart(64, '0')
}
