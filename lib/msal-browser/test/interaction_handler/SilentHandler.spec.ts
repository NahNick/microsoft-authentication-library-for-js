/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PkceCodes,
    AuthorityFactory,
    CommonAuthorizationCodeRequest,
    Constants,
    AuthorizationCodeClient,
    ProtocolMode,
    Logger,
    LoggerOptions,
    AuthenticationScheme,
    AuthorityOptions,
    ClientConfiguration,
    IPerformanceClient,
} from "@azure/msal-common";
import sinon from "sinon";
import { SilentHandler } from "../../src/interaction_handler/SilentHandler";
import {
    Configuration,
    buildConfiguration,
} from "../../src/config/Configuration";
import {
    TEST_CONFIG,
    testNavUrl,
    TEST_URIS,
    RANDOM_TEST_GUID,
    TEST_POP_VALUES,
    TEST_CRYPTO_VALUES,
} from "../utils/StringConstants";
import { InteractionHandler } from "../../src/interaction_handler/InteractionHandler";
import {
    BrowserAuthError,
    createBrowserAuthError,
    BrowserAuthErrorCodes,
} from "../../src/error/BrowserAuthError";
import { CryptoOps } from "../../src/crypto/CryptoOps";
import { TestStorageManager } from "../cache/TestStorageManager";
import { BrowserCacheManager } from "../../src/cache/BrowserCacheManager";

const DEFAULT_IFRAME_TIMEOUT_MS = 6000;
const DEFAULT_POLL_INTERVAL_MS = 30;

const testPkceCodes = {
    challenge: "TestChallenge",
    verifier: "TestVerifier",
} as PkceCodes;

const testNetworkResult = {
    testParam: "testValue",
};

const defaultTokenRequest: CommonAuthorizationCodeRequest = {
    redirectUri: `${TEST_URIS.DEFAULT_INSTANCE}/`,
    code: "thisIsATestCode",
    scopes: TEST_CONFIG.DEFAULT_SCOPES,
    codeVerifier: TEST_CONFIG.TEST_VERIFIER,
    authority: `${Constants.DEFAULT_AUTHORITY}/`,
    correlationId: RANDOM_TEST_GUID,
    authenticationScheme: AuthenticationScheme.BEARER,
};

const networkInterface = {
    sendGetRequestAsync<T>(): T {
        return {} as T;
    },
    sendPostRequestAsync<T>(): T {
        return {} as T;
    },
};

describe("SilentHandler.ts Unit Tests", () => {
    let authCodeModule: AuthorizationCodeClient;
    let browserRequestLogger: Logger;
    let browserStorage: BrowserCacheManager;
    let performanceClient: IPerformanceClient;

    beforeEach(() => {
        const appConfig: Configuration = {
            auth: {
                clientId: TEST_CONFIG.MSAL_CLIENT_ID,
            },
        };
        const configObj = buildConfiguration(appConfig, true);
        const authorityOptions: AuthorityOptions = {
            protocolMode: ProtocolMode.AAD,
            knownAuthorities: [],
            cloudDiscoveryMetadata: "",
            authorityMetadata: "",
        };
        const loggerOptions: LoggerOptions = {
            loggerCallback: (): void => {},
            piiLoggingEnabled: true,
        };
        const logger: Logger = new Logger(loggerOptions);
        const authorityInstance = AuthorityFactory.createInstance(
            configObj.auth.authority,
            networkInterface,
            browserStorage,
            authorityOptions,
            logger
        );
        const authConfig: ClientConfiguration = {
            authOptions: {
                ...configObj.auth,
                authority: authorityInstance,
            },
            systemOptions: {
                tokenRenewalOffsetSeconds:
                    configObj.system.tokenRenewalOffsetSeconds,
            },
            cryptoInterface: {
                createNewGuid: (): string => {
                    return "newGuid";
                },
                base64Decode: (input: string): string => {
                    return "testDecodedString";
                },
                base64Encode: (input: string): string => {
                    return "testEncodedString";
                },
                getPublicKeyThumbprint: async (): Promise<string> => {
                    return TEST_POP_VALUES.ENCODED_REQ_CNF;
                },
                signJwt: async (): Promise<string> => {
                    return "signedJwt";
                },
                removeTokenBindingKey: async (): Promise<boolean> => {
                    return Promise.resolve(true);
                },
                clearKeystore: async (): Promise<boolean> => {
                    return Promise.resolve(true);
                },
                hashString: async (): Promise<string> => {
                    return Promise.resolve(TEST_CRYPTO_VALUES.TEST_SHA256_HASH);
                },
            },
            networkInterface: {
                sendGetRequestAsync: async (): Promise<any> => {
                    return testNetworkResult;
                },
                sendPostRequestAsync: async (): Promise<any> => {
                    return testNetworkResult;
                },
            },
            loggerOptions: loggerOptions,
        };
        authConfig.storageInterface = new TestStorageManager(
            TEST_CONFIG.MSAL_CLIENT_ID,
            authConfig.cryptoInterface!,
            logger
        );
        authCodeModule = new AuthorizationCodeClient(authConfig);
        const browserCrypto = new CryptoOps(logger);
        browserStorage = new BrowserCacheManager(
            TEST_CONFIG.MSAL_CLIENT_ID,
            configObj.cache,
            browserCrypto,
            logger
        );
        browserRequestLogger = new Logger(authConfig.loggerOptions!);
        performanceClient = {
            startMeasurement: jest.fn(),
            endMeasurement: jest.fn(),
            discardMeasurements: jest.fn(),
            removePerformanceCallback: jest.fn(),
            addPerformanceCallback: jest.fn(),
            emitEvents: jest.fn(),
            startPerformanceMeasurement: jest.fn(),
            generateId: jest.fn(),
            calculateQueuedTime: jest.fn(),
            addQueueMeasurement: jest.fn(),
            setPreQueueTime: jest.fn(),
            addFields: jest.fn(),
            incrementFields: jest.fn(),
        };
    });

    afterEach(() => {
        sinon.restore();
    });

    describe("Constructor", () => {
        it("creates a subclass of InteractionHandler called SilentHandler", () => {
            const silentHandler = new SilentHandler(
                authCodeModule,
                browserStorage,
                defaultTokenRequest,
                browserRequestLogger,
                {
                    navigateFrameWait: DEFAULT_IFRAME_TIMEOUT_MS,
                    pollIntervalMilliseconds: DEFAULT_POLL_INTERVAL_MS,
                },
                performanceClient
            );
            expect(silentHandler instanceof SilentHandler).toBe(true);
            expect(silentHandler instanceof InteractionHandler).toBe(true);
        });
    });

    describe("initiateAuthRequest()", () => {
        it("throws error if requestUrl is empty", async () => {
            const silentHandler = new SilentHandler(
                authCodeModule,
                browserStorage,
                defaultTokenRequest,
                browserRequestLogger,
                {
                    navigateFrameWait: DEFAULT_IFRAME_TIMEOUT_MS,
                    pollIntervalMilliseconds: DEFAULT_POLL_INTERVAL_MS,
                },
                performanceClient
            );
            await expect(
                silentHandler.initiateAuthRequest("")
            ).rejects.toMatchObject(
                createBrowserAuthError(BrowserAuthErrorCodes.emptyNavigateUri)
            );
            await expect(
                //@ts-ignore
                silentHandler.initiateAuthRequest(null)
            ).rejects.toMatchObject(
                createBrowserAuthError(BrowserAuthErrorCodes.emptyNavigateUri)
            );
        });

        it(
            "Creates a frame asynchronously when created with default timeout",
            async () => {
                const silentHandler = new SilentHandler(
                    authCodeModule,
                    browserStorage,
                    defaultTokenRequest,
                    browserRequestLogger,
                    {
                        navigateFrameWait: DEFAULT_IFRAME_TIMEOUT_MS,
                        pollIntervalMilliseconds: DEFAULT_POLL_INTERVAL_MS,
                    },
                    performanceClient
                );
                const loadFrameSpy = sinon.spy(silentHandler, <any>"loadFrame");
                const authFrame = await silentHandler.initiateAuthRequest(
                    testNavUrl
                );
                expect(loadFrameSpy.called).toBe(true);
                expect(authFrame instanceof HTMLIFrameElement).toBe(true);
            },
            DEFAULT_IFRAME_TIMEOUT_MS + 1000
        );

        it("Creates a frame synchronously when created with a timeout of 0", async () => {
            const silentHandler = new SilentHandler(
                authCodeModule,
                browserStorage,
                defaultTokenRequest,
                browserRequestLogger,
                {
                    navigateFrameWait: 0,
                    pollIntervalMilliseconds: DEFAULT_POLL_INTERVAL_MS,
                },
                performanceClient
            );
            const loadFrameSyncSpy = sinon.spy(
                silentHandler,
                <any>"loadFrameSync"
            );
            const loadFrameSpy = sinon.spy(silentHandler, <any>"loadFrame");
            const authFrame = await silentHandler.initiateAuthRequest(
                testNavUrl
            );
            expect(loadFrameSyncSpy.calledOnce).toBe(true);
            expect(loadFrameSpy.called).toBe(false);
            expect(authFrame instanceof HTMLIFrameElement).toBe(true);
        });
    });

    describe("monitorIframeForHash", () => {
        it("times out", (done) => {
            const iframe = {
                contentWindow: {
                    // @ts-ignore
                    location: null, // example of scenario that would never otherwise resolve
                },
            };

            const silentHandler = new SilentHandler(
                authCodeModule,
                browserStorage,
                defaultTokenRequest,
                browserRequestLogger,
                {
                    navigateFrameWait: DEFAULT_IFRAME_TIMEOUT_MS,
                    pollIntervalMilliseconds: DEFAULT_POLL_INTERVAL_MS,
                },
                performanceClient
            );
            // @ts-ignore
            silentHandler.monitorIframeForHash(iframe, 500).catch((e) => {
                expect(e).toBeInstanceOf(BrowserAuthError);
                expect(e).toMatchObject(
                    createBrowserAuthError(
                        BrowserAuthErrorCodes.monitorWindowTimeout
                    )
                );
                done();
            });
        });

        it("times out when event loop is suspended", (done) => {
            jest.setTimeout(5000);

            const iframe = {
                contentWindow: {
                    location: {
                        href: "about:blank",
                        hash: "",
                    },
                },
            };

            const silentHandler = new SilentHandler(
                authCodeModule,
                browserStorage,
                defaultTokenRequest,
                browserRequestLogger,
                {
                    navigateFrameWait: DEFAULT_IFRAME_TIMEOUT_MS,
                    pollIntervalMilliseconds: DEFAULT_POLL_INTERVAL_MS,
                },
                performanceClient
            );
            // @ts-ignore
            silentHandler.monitorIframeForHash(iframe, 2000).catch((e) => {
                expect(e).toBeInstanceOf(BrowserAuthError);
                expect(e).toMatchObject(
                    createBrowserAuthError(
                        BrowserAuthErrorCodes.monitorWindowTimeout
                    )
                );
                done();
            });

            setTimeout(() => {
                iframe.contentWindow.location = {
                    href: "http://localhost/#/code=hello",
                    hash: "#code=hello",
                };
            }, 1600);

            /**
             * This code mimics the JS event loop being synchonously paused (e.g. tab suspension) midway through polling the iframe.
             * If the event loop is suspended for longer than the configured timeout,
             * the polling operation should throw an error for a timeout.
             */
            const startPauseDelay = 200;
            const pauseDuration = 3000;
            setTimeout(() => {
                Atomics.wait(
                    new Int32Array(new SharedArrayBuffer(4)),
                    0,
                    0,
                    pauseDuration
                );
            }, startPauseDelay);
        });

        it("returns hash", (done) => {
            const iframe = {
                contentWindow: {
                    location: {
                        href: "about:blank",
                        hash: "",
                    },
                },
            };

            const silentHandler = new SilentHandler(
                authCodeModule,
                browserStorage,
                defaultTokenRequest,
                browserRequestLogger,
                {
                    navigateFrameWait: DEFAULT_IFRAME_TIMEOUT_MS,
                    pollIntervalMilliseconds: DEFAULT_POLL_INTERVAL_MS,
                },
                performanceClient
            );
            silentHandler
                //@ts-ignore
                .monitorIframeForHash(iframe, 1000)
                .then((hash: string) => {
                    expect(hash).toEqual("#code=hello");
                    done();
                });

            setTimeout(() => {
                iframe.contentWindow.location = {
                    href: "http://localhost/#code=hello",
                    hash: "#code=hello",
                };
            }, 500);
        });

        it("Throws hash empty error", (done) => {
            const iframe = {
                contentWindow: {
                    location: {
                        href: "about:blank",
                        hash: "",
                    },
                },
            };

            const silentHandler = new SilentHandler(
                authCodeModule,
                browserStorage,
                defaultTokenRequest,
                browserRequestLogger,
                {
                    navigateFrameWait: DEFAULT_IFRAME_TIMEOUT_MS,
                    pollIntervalMilliseconds: DEFAULT_POLL_INTERVAL_MS,
                },
                performanceClient
            );
            // @ts-ignore
            silentHandler.monitorIframeForHash(iframe, 1000).catch((e) => {
                expect(e).toBeInstanceOf(BrowserAuthError);
                expect(e).toMatchObject(
                    createBrowserAuthError(BrowserAuthErrorCodes.hashEmptyError)
                );
                done();
            });

            setTimeout(() => {
                iframe.contentWindow.location = {
                    href: "http://localhost/",
                    hash: "",
                };
            }, 500);
        });

        it("Throws hashDoesNotContainKnownProperties error", (done) => {
            const iframe = {
                contentWindow: {
                    location: {
                        href: "about:blank",
                        hash: "",
                    },
                },
            };

            const silentHandler = new SilentHandler(
                authCodeModule,
                browserStorage,
                defaultTokenRequest,
                browserRequestLogger,
                {
                    navigateFrameWait: DEFAULT_IFRAME_TIMEOUT_MS,
                    pollIntervalMilliseconds: DEFAULT_POLL_INTERVAL_MS,
                },
                performanceClient
            );
            // @ts-ignore
            silentHandler.monitorIframeForHash(iframe, 1000).catch((e) => {
                expect(e).toBeInstanceOf(BrowserAuthError);
                expect(e).toMatchObject(
                    createBrowserAuthError(
                        BrowserAuthErrorCodes.hashDoesNotContainKnownProperties
                    )
                );
                done();
            });

            setTimeout(() => {
                iframe.contentWindow.location = {
                    href: "http://localhost/#myCustomHash",
                    hash: "myCustomHash",
                };
            }, 500);
        });
    });
});
