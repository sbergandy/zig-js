import '../common/polyfills';

import {sleep} from '../common/common';
import {GameMessageInterface, MessageClient, Unregister} from '../common/message-client';
import {injectStyle, onDOMLoad} from '../common/dom';
import {buildTime, clientVersion} from '../common/vars';
import {delegateToVersion} from '../common/delegate';
import {Options} from '../common/options';
import {appendGameConfigToURL, ClockStyle, GameSettings, parseGameConfigFromURL} from '../common/config';
import {Logger} from '../common/logging';
import {WrapperStyleCSS} from './style.css';

const log = Logger.get('zig.wrapper');

/**
 * Get game config from window
 */
const GameSettings = (<any>window).GameSettings as GameSettings;
if (GameSettings == null) {
    throw new Error('window.GameConfig must be initialized.');
}

/**
 * Create and load the real game inside the iframe.
 * This method will add the iframe to the body of the page.
 */
async function initializeGame(): Promise<HTMLIFrameElement> {
    const config = parseGameConfigFromURL();

    let url = appendGameConfigToURL(GameSettings.index || 'inner.html', config);

    // legacy games need extra patching. We'll need to inform the inner.html about that.
    if (GameSettings.legacyGame === true) {
        url += '&legacyGame=true';
    }

    log.info(`Creating iframe with URL ${url}`);

    // create iframe and insert into document.
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.allowFullscreen = true;
    iframe.scrolling = 'no';
    (iframe as any).allow = 'autoplay';

    const parentMessageClient = new MessageClient(window.parent);

    // forward errors to parent frame.
    iframe.onerror = err => parentMessageClient.sendError(err);

    // send the new config to the parent so it can update the frame size
    const messageInterface = new GameMessageInterface(parentMessageClient, config.canonicalGameName);
    messageInterface.updateGameSettings(GameSettings);

    if (GameSettings.clockStyle !== false) {
        setupGameClock(config.clientTimeOffsetInMillis, messageInterface);
    }

    // add game to window
    document.body.appendChild(iframe);

    async function trySetupMessageClient(): Promise<void> {
        // wait for the content window to load.
        while (iframe.contentWindow == null) {
            log.info('contentWindow not yet available, waiting...');
            await sleep(250);
        }

        // initialize the message client to the game window
        const innerMessageClient = new MessageClient(iframe.contentWindow);

        // and proxy all messages between the frames
        proxyMessages(parentMessageClient, innerMessageClient);

        window.onfocus = () => {
            log.debug('Got focus, focusing iframe now.');
            setTimeout(() => {
                const contentWindow = iframe.contentWindow;
                if (contentWindow != null) {
                    contentWindow.focus();
                }
            });
        };
    }

    await trySetupMessageClient();

    return iframe;
}

/**
 * Set up a proxy for post messages. Everything coming from the iframe will be forwarded
 * to the parent, and everything coming from the parent will be send to the iframe.
 */
function proxyMessages(parentMessageClient: MessageClient, innerMessageClient: MessageClient): void {
    innerMessageClient.register(ev => {
        log.debug('Proxy message parent <- game');
        parentMessageClient.send(ev);
    });

    parentMessageClient.register(ev => {
        log.debug('Proxy message parent -> game');
        innerMessageClient.send(ev);
    });
}

function setupGameClock(clientTimeOffsetInMillis: number, messageInterface: GameMessageInterface) {
    const clockStyle: Required<ClockStyle> = {
        horizontalAlignment: 'right',
        verticalAlignment: 'top',
        backgroundColor: 'rgba(0,0,0,0.5)',
        fontColor: 'white',
        ...(GameSettings.clockStyle || {}),
    };

    let unregister: Unregister;

    function _showClock() {
        showClock(clockStyle, clientTimeOffsetInMillis);
        unregister();
    }

    unregister = messageInterface.registerGeneric({
        prepareGame: _showClock,
        playGame: _showClock,
        playDemoGame: _showClock,
        requestStartGame: _showClock,
    });
}

function showClock(style: Required<ClockStyle>, clientTimeOffsetInMillis: number) {
    const div = document.createElement('div');
    div.className = 'zig-clock';
    div.style.color = style.fontColor;
    div.style[style.verticalAlignment] = '0';
    div.style[style.horizontalAlignment] = '0.5em';
    div.style.backgroundColor = style.backgroundColor;

    function getTimeString(now: Date): string {
        const hour = now.getHours();
        const minutes = now.getMinutes();
        return `${hour >= 10 ? hour : '0' + hour}:${minutes >= 10 ? minutes : '0' + minutes}`;
    }

    function updateOnce() {
        const now = new Date(Date.now() + clientTimeOffsetInMillis);
        div.innerText = getTimeString(now);

        const currentSeconds = now.getSeconds();
        const delayInSeconds = 60 - currentSeconds;

        setTimeout(updateOnce, delayInSeconds * 1000);
    }

    updateOnce();

    document.body.appendChild(div);
}

function initializeWinningClassOverride(): boolean {
    const override = Options.winningClassOverride;
    if (override == null)
        return false;

    const params = `&wc=${override.winningClass}&scenario=${override.scenarioId}`;
    if (location.href.indexOf(params) === -1) {
        const search = location.search.replace(/\b(scenario|wc)=[^&]+/g, '');
        const sep = location.search || '&';

        log.info('Replace outer.html with updated url:', search + sep + params);
        location.search = search + sep + params;

        return true;
    }

    return false;
}

onDOMLoad(() => {
    log.info(`Initializing zig wrapper in ${clientVersion}`);

    // we might want to delegate the script to another version
    if (delegateToVersion('wrapper.js')) {
        return;
    }

    // if we have a winning class override, we'll change the url and
    // reload the script. we wont be initializing the rest of the game here.
    if (initializeWinningClassOverride()) {
        return;
    }

    // inject the css style for the wrapper into the document
    injectStyle(WrapperStyleCSS);

    void initializeGame();

    if (Options.debuggingLayer) {
        log.debug('Debugging options are set, showing debugging layer now.');

        const el = document.createElement('div');
        el.innerHTML = `
            <div style='position: absolute; top: 0; left: 0; font-size: 0.6em; padding: 0.25em; background: rgba(0, 0, 0, 128); color: white; z-index: 100;'>
                <strong>ZIG</strong> &nbsp;&nbsp;
                version: ${Options.version} (=${clientVersion}),
                logging: ${Options.logging},
                wc override: ${JSON.stringify(Options.winningClassOverride)},
                build ${(Date.now() - buildTime) / 1000.0}s ago
            </div>`;

        document.body.appendChild(el.firstElementChild!);
    }
});
