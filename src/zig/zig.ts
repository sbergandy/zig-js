import '../_common/polyfills';

import {isLegacyGame, patchLegacyGame} from './zig-legacy';
import {Logger} from '../_common/logging';
import {ZigClient} from './zig-client';
import {delegateToVersion} from '../_common/delegate';
import {buildTime, clientVersion} from '../_common/vars';

declare global {
    interface Window {
        Zig?: ZigGlobal;
    }
}

export interface ZigGlobal {
    Client: ZigClient
}

const log = Logger.get('zig.main');

let globalZigClient: ZigClient | null = null;

export const Zig: ZigGlobal = {
    get Client(): ZigClient {
        if (globalZigClient == null) {
            log.warn('globalZigClient variable is currently null.');
            throw new Error('ZigClient not available.');
        }

        return globalZigClient;
    },
};

export function main() {
    if (!window.Zig) {
        log.info(`Expose global 'Zig.Client' instance on 'window' object.`);
        window.Zig = Zig;
    }

    if (isLegacyGame()) {
        log.info('Enable legacy game patches');
        patchLegacyGame();
    }

    // create the global zig client
    globalZigClient = new ZigClient();

    // track height of the iframe if the marker exists.
    globalZigClient.trackGameHeight('#iframe-height-marker');
}

if (!delegateToVersion(`libzig.js`)) {
    if (window.console && console.log) {
        log.info('');
        log.info(`[zig] Initializing zig client in version ${clientVersion}`);
        log.info(`[zig] compiled ${(Date.now() - buildTime) / 1000.0}sec ago`);
        log.info('');
    }

    main();
}