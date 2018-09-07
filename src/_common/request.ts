import {GameMessageInterface, ParentMessageInterface} from "./message-client";
import {logger} from "./common";

const log = logger("zig.xhr");

export interface Request {
    method: string;
    path: string;
    headers: { [key: string]: string };
    body: string;

    extraSettings?: any;
}

export interface Response {
    statusCode: number;
    body: string;

    // the raw response
    xhr?: XMLHttpRequest;
}

export interface Result {
    response?: Response;
    error?: string;
}

/**
 * Adds a unique id to an object. This is used to correlate
 * request and response messages.
 */
export interface WithCID<T> {
    data: T;
    cid: string;
}

/**
 * Executes/Performs the given requests locally by converting it into a XMLHttpRequest.
 * In case of an error, the error will be thrown as an exception.
 */
export async function executeRequestLocally(req: Request): Promise<Response> {
    const result = await _executeRequestLocally(req);
    if (result.error) {
        throw result.error;
    }

    return result.response;
}

// Need to keep a reference to the original XMLHttpRequest class before
// monkey patching it for legacy games.
const OriginalXMLHttpRequest = XMLHttpRequest;

async function _executeRequestLocally(req: Request): Promise<Result> {
    log.info("Execute http request locally", req);

    const xhr = new OriginalXMLHttpRequest();

    log.debug("Open request %s %s", req.method, req.path);
    xhr.open(req.method, req.path);

    // copy request headers to request
    Object.keys(req.headers || {}).forEach(key => {
        const value = req.headers[key];

        log.debug("Add request header %s: %s", key, value);
        xhr.setRequestHeader(key, value);
    });

    // copy extra properties.
    Object.keys(req.extraSettings || {}).forEach(key => {
        let setting = req.extraSettings[key];

        log.debug("Add request property %s: %s", key, setting);
        xhr[key] = setting;
    });

    // set the x-csrf header based on the cookie value.
    const match = /X-CSRF-TOKEN=([^;]+)/.exec(document.cookie || "");
    if (match && match[1]) {
        log.debug("Set csrf token header based on document cookie");
        xhr.setRequestHeader("X-CSRF-TOKEN", match[1]);
    }

    log.debug("Sending XMLHttpRequest with body", req.body);
    xhr.send(req.body);

    return new Promise<Result>(resolve => {
        // forward request results
        xhr.onreadystatechange = () => {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                log.debug("Request for %s finished with status code %s", req.path, xhr.status);

                // get body (only type = text is allowed)
                let body: string | null = null;
                if (xhr.responseType === "" || xhr.responseType === "text") {
                    body = xhr.responseText;
                }

                const result: Result = {
                    response: {
                        statusCode: xhr.status,
                        body: body,
                        xhr: xhr,
                    }
                };

                resolve(result);
            }
        };

        // forward connection errors or something like that
        xhr.onerror = err => {
            log.debug("Request failed with error:", err);
            const result: Result = {error: err.message || ""};
            resolve(result);
        };
    });
}

/**
 * Registers a handler for Request messages. By default, this calls _executeRequestLocally to handle
 * the request locally.
 */
export function registerRequestListener(iface: ParentMessageInterface,
                                        handler: (req: Request) => Promise<Result> = null) {

    const h = handler || _executeRequestLocally;

    iface.register("zig.XMLHttpRequest.request", async (message) => {
        const req: WithCID<Request> = message.request;
        const result = await h(req.data);

        if (result.response) {
            // remove xhr instance before sending it via post message.
            delete result.response["xhr"];
        }

        iface.xhrResult({cid: req.cid, data: result});
    });
}

let cidUniqueNumber = 1;

/**
 * Executes the given request in the parent frame. This sends the request as a message using the
 * given GameMessageInterface instance to the parent. The parent needs to execute the request
 * using XMLHttpRequests. After executing the request, it will respond with the requests result.
 *
 * This method will wait for the result to the request and provide it as a promise to a Response object.
 */
export async function executeRequestInParent(iface: GameMessageInterface, req: Request): Promise<Response> {
    const cid = req.path + ":" + Date.now() + ":" + cidUniqueNumber++;

    return new Promise<Response>((resolve, reject) => {
        // we are interested in results from our partner
        const unregister = iface.register("zig.XMLHttpRequest.result", message => {
            const result: WithCID<Result> = message.result;
            if (result.cid !== cid) {
                return;
            }

            // remove the listener, we got the message we are interested in.
            unregister();

            // handle rejection on connection errors or similar
            if (result.data.error != null) {
                reject(result.data.error);
            }

            // we got a good result.
            resolve(result.data.response);
        });

        if (req.body === null) {
            req.body = '{}';
        }

        // send the request to the partner.
        iface.xhrRequest({cid, data: req});
    });
}