/**
 * Injects style into the document.
 * @param css
 */
import {logger} from "./common";

const log = logger("zig.dom");

export function injectStyle(css: string): void {
    const style = document.createElement("style");
    style.textContent = css;
    document.body.appendChild(style);
}

const eventStore: { [k: string]: boolean } = (window["__zig_events"] = window["__zig_events"] || {});

function registerEventHandler(object: any, eventName: string): (f: () => void) => void {
    if (!eventStore[eventName]) {
        if (document.readyState === "interactive") {
            eventStore["DOMContentLoaded"] = true;
        }

        object.addEventListener(eventName, () => {
            eventStore[eventName] = true;
        });
    }

    return (func: () => void) => {
        if (eventStore[eventName]) {
            window.setTimeout(func, 0);
        } else {
            object.addEventListener(eventName, func);
        }
    };
}

/**
 * Register a function to be called on DOMContentLoaded event.
 * If the event already fired before, this will trigger again.
 * @type {(f: () => void) => void}
 */
export const onDOMLoad = registerEventHandler(document, "DOMContentLoaded");

/**
 * Register a function to be called on document load.
 * If the event already fired before, this will trigger again.
 * @type {(f: () => void) => void}
 */
export const onLoad = registerEventHandler(window, "load");

onLoad(() => {
    log.debug("Document load event triggered");
});

onDOMLoad(() => {
    log.debug("Document content loaded event triggered");
});
