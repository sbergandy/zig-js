import {isLegacyGame, patchLegacyGame} from "./zig-legacy";
import {ITicket, logger} from "../_common/common";
import {MessageClient, toErrorValue} from "../_common/message-client";
import {objectAssignPolyfill} from "../_common/polyfill";
import {buildTime, clientVersion} from "../_common/vars";
import {delegateToVersion} from "../_common/delegate";
import {Options} from "../_common/options";
import {executeRequestInParent} from "../_common/request";

const log = logger("[zig-client]");

function guessQuantity(payload: any | undefined): number {
    if (payload != null && typeof payload === "object") {
        if (payload.rows && payload.rows.length) {
            // sofortlotto like payload
            return payload.rows.length;
        }
    }

    return 1;
}

export interface BuyTicketOptions {
    // Set to true if the ticket is seen as immediately settled.
    alreadySettled?: boolean

    // Set to a positive value if more than one ticket is requested (e.g. sofort games)
    quantity?: number
}

class ZigClient {
    private readonly messageClient: MessageClient;

    constructor() {
        this.messageClient = new MessageClient(window.parent);
    }

    public async buyTicket(payload: any = {}, options: BuyTicketOptions = {}): Promise<ITicket> {
        return await this.propagateErrors(async () => {
            const quantity: number = options.quantity || guessQuantity(payload);

            const url = "/product/iwg/tickets?quantity=" + quantity;
            const ticket = await this.request<ITicket>("POST", url, payload);

            this.sendGameStartedEvent(options, ticket);

            return ticket
        });
    }

    public async demoTicket(payload: any = {}, options: BuyTicketOptions = {}): Promise<ITicket> {
        return await this.propagateErrors(async () => {
            const quantity: number = options.quantity || guessQuantity(payload);
            const wcParam = Options.winningClassOverride && `&wc=${Options.winningClassOverride.winningClass}` || "";

            const url = `/product/iwg/demo?quantity=${quantity}${wcParam}`;
            let ticket = await this.request<ITicket>("POST", url, payload);

            this.sendGameStartedEvent(options, ticket);

            return ticket;
        });
    }

    private sendGameStartedEvent(options: BuyTicketOptions, ticket: ITicket) {
        let alreadySettled = options.alreadySettled;
        if (alreadySettled === undefined) {
            alreadySettled = !(ticket.game || {supportsResume: true}).supportsResume;
        }

        this.messageClient.send({
            command: "gameStarted",
            ticket: ticket,
            alreadySettled: !!alreadySettled,
        });
    }

    public async settleTicket(id: string): Promise<void> {
        return await this.propagateErrors(async () => {
            const url = "/product/iwg/tickets/" + encodeURIComponent(id) + "/settle";
            const response = await this.request<any>("POST", url);

            this.messageClient.send({
                command: "gameSettled",
                response: response,
            });

            return
        });
    }

    private async propagateErrors<T>(fn: () => Promise<T>): Promise<T> {
        try {
            return await fn()
        } catch (err) {
            this.messageClient.sendError(err);
            throw err;
        }
    }

    private async request<T>(method: string, url: string, body: any = null): Promise<T> {
        const result = await executeRequestInParent(this.messageClient, {
            method,
            path: url,
            body: body === null ? null : JSON.stringify(body),
            headers: {},
        });

        if (Math.floor(result.statusCode / 100) === 2) {
            return JSON.parse(result.body || "null");
        } else {
            throw toErrorValue(result);
        }
    }

    public trackGameHeight(markerOrSelector: HTMLElement | string): void {
        let previousMarkerTop = 0;

        function topOf(element: HTMLElement): number {
            const top = element.offsetTop;
            if (!element.offsetParent) {
                return top;
            }

            return topOf(<HTMLElement>element.offsetParent) + element.offsetTop;
        }

        let marker: HTMLElement | null = null;
        if (typeof markerOrSelector !== "string") {
            marker = markerOrSelector;
        }

        window.setInterval(() => {
            // if we don't have a marker yet, we'll look for it
            if (marker == null && typeof markerOrSelector === "string") {
                marker = <HTMLElement>document.querySelector(markerOrSelector);
            }

            // if we still don't have a marker, we'll fail.
            if (marker == null) {
                return;
            }

            const markerTop = topOf(marker);
            const difference = Math.abs(markerTop - previousMarkerTop);

            if (difference > 1) {
                previousMarkerTop = markerTop;
                this.publishMessage("updateGameHeight", {height: markerTop});
            }
        }, 100);
    }

    private publishMessage(command: string, extras: object): void {
        const message = Object.assign({command}, extras);

        log("Publishing message ", message);
        window.parent.postMessage(message, "*");
    }
}

function main() {
    // initialize Object.assign polyfill for ie11.
    objectAssignPolyfill();

    if (isLegacyGame()) {
        log("Enable legacy game patches");
        patchLegacyGame();
    }

    // expose types to user of this library
    window["Zig"] = window["Zig"] || {};

    window["Zig"].MessageClient = new MessageClient(window.parent);
    window["Zig"].Client = new ZigClient();

    // Some games are currently using this.
    window["ZigClient"] = window["Zig"].Client;
    window["ZigMessageClient"] = MessageClient;
}

if (!delegateToVersion("zig.min.js")) {
    if (window.console && console.log) {
        console.log("");
        console.log(`[zig] Initializing zig client in version ${clientVersion}`);
        console.log(`[zig] compiled ${(Date.now() - buildTime) / 1000.0}sec ago`);
        console.log("");
    }

    main();
}