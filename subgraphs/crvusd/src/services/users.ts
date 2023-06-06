import {User} from "../../generated/schema";
import {Address} from "@graphprotocol/graph-ts";

export function getOrCreateUser(user: Address): User {
    let entity = User.load(user)
    if (!entity) {
        entity = new User(user)
        entity.save()
    }
    return entity
}