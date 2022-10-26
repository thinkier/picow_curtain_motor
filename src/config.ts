import {AccessoryConfig} from "homebridge";

export interface Config extends AccessoryConfig {
    name: string,
    port: string
}
