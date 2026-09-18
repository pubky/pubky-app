/* @ts-self-types="./locks_sdk_wasm.d.ts" */

export class BundleId {
    static __wrap(ptr) {
        const obj = Object.create(BundleId.prototype);
        obj.__wbg_ptr = ptr;
        BundleIdFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        BundleIdFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_bundleid_free(ptr, 0);
    }
    /**
     * @returns {BundleId}
     */
    static generate() {
        const ret = wasm.bundleid_generate();
        return BundleId.__wrap(ret);
    }
    /**
     * @param {string} value
     */
    constructor(value) {
        const ptr0 = passStringToWasm0(value, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.bundleid_new(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        BundleIdFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {string}
     */
    toString() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.bundleid_toString(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) BundleId.prototype[Symbol.dispose] = BundleId.prototype.free;

export class ConnectCallback {
    static __wrap(ptr) {
        const obj = Object.create(ConnectCallback.prototype);
        obj.__wbg_ptr = ptr;
        ConnectCallbackFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ConnectCallbackFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_connectcallback_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    get code() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.connectcallback_code(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    get state() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.connectcallback_state(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) ConnectCallback.prototype[Symbol.dispose] = ConnectCallback.prototype.free;

export class ConnectUrlOptions {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ConnectUrlOptionsFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_connecturloptions_free(ptr, 0);
    }
    /**
     * @param {string} return_to
     * @param {string} state
     */
    constructor(return_to, state) {
        const ptr0 = passStringToWasm0(return_to, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(state, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.connecturloptions_new(ptr0, len0, ptr1, len1);
        this.__wbg_ptr = ret;
        ConnectUrlOptionsFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {string}
     */
    get returnTo() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.connecturloptions_returnTo(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    get state() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.connecturloptions_state(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) ConnectUrlOptions.prototype[Symbol.dispose] = ConnectUrlOptions.prototype.free;

export class CreateContentLockRequestBuilder {
    static __wrap(ptr) {
        const obj = Object.create(CreateContentLockRequestBuilder.prototype);
        obj.__wbg_ptr = ptr;
        CreateContentLockRequestBuilderFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CreateContentLockRequestBuilderFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_createcontentlockrequestbuilder_free(ptr, 0);
    }
    /**
     * @param {any} access_policy
     * @returns {CreateContentLockRequestBuilder}
     */
    accessPolicy(access_policy) {
        const ret = wasm.createcontentlockrequestbuilder_accessPolicy(this.__wbg_ptr, access_policy);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return CreateContentLockRequestBuilder.__wrap(ret[0]);
    }
    /**
     * @returns {any}
     */
    build() {
        const ret = wasm.createcontentlockrequestbuilder_build(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * @param {any} criteria
     * @returns {CreateContentLockRequestBuilder}
     */
    criteria(criteria) {
        const ret = wasm.createcontentlockrequestbuilder_criteria(this.__wbg_ptr, criteria);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return CreateContentLockRequestBuilder.__wrap(ret[0]);
    }
    /**
     * @param {any} lock_logic
     * @returns {CreateContentLockRequestBuilder}
     */
    lockLogic(lock_logic) {
        const ret = wasm.createcontentlockrequestbuilder_lockLogic(this.__wbg_ptr, lock_logic);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return CreateContentLockRequestBuilder.__wrap(ret[0]);
    }
    /**
     * @param {any} lock_server
     * @returns {CreateContentLockRequestBuilder}
     */
    lockServer(lock_server) {
        const ret = wasm.createcontentlockrequestbuilder_lockServer(this.__wbg_ptr, lock_server);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return CreateContentLockRequestBuilder.__wrap(ret[0]);
    }
    constructor() {
        const ret = wasm.createcontentlockrequestbuilder_new();
        this.__wbg_ptr = ret;
        CreateContentLockRequestBuilderFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @param {any} resource
     * @returns {CreateContentLockRequestBuilder}
     */
    primaryResource(resource) {
        const ret = wasm.createcontentlockrequestbuilder_primaryResource(this.__wbg_ptr, resource);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return CreateContentLockRequestBuilder.__wrap(ret[0]);
    }
    /**
     * @param {any} resource
     * @returns {CreateContentLockRequestBuilder}
     */
    secondaryResource(resource) {
        const ret = wasm.createcontentlockrequestbuilder_secondaryResource(this.__wbg_ptr, resource);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return CreateContentLockRequestBuilder.__wrap(ret[0]);
    }
    /**
     * @param {any} resources
     * @returns {CreateContentLockRequestBuilder}
     */
    secondaryResources(resources) {
        const ret = wasm.createcontentlockrequestbuilder_secondaryResources(this.__wbg_ptr, resources);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return CreateContentLockRequestBuilder.__wrap(ret[0]);
    }
}
if (Symbol.dispose) CreateContentLockRequestBuilder.prototype[Symbol.dispose] = CreateContentLockRequestBuilder.prototype.free;

export class Creator {
    static __wrap(ptr) {
        const obj = Object.create(Creator.prototype);
        obj.__wbg_ptr = ptr;
        CreatorFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CreatorFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_creator_free(ptr, 0);
    }
    /**
     * @param {any} body
     * @returns {Promise<any>}
     */
    createContentLock(body) {
        const ret = wasm.creator_createContentLock(this.__wbg_ptr, body);
        return ret;
    }
    /**
     * @param {DeleteGuardedResourceOptions} options
     * @returns {Promise<void>}
     */
    deleteGuardedResource(options) {
        _assertClass(options, DeleteGuardedResourceOptions);
        const ret = wasm.creator_deleteGuardedResource(this.__wbg_ptr, options.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {string}
     */
    exportSessionSecretForTests() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.creator_exportSessionSecretForTests(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Promise<any>}
     */
    paykitSetupStatus() {
        const ret = wasm.creator_paykitSetupStatus(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {RegisterGuardedResourceOptions} options
     * @returns {Promise<any>}
     */
    registerGuardedResource(options) {
        _assertClass(options, RegisterGuardedResourceOptions);
        const ret = wasm.creator_registerGuardedResource(this.__wbg_ptr, options.__wbg_ptr);
        return ret;
    }
    /**
     * @param {SetLockServicePointerOptions} options
     * @returns {Promise<void>}
     */
    setLockServicePointer(options) {
        _assertClass(options, SetLockServicePointerOptions);
        const ret = wasm.creator_setLockServicePointer(this.__wbg_ptr, options.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) Creator.prototype[Symbol.dispose] = Creator.prototype.free;

export class DeleteGuardedResourceOptions {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        DeleteGuardedResourceOptionsFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_deleteguardedresourceoptions_free(ptr, 0);
    }
    /**
     * @param {string} path
     */
    constructor(path) {
        const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.deleteguardedresourceoptions_new(ptr0, len0);
        this.__wbg_ptr = ret;
        DeleteGuardedResourceOptionsFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {string}
     */
    get path() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.deleteguardedresourceoptions_path(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) DeleteGuardedResourceOptions.prototype[Symbol.dispose] = DeleteGuardedResourceOptions.prototype.free;

export class ExchangeFrontendSessionCodeOptions {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ExchangeFrontendSessionCodeOptionsFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_exchangefrontendsessioncodeoptions_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    get code() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.exchangefrontendsessioncodeoptions_code(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} code
     * @param {string} state
     */
    constructor(code, state) {
        const ptr0 = passStringToWasm0(code, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(state, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.exchangefrontendsessioncodeoptions_new(ptr0, len0, ptr1, len1);
        this.__wbg_ptr = ret;
        ExchangeFrontendSessionCodeOptionsFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {string}
     */
    get state() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.exchangefrontendsessioncodeoptions_state(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) ExchangeFrontendSessionCodeOptions.prototype[Symbol.dispose] = ExchangeFrontendSessionCodeOptions.prototype.free;

export class IntoUnderlyingByteSource {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        IntoUnderlyingByteSourceFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_intounderlyingbytesource_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get autoAllocateChunkSize() {
        const ret = wasm.intounderlyingbytesource_autoAllocateChunkSize(this.__wbg_ptr);
        return ret >>> 0;
    }
    cancel() {
        const ptr = this.__destroy_into_raw();
        wasm.intounderlyingbytesource_cancel(ptr);
    }
    /**
     * @param {ReadableByteStreamController} controller
     * @returns {Promise<any>}
     */
    pull(controller) {
        const ret = wasm.intounderlyingbytesource_pull(this.__wbg_ptr, controller);
        return ret;
    }
    /**
     * @param {ReadableByteStreamController} controller
     */
    start(controller) {
        wasm.intounderlyingbytesource_start(this.__wbg_ptr, controller);
    }
    /**
     * @returns {ReadableStreamType}
     */
    get type() {
        const ret = wasm.intounderlyingbytesource_type(this.__wbg_ptr);
        return __wbindgen_enum_ReadableStreamType[ret];
    }
}
if (Symbol.dispose) IntoUnderlyingByteSource.prototype[Symbol.dispose] = IntoUnderlyingByteSource.prototype.free;

export class IntoUnderlyingSink {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        IntoUnderlyingSinkFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_intounderlyingsink_free(ptr, 0);
    }
    /**
     * @param {any} reason
     * @returns {Promise<any>}
     */
    abort(reason) {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.intounderlyingsink_abort(ptr, reason);
        return ret;
    }
    /**
     * @returns {Promise<any>}
     */
    close() {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.intounderlyingsink_close(ptr);
        return ret;
    }
    /**
     * @param {any} chunk
     * @returns {Promise<any>}
     */
    write(chunk) {
        const ret = wasm.intounderlyingsink_write(this.__wbg_ptr, chunk);
        return ret;
    }
}
if (Symbol.dispose) IntoUnderlyingSink.prototype[Symbol.dispose] = IntoUnderlyingSink.prototype.free;

export class IntoUnderlyingSource {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        IntoUnderlyingSourceFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_intounderlyingsource_free(ptr, 0);
    }
    cancel() {
        const ptr = this.__destroy_into_raw();
        wasm.intounderlyingsource_cancel(ptr);
    }
    /**
     * @param {ReadableStreamDefaultController} controller
     * @returns {Promise<any>}
     */
    pull(controller) {
        const ret = wasm.intounderlyingsource_pull(this.__wbg_ptr, controller);
        return ret;
    }
}
if (Symbol.dispose) IntoUnderlyingSource.prototype[Symbol.dispose] = IntoUnderlyingSource.prototype.free;

export class Locks {
    static __wrap(ptr) {
        const obj = Object.create(Locks.prototype);
        obj.__wbg_ptr = ptr;
        LocksFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        LocksFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_locks_free(ptr, 0);
    }
    /**
     * @param {ConnectUrlOptions} options
     * @returns {Promise<string>}
     */
    createConnectUrl(options) {
        _assertClass(options, ConnectUrlOptions);
        const ret = wasm.locks_createConnectUrl(this.__wbg_ptr, options.__wbg_ptr);
        return ret;
    }
    /**
     * @param {ExchangeFrontendSessionCodeOptions} options
     * @returns {Promise<Session>}
     */
    exchangeFrontendSessionCode(options) {
        _assertClass(options, ExchangeFrontendSessionCodeOptions);
        const ret = wasm.locks_exchangeFrontendSessionCode(this.__wbg_ptr, options.__wbg_ptr);
        return ret;
    }
    /**
     * @param {string} resource
     * @returns {Promise<Locks>}
     */
    static forContentLock(resource) {
        const ptr0 = passStringToWasm0(resource, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.locks_forContentLock(ptr0, len0);
        return ret;
    }
    /**
     * @param {string} resource
     * @param {LocksOptions} options
     * @returns {Promise<Locks>}
     */
    static forContentLockWithOptions(resource, options) {
        const ptr0 = passStringToWasm0(resource, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        _assertClass(options, LocksOptions);
        const ret = wasm.locks_forContentLockWithOptions(ptr0, len0, options.__wbg_ptr);
        return ret;
    }
    /**
     * @param {string} creator
     * @returns {Promise<Locks>}
     */
    static forCreator(creator) {
        const ptr0 = passStringToWasm0(creator, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.locks_forCreator(ptr0, len0);
        return ret;
    }
    /**
     * @param {string} creator
     * @param {LocksOptions} options
     * @returns {Promise<Locks>}
     */
    static forCreatorWithOptions(creator, options) {
        const ptr0 = passStringToWasm0(creator, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        _assertClass(options, LocksOptions);
        const ret = wasm.locks_forCreatorWithOptions(ptr0, len0, options.__wbg_ptr);
        return ret;
    }
    /**
     * @param {string} lock_server
     * @returns {Locks}
     */
    static forServer(lock_server) {
        const ptr0 = passStringToWasm0(lock_server, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.locks_forServer(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return Locks.__wrap(ret[0]);
    }
    /**
     * @param {string} lock_server
     * @param {LocksOptions} options
     * @returns {Locks}
     */
    static forServerWithOptions(lock_server, options) {
        const ptr0 = passStringToWasm0(lock_server, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        _assertClass(options, LocksOptions);
        const ret = wasm.locks_forServerWithOptions(ptr0, len0, options.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return Locks.__wrap(ret[0]);
    }
    /**
     * @param {any} pointer
     * @returns {Locks}
     */
    static fromCreatorLockServicePointer(pointer) {
        const ret = wasm.locks_fromCreatorLockServicePointer(pointer);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return Locks.__wrap(ret[0]);
    }
    /**
     * @param {string} user
     * @returns {Promise<boolean>}
     */
    static hasPaykitData(user) {
        const ptr0 = passStringToWasm0(user, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.locks_hasPaykitData(ptr0, len0);
        return ret;
    }
    /**
     * @param {string} user
     * @param {LocksOptions} options
     * @returns {Promise<boolean>}
     */
    static hasPaykitDataWithOptions(user, options) {
        const ptr0 = passStringToWasm0(user, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        _assertClass(options, LocksOptions);
        const ret = wasm.locks_hasPaykitDataWithOptions(ptr0, len0, options.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {string}
     */
    lockServer() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.locks_lockServer(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} callback_url
     * @returns {ConnectCallback}
     */
    static parseConnectCallback(callback_url) {
        const ptr0 = passStringToWasm0(callback_url, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.locks_parseConnectCallback(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ConnectCallback.__wrap(ret[0]);
    }
    /**
     * @param {string} resource
     * @returns {Promise<any>}
     */
    static readContentLock(resource) {
        const ptr0 = passStringToWasm0(resource, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.locks_readContentLock(ptr0, len0);
        return ret;
    }
    /**
     * @param {string} resource
     * @param {LocksOptions} options
     * @returns {Promise<any>}
     */
    static readContentLockWithOptions(resource, options) {
        const ptr0 = passStringToWasm0(resource, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        _assertClass(options, LocksOptions);
        const ret = wasm.locks_readContentLockWithOptions(ptr0, len0, options.__wbg_ptr);
        return ret;
    }
    /**
     * @param {string} secret
     * @returns {Session}
     */
    restoreSession(secret) {
        const ptr0 = passStringToWasm0(secret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.locks_restoreSession(this.__wbg_ptr, ptr0, len0);
        return Session.__wrap(ret);
    }
    /**
     * @returns {Viewer}
     */
    get viewer() {
        const ret = wasm.locks_viewer(this.__wbg_ptr);
        return Viewer.__wrap(ret);
    }
}
if (Symbol.dispose) Locks.prototype[Symbol.dispose] = Locks.prototype.free;

export class LocksOptions {
    static __wrap(ptr) {
        const obj = Object.create(LocksOptions.prototype);
        obj.__wbg_ptr = ptr;
        LocksOptionsFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        LocksOptionsFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_locksoptions_free(ptr, 0);
    }
    /**
     * @param {string} relay_url
     * @returns {LocksOptions}
     */
    addPkarrRelay(relay_url) {
        const ptr0 = passStringToWasm0(relay_url, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.locksoptions_addPkarrRelay(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return LocksOptions.__wrap(ret[0]);
    }
    constructor() {
        const ret = wasm.locksoptions_new();
        this.__wbg_ptr = ret;
        LocksOptionsFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {string[]}
     */
    get pkarrRelays() {
        const ret = wasm.locksoptions_pkarrRelays(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
}
if (Symbol.dispose) LocksOptions.prototype[Symbol.dispose] = LocksOptions.prototype.free;

export class RegisterGuardedResourceOptions {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RegisterGuardedResourceOptionsFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_registerguardedresourceoptions_free(ptr, 0);
    }
    /**
     * @returns {Uint8Array}
     */
    get bytes() {
        const ret = wasm.registerguardedresourceoptions_bytes(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {string}
     */
    get contentType() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.registerguardedresourceoptions_contentType(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} path
     * @param {string} content_type
     * @param {Uint8Array} bytes
     */
    constructor(path, content_type, bytes) {
        const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(content_type, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.registerguardedresourceoptions_new(ptr0, len0, ptr1, len1, ptr2, len2);
        this.__wbg_ptr = ret;
        RegisterGuardedResourceOptionsFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * @returns {string}
     */
    get path() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.registerguardedresourceoptions_path(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) RegisterGuardedResourceOptions.prototype[Symbol.dispose] = RegisterGuardedResourceOptions.prototype.free;

export class Session {
    static __wrap(ptr) {
        const obj = Object.create(Session.prototype);
        obj.__wbg_ptr = ptr;
        SessionFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SessionFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_session_free(ptr, 0);
    }
    /**
     * @returns {Creator}
     */
    get creator() {
        const ret = wasm.session_creator(this.__wbg_ptr);
        return Creator.__wrap(ret);
    }
    /**
     * @returns {string | undefined}
     */
    creatorPubky() {
        const ret = wasm.session_creatorPubky(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * @returns {string}
     */
    exportSecret() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.session_exportSecret(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    lockServer() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.session_lockServer(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Promise<void>}
     */
    signout() {
        const ret = wasm.session_signout(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) Session.prototype[Symbol.dispose] = Session.prototype.free;

export class SetLockServicePointerOptions {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SetLockServicePointerOptionsFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_setlockservicepointeroptions_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    get defaultLockServer() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.setlockservicepointeroptions_defaultLockServer(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} default_lock_server
     */
    constructor(default_lock_server) {
        const ptr0 = passStringToWasm0(default_lock_server, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.setlockservicepointeroptions_new(ptr0, len0);
        this.__wbg_ptr = ret;
        SetLockServicePointerOptionsFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}
if (Symbol.dispose) SetLockServicePointerOptions.prototype[Symbol.dispose] = SetLockServicePointerOptions.prototype.free;

export class VerificationTaskHandleOptions {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        VerificationTaskHandleOptionsFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_verificationtaskhandleoptions_free(ptr, 0);
    }
    /**
     * @returns {string}
     */
    get bundleId() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.verificationtaskhandleoptions_bundleId(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {string}
     */
    get creator() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.verificationtaskhandleoptions_creator(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {string} creator
     * @param {string} bundle_id
     */
    constructor(creator, bundle_id) {
        const ptr0 = passStringToWasm0(creator, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(bundle_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.verificationtaskhandleoptions_new(ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0];
        VerificationTaskHandleOptionsFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
}
if (Symbol.dispose) VerificationTaskHandleOptions.prototype[Symbol.dispose] = VerificationTaskHandleOptions.prototype.free;

export class Viewer {
    static __wrap(ptr) {
        const obj = Object.create(Viewer.prototype);
        obj.__wbg_ptr = ptr;
        ViewerFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ViewerFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_viewer_free(ptr, 0);
    }
    /**
     * @param {VerificationTaskHandleOptions} options
     * @returns {Promise<any>}
     */
    completeVerificationTask(options) {
        _assertClass(options, VerificationTaskHandleOptions);
        const ret = wasm.viewer_completeVerificationTask(this.__wbg_ptr, options.__wbg_ptr);
        return ret;
    }
    /**
     * @param {VerificationTaskHandleOptions} options
     * @returns {Promise<any>}
     */
    issueAccessCredential(options) {
        _assertClass(options, VerificationTaskHandleOptions);
        const ret = wasm.viewer_issueAccessCredential(this.__wbg_ptr, options.__wbg_ptr);
        return ret;
    }
    /**
     * @param {VerificationTaskHandleOptions} options
     * @returns {Promise<any>}
     */
    lookupVerificationTask(options) {
        _assertClass(options, VerificationTaskHandleOptions);
        const ret = wasm.viewer_lookupVerificationTask(this.__wbg_ptr, options.__wbg_ptr);
        return ret;
    }
    /**
     * @param {string} access_credential
     * @param {string} path
     * @returns {Promise<Uint8Array>}
     */
    proxyReadGuardedResource(access_credential, path) {
        const ptr0 = passStringToWasm0(access_credential, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.viewer_proxyReadGuardedResource(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret;
    }
    /**
     * @param {string} access_credential
     * @param {string} path
     * @returns {Promise<Response>}
     */
    proxyReadGuardedResourceResponse(access_credential, path) {
        const ptr0 = passStringToWasm0(access_credential, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.viewer_proxyReadGuardedResourceResponse(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        return ret;
    }
    /**
     * @param {any} submitted_proof_bundle
     * @returns {Promise<any>}
     */
    submitProofBundle(submitted_proof_bundle) {
        const ret = wasm.viewer_submitProofBundle(this.__wbg_ptr, submitted_proof_bundle);
        return ret;
    }
}
if (Symbol.dispose) Viewer.prototype[Symbol.dispose] = Viewer.prototype.free;
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_92b29b0548f8b746: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_String_8564e559799eccda: function(arg0, arg1) {
            const ret = String(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_bigint_get_as_i64_d968e41184ae354f: function(arg0, arg1) {
            const v = arg1;
            const ret = typeof(v) === 'bigint' ? v : undefined;
            getDataViewMemory0().setBigInt64(arg0 + 8 * 1, isLikeNone(ret) ? BigInt(0) : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_boolean_get_fa956cfa2d1bd751: function(arg0) {
            const v = arg0;
            const ret = typeof(v) === 'boolean' ? v : undefined;
            return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
        },
        __wbg___wbindgen_debug_string_c25d447a39f5578f: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_in_aca499c5de7ff5e5: function(arg0, arg1) {
            const ret = arg0 in arg1;
            return ret;
        },
        __wbg___wbindgen_is_bigint_2f76dc55065b4273: function(arg0) {
            const ret = typeof(arg0) === 'bigint';
            return ret;
        },
        __wbg___wbindgen_is_function_1ff95bcc5517c252: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_object_a27215656b807791: function(arg0) {
            const val = arg0;
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_string_ea5e6cc2e4141dfe: function(arg0) {
            const ret = typeof(arg0) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_c05833b95a3cf397: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_jsval_eq_e659fcf7b0e32763: function(arg0, arg1) {
            const ret = arg0 === arg1;
            return ret;
        },
        __wbg___wbindgen_jsval_loose_eq_db4c3b15f63fc170: function(arg0, arg1) {
            const ret = arg0 == arg1;
            return ret;
        },
        __wbg___wbindgen_number_get_394265ed1e1b84ee: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_string_get_b0ca35b86a603356: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_344f42d3211c4765: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg__wbg_cb_unref_fffb441def202758: function(arg0) {
            arg0._wbg_cb_unref();
        },
        __wbg_abort_8bae0f33e7833997: function(arg0) {
            arg0.abort();
        },
        __wbg_abort_eee9248a6d680839: function(arg0, arg1) {
            arg0.abort(arg1);
        },
        __wbg_append_01c74e5c6b58aa64: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            arg0.append(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
        }, arguments); },
        __wbg_arrayBuffer_3b637f0fa65c5351: function() { return handleError(function (arg0) {
            const ret = arg0.arrayBuffer();
            return ret;
        }, arguments); },
        __wbg_buffer_54b87055582c8a81: function(arg0) {
            const ret = arg0.buffer;
            return ret;
        },
        __wbg_byobRequest_06b654bb15590436: function(arg0) {
            const ret = arg0.byobRequest;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_byteLength_41862ca4020b9c43: function(arg0) {
            const ret = arg0.byteLength;
            return ret;
        },
        __wbg_byteOffset_d42e18c4441f628b: function(arg0) {
            const ret = arg0.byteOffset;
            return ret;
        },
        __wbg_call_8a2dd23819f8a60a: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.call(arg1);
            return ret;
        }, arguments); },
        __wbg_call_a6e5c5dce5018821: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_clearTimeout_333bba87532ab9d3: function(arg0) {
            const ret = clearTimeout(arg0);
            return ret;
        },
        __wbg_close_249a23304523681b: function() { return handleError(function (arg0) {
            arg0.close();
        }, arguments); },
        __wbg_close_72d318d9c16e83ef: function() { return handleError(function (arg0) {
            arg0.close();
        }, arguments); },
        __wbg_crypto_38df2bab126b63dc: function(arg0) {
            const ret = arg0.crypto;
            return ret;
        },
        __wbg_done_89b2b13e91a60321: function(arg0) {
            const ret = arg0.done;
            return ret;
        },
        __wbg_enqueue_6d83b4c6281bafd6: function() { return handleError(function (arg0, arg1) {
            arg0.enqueue(arg1);
        }, arguments); },
        __wbg_entries_015dc610cd81ede0: function(arg0) {
            const ret = Object.entries(arg0);
            return ret;
        },
        __wbg_entries_900cefd6f70eb290: function(arg0) {
            const ret = arg0.entries();
            return ret;
        },
        __wbg_fetch_074561c3e313c86f: function(arg0) {
            const ret = fetch(arg0);
            return ret;
        },
        __wbg_fetch_6ecc661950e58d49: function(arg0, arg1) {
            const ret = arg0.fetch(arg1);
            return ret;
        },
        __wbg_fetch_b5951fc96f52f786: function(arg0, arg1) {
            const ret = arg0.fetch(arg1);
            return ret;
        },
        __wbg_getRandomValues_1ad11c1597afb478: function() { return handleError(function (arg0, arg1) {
            globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, arguments); },
        __wbg_getRandomValues_c44a50d8cfdaebeb: function() { return handleError(function (arg0, arg1) {
            arg0.getRandomValues(arg1);
        }, arguments); },
        __wbg_getRandomValues_cc7f052a444bb2ce: function() { return handleError(function (arg0, arg1) {
            globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1));
        }, arguments); },
        __wbg_get_507a50627bffa49b: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_c7eb1f358a7654df: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_get_unchecked_6e0ad6d2a41b06f6: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_has_8374cf06984d8bfc: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.has(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_headers_7b59c5203c8c475d: function(arg0) {
            const ret = arg0.headers;
            return ret;
        },
        __wbg_headers_cf9c80f30e2a4eff: function(arg0) {
            const ret = arg0.headers;
            return ret;
        },
        __wbg_instanceof_ArrayBuffer_4480b9e0068a8adb: function(arg0) {
            let result;
            try {
                result = arg0 instanceof ArrayBuffer;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Map_e5b5e3db98422fcc: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Map;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Response_c8b64b2256f01bec: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Response;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Uint8Array_309b927aaf7a3fc7: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Uint8Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Window_05ba1ee4f6781663: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Window;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_isArray_0677c962b281d01a: function(arg0) {
            const ret = Array.isArray(arg0);
            return ret;
        },
        __wbg_isSafeInteger_04f36e4056f1b851: function(arg0) {
            const ret = Number.isSafeInteger(arg0);
            return ret;
        },
        __wbg_iterator_6f722e4a93058b71: function() {
            const ret = Symbol.iterator;
            return ret;
        },
        __wbg_json_77bd792f9a4a3fe1: function() { return handleError(function (arg0) {
            const ret = arg0.json();
            return ret;
        }, arguments); },
        __wbg_length_1f0964f4a5e2c6d8: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_370319915dc99107: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_locks_new: function(arg0) {
            const ret = Locks.__wrap(arg0);
            return ret;
        },
        __wbg_msCrypto_bd5a034af96bcba6: function(arg0) {
            const ret = arg0.msCrypto;
            return ret;
        },
        __wbg_new_0d809930cd1354c6: function() { return handleError(function () {
            const ret = new Headers();
            return ret;
        }, arguments); },
        __wbg_new_4339b2a2675a03e3: function() { return handleError(function () {
            const ret = new AbortController();
            return ret;
        }, arguments); },
        __wbg_new_b667d279fd5aa943: function(arg0, arg1) {
            const ret = new Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_cd45aabdf6073e84: function(arg0) {
            const ret = new Uint8Array(arg0);
            return ret;
        },
        __wbg_new_da52cf8fe3429cb2: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_from_slice_77cdfb7977362f3c: function(arg0, arg1) {
            const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_typed_1824d93f294193e5: function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return wasm_bindgen__convert__closures_____invoke__h0bbd1023632d6b79(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return ret;
            } finally {
                state0.a = 0;
            }
        },
        __wbg_new_with_byte_offset_and_length_54c7724ee3ec7d82: function(arg0, arg1, arg2) {
            const ret = new Uint8Array(arg0, arg1 >>> 0, arg2 >>> 0);
            return ret;
        },
        __wbg_new_with_length_e6785c33c8e4cce8: function(arg0) {
            const ret = new Uint8Array(arg0 >>> 0);
            return ret;
        },
        __wbg_new_with_str_and_init_d95cbe11ce28e65e: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = new Request(getStringFromWasm0(arg0, arg1), arg2);
            return ret;
        }, arguments); },
        __wbg_next_6dbf2c0ac8cde20f: function(arg0) {
            const ret = arg0.next;
            return ret;
        },
        __wbg_next_71f2aa1cb3d1e37e: function() { return handleError(function (arg0) {
            const ret = arg0.next();
            return ret;
        }, arguments); },
        __wbg_node_84ea875411254db1: function(arg0) {
            const ret = arg0.node;
            return ret;
        },
        __wbg_now_86c0d4ba3fa605b8: function() {
            const ret = Date.now();
            return ret;
        },
        __wbg_ok_acc5e3fb89668864: function(arg0) {
            const ret = arg0.ok;
            return ret;
        },
        __wbg_parse_1c0d8a8656d7e016: function() { return handleError(function (arg0, arg1) {
            const ret = JSON.parse(getStringFromWasm0(arg0, arg1));
            return ret;
        }, arguments); },
        __wbg_process_44c7a14e11e9f69e: function(arg0) {
            const ret = arg0.process;
            return ret;
        },
        __wbg_prototypesetcall_4770620bbe4688a0: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_queueMicrotask_0ab5b2d2393e99b9: function(arg0) {
            const ret = arg0.queueMicrotask;
            return ret;
        },
        __wbg_queueMicrotask_6a09b7bc46549209: function(arg0) {
            queueMicrotask(arg0);
        },
        __wbg_randomFillSync_6c25eac9869eb53c: function() { return handleError(function (arg0, arg1) {
            arg0.randomFillSync(arg1);
        }, arguments); },
        __wbg_require_b4edbdcf3e2a1ef0: function() { return handleError(function () {
            const ret = module.require;
            return ret;
        }, arguments); },
        __wbg_resolve_2191a4dfe481c25b: function(arg0) {
            const ret = Promise.resolve(arg0);
            return ret;
        },
        __wbg_respond_510e32df8aeb6817: function() { return handleError(function (arg0, arg1) {
            arg0.respond(arg1 >>> 0);
        }, arguments); },
        __wbg_session_new: function(arg0) {
            const ret = Session.__wrap(arg0);
            return ret;
        },
        __wbg_setTimeout_3a808dd861dd3c12: function(arg0, arg1) {
            const ret = setTimeout(arg0, arg1);
            return ret;
        },
        __wbg_set_0de9c62c23d04ad5: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            arg0.set(getStringFromWasm0(arg1, arg2), getStringFromWasm0(arg3, arg4));
        }, arguments); },
        __wbg_set_4d7dd76f3dae2926: function(arg0, arg1, arg2) {
            arg0.set(getArrayU8FromWasm0(arg1, arg2));
        },
        __wbg_set_body_029f2d171e0a005f: function(arg0, arg1) {
            arg0.body = arg1;
        },
        __wbg_set_cache_b4a740b195c051f4: function(arg0, arg1) {
            arg0.cache = __wbindgen_enum_RequestCache[arg1];
        },
        __wbg_set_credentials_bb34a40189e3b43b: function(arg0, arg1) {
            arg0.credentials = __wbindgen_enum_RequestCredentials[arg1];
        },
        __wbg_set_headers_9c61d123c3ee1f10: function(arg0, arg1) {
            arg0.headers = arg1;
        },
        __wbg_set_method_5532d59b92d76467: function(arg0, arg1, arg2) {
            arg0.method = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_mode_66c79886ad78fc05: function(arg0, arg1) {
            arg0.mode = __wbindgen_enum_RequestMode[arg1];
        },
        __wbg_set_name_3bbc583faefa4193: function(arg0, arg1, arg2) {
            arg0.name = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_signal_c4ef8faddb4c1446: function(arg0, arg1) {
            arg0.signal = arg1;
        },
        __wbg_signal_dad7cb35193abd31: function(arg0) {
            const ret = arg0.signal;
            return ret;
        },
        __wbg_static_accessor_GLOBAL_4ef717fb391d88b7: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_THIS_8d1badc68b5a74f4: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_146583524fe1469b: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_f2829a2234d7819e: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_status_c45b3b9b3033184a: function(arg0) {
            const ret = arg0.status;
            return ret;
        },
        __wbg_subarray_3ed232c8a6baee09: function(arg0, arg1, arg2) {
            const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
            return ret;
        },
        __wbg_text_d3a29f7525a132c3: function() { return handleError(function (arg0) {
            const ret = arg0.text();
            return ret;
        }, arguments); },
        __wbg_then_16d107c451e9905d: function(arg0, arg1, arg2) {
            const ret = arg0.then(arg1, arg2);
            return ret;
        },
        __wbg_then_6ec10ae38b3e92f7: function(arg0, arg1) {
            const ret = arg0.then(arg1);
            return ret;
        },
        __wbg_url_abdb8fb08377f8c0: function(arg0, arg1) {
            const ret = arg1.url;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_value_a5d5488a9589444a: function(arg0) {
            const ret = arg0.value;
            return ret;
        },
        __wbg_versions_276b2795b1c6a219: function(arg0) {
            const ret = arg0.versions;
            return ret;
        },
        __wbg_view_21f1d4a4f175dfa9: function(arg0) {
            const ret = arg0.view;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 655, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen__convert__closures_____invoke__h91c6e0a7524f6a5b);
            return ret;
        },
        __wbindgen_cast_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [], shim_idx: 468, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen__convert__closures_____invoke__h67168fce963d1069);
            return ret;
        },
        __wbindgen_cast_0000000000000003: function(arg0) {
            // Cast intrinsic for `I64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000004: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
            const ret = getArrayU8FromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_cast_0000000000000005: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_cast_0000000000000006: function(arg0) {
            // Cast intrinsic for `U64 -> Externref`.
            const ret = BigInt.asUintN(64, arg0);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./locks_sdk_wasm_bg.js": import0,
    };
}

function wasm_bindgen__convert__closures_____invoke__h67168fce963d1069(arg0, arg1) {
    wasm.wasm_bindgen__convert__closures_____invoke__h67168fce963d1069(arg0, arg1);
}

function wasm_bindgen__convert__closures_____invoke__h91c6e0a7524f6a5b(arg0, arg1, arg2) {
    const ret = wasm.wasm_bindgen__convert__closures_____invoke__h91c6e0a7524f6a5b(arg0, arg1, arg2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

function wasm_bindgen__convert__closures_____invoke__h0bbd1023632d6b79(arg0, arg1, arg2, arg3) {
    wasm.wasm_bindgen__convert__closures_____invoke__h0bbd1023632d6b79(arg0, arg1, arg2, arg3);
}


const __wbindgen_enum_ReadableStreamType = ["bytes"];


const __wbindgen_enum_RequestCache = ["default", "no-store", "reload", "no-cache", "force-cache", "only-if-cached"];


const __wbindgen_enum_RequestCredentials = ["omit", "same-origin", "include"];


const __wbindgen_enum_RequestMode = ["same-origin", "no-cors", "cors", "navigate"];
const BundleIdFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_bundleid_free(ptr, 1));
const ConnectCallbackFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_connectcallback_free(ptr, 1));
const ConnectUrlOptionsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_connecturloptions_free(ptr, 1));
const CreateContentLockRequestBuilderFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_createcontentlockrequestbuilder_free(ptr, 1));
const CreatorFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_creator_free(ptr, 1));
const DeleteGuardedResourceOptionsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_deleteguardedresourceoptions_free(ptr, 1));
const ExchangeFrontendSessionCodeOptionsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_exchangefrontendsessioncodeoptions_free(ptr, 1));
const IntoUnderlyingByteSourceFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_intounderlyingbytesource_free(ptr, 1));
const IntoUnderlyingSinkFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_intounderlyingsink_free(ptr, 1));
const IntoUnderlyingSourceFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_intounderlyingsource_free(ptr, 1));
const LocksFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_locks_free(ptr, 1));
const LocksOptionsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_locksoptions_free(ptr, 1));
const RegisterGuardedResourceOptionsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_registerguardedresourceoptions_free(ptr, 1));
const SessionFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_session_free(ptr, 1));
const SetLockServicePointerOptionsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_setlockservicepointeroptions_free(ptr, 1));
const VerificationTaskHandleOptionsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_verificationtaskhandleoptions_free(ptr, 1));
const ViewerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_viewer_free(ptr, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => wasm.__wbindgen_destroy_closure(state.a, state.b));

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function getArrayJsValueFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    const mem = getDataViewMemory0();
    const result = [];
    for (let i = ptr; i < ptr + 4 * len; i += 4) {
        result.push(wasm.__wbindgen_externrefs.get(mem.getUint32(i, true)));
    }
    wasm.__externref_drop_slice(ptr, len);
    return result;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function makeMutClosure(arg0, arg1, f) {
    const state = { a: arg0, b: arg1, cnt: 1 };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            state.a = a;
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            wasm.__wbindgen_destroy_closure(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('locks_sdk_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
