/* tslint:disable */
/* eslint-disable */
/**
 * The `ReadableStreamType` enum.
 *
 * *This API requires the following crate features to be activated: `ReadableStreamType`*
 */

export type ReadableStreamType = "bytes";

export class BundleId {
    free(): void;
    [Symbol.dispose](): void;
    static generate(): BundleId;
    constructor(value: string);
    toString(): string;
}

export class ConnectCallback {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly code: string;
    readonly state: string;
}

export class ConnectUrlOptions {
    free(): void;
    [Symbol.dispose](): void;
    constructor(return_to: string, state: string);
    readonly returnTo: string;
    readonly state: string;
}

export class CreateContentLockRequestBuilder {
    free(): void;
    [Symbol.dispose](): void;
    accessPolicy(access_policy: any): CreateContentLockRequestBuilder;
    build(): any;
    criteria(criteria: any): CreateContentLockRequestBuilder;
    lockLogic(lock_logic: any): CreateContentLockRequestBuilder;
    lockServer(lock_server: any): CreateContentLockRequestBuilder;
    constructor();
    primaryResource(resource: any): CreateContentLockRequestBuilder;
    secondaryResource(resource: any): CreateContentLockRequestBuilder;
    secondaryResources(resources: any): CreateContentLockRequestBuilder;
}

export class Creator {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    createContentLock(body: any): Promise<any>;
    deleteGuardedResource(options: DeleteGuardedResourceOptions): Promise<void>;
    exportSessionSecretForTests(): string;
    paykitSetupStatus(): Promise<any>;
    registerGuardedResource(options: RegisterGuardedResourceOptions): Promise<any>;
    setLockServicePointer(options: SetLockServicePointerOptions): Promise<void>;
}

export class DeleteGuardedResourceOptions {
    free(): void;
    [Symbol.dispose](): void;
    constructor(path: string);
    readonly path: string;
}

export class ExchangeFrontendSessionCodeOptions {
    free(): void;
    [Symbol.dispose](): void;
    constructor(code: string, state: string);
    readonly code: string;
    readonly state: string;
}

export class IntoUnderlyingByteSource {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    cancel(): void;
    pull(controller: ReadableByteStreamController): Promise<any>;
    start(controller: ReadableByteStreamController): void;
    readonly autoAllocateChunkSize: number;
    readonly type: ReadableStreamType;
}

export class IntoUnderlyingSink {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    abort(reason: any): Promise<any>;
    close(): Promise<any>;
    write(chunk: any): Promise<any>;
}

export class IntoUnderlyingSource {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    cancel(): void;
    pull(controller: ReadableStreamDefaultController): Promise<any>;
}

export class Locks {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    createConnectUrl(options: ConnectUrlOptions): Promise<string>;
    exchangeFrontendSessionCode(options: ExchangeFrontendSessionCodeOptions): Promise<Session>;
    static forContentLock(resource: string): Promise<Locks>;
    static forContentLockWithOptions(resource: string, options: LocksOptions): Promise<Locks>;
    static forCreator(creator: string): Promise<Locks>;
    static forCreatorWithOptions(creator: string, options: LocksOptions): Promise<Locks>;
    static forServer(lock_server: string): Locks;
    static forServerWithOptions(lock_server: string, options: LocksOptions): Locks;
    static fromCreatorLockServicePointer(pointer: any): Locks;
    static hasPaykitData(user: string): Promise<boolean>;
    static hasPaykitDataWithOptions(user: string, options: LocksOptions): Promise<boolean>;
    lockServer(): string;
    static parseConnectCallback(callback_url: string): ConnectCallback;
    static readContentLock(resource: string): Promise<any>;
    static readContentLockWithOptions(resource: string, options: LocksOptions): Promise<any>;
    restoreSession(secret: string): Session;
    readonly viewer: Viewer;
}

export class LocksOptions {
    free(): void;
    [Symbol.dispose](): void;
    addPkarrRelay(relay_url: string): LocksOptions;
    constructor();
    readonly pkarrRelays: string[];
}

export class RegisterGuardedResourceOptions {
    free(): void;
    [Symbol.dispose](): void;
    constructor(path: string, content_type: string, bytes: Uint8Array);
    readonly bytes: Uint8Array;
    readonly contentType: string;
    readonly path: string;
}

export class Session {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    creatorPubky(): string | undefined;
    exportSecret(): string;
    lockServer(): string;
    signout(): Promise<void>;
    readonly creator: Creator;
}

export class SetLockServicePointerOptions {
    free(): void;
    [Symbol.dispose](): void;
    constructor(default_lock_server: string);
    readonly defaultLockServer: string;
}

export class VerificationTaskHandleOptions {
    free(): void;
    [Symbol.dispose](): void;
    constructor(creator: string, bundle_id: string);
    readonly bundleId: string;
    readonly creator: string;
}

export class Viewer {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    completeVerificationTask(options: VerificationTaskHandleOptions): Promise<any>;
    issueAccessCredential(options: VerificationTaskHandleOptions): Promise<any>;
    lookupVerificationTask(options: VerificationTaskHandleOptions): Promise<any>;
    proxyReadGuardedResource(access_credential: string, path: string): Promise<Uint8Array>;
    proxyReadGuardedResourceResponse(access_credential: string, path: string): Promise<Response>;
    submitProofBundle(submitted_proof_bundle: any): Promise<any>;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_session_free: (a: number, b: number) => void;
    readonly session_creator: (a: number) => number;
    readonly session_creatorPubky: (a: number) => [number, number];
    readonly session_exportSecret: (a: number) => [number, number];
    readonly session_lockServer: (a: number) => [number, number];
    readonly session_signout: (a: number) => any;
    readonly __wbg_bundleid_free: (a: number, b: number) => void;
    readonly __wbg_verificationtaskhandleoptions_free: (a: number, b: number) => void;
    readonly __wbg_viewer_free: (a: number, b: number) => void;
    readonly bundleid_generate: () => number;
    readonly bundleid_new: (a: number, b: number) => [number, number, number];
    readonly bundleid_toString: (a: number) => [number, number];
    readonly verificationtaskhandleoptions_bundleId: (a: number) => [number, number];
    readonly verificationtaskhandleoptions_creator: (a: number) => [number, number];
    readonly verificationtaskhandleoptions_new: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly viewer_completeVerificationTask: (a: number, b: number) => any;
    readonly viewer_issueAccessCredential: (a: number, b: number) => any;
    readonly viewer_lookupVerificationTask: (a: number, b: number) => any;
    readonly viewer_proxyReadGuardedResource: (a: number, b: number, c: number, d: number, e: number) => any;
    readonly viewer_proxyReadGuardedResourceResponse: (a: number, b: number, c: number, d: number, e: number) => any;
    readonly viewer_submitProofBundle: (a: number, b: any) => any;
    readonly __wbg_connectcallback_free: (a: number, b: number) => void;
    readonly __wbg_connecturloptions_free: (a: number, b: number) => void;
    readonly __wbg_exchangefrontendsessioncodeoptions_free: (a: number, b: number) => void;
    readonly __wbg_locks_free: (a: number, b: number) => void;
    readonly __wbg_locksoptions_free: (a: number, b: number) => void;
    readonly connectcallback_code: (a: number) => [number, number];
    readonly connectcallback_state: (a: number) => [number, number];
    readonly connecturloptions_new: (a: number, b: number, c: number, d: number) => number;
    readonly connecturloptions_returnTo: (a: number) => [number, number];
    readonly connecturloptions_state: (a: number) => [number, number];
    readonly exchangefrontendsessioncodeoptions_code: (a: number) => [number, number];
    readonly exchangefrontendsessioncodeoptions_state: (a: number) => [number, number];
    readonly locks_createConnectUrl: (a: number, b: number) => any;
    readonly locks_exchangeFrontendSessionCode: (a: number, b: number) => any;
    readonly locks_forContentLock: (a: number, b: number) => any;
    readonly locks_forContentLockWithOptions: (a: number, b: number, c: number) => any;
    readonly locks_forCreator: (a: number, b: number) => any;
    readonly locks_forCreatorWithOptions: (a: number, b: number, c: number) => any;
    readonly locks_forServer: (a: number, b: number) => [number, number, number];
    readonly locks_forServerWithOptions: (a: number, b: number, c: number) => [number, number, number];
    readonly locks_fromCreatorLockServicePointer: (a: any) => [number, number, number];
    readonly locks_hasPaykitData: (a: number, b: number) => any;
    readonly locks_hasPaykitDataWithOptions: (a: number, b: number, c: number) => any;
    readonly locks_lockServer: (a: number) => [number, number];
    readonly locks_parseConnectCallback: (a: number, b: number) => [number, number, number];
    readonly locks_readContentLock: (a: number, b: number) => any;
    readonly locks_readContentLockWithOptions: (a: number, b: number, c: number) => any;
    readonly locks_restoreSession: (a: number, b: number, c: number) => number;
    readonly locks_viewer: (a: number) => number;
    readonly locksoptions_addPkarrRelay: (a: number, b: number, c: number) => [number, number, number];
    readonly locksoptions_new: () => number;
    readonly locksoptions_pkarrRelays: (a: number) => [number, number];
    readonly exchangefrontendsessioncodeoptions_new: (a: number, b: number, c: number, d: number) => number;
    readonly __wbg_createcontentlockrequestbuilder_free: (a: number, b: number) => void;
    readonly __wbg_creator_free: (a: number, b: number) => void;
    readonly __wbg_deleteguardedresourceoptions_free: (a: number, b: number) => void;
    readonly __wbg_registerguardedresourceoptions_free: (a: number, b: number) => void;
    readonly __wbg_setlockservicepointeroptions_free: (a: number, b: number) => void;
    readonly createcontentlockrequestbuilder_accessPolicy: (a: number, b: any) => [number, number, number];
    readonly createcontentlockrequestbuilder_build: (a: number) => [number, number, number];
    readonly createcontentlockrequestbuilder_criteria: (a: number, b: any) => [number, number, number];
    readonly createcontentlockrequestbuilder_lockLogic: (a: number, b: any) => [number, number, number];
    readonly createcontentlockrequestbuilder_lockServer: (a: number, b: any) => [number, number, number];
    readonly createcontentlockrequestbuilder_new: () => number;
    readonly createcontentlockrequestbuilder_primaryResource: (a: number, b: any) => [number, number, number];
    readonly createcontentlockrequestbuilder_secondaryResource: (a: number, b: any) => [number, number, number];
    readonly createcontentlockrequestbuilder_secondaryResources: (a: number, b: any) => [number, number, number];
    readonly creator_createContentLock: (a: number, b: any) => any;
    readonly creator_deleteGuardedResource: (a: number, b: number) => any;
    readonly creator_exportSessionSecretForTests: (a: number) => [number, number];
    readonly creator_paykitSetupStatus: (a: number) => any;
    readonly creator_registerGuardedResource: (a: number, b: number) => any;
    readonly creator_setLockServicePointer: (a: number, b: number) => any;
    readonly deleteguardedresourceoptions_new: (a: number, b: number) => number;
    readonly deleteguardedresourceoptions_path: (a: number) => [number, number];
    readonly registerguardedresourceoptions_bytes: (a: number) => [number, number];
    readonly registerguardedresourceoptions_contentType: (a: number) => [number, number];
    readonly registerguardedresourceoptions_new: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly registerguardedresourceoptions_path: (a: number) => [number, number];
    readonly setlockservicepointeroptions_defaultLockServer: (a: number) => [number, number];
    readonly setlockservicepointeroptions_new: (a: number, b: number) => number;
    readonly __wbg_intounderlyingsource_free: (a: number, b: number) => void;
    readonly intounderlyingsource_cancel: (a: number) => void;
    readonly intounderlyingsource_pull: (a: number, b: any) => any;
    readonly __wbg_intounderlyingbytesource_free: (a: number, b: number) => void;
    readonly intounderlyingbytesource_autoAllocateChunkSize: (a: number) => number;
    readonly intounderlyingbytesource_cancel: (a: number) => void;
    readonly intounderlyingbytesource_pull: (a: number, b: any) => any;
    readonly intounderlyingbytesource_start: (a: number, b: any) => void;
    readonly intounderlyingbytesource_type: (a: number) => number;
    readonly __wbg_intounderlyingsink_free: (a: number, b: number) => void;
    readonly intounderlyingsink_abort: (a: number, b: any) => any;
    readonly intounderlyingsink_close: (a: number) => any;
    readonly intounderlyingsink_write: (a: number, b: any) => any;
    readonly wasm_bindgen__convert__closures_____invoke__h91c6e0a7524f6a5b: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen__convert__closures_____invoke__h0bbd1023632d6b79: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h67168fce963d1069: (a: number, b: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
