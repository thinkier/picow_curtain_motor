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
import http, {RequestListener} from "node:http";
import dgram from "node:dgram";
import {RemoteInfo} from "dgram";

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
    private http_server: http.Server;
    private udp_server: dgram.Socket;
    private current_pct: number = 0;
    private target_pct: number = -1;
    private last_check: number = 0;

    constructor(private readonly log: Logging, private readonly config: Config, api: API) {
        this.name = config.name;
        this.config.port ??= 44444;
        this.http_server = http.createServer(this.httpListener);
        this.http_server.listen(this.config.port);
        this.udp_server = dgram.createSocket({type: "udp4"}, this.udpListener);
        this.udp_server.bind(this.config.port);

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
        const succ = (data: object) => res.writeHead(200, {"content-type": "application/json"}).end(JSON.stringify(data))
        const err = (error: string) => res.writeHead(400, {"content-type": "application/json"}).end(JSON.stringify({error}))

        if (req.method === "POST" && req.headers["content-type"] === "application/json") {
            req.setEncoding("utf8");
            let body = "";
            req.on("readable", () => {
                let read = req.read();
                if (read) {
                    body += read;
                }
            })
                .on("end", () => this.genericListener(body, succ, err));
        } else {
            err("Bad Request: Not POST with application/json");
        }
    }

    udpListener = (msg: Buffer, rinfo: RemoteInfo) => {
        const resp = body => this.udp_server.send(JSON.stringify(body), rinfo.port, rinfo.address);
        const err = error => resp({error});

        this.genericListener(msg.toString("utf8"), resp, err);
    }

    genericListener = (payload: string, succ: (data: object) => void, err: (error: string) => void) => {
        let data: Record<string, number>;
        try {
            data = JSON.parse(payload);
        } catch (ex) {
            console.error(payload, "\n\nRequest Parse Error:", ex);
            err("Bad Request: Bad JSON");
            return;
        }

        let current_pct = data["current_pct"];
        if (current_pct < 0 || current_pct > 100) {
            err("Bad JSON: current_pct must be 0-100 inclusive");
            return;
        }
        this.current_pct = current_pct;
        this.last_check = Date.now();

        // Write current to target
        if (this.target_pct === -1) {
            let target_pct = data["target_pct"];
            if (target_pct < 0 || target_pct > 100) {
                err("Bad JSON: target_pct must be 0-100 inclusive");
                return;
            }
            this.target_pct = target_pct;
        }

        succ({"target_pct": this.target_pct});
    }

    getServices = (): Service[] => [
        this.informationService,
        this.service
    ];
}
