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

const TIMEOUT_THRESHOLD = 10e3;

class WindowDressingPlugin implements AccessoryPlugin {
    private readonly name: string;
    private readonly informationService: Service;

    private readonly service: Service;
    private server;
    private current_pct: number = 0;
    private target_pct: number = -1;
    private last_check: number = 0;

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
                this.answer(callback, this.current_pct);
            })
        this.service.getCharacteristic(hap.Characteristic.TargetPosition)
            .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                this.answer(callback, this.getClampedTargetPct());
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
                this.answer(callback, state);
            });

        log.info("Window Dressing finished initializing!");
    }

    answer = (callback: CharacteristicGetCallback, state: CharacteristicValue) => {
        // 10 second timeout
        if (Date.now() - this.last_check < TIMEOUT_THRESHOLD) {
            callback(HAPStatus.SUCCESS, state);
        } else {
            callback(HAPStatus.OPERATION_TIMED_OUT)
        }
    }

    getClampedTargetPct = () => {
        return Math.min(Math.max(this.target_pct, 0), 100);
    }

    httpListener: RequestListener = (req, res) => {
        if (req.method === "POST" && req.headers["content-type"] === "application/json") {
            req.setEncoding("utf8");
            let body = "";
            req.on("readable", () => {
                let read = req.read();
                if (read) {
                    body += read;
                }
            })
                .on("end", () => {
                    let data;
                    try {
                        data = JSON.parse(body);
                    } catch (ex) {
                        console.error(body, "\n\nRequest Parse Error:", ex);
                        res.writeHead(400).end("Bad Request: Bad JSON");
                        return;
                    }

                    let current_pct = Number.parseInt(data["current_pct"]);
                    if (current_pct < 0 || current_pct > 100) {
                        res.writeHead(400).end("Bad Request: Bad JSON: current_pct must be 0-100 inclusive");
                        return;
                    }
                    this.current_pct = current_pct;
                    this.last_check = Date.now();

                    // Write current to target
                    if (this.target_pct === -1) {
                        let target_pct = Number.parseInt(data["target_pct"]);
                        if (target_pct < 0 || target_pct > 100) {
                            res.writeHead(400).end("Bad Request: Bad JSON: target_pct must be 0-100 inclusive");
                            return;
                        }
                        this.target_pct = target_pct;
                    }

                    res.writeHead(200, {
                        "content-type": "application/json"
                    }).end(JSON.stringify({"target_pct": this.target_pct}));
                });
        } else {
            res.writeHead(400).end("Bad Request: Not POST with application/json");
        }
    }


    getServices = (): Service[] => [
        this.informationService,
        this.service
    ];
}
