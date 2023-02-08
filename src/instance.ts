import makeWASocket, { SocketConfig, WASocket, ConnectionState, makeCacheableSignalKeyStore, DisconnectReason } from '@adiwajshing/baileys'
import { Boom } from '@hapi/boom'
import { toDataURL } from 'qrcode';
import pino from 'pino';
import BaileysBottle from '../baileys-bottle';

const SESSION_ID = 'whatsapp-session';

type Session = WASocket & {
    destroy: () => Promise<void>;
    // store: Store;
    webhook?: string | null;
    connectionState?: Partial<ConnectionState>
    loggedIn?: boolean;
};

type createSessionOptions = {
    sessionId: string;
    socketConfig?: SocketConfig;
    webhook?: string | null;
};

const sessions = new Map<string, Session>();
const bottle = await BaileysBottle.init({
    type: "sqlite",
    database: "db.sqlite",
})

export class createSession {

    logger: pino.Logger;
    sessionId: string;
    webhook: string;
    socketConfig: any;
    configID: string;

    constructor(options: createSessionOptions) {
        const { sessionId, webhook, socketConfig } = options;
        this.logger = pino({ prettyPrint: true });
        this.webhook = webhook!;
        this.sessionId = sessionId;
        this.socketConfig = socketConfig || {};
        this.configID = `${SESSION_ID}-${this.sessionId}`;
    }

    create = async () => {


        const { auth, store } = await bottle.createStore(this.sessionId);
        const { state, saveState } = await auth.useAuthHandle();

        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, this.logger),
            },
            logger: this.logger,
        })

        store.bind(sock.ev);
        sock.ev.process(async (events) => {
            // if (events["messages.upsert"]) {
            //     const upsert = events["messages.upsert"];
            //     console.log("recv messages ", JSON.stringify(upsert, undefined, 2));
            //     if (upsert.type === "notify") {
            //         for (const msg of upsert.messages) {
            //             if (!msg.key.fromMe) {
            //                 // mark message as read
            //                 await sock!.readMessages([msg.key]);
            //             }
            //         }
            //     }
            // }

            if (events["creds.update"]) await saveState();

            if (events["connection.update"]) {
                const update = events["connection.update"];
                const { connection, lastDisconnect } = update;
                connection === "open"
                    ? console.log("Connected")
                    : connection === "close"
                        ? (lastDisconnect?.error as Boom)?.output?.statusCode !==
                            DisconnectReason.loggedOut
                            ? this.create()
                            : console.log("Connection closed. You are logged out.")
                        : null;
            }
        });

        return this
    };


}