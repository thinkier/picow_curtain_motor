import {
    AccessoryPlugin,
    API,
    CharacteristicEventTypes,
    CharacteristicGetCallback,
    CharacteristicSetCallback,
    CharacteristicValue,
    HAP,
    HAPStatus,
    Logging,
    Service
} from "homebridge";
import {Config} from "./config";

let hap: HAP;

export = (api: API) => {
    hap = api.hap;
    api.registerAccessory("WindowDressingPlugin", WindowDressingPlugin);
};

class WindowDressingPlugin implements AccessoryPlugin {
    private readonly name: string;
    private readonly informationService: Service;

    private readonly service: Service;

    constructor(private readonly log: Logging, private readonly config: Config, api: API) {
        this.name = config.name;
        this.config.port ??= 44444;

        this.informationService = new hap.Service.AccessoryInformation()
            .setCharacteristic(hap.Characteristic.Manufacturer, "ACME Pty Ltd");

        this.service = new hap.Service.WindowCovering(this.name);
        this.service.getCharacteristic(hap.Characteristic.CurrentPosition)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                callback(HAPStatus.SUCCESS, /* TODO Get Current Position */);
            })
        this.service.getCharacteristic(hap.Characteristic.TargetPosition)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                callback(HAPStatus.SUCCESS, /* TODO Get Desired Position */);
            })
            .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                /* TODO Set Desired Position */

                callback(HAPStatus.SUCCESS);
            });
        this.service.getCharacteristic(hap.Characteristic.PositionState)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                let delta = /* Calculate delta of current & target position */;
                let state = hap.Characteristic.PositionState.STOPPED;

                if (delta > 0) {
                    state = hap.Characteristic.PositionState.INCREASING;
                } else if (delta < 0) {
                    state = hap.Characteristic.PositionState.DECREASING;
                }
                callback(HAPStatus.SUCCESS, state);
            });

        log.info("Curtain Motor finished initializing!");
    }


    getServices = (): Service[] => [
        this.informationService,
        this.service
    ];
}
