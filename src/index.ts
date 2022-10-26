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
import http, {RequestListener} from "http";

let hap: HAP;

export = (api: API) => {
    hap = api.hap;
    api.registerAccessory("WindowDressingPlugin", WindowDressingPlugin);
};

class WindowDressingPlugin implements AccessoryPlugin {
    private readonly name: string;
    private readonly informationService: Service;

    private readonly service: Service;
    private server;
    private current_pct: number = 0;
    private target_pct: number = -1;

    constructor(private readonly log: Logging, private readonly config: Config, api: API) {
        this.name = config.name;
        this.config.port ??= 44444;
        this.server = http.createServer(this.httpListener);
        this.server.listen(this.config.port);

        this.informationService = new hap.Service.AccessoryInformation()
            .setCharacteristic(hap.Characteristic.Manufacturer, "ACME Pty Ltd");

        this.service = new hap.Service.WindowCovering(this.name);
        this.service.getCharacteristic(hap.Characteristic.CurrentPosition)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                callback(HAPStatus.SUCCESS, this.current_pct);
            })
        this.service.getCharacteristic(hap.Characteristic.TargetPosition)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                callback(HAPStatus.SUCCESS, this.getClampedTargetPct());
            })
            .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                this.target_pct = value as number;

                callback(HAPStatus.SUCCESS);
            });
        this.service.getCharacteristic(hap.Characteristic.PositionState)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                let delta = this.getClampedTargetPct() - this.current_pct;
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

    getClampedTargetPct = () => {
        return Math.min(Math.max(this.target_pct, 0), 100);
    }

    httpListener: RequestListener = (req, res) => {
        try {
            if (req.method === "POST" && req.headers["content-type"] === "application/json") {
                req.setEncoding("utf8");
                let body = JSON.parse(req.read(512));

                let current_pct = Number.parseInt(body["current_pct"]);
                if (current_pct < 0 || current_pct > 100) {
                    res.writeHead(400).end("current_pct must be 0-100 inclusive");
                    return;
                }
                this.current_pct = current_pct;

                // Write current to target
                if (this.target_pct === -1) {
                    let target_pct = Number.parseInt(body["target_pct"]);
                    if (target_pct < 0 || target_pct > 100) {
                        res.writeHead(400).end("target_pct must be 0-100 inclusive");
                        return;
                    }
                    this.target_pct = target_pct;
                }
            } else {
                res.writeHead(400).end("Bad Request");
            }
        } catch (ex) {
            res.writeHead(400).end("Bad Request");
            console.error("Request Error: ", ex);
        }

        res.writeHead(200, {
            "content-type": "application/json"
        }).end(JSON.stringify({"target_pct": this.target_pct}));
    }


    getServices = (): Service[] => [
        this.informationService,
        this.service
    ];
}
