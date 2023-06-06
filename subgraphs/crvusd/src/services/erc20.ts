import {Address, BigInt} from "@graphprotocol/graph-ts";
import {ERC20} from "../../generated/templates/Llamma/ERC20";

export function getDecimals(token: Address): BigInt {
    const tokenContract = ERC20.bind(token)
    const decimalsResult = tokenContract.try_decimals()
    return decimalsResult.reverted ? BigInt.fromI32(18) : BigInt.fromI32(decimalsResult.value)
}

export function getName(token: Address): string {
    const tokenContract = ERC20.bind(token)
    const nameResult = tokenContract.try_symbol()
    return nameResult.reverted ? token.toHexString().slice(0, 6) : nameResult.value
}

export function getBalanceOf(token: Address, user: Address): BigInt {
    const tokenContract = ERC20.bind(token)
    const balanceResult = tokenContract.try_balanceOf(user)
    return balanceResult.reverted ? BigInt.zero() : balanceResult.value
}