/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 150:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Config = void 0;
class Config {
    MinDelayBetweenSigningRequestStatusChecksInSeconds = 10; // start from 10 sec
    MaxDelayBetweenSigningRequestStatusChecksInSeconds = 60 * 20; // check at least every 20 minutes
}
exports.Config = Config;


/***/ }),

/***/ 979:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ConnectorUrlBuilder = void 0;
class ConnectorUrlBuilder {
    connectorBaseUrl;
    organizationId;
    apiVersion = "1.0";
    baseSigningRequestsRoute;
    constructor(connectorBaseUrl, organizationId) {
        this.connectorBaseUrl = connectorBaseUrl;
        this.organizationId = organizationId;
        this.connectorBaseUrl = this.trimSlash(this.connectorBaseUrl);
        this.baseSigningRequestsRoute = `${this.connectorBaseUrl}/${encodeURIComponent(this.organizationId)}/SigningRequests`;
    }
    buildSubmitSigningRequestUrl() {
        return `${this.baseSigningRequestsRoute}?api-version=${this.apiVersion}`;
    }
    buildGetSigningRequestStatusUrl(signingRequestId) {
        return `${this.baseSigningRequestsRoute}/${encodeURIComponent(signingRequestId)}/Status?api-version=${this.apiVersion}`;
    }
    buildGetSignedArtifactUrl(signingRequestId) {
        return `${this.baseSigningRequestsRoute}/${encodeURIComponent(signingRequestId)}/SignedArtifact?api-version=${this.apiVersion}`;
    }
    trimSlash(text) {
        if (text && text[text.length - 1] === '/') {
            return text.substring(0, text.length - 1);
        }
        return text;
    }
}
exports.ConnectorUrlBuilder = ConnectorUrlBuilder;


/***/ }),

/***/ 661:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.LogLevelError = exports.LogLevelWarning = exports.LogLevelInformation = exports.LogLevelDebug = void 0;
exports.LogLevelDebug = "Debug";
exports.LogLevelInformation = "Information";
exports.LogLevelWarning = "Warning";
exports.LogLevelError = "Error";


/***/ }),

/***/ 487:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.HttpClient = exports.retryPolicy = exports.HttpError = void 0;
const fs = __importStar(__nccwpck_require__(896));
const stream_1 = __nccwpck_require__(203);
const promises_1 = __nccwpck_require__(786);
const http_error_1 = __nccwpck_require__(204);
Object.defineProperty(exports, "HttpError", ({ enumerable: true, get: function () { return http_error_1.HttpError; } }));
const request_timeout_1 = __nccwpck_require__(28);
exports.retryPolicy = {
    // the delays are powers of 2 * 100ms, with 20% jitter
    // we want to cover 10 minutes of SignPath service unavailability
    // so we need to do 12 retries
    // sum of 2^1 + 2^2 + ... + 2^12 = 2^13 - 2 = 8190
    // 8190 * 100ms = 819 seconds = 13.65 minutes
    // 11 retries will not be enough to cover 10 minutes downtime
    maxRetryCount: 12,
    delayMs(retryNumber) {
        const delay = Math.pow(2, retryNumber) * 100;
        return delay + delay * 0.2 * Math.random();
    }
};
const retryableStatusCodes = [429, 502, 503, 504];
class HttpClient {
    options;
    constructor(options) {
        this.options = options;
    }
    async getJson(url) {
        return this.sendJson('GET', url, undefined);
    }
    async postJson(url, body) {
        return this.sendJson('POST', url, JSON.stringify(body));
    }
    async getStream(url, timeoutMs) {
        return this.executeWithRetries(timeoutMs, async (remainingTimeMs) => {
            const { response, timeout } = await this.send('GET', url, undefined, remainingTimeMs);
            // like before, downloading the body has its own timeout
            timeout.start(timeoutMs);
            return {
                status: response.status,
                headers: response.headers,
                saveToFile: async (filePath) => {
                    try {
                        const writer = fs.createWriteStream(filePath);
                        if (response.body) {
                            await (0, promises_1.pipeline)(stream_1.Readable.fromWeb(response.body), writer);
                        }
                        else {
                            writer.end();
                        }
                    }
                    catch (err) {
                        throw timeout.hasTimedOut ? this.timeoutError(timeoutMs) : err;
                    }
                    finally {
                        timeout.clear();
                    }
                }
            };
        });
    }
    async sendJson(method, url, body) {
        return this.executeWithRetries(this.options.timeoutMs, async (remainingTimeMs) => {
            const { response, timeout } = await this.send(method, url, body, remainingTimeMs);
            try {
                return {
                    status: response.status,
                    headers: response.headers,
                    data: parseResponseBody(await response.text())
                };
            }
            catch (err) {
                throw timeout.hasTimedOut ? this.timeoutError(remainingTimeMs) : this.networkError(err);
            }
            finally {
                timeout.clear();
            }
        });
    }
    async executeWithRetries(timeoutMs, request) {
        const deadline = Date.now() + timeoutMs;
        let retryCount = 0;
        while (true) {
            try {
                return await request(deadline - Date.now());
            }
            catch (err) {
                if (retryCount >= exports.retryPolicy.maxRetryCount || !this.isRetryable(err)) {
                    throw err;
                }
                retryCount++;
                const delayMs = exports.retryPolicy.delayMs(retryCount);
                if (deadline - Date.now() - delayMs <= 0) {
                    // the retry would exceed the timeout
                    throw err;
                }
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }
    // sends the request and returns the response if it has a success status code, the body is not read yet
    // throws an HttpError otherwise
    async send(method, url, body, timeoutMs) {
        const timeout = new request_timeout_1.RequestTimeout();
        timeout.start(timeoutMs);
        this.options.logger.debug(`Sending request: ${method} ${url}`);
        let response;
        try {
            response = await fetch(url, {
                method,
                body,
                headers: {
                    'User-Agent': this.options.userAgent,
                    'Authorization': `Bearer ${this.options.apiToken}`,
                    'Accept': 'application/json, text/plain, */*',
                    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
                },
                signal: timeout.signal
            });
        }
        catch (err) {
            timeout.clear();
            const error = timeout.hasTimedOut ? this.timeoutError(timeoutMs) : this.networkError(err);
            // response is absent for network errors, timeouts, and connection failures
            this.options.logger.debug(`Request failed without a response: ${error.message}`);
            throw error;
        }
        this.options.logger.debug(`Received response: ${response.status} ${response.statusText} from ${url}`);
        if (!response.ok) {
            let data;
            try {
                data = parseResponseBody(await response.text());
            }
            catch (err) {
                throw timeout.hasTimedOut ? this.timeoutError(timeoutMs) : this.networkError(err);
            }
            finally {
                timeout.clear();
            }
            throw new http_error_1.HttpError(`Request failed with status code ${response.status}`, { status: response.status, data });
        }
        return { response, timeout };
    }
    isRetryable(err) {
        if (!(err instanceof http_error_1.HttpError) || err.isTimeout) {
            return false;
        }
        if (!err.response) {
            return err.isTransientNetworkError;
        }
        const status = err.response.status;
        if (status === 429) {
            this.options.logger.info('SignPath REST API encountered too many requests.');
        }
        else if (retryableStatusCodes.includes(status)) {
            this.options.logger.info(`SignPath REST API is temporarily unavailable (server responded with ${status}).`);
        }
        return retryableStatusCodes.includes(status);
    }
    timeoutError(timeoutMs) {
        return new http_error_1.HttpError(`timeout of ${Math.max(timeoutMs, 0)}ms exceeded`, undefined, true);
    }
    networkError(err) {
        // fetch reports network errors as "TypeError: fetch failed", the actual error is in the cause
        const cause = err?.cause;
        const message = cause?.message || err?.message || String(err);
        // only system errors (e.g. ECONNRESET) are retried, errors without a code are thrown by fetch for invalid requests (e.g. an invalid header value)
        const code = cause?.code ?? err?.code;
        const isTransient = typeof code === 'string' && !permanentNetworkErrorCodes.includes(code);
        return new http_error_1.HttpError(message, undefined, false, isTransient);
    }
}
exports.HttpClient = HttpClient;
// network errors that will not go away by retrying: unknown host, unreachable network, invalid URL and TLS certificate errors
// (the same as axios-retry, which was used before, see https://github.com/sindresorhus/is-retry-allowed)
const permanentNetworkErrorCodes = [
    'ENOTFOUND',
    'ENETUNREACH',
    'ERR_INVALID_URL',
    'ERR_TLS_CERT_ALTNAME_INVALID',
    'UNABLE_TO_GET_ISSUER_CERT',
    'UNABLE_TO_GET_CRL',
    'UNABLE_TO_DECRYPT_CERT_SIGNATURE',
    'UNABLE_TO_DECRYPT_CRL_SIGNATURE',
    'UNABLE_TO_DECODE_ISSUER_PUBLIC_KEY',
    'CERT_SIGNATURE_FAILURE',
    'CRL_SIGNATURE_FAILURE',
    'CERT_NOT_YET_VALID',
    'CERT_HAS_EXPIRED',
    'CRL_NOT_YET_VALID',
    'CRL_HAS_EXPIRED',
    'ERROR_IN_CERT_NOT_BEFORE_FIELD',
    'ERROR_IN_CERT_NOT_AFTER_FIELD',
    'ERROR_IN_CRL_LAST_UPDATE_FIELD',
    'ERROR_IN_CRL_NEXT_UPDATE_FIELD',
    'OUT_OF_MEM',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'CERT_CHAIN_TOO_LONG',
    'CERT_REVOKED',
    'INVALID_CA',
    'PATH_LENGTH_EXCEEDED',
    'INVALID_PURPOSE',
    'CERT_UNTRUSTED',
    'CERT_REJECTED',
    'HOSTNAME_MISMATCH'
];
// JSON responses are parsed, other responses are returned as text
function parseResponseBody(text) {
    if (!text) {
        return text;
    }
    try {
        return JSON.parse(text);
    }
    catch {
        return text;
    }
}


/***/ }),

/***/ 204:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.HttpError = void 0;
// error of an HTTP request: a non-success response, a timeout or a network error
class HttpError extends Error {
    response;
    isTimeout;
    isTransientNetworkError;
    constructor(message, 
    // only set when the server responded with a non-success status code
    response, isTimeout = false, 
    // only set for network errors that may succeed when retried (e.g. a reset connection, but not an unknown host)
    isTransientNetworkError = false) {
        super(message);
        this.response = response;
        this.isTimeout = isTimeout;
        this.isTransientNetworkError = isTransientNetworkError;
        this.name = 'HttpError';
    }
}
exports.HttpError = HttpError;


/***/ }),

/***/ 28:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.RequestTimeout = void 0;
// timeout of an HTTP request, which can be restarted for reading the response body
class RequestTimeout {
    controller = new AbortController();
    timer;
    timedOut = false;
    get signal() {
        return this.controller.signal;
    }
    get hasTimedOut() {
        return this.timedOut;
    }
    start(timeoutMs) {
        this.clear();
        this.timer = setTimeout(() => {
            this.timedOut = true;
            this.controller.abort();
        }, Math.max(timeoutMs, 0));
        // a pending timeout must not keep the process alive
        this.timer.unref();
    }
    clear() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
    }
}
exports.RequestTimeout = RequestTimeout;


/***/ }),

/***/ 590:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.parseUserDefinedParameters = exports.parseRequiredNumberInput = exports.httpErrorResponseToText = exports.executeWithRetries = exports.SubmitSigningRequestWorkflow = exports.SignedArtifactDownloader = exports.retryPolicy = exports.HttpError = exports.HttpClient = exports.LogLevelWarning = exports.LogLevelInformation = exports.LogLevelError = exports.LogLevelDebug = exports.ConnectorUrlBuilder = exports.Config = void 0;
var config_1 = __nccwpck_require__(150);
Object.defineProperty(exports, "Config", ({ enumerable: true, get: function () { return config_1.Config; } }));
var connector_url_builder_1 = __nccwpck_require__(979);
Object.defineProperty(exports, "ConnectorUrlBuilder", ({ enumerable: true, get: function () { return connector_url_builder_1.ConnectorUrlBuilder; } }));
var submit_signing_request_result_1 = __nccwpck_require__(661);
Object.defineProperty(exports, "LogLevelDebug", ({ enumerable: true, get: function () { return submit_signing_request_result_1.LogLevelDebug; } }));
Object.defineProperty(exports, "LogLevelError", ({ enumerable: true, get: function () { return submit_signing_request_result_1.LogLevelError; } }));
Object.defineProperty(exports, "LogLevelInformation", ({ enumerable: true, get: function () { return submit_signing_request_result_1.LogLevelInformation; } }));
Object.defineProperty(exports, "LogLevelWarning", ({ enumerable: true, get: function () { return submit_signing_request_result_1.LogLevelWarning; } }));
var http_client_1 = __nccwpck_require__(487);
Object.defineProperty(exports, "HttpClient", ({ enumerable: true, get: function () { return http_client_1.HttpClient; } }));
Object.defineProperty(exports, "HttpError", ({ enumerable: true, get: function () { return http_client_1.HttpError; } }));
Object.defineProperty(exports, "retryPolicy", ({ enumerable: true, get: function () { return http_client_1.retryPolicy; } }));
var signed_artifact_downloader_1 = __nccwpck_require__(543);
Object.defineProperty(exports, "SignedArtifactDownloader", ({ enumerable: true, get: function () { return signed_artifact_downloader_1.SignedArtifactDownloader; } }));
var submit_signing_request_workflow_1 = __nccwpck_require__(178);
Object.defineProperty(exports, "SubmitSigningRequestWorkflow", ({ enumerable: true, get: function () { return submit_signing_request_workflow_1.SubmitSigningRequestWorkflow; } }));
var utils_1 = __nccwpck_require__(31);
Object.defineProperty(exports, "executeWithRetries", ({ enumerable: true, get: function () { return utils_1.executeWithRetries; } }));
Object.defineProperty(exports, "httpErrorResponseToText", ({ enumerable: true, get: function () { return utils_1.httpErrorResponseToText; } }));
Object.defineProperty(exports, "parseRequiredNumberInput", ({ enumerable: true, get: function () { return utils_1.parseRequiredNumberInput; } }));
Object.defineProperty(exports, "parseUserDefinedParameters", ({ enumerable: true, get: function () { return utils_1.parseUserDefinedParameters; } }));


/***/ }),

/***/ 543:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SignedArtifactDownloader = void 0;
const fs = __importStar(__nccwpck_require__(896));
const path = __importStar(__nccwpck_require__(928));
const nodeStreamZip = __importStar(__nccwpck_require__(61));
const utils_1 = __nccwpck_require__(31);
const http_client_1 = __nccwpck_require__(487);
class SignedArtifactDownloader {
    httpClient;
    logger;
    constructor(httpClient, logger) {
        this.httpClient = httpClient;
        this.logger = logger;
    }
    async downloadSignedArtifact(artifactDownloadUrl, options) {
        this.logger.info(`Signed artifact url ${artifactDownloadUrl}`);
        const timeoutMs = options.timeoutInSeconds * 1000;
        const response = await this.httpClient.getStream(artifactDownloadUrl, timeoutMs)
            .catch((e) => {
            throw new Error((0, utils_1.httpErrorResponseToText)(e));
        });
        const targetDirectory = this.resolveOrCreateDirectory(options.outputArtifactDirectory, options.workingDirectory);
        this.logger.info(`The signed artifact is being downloaded from SignPath and will be saved to ${targetDirectory}`);
        if (options.skipDecompress) {
            const fileName = this.getFileNameFromContentDisposition(response.headers.get('content-disposition') ?? undefined);
            const targetFile = path.join(targetDirectory, fileName);
            this.logger.info(`Going to download signed artifact to ${targetFile}`);
            await this.saveToFile(response, targetFile, timeoutMs);
            this.logger.info(`The signed artifact has been successfully downloaded from SignPath and saved to ${targetFile}`);
        }
        else {
            this.logger.info(`Going to download signed artifact`);
            const tmpDir = fs.mkdtempSync(`${options.tempDirectory}${path.sep}`);
            this.logger.debug(`Created temp directory ${tmpDir}`);
            try {
                // save the signed artifact to temp ZIP file
                const tmpZipFile = path.join(tmpDir, 'artifact_tmp.zip');
                await this.saveToFile(response, tmpZipFile, timeoutMs);
                this.logger.debug(`The signed artifact ZIP has been saved to ${tmpZipFile}`);
                this.logger.debug(`Extracting the signed artifact from ${tmpZipFile} to ${targetDirectory}`);
                // unzip temp ZIP file to the targetDirectory
                const zip = new nodeStreamZip.async({ file: tmpZipFile });
                try {
                    await zip.extract(null, targetDirectory);
                }
                finally {
                    await zip.close();
                }
                this.logger.info(`The signed artifact has been successfully downloaded from SignPath and extracted to ${targetDirectory}`);
            }
            finally {
                fs.rmSync(tmpDir, { recursive: true, force: true });
                this.logger.debug(`Deleted temp directory ${tmpDir}`);
            }
        }
    }
    async saveToFile(response, filePath, timeoutMs) {
        await response.saveToFile(filePath)
            .catch((e) => {
            if (e instanceof http_client_1.HttpError && e.isTimeout) {
                throw new Error(`Timeout of ${timeoutMs}ms exceeded while downloading the signed artifact from SignPath`);
            }
            throw e;
        });
    }
    getFileNameFromContentDisposition(contentDisposition) {
        // only the file name is used, so the file cannot be written outside of the output artifact directory
        const fileName = this.getRawFileNameFromContentDisposition(contentDisposition)?.split(/[\\/]/).pop();
        return fileName && fileName !== '.' && fileName !== '..' ? fileName : 'signed-artifact';
    }
    getRawFileNameFromContentDisposition(contentDisposition) {
        if (contentDisposition) {
            // Prefer filename* (RFC 5987 extended notation) - supports Unicode via percent-encoding
            const extendedMatch = contentDisposition.match(/filename\*=UTF-8''([^;\s]+)/i);
            if (extendedMatch) {
                try {
                    return decodeURIComponent(extendedMatch[1]);
                }
                catch {
                    // invalid percent-encoding, fall back to plain filename=
                }
            }
            // Fall back to plain filename=
            const simpleMatch = contentDisposition.match(/filename=(?:(['"])(.*?)\1|([^;\s]*))/i);
            if (simpleMatch) {
                return (simpleMatch[2] || simpleMatch[3] || '').trim();
            }
        }
        return undefined;
    }
    resolveOrCreateDirectory(directoryPath, workingDirectory) {
        const absolutePath = path.isAbsolute(directoryPath) ? directoryPath :
            path.join(workingDirectory, directoryPath);
        if (!fs.existsSync(absolutePath)) {
            this.logger.info(`Directory "${absolutePath}" does not exist and will be created`);
            fs.mkdirSync(absolutePath, { recursive: true });
        }
        return absolutePath;
    }
}
exports.SignedArtifactDownloader = SignedArtifactDownloader;


/***/ }),

/***/ 178:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.SubmitSigningRequestWorkflow = void 0;
const submit_signing_request_result_1 = __nccwpck_require__(661);
const config_1 = __nccwpck_require__(150);
const connector_url_builder_1 = __nccwpck_require__(979);
const http_client_1 = __nccwpck_require__(487);
const signed_artifact_downloader_1 = __nccwpck_require__(543);
const utils_1 = __nccwpck_require__(31);
// submits a signing request to the SignPath connector, waits for its completion and downloads the signed artifact
// fails with an Error that contains the message to report to the user
class SubmitSigningRequestWorkflow {
    options;
    ciSystem;
    config;
    urlBuilder;
    httpClient;
    logger;
    constructor(options, ciSystem, config = new config_1.Config()) {
        this.options = options;
        this.ciSystem = ciSystem;
        this.config = config;
        this.logger = ciSystem.logger;
        this.urlBuilder = new connector_url_builder_1.ConnectorUrlBuilder(options.connectorUrl, options.organizationId);
        this.httpClient = new http_client_1.HttpClient({
            userAgent: options.userAgent,
            apiToken: options.apiToken,
            timeoutMs: options.serviceUnavailableTimeoutInSeconds * 1000,
            logger: this.logger
        });
    }
    async run() {
        const signingRequestId = await this.submitSigningRequest();
        if (this.options.waitForCompletion) {
            await this.ensureSigningRequestCompleted(signingRequestId);
            if (this.options.outputArtifactDirectory) {
                await new signed_artifact_downloader_1.SignedArtifactDownloader(this.httpClient, this.logger).downloadSignedArtifact(this.urlBuilder.buildGetSignedArtifactUrl(signingRequestId), {
                    outputArtifactDirectory: this.options.outputArtifactDirectory,
                    workingDirectory: this.options.workingDirectory,
                    tempDirectory: this.options.tempDirectory,
                    skipDecompress: this.options.skipDecompress,
                    timeoutInSeconds: this.options.downloadSignedArtifactTimeoutInSeconds
                });
            }
        }
    }
    async submitSigningRequest() {
        const submitSigningRequestUrl = this.urlBuilder.buildSubmitSigningRequestUrl();
        this.logger.info('Submitting the signing request to the SignPath connector...');
        // call the connector to submit the signing request
        const response = (await this.httpClient
            .postJson(submitSigningRequestUrl, this.options.payload)
            .catch((e) => {
            if (e instanceof http_client_1.HttpError && e.response && e.response.status >= 400 && e.response.status < 500) {
                const connectorResponse = e.response;
                if (connectorResponse.data.error) {
                    this.redirectConnectorLogsToBuildLog(connectorResponse.data.logs);
                    // when an error occurs in the validator the error details are in the validationResult
                    this.checkCiSystemValidationResult(connectorResponse.data.validationResult);
                    throw new Error(connectorResponse.data.error);
                }
                // got validation errors from the connector
                return connectorResponse;
            }
            this.logger.error(`API call error: ${e.message}`);
            throw new Error((0, utils_1.httpErrorResponseToText)(e));
        }))
            .data;
        this.checkResponseStructure(response);
        this.redirectConnectorLogsToBuildLog(response.logs);
        this.checkCiSystemValidationResult(response.validationResult);
        this.logger.info(`SignPath signing request has been successfully submitted`);
        this.logger.info(`The signing request id is ${response.signingRequestId}`);
        this.logger.info(`You can view the signing request here: ${response.signingRequestUrl}`);
        this.ciSystem.setOutputs({
            signingRequestId: response.signingRequestId,
            signingRequestWebUrl: response.signingRequestUrl,
            signedArtifactDownloadUrl: this.urlBuilder.buildGetSignedArtifactUrl(response.signingRequestId)
        });
        return response.signingRequestId;
    }
    checkCiSystemValidationResult(validationResult) {
        if (validationResult && validationResult.errors.length > 0) {
            // got validation errors from the connector
            this.logger.startGroup('Policy violation(s)');
            this.logger.error(`Build artifact "${this.options.artifactIdOrName}" cannot be signed because of policy violations:`);
            validationResult.errors.forEach(validationError => {
                this.logger.error(`${validationError.error}`);
                if (validationError.howToFix) {
                    this.logger.info(validationError.howToFix);
                }
            });
            this.logger.endGroup();
            throw new Error('Policy evaluation failed');
        }
    }
    async ensureSigningRequestCompleted(signingRequestId) {
        // check for status update
        this.logger.info(`Checking the signing request status...`);
        const requestData = await ((0, utils_1.executeWithRetries)(async () => {
            const signingRequestStatusDto = await (this.getSigningRequestStatus(signingRequestId)
                .then(data => {
                if (data && !data.isFinalStatus) {
                    this.logger.info(`The signing request status is ${data.status}, which is not a final status; after a delay, we will check again...`);
                    return { retry: true };
                }
                return { retry: false, result: data };
            }));
            return signingRequestStatusDto;
        }, this.options.waitForCompletionTimeoutInSeconds * 1000, this.config.MinDelayBetweenSigningRequestStatusChecksInSeconds * 1000, this.config.MaxDelayBetweenSigningRequestStatusChecksInSeconds * 1000, this.logger));
        this.logger.info(`Signing request status is ${requestData.status}`);
        if (!requestData.isFinalStatus) {
            const maxWaitingTime = (0, utils_1.formatDuration)(this.options.waitForCompletionTimeoutInSeconds * 1000);
            this.logger.error(`We have exceeded the maximum waiting time, which is ${maxWaitingTime}, and the signing request is still not in a final state`);
            throw new Error(`The signing request is not completed. The current status is "${requestData.status}"`);
        }
        else {
            if (requestData.status !== "Completed") {
                throw new Error(`The signing request is not completed. The final status is "${requestData.status}"`);
            }
        }
        return requestData;
    }
    async getSigningRequestStatus(signingRequestId) {
        const requestStatusUrl = this.urlBuilder.buildGetSigningRequestStatusUrl(signingRequestId);
        const signingRequestStatusDto = await this.httpClient
            .getJson(requestStatusUrl)
            .catch((e) => {
            this.logger.error(`SignPath API call error: ${e.message}`);
            this.logger.error(`Signing request details API URL is: ${requestStatusUrl}`);
            throw new Error((0, utils_1.httpErrorResponseToText)(e));
        })
            .then(response => response.data);
        return signingRequestStatusDto;
    }
    checkResponseStructure(response) {
        if (!response.validationResult && !response.signingRequestId) {
            // if neither validationResult nor signingRequestId are present,
            // then the response might be not from the connector
            this.logger.error(`Unexpected response from the SignPath connector: ${JSON.stringify(response)}`);
            throw new Error('SignPath signing request was not created. Please make sure that the selected connector endpoint is pointing to the SignPath connector.');
        }
    }
    redirectConnectorLogsToBuildLog(logs) {
        if (logs && logs.length > 0) {
            logs.forEach(log => {
                switch (log.level) {
                    case submit_signing_request_result_1.LogLevelDebug:
                        this.logger.debug(log.message);
                        break;
                    case submit_signing_request_result_1.LogLevelInformation:
                        this.logger.info(log.message);
                        break;
                    case submit_signing_request_result_1.LogLevelWarning:
                        this.logger.warning(log.message);
                        break;
                    case submit_signing_request_result_1.LogLevelError:
                        this.logger.error(log.message);
                        break;
                    default:
                        this.logger.info(`${log.level}:${log.message}`);
                        break;
                }
            });
        }
    }
}
exports.SubmitSigningRequestWorkflow = SubmitSigningRequestWorkflow;


/***/ }),

/***/ 31:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.executeWithRetries = executeWithRetries;
exports.formatDuration = formatDuration;
exports.humanizeDuration = humanizeDuration;
exports.parseRequiredNumberInput = parseRequiredNumberInput;
exports.httpErrorResponseToText = httpErrorResponseToText;
exports.parseUserDefinedParameters = parseUserDefinedParameters;
async function executeWithRetries(promise, maxTotalWaitingTimeMs, minDelayMs, maxDelayMs, logger) {
    const startTime = Date.now();
    let delayMs = minDelayMs;
    let result;
    while (true) {
        result = await promise();
        if (result.retry === false) {
            break;
        }
        else {
            const totalWaitingTimeMs = Date.now() - startTime;
            if (totalWaitingTimeMs > maxTotalWaitingTimeMs) {
                throw new Error(`The operation has timed out after ${formatDuration(totalWaitingTimeMs)}`);
            }
            logger.info(`Next check in ${humanizeDuration(delayMs)}`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
            delayMs = Math.min(delayMs * 2, maxDelayMs);
        }
    }
    return result.result;
}
// formats a duration as hh:mm:ss, e.g. 00:10:00 for 10 minutes
function formatDuration(durationMs) {
    const totalSeconds = Math.floor(Math.max(durationMs, 0) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map(part => part.toString().padStart(2, '0')).join(':');
}
// formats a duration in words, rounded to whole seconds or minutes, e.g. "5 seconds" or "2 minutes"
function humanizeDuration(durationMs) {
    const seconds = Math.round(Math.max(durationMs, 0) / 1000);
    if (seconds < 60) {
        return pluralize(seconds, 'second');
    }
    return pluralize(Math.round(seconds / 60), 'minute');
}
function pluralize(count, unit) {
    return `${count} ${unit}${count === 1 ? '' : 's'}`;
}
function parseRequiredNumberInput(name, value) {
    if (!value) {
        throw new Error(`Input ${name} is required`);
    }
    const result = parseInt(value, 10);
    if (isNaN(result)) {
        throw new Error(`Input ${name} is not a number`);
    }
    return result;
}
function httpErrorResponseToText(err) {
    const response = err.response;
    if (response && response.data) {
        // read error information from response
        // data is a string
        if (typeof (response.data) === "string") {
            return response.data;
        }
        else if (typeof (response.data) === "object") {
            return JSON.stringify(response.data);
        }
    }
    return err.message;
}
function parseUserDefinedParameters(parameters) {
    if (!parameters) {
        return [];
    }
    // split value by lines
    const parmLines = parameters.split('\n');
    // for each line get param name and value
    return parmLines.map(parseUseDefinedParameter)
        .filter(p => p !== null)
        .map(p => p);
}
function parseUseDefinedParameter(line) {
    if (!line) {
        return null;
    }
    const nameValueSeparatorIndex = line.indexOf(':');
    if (nameValueSeparatorIndex === -1) {
        throw new Error(`Invalid parameter line: ${line}`);
    }
    const name = line.substring(0, nameValueSeparatorIndex).trim();
    const value = line.substring(nameValueSeparatorIndex + 1).trim();
    // validate name
    if (!name) {
        throw new Error(`Parameter name cannot be empty. Line: ${line}`);
    }
    if (/[a-zA-Z0-9.\-_]+/.exec(name)?.[0] !== name) {
        throw new Error(`Invalid parameter name: ${name}. Only alphanumeric characters, dots, dashes and underscores are allowed.`);
    }
    // validate value
    let parsedValue;
    try {
        parsedValue = JSON.parse(value);
    }
    catch (e) {
        throw new Error(`Invalid parameter value: ${value} - ${e}. Only valid JSON strings are allowed.`, { cause: e });
    }
    if (typeof (parsedValue) !== 'string') {
        throw new Error(`Invalid parameter value: ${value}. Only valid JSON strings are allowed.`);
    }
    return { name, value: parsedValue };
}


/***/ }),

/***/ 61:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

/**
 * @license node-stream-zip | (c) 2020 Antelle | https://github.com/antelle/node-stream-zip/blob/master/LICENSE
 * Portions copyright https://github.com/cthackers/adm-zip | https://raw.githubusercontent.com/cthackers/adm-zip/master/LICENSE
 */

let fs = __nccwpck_require__(896);
const util = __nccwpck_require__(23);
const path = __nccwpck_require__(928);
const events = __nccwpck_require__(434);
const zlib = __nccwpck_require__(106);
const stream = __nccwpck_require__(203);

const consts = {
    /* The local file header */
    LOCHDR: 30, // LOC header size
    LOCSIG: 0x04034b50, // "PK\003\004"
    LOCVER: 4, // version needed to extract
    LOCFLG: 6, // general purpose bit flag
    LOCHOW: 8, // compression method
    LOCTIM: 10, // modification time (2 bytes time, 2 bytes date)
    LOCCRC: 14, // uncompressed file crc-32 value
    LOCSIZ: 18, // compressed size
    LOCLEN: 22, // uncompressed size
    LOCNAM: 26, // filename length
    LOCEXT: 28, // extra field length

    /* The Data descriptor */
    EXTSIG: 0x08074b50, // "PK\007\008"
    EXTHDR: 16, // EXT header size
    EXTCRC: 4, // uncompressed file crc-32 value
    EXTSIZ: 8, // compressed size
    EXTLEN: 12, // uncompressed size

    /* The central directory file header */
    CENHDR: 46, // CEN header size
    CENSIG: 0x02014b50, // "PK\001\002"
    CENVEM: 4, // version made by
    CENVER: 6, // version needed to extract
    CENFLG: 8, // encrypt, decrypt flags
    CENHOW: 10, // compression method
    CENTIM: 12, // modification time (2 bytes time, 2 bytes date)
    CENCRC: 16, // uncompressed file crc-32 value
    CENSIZ: 20, // compressed size
    CENLEN: 24, // uncompressed size
    CENNAM: 28, // filename length
    CENEXT: 30, // extra field length
    CENCOM: 32, // file comment length
    CENDSK: 34, // volume number start
    CENATT: 36, // internal file attributes
    CENATX: 38, // external file attributes (host system dependent)
    CENOFF: 42, // LOC header offset

    /* The entries in the end of central directory */
    ENDHDR: 22, // END header size
    ENDSIG: 0x06054b50, // "PK\005\006"
    ENDSIGFIRST: 0x50,
    ENDSUB: 8, // number of entries on this disk
    ENDTOT: 10, // total number of entries
    ENDSIZ: 12, // central directory size in bytes
    ENDOFF: 16, // offset of first CEN header
    ENDCOM: 20, // zip file comment length
    MAXFILECOMMENT: 0xffff,

    /* The entries in the end of ZIP64 central directory locator */
    ENDL64HDR: 20, // ZIP64 end of central directory locator header size
    ENDL64SIG: 0x07064b50, // ZIP64 end of central directory locator signature
    ENDL64SIGFIRST: 0x50,
    ENDL64OFS: 8, // ZIP64 end of central directory offset

    /* The entries in the end of ZIP64 central directory */
    END64HDR: 56, // ZIP64 end of central directory header size
    END64SIG: 0x06064b50, // ZIP64 end of central directory signature
    END64SIGFIRST: 0x50,
    END64SUB: 24, // number of entries on this disk
    END64TOT: 32, // total number of entries
    END64SIZ: 40,
    END64OFF: 48,

    /* Compression methods */
    STORED: 0, // no compression
    SHRUNK: 1, // shrunk
    REDUCED1: 2, // reduced with compression factor 1
    REDUCED2: 3, // reduced with compression factor 2
    REDUCED3: 4, // reduced with compression factor 3
    REDUCED4: 5, // reduced with compression factor 4
    IMPLODED: 6, // imploded
    // 7 reserved
    DEFLATED: 8, // deflated
    ENHANCED_DEFLATED: 9, // deflate64
    PKWARE: 10, // PKWare DCL imploded
    // 11 reserved
    BZIP2: 12, //  compressed using BZIP2
    // 13 reserved
    LZMA: 14, // LZMA
    // 15-17 reserved
    IBM_TERSE: 18, // compressed using IBM TERSE
    IBM_LZ77: 19, //IBM LZ77 z

    /* General purpose bit flag */
    FLG_ENC: 0, // encrypted file
    FLG_COMP1: 1, // compression option
    FLG_COMP2: 2, // compression option
    FLG_DESC: 4, // data descriptor
    FLG_ENH: 8, // enhanced deflation
    FLG_STR: 16, // strong encryption
    FLG_LNG: 1024, // language encoding
    FLG_MSK: 4096, // mask header values
    FLG_ENTRY_ENC: 1,

    /* 4.5 Extensible data fields */
    EF_ID: 0,
    EF_SIZE: 2,

    /* Header IDs */
    ID_ZIP64: 0x0001,
    ID_AVINFO: 0x0007,
    ID_PFS: 0x0008,
    ID_OS2: 0x0009,
    ID_NTFS: 0x000a,
    ID_OPENVMS: 0x000c,
    ID_UNIX: 0x000d,
    ID_FORK: 0x000e,
    ID_PATCH: 0x000f,
    ID_X509_PKCS7: 0x0014,
    ID_X509_CERTID_F: 0x0015,
    ID_X509_CERTID_C: 0x0016,
    ID_STRONGENC: 0x0017,
    ID_RECORD_MGT: 0x0018,
    ID_X509_PKCS7_RL: 0x0019,
    ID_IBM1: 0x0065,
    ID_IBM2: 0x0066,
    ID_POSZIP: 0x4690,

    EF_ZIP64_OR_32: 0xffffffff,
    EF_ZIP64_OR_16: 0xffff,
};

const StreamZip = function (config) {
    let fd, fileSize, chunkSize, op, centralDirectory, closed;
    const ready = false,
        that = this,
        entries = config.storeEntries !== false ? {} : null,
        fileName = config.file,
        textDecoder = config.nameEncoding ? new TextDecoder(config.nameEncoding) : null;

    open();

    function open() {
        if (config.fd) {
            fd = config.fd;
            readFile();
        } else {
            fs.open(fileName, 'r', (err, f) => {
                if (err) {
                    return that.emit('error', err);
                }
                fd = f;
                readFile();
            });
        }
    }

    function readFile() {
        fs.fstat(fd, (err, stat) => {
            if (err) {
                return that.emit('error', err);
            }
            fileSize = stat.size;
            chunkSize = config.chunkSize || Math.round(fileSize / 1000);
            chunkSize = Math.max(
                Math.min(chunkSize, Math.min(128 * 1024, fileSize)),
                Math.min(1024, fileSize)
            );
            readCentralDirectory();
        });
    }

    function readUntilFoundCallback(err, bytesRead) {
        if (err || !bytesRead) {
            return that.emit('error', err || new Error('Archive read error'));
        }
        let pos = op.lastPos;
        let bufferPosition = pos - op.win.position;
        const buffer = op.win.buffer;
        const minPos = op.minPos;
        while (--pos >= minPos && --bufferPosition >= 0) {
            if (buffer.length - bufferPosition >= 4 && buffer[bufferPosition] === op.firstByte) {
                // quick check first signature byte
                if (buffer.readUInt32LE(bufferPosition) === op.sig) {
                    op.lastBufferPosition = bufferPosition;
                    op.lastBytesRead = bytesRead;
                    op.complete();
                    return;
                }
            }
        }
        if (pos === minPos) {
            return that.emit('error', new Error('Bad archive'));
        }
        op.lastPos = pos + 1;
        op.chunkSize *= 2;
        if (pos <= minPos) {
            return that.emit('error', new Error('Bad archive'));
        }
        const expandLength = Math.min(op.chunkSize, pos - minPos);
        op.win.expandLeft(expandLength, readUntilFoundCallback);
    }

    function readCentralDirectory() {
        const totalReadLength = Math.min(consts.ENDHDR + consts.MAXFILECOMMENT, fileSize);
        op = {
            win: new FileWindowBuffer(fd),
            totalReadLength,
            minPos: fileSize - totalReadLength,
            lastPos: fileSize,
            chunkSize: Math.min(1024, chunkSize),
            firstByte: consts.ENDSIGFIRST,
            sig: consts.ENDSIG,
            complete: readCentralDirectoryComplete,
        };
        op.win.read(fileSize - op.chunkSize, op.chunkSize, readUntilFoundCallback);
    }

    function readCentralDirectoryComplete() {
        const buffer = op.win.buffer;
        const pos = op.lastBufferPosition;
        try {
            centralDirectory = new CentralDirectoryHeader();
            centralDirectory.read(buffer.slice(pos, pos + consts.ENDHDR));
            centralDirectory.headerOffset = op.win.position + pos;
            if (centralDirectory.commentLength) {
                that.comment = buffer
                    .slice(
                        pos + consts.ENDHDR,
                        pos + consts.ENDHDR + centralDirectory.commentLength
                    )
                    .toString();
            } else {
                that.comment = null;
            }
            that.entriesCount = centralDirectory.volumeEntries;
            that.centralDirectory = centralDirectory;
            if (
                (centralDirectory.volumeEntries === consts.EF_ZIP64_OR_16 &&
                    centralDirectory.totalEntries === consts.EF_ZIP64_OR_16) ||
                centralDirectory.size === consts.EF_ZIP64_OR_32 ||
                centralDirectory.offset === consts.EF_ZIP64_OR_32
            ) {
                readZip64CentralDirectoryLocator();
            } else {
                op = {};
                readEntries();
            }
        } catch (err) {
            that.emit('error', err);
        }
    }

    function readZip64CentralDirectoryLocator() {
        const length = consts.ENDL64HDR;
        if (op.lastBufferPosition > length) {
            op.lastBufferPosition -= length;
            readZip64CentralDirectoryLocatorComplete();
        } else {
            op = {
                win: op.win,
                totalReadLength: length,
                minPos: op.win.position - length,
                lastPos: op.win.position,
                chunkSize: op.chunkSize,
                firstByte: consts.ENDL64SIGFIRST,
                sig: consts.ENDL64SIG,
                complete: readZip64CentralDirectoryLocatorComplete,
            };
            op.win.read(op.lastPos - op.chunkSize, op.chunkSize, readUntilFoundCallback);
        }
    }

    function readZip64CentralDirectoryLocatorComplete() {
        const buffer = op.win.buffer;
        const locHeader = new CentralDirectoryLoc64Header();
        locHeader.read(
            buffer.slice(op.lastBufferPosition, op.lastBufferPosition + consts.ENDL64HDR)
        );
        const readLength = fileSize - locHeader.headerOffset;
        op = {
            win: op.win,
            totalReadLength: readLength,
            minPos: locHeader.headerOffset,
            lastPos: op.lastPos,
            chunkSize: op.chunkSize,
            firstByte: consts.END64SIGFIRST,
            sig: consts.END64SIG,
            complete: readZip64CentralDirectoryComplete,
        };
        op.win.read(fileSize - op.chunkSize, op.chunkSize, readUntilFoundCallback);
    }

    function readZip64CentralDirectoryComplete() {
        const buffer = op.win.buffer;
        const zip64cd = new CentralDirectoryZip64Header();
        zip64cd.read(buffer.slice(op.lastBufferPosition, op.lastBufferPosition + consts.END64HDR));
        that.centralDirectory.volumeEntries = zip64cd.volumeEntries;
        that.centralDirectory.totalEntries = zip64cd.totalEntries;
        that.centralDirectory.size = zip64cd.size;
        that.centralDirectory.offset = zip64cd.offset;
        that.entriesCount = zip64cd.volumeEntries;
        op = {};
        readEntries();
    }

    function readEntries() {
        op = {
            win: new FileWindowBuffer(fd),
            pos: centralDirectory.offset,
            chunkSize,
            entriesLeft: centralDirectory.volumeEntries,
        };
        op.win.read(op.pos, Math.min(chunkSize, fileSize - op.pos), readEntriesCallback);
    }

    function readEntriesCallback(err, bytesRead) {
        if (err || !bytesRead) {
            return that.emit('error', err || new Error('Entries read error'));
        }
        let bufferPos = op.pos - op.win.position;
        let entry = op.entry;
        const buffer = op.win.buffer;
        const bufferLength = buffer.length;
        try {
            while (op.entriesLeft > 0) {
                if (!entry) {
                    entry = new ZipEntry();
                    entry.readHeader(buffer, bufferPos);
                    entry.headerOffset = op.win.position + bufferPos;
                    op.entry = entry;
                    op.pos += consts.CENHDR;
                    bufferPos += consts.CENHDR;
                }
                const entryHeaderSize = entry.fnameLen + entry.extraLen + entry.comLen;
                const advanceBytes = entryHeaderSize + (op.entriesLeft > 1 ? consts.CENHDR : 0);
                if (bufferLength - bufferPos < advanceBytes) {
                    op.win.moveRight(chunkSize, readEntriesCallback, bufferPos);
                    op.move = true;
                    return;
                }
                entry.read(buffer, bufferPos, textDecoder);
                if (!config.skipEntryNameValidation) {
                    entry.validateName();
                }
                if (entries) {
                    entries[entry.name] = entry;
                }
                that.emit('entry', entry);
                op.entry = entry = null;
                op.entriesLeft--;
                op.pos += entryHeaderSize;
                bufferPos += entryHeaderSize;
            }
            that.emit('ready');
        } catch (err) {
            that.emit('error', err);
        }
    }

    function checkEntriesExist() {
        if (!entries) {
            throw new Error('storeEntries disabled');
        }
    }

    Object.defineProperty(this, 'ready', {
        get() {
            return ready;
        },
    });

    this.entry = function (name) {
        checkEntriesExist();
        return entries[name];
    };

    this.entries = function () {
        checkEntriesExist();
        return entries;
    };

    this.stream = function (entry, callback) {
        return this.openEntry(
            entry,
            (err, entry) => {
                if (err) {
                    return callback(err);
                }
                const offset = dataOffset(entry);
                let entryStream = new EntryDataReaderStream(fd, offset, entry.compressedSize);
                if (entry.method === consts.STORED) {
                    // nothing to do
                } else if (entry.method === consts.DEFLATED) {
                    entryStream = entryStream.pipe(zlib.createInflateRaw());
                } else {
                    return callback(new Error('Unknown compression method: ' + entry.method));
                }
                if (canVerifyCrc(entry)) {
                    entryStream = entryStream.pipe(
                        new EntryVerifyStream(entryStream, entry.crc, entry.size)
                    );
                }
                callback(null, entryStream);
            },
            false
        );
    };

    this.entryDataSync = function (entry) {
        let err = null;
        this.openEntry(
            entry,
            (e, en) => {
                err = e;
                entry = en;
            },
            true
        );
        if (err) {
            throw err;
        }
        let data = Buffer.alloc(entry.compressedSize);
        new FsRead(fd, data, 0, entry.compressedSize, dataOffset(entry), (e) => {
            err = e;
        }).read(true);
        if (err) {
            throw err;
        }
        if (entry.method === consts.STORED) {
            // nothing to do
        } else if (entry.method === consts.DEFLATED || entry.method === consts.ENHANCED_DEFLATED) {
            data = zlib.inflateRawSync(data);
        } else {
            throw new Error('Unknown compression method: ' + entry.method);
        }
        if (data.length !== entry.size) {
            throw new Error('Invalid size');
        }
        if (canVerifyCrc(entry)) {
            const verify = new CrcVerify(entry.crc, entry.size);
            verify.data(data);
        }
        return data;
    };

    this.openEntry = function (entry, callback, sync) {
        if (typeof entry === 'string') {
            checkEntriesExist();
            entry = entries[entry];
            if (!entry) {
                return callback(new Error('Entry not found'));
            }
        }
        if (!entry.isFile) {
            return callback(new Error('Entry is not file'));
        }
        if (!fd) {
            return callback(new Error('Archive closed'));
        }
        const buffer = Buffer.alloc(consts.LOCHDR);
        new FsRead(fd, buffer, 0, buffer.length, entry.offset, (err) => {
            if (err) {
                return callback(err);
            }
            let readEx;
            try {
                entry.readDataHeader(buffer);
                if (entry.encrypted) {
                    readEx = new Error('Entry encrypted');
                }
            } catch (ex) {
                readEx = ex;
            }
            callback(readEx, entry);
        }).read(sync);
    };

    function dataOffset(entry) {
        return entry.offset + consts.LOCHDR + entry.fnameLen + entry.extraLen;
    }

    function canVerifyCrc(entry) {
        // if bit 3 (0x08) of the general-purpose flags field is set, then the CRC-32 and file sizes are not known when the header is written
        return (entry.flags & 0x8) !== 0x8;
    }

    function extract(entry, outPath, callback) {
        that.stream(entry, (err, stm) => {
            if (err) {
                callback(err);
            } else {
                let fsStm, errThrown;
                stm.on('error', (err) => {
                    errThrown = err;
                    if (fsStm) {
                        stm.unpipe(fsStm);
                        fsStm.close(() => {
                            callback(err);
                        });
                    }
                });
                fs.open(outPath, 'w', (err, fdFile) => {
                    if (err) {
                        return callback(err);
                    }
                    if (errThrown) {
                        fs.close(fd, () => {
                            callback(errThrown);
                        });
                        return;
                    }
                    fsStm = fs.createWriteStream(outPath, { fd: fdFile });
                    fsStm.on('finish', () => {
                        that.emit('extract', entry, outPath);
                        if (!errThrown) {
                            callback();
                        }
                    });
                    stm.pipe(fsStm);
                });
            }
        });
    }

    function createDirectories(baseDir, dirs, callback) {
        if (!dirs.length) {
            return callback();
        }
        let dir = dirs.shift();
        dir = path.join(baseDir, path.join(...dir));
        fs.mkdir(dir, { recursive: true }, (err) => {
            if (err && err.code !== 'EEXIST') {
                return callback(err);
            }
            createDirectories(baseDir, dirs, callback);
        });
    }

    function extractFiles(baseDir, baseRelPath, files, callback, extractedCount) {
        if (!files.length) {
            return callback(null, extractedCount);
        }
        const file = files.shift();
        const targetPath = path.join(baseDir, file.name.replace(baseRelPath, ''));
        extract(file, targetPath, (err) => {
            if (err) {
                return callback(err, extractedCount);
            }
            extractFiles(baseDir, baseRelPath, files, callback, extractedCount + 1);
        });
    }

    this.extract = function (entry, outPath, callback) {
        let entryName = entry || '';
        if (typeof entry === 'string') {
            entry = this.entry(entry);
            if (entry) {
                entryName = entry.name;
            } else {
                if (entryName.length && entryName[entryName.length - 1] !== '/') {
                    entryName += '/';
                }
            }
        }
        if (!entry || entry.isDirectory) {
            const files = [],
                dirs = [],
                allDirs = {};
            for (const e in entries) {
                if (
                    Object.prototype.hasOwnProperty.call(entries, e) &&
                    e.lastIndexOf(entryName, 0) === 0
                ) {
                    let relPath = e.replace(entryName, '');
                    const childEntry = entries[e];
                    if (childEntry.isFile) {
                        files.push(childEntry);
                        relPath = path.dirname(relPath);
                    }
                    if (relPath && !allDirs[relPath] && relPath !== '.') {
                        allDirs[relPath] = true;
                        let parts = relPath.split('/').filter((f) => {
                            return f;
                        });
                        if (parts.length) {
                            dirs.push(parts);
                        }
                        while (parts.length > 1) {
                            parts = parts.slice(0, parts.length - 1);
                            const partsPath = parts.join('/');
                            if (allDirs[partsPath] || partsPath === '.') {
                                break;
                            }
                            allDirs[partsPath] = true;
                            dirs.push(parts);
                        }
                    }
                }
            }
            dirs.sort((x, y) => {
                return x.length - y.length;
            });
            if (dirs.length) {
                createDirectories(outPath, dirs, (err) => {
                    if (err) {
                        callback(err);
                    } else {
                        extractFiles(outPath, entryName, files, callback, 0);
                    }
                });
            } else {
                extractFiles(outPath, entryName, files, callback, 0);
            }
        } else {
            fs.stat(outPath, (err, stat) => {
                if (stat && stat.isDirectory()) {
                    extract(entry, path.join(outPath, path.basename(entry.name)), callback);
                } else {
                    extract(entry, outPath, callback);
                }
            });
        }
    };

    this.close = function (callback) {
        if (closed || !fd) {
            closed = true;
            if (callback) {
                callback();
            }
        } else {
            closed = true;
            fs.close(fd, (err) => {
                fd = null;
                if (callback) {
                    callback(err);
                }
            });
        }
    };

    const originalEmit = events.EventEmitter.prototype.emit;
    this.emit = function (...args) {
        if (!closed) {
            return originalEmit.call(this, ...args);
        }
    };
};

StreamZip.setFs = function (customFs) {
    fs = customFs;
};

StreamZip.debugLog = (...args) => {
    if (StreamZip.debug) {
        // eslint-disable-next-line no-console
        console.log(...args);
    }
};

util.inherits(StreamZip, events.EventEmitter);

const propZip = Symbol('zip');

StreamZip.async = class StreamZipAsync extends events.EventEmitter {
    constructor(config) {
        super();

        const zip = new StreamZip(config);

        zip.on('entry', (entry) => this.emit('entry', entry));
        zip.on('extract', (entry, outPath) => this.emit('extract', entry, outPath));

        this[propZip] = new Promise((resolve, reject) => {
            zip.on('ready', () => {
                zip.removeListener('error', reject);
                resolve(zip);
            });
            zip.on('error', reject);
        });
    }

    get entriesCount() {
        return this[propZip].then((zip) => zip.entriesCount);
    }

    get comment() {
        return this[propZip].then((zip) => zip.comment);
    }

    async entry(name) {
        const zip = await this[propZip];
        return zip.entry(name);
    }

    async entries() {
        const zip = await this[propZip];
        return zip.entries();
    }

    async stream(entry) {
        const zip = await this[propZip];
        return new Promise((resolve, reject) => {
            zip.stream(entry, (err, stm) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(stm);
                }
            });
        });
    }

    async entryData(entry) {
        const stm = await this.stream(entry);
        return new Promise((resolve, reject) => {
            const data = [];
            stm.on('data', (chunk) => data.push(chunk));
            stm.on('end', () => {
                resolve(Buffer.concat(data));
            });
            stm.on('error', (err) => {
                stm.removeAllListeners('end');
                reject(err);
            });
        });
    }

    async extract(entry, outPath) {
        const zip = await this[propZip];
        return new Promise((resolve, reject) => {
            zip.extract(entry, outPath, (err, res) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(res);
                }
            });
        });
    }

    async close() {
        const zip = await this[propZip];
        return new Promise((resolve, reject) => {
            zip.close((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
};

class CentralDirectoryHeader {
    read(data) {
        if (data.length !== consts.ENDHDR || data.readUInt32LE(0) !== consts.ENDSIG) {
            throw new Error('Invalid central directory');
        }
        // number of entries on this volume
        this.volumeEntries = data.readUInt16LE(consts.ENDSUB);
        // total number of entries
        this.totalEntries = data.readUInt16LE(consts.ENDTOT);
        // central directory size in bytes
        this.size = data.readUInt32LE(consts.ENDSIZ);
        // offset of first CEN header
        this.offset = data.readUInt32LE(consts.ENDOFF);
        // zip file comment length
        this.commentLength = data.readUInt16LE(consts.ENDCOM);
    }
}

class CentralDirectoryLoc64Header {
    read(data) {
        if (data.length !== consts.ENDL64HDR || data.readUInt32LE(0) !== consts.ENDL64SIG) {
            throw new Error('Invalid zip64 central directory locator');
        }
        // ZIP64 EOCD header offset
        this.headerOffset = readUInt64LE(data, consts.ENDSUB);
    }
}

class CentralDirectoryZip64Header {
    read(data) {
        if (data.length !== consts.END64HDR || data.readUInt32LE(0) !== consts.END64SIG) {
            throw new Error('Invalid central directory');
        }
        // number of entries on this volume
        this.volumeEntries = readUInt64LE(data, consts.END64SUB);
        // total number of entries
        this.totalEntries = readUInt64LE(data, consts.END64TOT);
        // central directory size in bytes
        this.size = readUInt64LE(data, consts.END64SIZ);
        // offset of first CEN header
        this.offset = readUInt64LE(data, consts.END64OFF);
    }
}

class ZipEntry {
    readHeader(data, offset) {
        // data should be 46 bytes and start with "PK 01 02"
        if (data.length < offset + consts.CENHDR || data.readUInt32LE(offset) !== consts.CENSIG) {
            throw new Error('Invalid entry header');
        }
        // version made by
        this.verMade = data.readUInt16LE(offset + consts.CENVEM);
        // version needed to extract
        this.version = data.readUInt16LE(offset + consts.CENVER);
        // encrypt, decrypt flags
        this.flags = data.readUInt16LE(offset + consts.CENFLG);
        // compression method
        this.method = data.readUInt16LE(offset + consts.CENHOW);
        // modification time (2 bytes time, 2 bytes date)
        const timebytes = data.readUInt16LE(offset + consts.CENTIM);
        const datebytes = data.readUInt16LE(offset + consts.CENTIM + 2);
        this.time = parseZipTime(timebytes, datebytes);

        // uncompressed file crc-32 value
        this.crc = data.readUInt32LE(offset + consts.CENCRC);
        // compressed size
        this.compressedSize = data.readUInt32LE(offset + consts.CENSIZ);
        // uncompressed size
        this.size = data.readUInt32LE(offset + consts.CENLEN);
        // filename length
        this.fnameLen = data.readUInt16LE(offset + consts.CENNAM);
        // extra field length
        this.extraLen = data.readUInt16LE(offset + consts.CENEXT);
        // file comment length
        this.comLen = data.readUInt16LE(offset + consts.CENCOM);
        // volume number start
        this.diskStart = data.readUInt16LE(offset + consts.CENDSK);
        // internal file attributes
        this.inattr = data.readUInt16LE(offset + consts.CENATT);
        // external file attributes
        this.attr = data.readUInt32LE(offset + consts.CENATX);
        // LOC header offset
        this.offset = data.readUInt32LE(offset + consts.CENOFF);
    }

    readDataHeader(data) {
        // 30 bytes and should start with "PK\003\004"
        if (data.readUInt32LE(0) !== consts.LOCSIG) {
            throw new Error('Invalid local header');
        }
        // version needed to extract
        this.version = data.readUInt16LE(consts.LOCVER);
        // general purpose bit flag
        this.flags = data.readUInt16LE(consts.LOCFLG);
        // compression method
        this.method = data.readUInt16LE(consts.LOCHOW);
        // modification time (2 bytes time ; 2 bytes date)
        const timebytes = data.readUInt16LE(consts.LOCTIM);
        const datebytes = data.readUInt16LE(consts.LOCTIM + 2);
        this.time = parseZipTime(timebytes, datebytes);

        // uncompressed file crc-32 value
        this.crc = data.readUInt32LE(consts.LOCCRC) || this.crc;
        // compressed size
        const compressedSize = data.readUInt32LE(consts.LOCSIZ);
        if (
            compressedSize &&
            compressedSize !== consts.EF_ZIP64_OR_32 &&
            compressedSize !== this.compressedSize
        ) {
            throw new Error('Invalid compressed size');
        }
        // uncompressed size
        const size = data.readUInt32LE(consts.LOCLEN);
        if (size && size !== consts.EF_ZIP64_OR_32 && size !== this.size) {
            throw new Error('Invalid size');
        }
        // filename length
        this.fnameLen = data.readUInt16LE(consts.LOCNAM);
        // extra field length
        this.extraLen = data.readUInt16LE(consts.LOCEXT);
    }

    read(data, offset, textDecoder) {
        const nameData = data.slice(offset, (offset += this.fnameLen));
        this.name = textDecoder
            ? textDecoder.decode(new Uint8Array(nameData))
            : nameData.toString('utf8');
        const lastChar = data[offset - 1];
        this.isDirectory = lastChar === 47 || lastChar === 92;

        if (this.extraLen) {
            this.readExtra(data, offset);
            offset += this.extraLen;
        }
        this.comment = this.comLen ? data.slice(offset, offset + this.comLen).toString() : null;
    }

    validateName() {
        if (/\\|^\w+:|^\/|(^|\/)\.\.(\/|$)/.test(this.name)) {
            throw new Error('Malicious entry: ' + this.name);
        }
    }

    readExtra(data, offset) {
        let signature, size;
        const maxPos = offset + this.extraLen;
        while (offset < maxPos) {
            signature = data.readUInt16LE(offset);
            offset += 2;
            size = data.readUInt16LE(offset);
            offset += 2;
            if (consts.ID_ZIP64 === signature) {
                this.parseZip64Extra(data, offset, size);
            }
            offset += size;
        }
    }

    parseZip64Extra(data, offset, length) {
        if (length >= 8 && this.size === consts.EF_ZIP64_OR_32) {
            this.size = readUInt64LE(data, offset);
            offset += 8;
            length -= 8;
        }
        if (length >= 8 && this.compressedSize === consts.EF_ZIP64_OR_32) {
            this.compressedSize = readUInt64LE(data, offset);
            offset += 8;
            length -= 8;
        }
        if (length >= 8 && this.offset === consts.EF_ZIP64_OR_32) {
            this.offset = readUInt64LE(data, offset);
            offset += 8;
            length -= 8;
        }
        if (length >= 4 && this.diskStart === consts.EF_ZIP64_OR_16) {
            this.diskStart = data.readUInt32LE(offset);
            // offset += 4; length -= 4;
        }
    }

    get encrypted() {
        return (this.flags & consts.FLG_ENTRY_ENC) === consts.FLG_ENTRY_ENC;
    }

    get isFile() {
        return !this.isDirectory;
    }
}

class FsRead {
    constructor(fd, buffer, offset, length, position, callback) {
        this.fd = fd;
        this.buffer = buffer;
        this.offset = offset;
        this.length = length;
        this.position = position;
        this.callback = callback;
        this.bytesRead = 0;
        this.waiting = false;
    }

    read(sync) {
        StreamZip.debugLog('read', this.position, this.bytesRead, this.length, this.offset);
        this.waiting = true;
        let err;
        if (sync) {
            let bytesRead = 0;
            try {
                bytesRead = fs.readSync(
                    this.fd,
                    this.buffer,
                    this.offset + this.bytesRead,
                    this.length - this.bytesRead,
                    this.position + this.bytesRead
                );
            } catch (e) {
                err = e;
            }
            this.readCallback(sync, err, err ? bytesRead : null);
        } else {
            fs.read(
                this.fd,
                this.buffer,
                this.offset + this.bytesRead,
                this.length - this.bytesRead,
                this.position + this.bytesRead,
                this.readCallback.bind(this, sync)
            );
        }
    }

    readCallback(sync, err, bytesRead) {
        if (typeof bytesRead === 'number') {
            this.bytesRead += bytesRead;
        }
        if (err || !bytesRead || this.bytesRead === this.length) {
            this.waiting = false;
            return this.callback(err, this.bytesRead);
        } else {
            this.read(sync);
        }
    }
}

class FileWindowBuffer {
    constructor(fd) {
        this.position = 0;
        this.buffer = Buffer.alloc(0);
        this.fd = fd;
        this.fsOp = null;
    }

    checkOp() {
        if (this.fsOp && this.fsOp.waiting) {
            throw new Error('Operation in progress');
        }
    }

    read(pos, length, callback) {
        this.checkOp();
        if (this.buffer.length < length) {
            this.buffer = Buffer.alloc(length);
        }
        this.position = pos;
        this.fsOp = new FsRead(this.fd, this.buffer, 0, length, this.position, callback).read();
    }

    expandLeft(length, callback) {
        this.checkOp();
        this.buffer = Buffer.concat([Buffer.alloc(length), this.buffer]);
        this.position -= length;
        if (this.position < 0) {
            this.position = 0;
        }
        this.fsOp = new FsRead(this.fd, this.buffer, 0, length, this.position, callback).read();
    }

    expandRight(length, callback) {
        this.checkOp();
        const offset = this.buffer.length;
        this.buffer = Buffer.concat([this.buffer, Buffer.alloc(length)]);
        this.fsOp = new FsRead(
            this.fd,
            this.buffer,
            offset,
            length,
            this.position + offset,
            callback
        ).read();
    }

    moveRight(length, callback, shift) {
        this.checkOp();
        if (shift) {
            this.buffer.copy(this.buffer, 0, shift);
        } else {
            shift = 0;
        }
        this.position += shift;
        this.fsOp = new FsRead(
            this.fd,
            this.buffer,
            this.buffer.length - shift,
            shift,
            this.position + this.buffer.length - shift,
            callback
        ).read();
    }
}

class EntryDataReaderStream extends stream.Readable {
    constructor(fd, offset, length) {
        super();
        this.fd = fd;
        this.offset = offset;
        this.length = length;
        this.pos = 0;
        this.readCallback = this.readCallback.bind(this);
    }

    _read(n) {
        const buffer = Buffer.alloc(Math.min(n, this.length - this.pos));
        if (buffer.length) {
            fs.read(this.fd, buffer, 0, buffer.length, this.offset + this.pos, this.readCallback);
        } else {
            this.push(null);
        }
    }

    readCallback(err, bytesRead, buffer) {
        this.pos += bytesRead;
        if (err) {
            this.emit('error', err);
            this.push(null);
        } else if (!bytesRead) {
            this.push(null);
        } else {
            if (bytesRead !== buffer.length) {
                buffer = buffer.slice(0, bytesRead);
            }
            this.push(buffer);
        }
    }
}

class EntryVerifyStream extends stream.Transform {
    constructor(baseStm, crc, size) {
        super();
        this.verify = new CrcVerify(crc, size);
        baseStm.on('error', (e) => {
            this.emit('error', e);
        });
    }

    _transform(data, encoding, callback) {
        let err;
        try {
            this.verify.data(data);
        } catch (e) {
            err = e;
        }
        callback(err, data);
    }
}

class CrcVerify {
    constructor(crc, size) {
        this.crc = crc;
        this.size = size;
        this.state = {
            crc: ~0,
            size: 0,
        };
    }

    data(data) {
        const crcTable = CrcVerify.getCrcTable();
        let crc = this.state.crc;
        let off = 0;
        let len = data.length;
        while (--len >= 0) {
            crc = crcTable[(crc ^ data[off++]) & 0xff] ^ (crc >>> 8);
        }
        this.state.crc = crc;
        this.state.size += data.length;
        if (this.state.size >= this.size) {
            const buf = Buffer.alloc(4);
            buf.writeInt32LE(~this.state.crc & 0xffffffff, 0);
            crc = buf.readUInt32LE(0);
            if (crc !== this.crc) {
                throw new Error('Invalid CRC');
            }
            if (this.state.size !== this.size) {
                throw new Error('Invalid size');
            }
        }
    }

    static getCrcTable() {
        let crcTable = CrcVerify.crcTable;
        if (!crcTable) {
            CrcVerify.crcTable = crcTable = [];
            const b = Buffer.alloc(4);
            for (let n = 0; n < 256; n++) {
                let c = n;
                for (let k = 8; --k >= 0; ) {
                    if ((c & 1) !== 0) {
                        c = 0xedb88320 ^ (c >>> 1);
                    } else {
                        c = c >>> 1;
                    }
                }
                if (c < 0) {
                    b.writeInt32LE(c, 0);
                    c = b.readUInt32LE(0);
                }
                crcTable[n] = c;
            }
        }
        return crcTable;
    }
}

function parseZipTime(timebytes, datebytes) {
    const timebits = toBits(timebytes, 16);
    const datebits = toBits(datebytes, 16);

    const mt = {
        h: parseInt(timebits.slice(0, 5).join(''), 2),
        m: parseInt(timebits.slice(5, 11).join(''), 2),
        s: parseInt(timebits.slice(11, 16).join(''), 2) * 2,
        Y: parseInt(datebits.slice(0, 7).join(''), 2) + 1980,
        M: parseInt(datebits.slice(7, 11).join(''), 2),
        D: parseInt(datebits.slice(11, 16).join(''), 2),
    };
    const dt_str = [mt.Y, mt.M, mt.D].join('-') + ' ' + [mt.h, mt.m, mt.s].join(':') + ' GMT+0';
    return new Date(dt_str).getTime();
}

function toBits(dec, size) {
    let b = (dec >>> 0).toString(2);
    while (b.length < size) {
        b = '0' + b;
    }
    return b.split('');
}

function readUInt64LE(buffer, offset) {
    return buffer.readUInt32LE(offset + 4) * 0x0000000100000000 + buffer.readUInt32LE(offset);
}

module.exports = StreamZip;


/***/ }),

/***/ 754:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.HelperInputOutput = void 0;
const core = __importStar(__nccwpck_require__(255));
const submit_signing_request_core_1 = __nccwpck_require__(590);
class HelperInputOutput {
    get signPathConnectorUrl() {
        return core.getInput('connector-url', { required: true });
    }
    get githubArtifactId() {
        return core.getInput('github-artifact-id', { required: true });
    }
    get outputArtifactDirectory() {
        return core.getInput('output-artifact-directory', { required: false });
    }
    get waitForCompletion() {
        return core.getInput('wait-for-completion', { required: true }) === 'true';
    }
    get organizationId() {
        return core.getInput('organization-id', { required: true });
    }
    get signPathApiToken() {
        return core.getInput('api-token', { required: true });
    }
    get projectSlug() {
        return core.getInput('project-slug', { required: true });
    }
    get gitHubToken() {
        return core.getInput('github-token', { required: true });
    }
    get parameters() {
        const value = core.getInput('parameters', { required: false });
        return (0, submit_signing_request_core_1.parseUserDefinedParameters)(value);
    }
    get signingPolicySlug() {
        return core.getInput('signing-policy-slug', { required: true });
    }
    get artifactConfigurationSlug() {
        return core.getInput('artifact-configuration-slug', { required: false });
    }
    get waitForCompletionTimeoutInSeconds() {
        return getRequiredInputNumber('wait-for-completion-timeout-in-seconds');
    }
    get downloadSignedArtifactTimeoutInSeconds() {
        return getRequiredInputNumber('download-signed-artifact-timeout-in-seconds');
    }
    get serviceUnavailableTimeoutInSeconds() {
        return getRequiredInputNumber('service-unavailable-timeout-in-seconds');
    }
    get skipDecompress() {
        return core.getInput('skip-decompress', { required: false }) === 'true';
    }
    setSignedArtifactDownloadUrl(url) {
        core.setOutput('signed-artifact-download-url', url);
    }
    setSigningRequestId(signingRequestId) {
        core.setOutput('signing-request-id', signingRequestId);
    }
    setSigningRequestWebUrl(signingRequestUrl) {
        core.setOutput('signing-request-web-url', signingRequestUrl);
    }
}
exports.HelperInputOutput = HelperInputOutput;
function getRequiredInputNumber(name) {
    return (0, submit_signing_request_core_1.parseRequiredNumberInput)(name, core.getInput(name, { required: true }));
}


/***/ }),

/***/ 527:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.issue = exports.issueCommand = void 0;
const os = __importStar(__nccwpck_require__(857));
const utils_1 = __nccwpck_require__(859);
/**
 * Commands
 *
 * Command Format:
 *   ::name key=value,key=value::message
 *
 * Examples:
 *   ::warning::This is the message
 *   ::set-env name=MY_VAR::some value
 */
function issueCommand(command, properties, message) {
    const cmd = new Command(command, properties, message);
    process.stdout.write(cmd.toString() + os.EOL);
}
exports.issueCommand = issueCommand;
function issue(name, message = '') {
    issueCommand(name, {}, message);
}
exports.issue = issue;
const CMD_STRING = '::';
class Command {
    constructor(command, properties, message) {
        if (!command) {
            command = 'missing.command';
        }
        this.command = command;
        this.properties = properties;
        this.message = message;
    }
    toString() {
        let cmdStr = CMD_STRING + this.command;
        if (this.properties && Object.keys(this.properties).length > 0) {
            cmdStr += ' ';
            let first = true;
            for (const key in this.properties) {
                if (this.properties.hasOwnProperty(key)) {
                    const val = this.properties[key];
                    if (val) {
                        if (first) {
                            first = false;
                        }
                        else {
                            cmdStr += ',';
                        }
                        cmdStr += `${key}=${escapeProperty(val)}`;
                    }
                }
            }
        }
        cmdStr += `${CMD_STRING}${escapeData(this.message)}`;
        return cmdStr;
    }
}
function escapeData(s) {
    return (0, utils_1.toCommandValue)(s)
        .replace(/%/g, '%25')
        .replace(/\r/g, '%0D')
        .replace(/\n/g, '%0A');
}
function escapeProperty(s) {
    return (0, utils_1.toCommandValue)(s)
        .replace(/%/g, '%25')
        .replace(/\r/g, '%0D')
        .replace(/\n/g, '%0A')
        .replace(/:/g, '%3A')
        .replace(/,/g, '%2C');
}
//# sourceMappingURL=command.js.map

/***/ }),

/***/ 255:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.platform = exports.toPlatformPath = exports.toWin32Path = exports.toPosixPath = exports.markdownSummary = exports.summary = exports.getIDToken = exports.getState = exports.saveState = exports.group = exports.endGroup = exports.startGroup = exports.info = exports.notice = exports.warning = exports.error = exports.debug = exports.isDebug = exports.setFailed = exports.setCommandEcho = exports.setOutput = exports.getBooleanInput = exports.getMultilineInput = exports.getInput = exports.addPath = exports.setSecret = exports.exportVariable = exports.ExitCode = void 0;
const command_1 = __nccwpck_require__(527);
const file_command_1 = __nccwpck_require__(914);
const utils_1 = __nccwpck_require__(859);
const os = __importStar(__nccwpck_require__(857));
const path = __importStar(__nccwpck_require__(928));
const oidc_utils_1 = __nccwpck_require__(653);
/**
 * The code to exit an action
 */
var ExitCode;
(function (ExitCode) {
    /**
     * A code indicating that the action was successful
     */
    ExitCode[ExitCode["Success"] = 0] = "Success";
    /**
     * A code indicating that the action was a failure
     */
    ExitCode[ExitCode["Failure"] = 1] = "Failure";
})(ExitCode || (exports.ExitCode = ExitCode = {}));
//-----------------------------------------------------------------------
// Variables
//-----------------------------------------------------------------------
/**
 * Sets env variable for this action and future actions in the job
 * @param name the name of the variable to set
 * @param val the value of the variable. Non-string values will be converted to a string via JSON.stringify
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function exportVariable(name, val) {
    const convertedVal = (0, utils_1.toCommandValue)(val);
    process.env[name] = convertedVal;
    const filePath = process.env['GITHUB_ENV'] || '';
    if (filePath) {
        return (0, file_command_1.issueFileCommand)('ENV', (0, file_command_1.prepareKeyValueMessage)(name, val));
    }
    (0, command_1.issueCommand)('set-env', { name }, convertedVal);
}
exports.exportVariable = exportVariable;
/**
 * Registers a secret which will get masked from logs
 * @param secret value of the secret
 */
function setSecret(secret) {
    (0, command_1.issueCommand)('add-mask', {}, secret);
}
exports.setSecret = setSecret;
/**
 * Prepends inputPath to the PATH (for this action and future actions)
 * @param inputPath
 */
function addPath(inputPath) {
    const filePath = process.env['GITHUB_PATH'] || '';
    if (filePath) {
        (0, file_command_1.issueFileCommand)('PATH', inputPath);
    }
    else {
        (0, command_1.issueCommand)('add-path', {}, inputPath);
    }
    process.env['PATH'] = `${inputPath}${path.delimiter}${process.env['PATH']}`;
}
exports.addPath = addPath;
/**
 * Gets the value of an input.
 * Unless trimWhitespace is set to false in InputOptions, the value is also trimmed.
 * Returns an empty string if the value is not defined.
 *
 * @param     name     name of the input to get
 * @param     options  optional. See InputOptions.
 * @returns   string
 */
function getInput(name, options) {
    const val = process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] || '';
    if (options && options.required && !val) {
        throw new Error(`Input required and not supplied: ${name}`);
    }
    if (options && options.trimWhitespace === false) {
        return val;
    }
    return val.trim();
}
exports.getInput = getInput;
/**
 * Gets the values of an multiline input.  Each value is also trimmed.
 *
 * @param     name     name of the input to get
 * @param     options  optional. See InputOptions.
 * @returns   string[]
 *
 */
function getMultilineInput(name, options) {
    const inputs = getInput(name, options)
        .split('\n')
        .filter(x => x !== '');
    if (options && options.trimWhitespace === false) {
        return inputs;
    }
    return inputs.map(input => input.trim());
}
exports.getMultilineInput = getMultilineInput;
/**
 * Gets the input value of the boolean type in the YAML 1.2 "core schema" specification.
 * Support boolean input list: `true | True | TRUE | false | False | FALSE` .
 * The return value is also in boolean type.
 * ref: https://yaml.org/spec/1.2/spec.html#id2804923
 *
 * @param     name     name of the input to get
 * @param     options  optional. See InputOptions.
 * @returns   boolean
 */
function getBooleanInput(name, options) {
    const trueValue = ['true', 'True', 'TRUE'];
    const falseValue = ['false', 'False', 'FALSE'];
    const val = getInput(name, options);
    if (trueValue.includes(val))
        return true;
    if (falseValue.includes(val))
        return false;
    throw new TypeError(`Input does not meet YAML 1.2 "Core Schema" specification: ${name}\n` +
        `Support boolean input list: \`true | True | TRUE | false | False | FALSE\``);
}
exports.getBooleanInput = getBooleanInput;
/**
 * Sets the value of an output.
 *
 * @param     name     name of the output to set
 * @param     value    value to store. Non-string values will be converted to a string via JSON.stringify
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setOutput(name, value) {
    const filePath = process.env['GITHUB_OUTPUT'] || '';
    if (filePath) {
        return (0, file_command_1.issueFileCommand)('OUTPUT', (0, file_command_1.prepareKeyValueMessage)(name, value));
    }
    process.stdout.write(os.EOL);
    (0, command_1.issueCommand)('set-output', { name }, (0, utils_1.toCommandValue)(value));
}
exports.setOutput = setOutput;
/**
 * Enables or disables the echoing of commands into stdout for the rest of the step.
 * Echoing is disabled by default if ACTIONS_STEP_DEBUG is not set.
 *
 */
function setCommandEcho(enabled) {
    (0, command_1.issue)('echo', enabled ? 'on' : 'off');
}
exports.setCommandEcho = setCommandEcho;
//-----------------------------------------------------------------------
// Results
//-----------------------------------------------------------------------
/**
 * Sets the action status to failed.
 * When the action exits it will be with an exit code of 1
 * @param message add error issue message
 */
function setFailed(message) {
    process.exitCode = ExitCode.Failure;
    error(message);
}
exports.setFailed = setFailed;
//-----------------------------------------------------------------------
// Logging Commands
//-----------------------------------------------------------------------
/**
 * Gets whether Actions Step Debug is on or not
 */
function isDebug() {
    return process.env['RUNNER_DEBUG'] === '1';
}
exports.isDebug = isDebug;
/**
 * Writes debug message to user log
 * @param message debug message
 */
function debug(message) {
    (0, command_1.issueCommand)('debug', {}, message);
}
exports.debug = debug;
/**
 * Adds an error issue
 * @param message error issue message. Errors will be converted to string via toString()
 * @param properties optional properties to add to the annotation.
 */
function error(message, properties = {}) {
    (0, command_1.issueCommand)('error', (0, utils_1.toCommandProperties)(properties), message instanceof Error ? message.toString() : message);
}
exports.error = error;
/**
 * Adds a warning issue
 * @param message warning issue message. Errors will be converted to string via toString()
 * @param properties optional properties to add to the annotation.
 */
function warning(message, properties = {}) {
    (0, command_1.issueCommand)('warning', (0, utils_1.toCommandProperties)(properties), message instanceof Error ? message.toString() : message);
}
exports.warning = warning;
/**
 * Adds a notice issue
 * @param message notice issue message. Errors will be converted to string via toString()
 * @param properties optional properties to add to the annotation.
 */
function notice(message, properties = {}) {
    (0, command_1.issueCommand)('notice', (0, utils_1.toCommandProperties)(properties), message instanceof Error ? message.toString() : message);
}
exports.notice = notice;
/**
 * Writes info to log with console.log.
 * @param message info message
 */
function info(message) {
    process.stdout.write(message + os.EOL);
}
exports.info = info;
/**
 * Begin an output group.
 *
 * Output until the next `groupEnd` will be foldable in this group
 *
 * @param name The name of the output group
 */
function startGroup(name) {
    (0, command_1.issue)('group', name);
}
exports.startGroup = startGroup;
/**
 * End an output group.
 */
function endGroup() {
    (0, command_1.issue)('endgroup');
}
exports.endGroup = endGroup;
/**
 * Wrap an asynchronous function call in a group.
 *
 * Returns the same type as the function itself.
 *
 * @param name The name of the group
 * @param fn The function to wrap in the group
 */
function group(name, fn) {
    return __awaiter(this, void 0, void 0, function* () {
        startGroup(name);
        let result;
        try {
            result = yield fn();
        }
        finally {
            endGroup();
        }
        return result;
    });
}
exports.group = group;
//-----------------------------------------------------------------------
// Wrapper action state
//-----------------------------------------------------------------------
/**
 * Saves state for current action, the state can only be retrieved by this action's post job execution.
 *
 * @param     name     name of the state to store
 * @param     value    value to store. Non-string values will be converted to a string via JSON.stringify
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function saveState(name, value) {
    const filePath = process.env['GITHUB_STATE'] || '';
    if (filePath) {
        return (0, file_command_1.issueFileCommand)('STATE', (0, file_command_1.prepareKeyValueMessage)(name, value));
    }
    (0, command_1.issueCommand)('save-state', { name }, (0, utils_1.toCommandValue)(value));
}
exports.saveState = saveState;
/**
 * Gets the value of an state set by this action's main execution.
 *
 * @param     name     name of the state to get
 * @returns   string
 */
function getState(name) {
    return process.env[`STATE_${name}`] || '';
}
exports.getState = getState;
function getIDToken(aud) {
    return __awaiter(this, void 0, void 0, function* () {
        return yield oidc_utils_1.OidcClient.getIDToken(aud);
    });
}
exports.getIDToken = getIDToken;
/**
 * Summary exports
 */
var summary_1 = __nccwpck_require__(750);
Object.defineProperty(exports, "summary", ({ enumerable: true, get: function () { return summary_1.summary; } }));
/**
 * @deprecated use core.summary
 */
var summary_2 = __nccwpck_require__(750);
Object.defineProperty(exports, "markdownSummary", ({ enumerable: true, get: function () { return summary_2.markdownSummary; } }));
/**
 * Path exports
 */
var path_utils_1 = __nccwpck_require__(699);
Object.defineProperty(exports, "toPosixPath", ({ enumerable: true, get: function () { return path_utils_1.toPosixPath; } }));
Object.defineProperty(exports, "toWin32Path", ({ enumerable: true, get: function () { return path_utils_1.toWin32Path; } }));
Object.defineProperty(exports, "toPlatformPath", ({ enumerable: true, get: function () { return path_utils_1.toPlatformPath; } }));
/**
 * Platform utilities exports
 */
exports.platform = __importStar(__nccwpck_require__(19));
//# sourceMappingURL=core.js.map

/***/ }),

/***/ 914:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {

"use strict";

// For internal use, subject to change.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.prepareKeyValueMessage = exports.issueFileCommand = void 0;
// We use any as a valid input type
/* eslint-disable @typescript-eslint/no-explicit-any */
const crypto = __importStar(__nccwpck_require__(982));
const fs = __importStar(__nccwpck_require__(896));
const os = __importStar(__nccwpck_require__(857));
const utils_1 = __nccwpck_require__(859);
function issueFileCommand(command, message) {
    const filePath = process.env[`GITHUB_${command}`];
    if (!filePath) {
        throw new Error(`Unable to find environment variable for file command ${command}`);
    }
    if (!fs.existsSync(filePath)) {
        throw new Error(`Missing file at path: ${filePath}`);
    }
    fs.appendFileSync(filePath, `${(0, utils_1.toCommandValue)(message)}${os.EOL}`, {
        encoding: 'utf8'
    });
}
exports.issueFileCommand = issueFileCommand;
function prepareKeyValueMessage(key, value) {
    const delimiter = `ghadelimiter_${crypto.randomUUID()}`;
    const convertedValue = (0, utils_1.toCommandValue)(value);
    // These should realistically never happen, but just in case someone finds a
    // way to exploit uuid generation let's not allow keys or values that contain
    // the delimiter.
    if (key.includes(delimiter)) {
        throw new Error(`Unexpected input: name should not contain the delimiter "${delimiter}"`);
    }
    if (convertedValue.includes(delimiter)) {
        throw new Error(`Unexpected input: value should not contain the delimiter "${delimiter}"`);
    }
    return `${key}<<${delimiter}${os.EOL}${convertedValue}${os.EOL}${delimiter}`;
}
exports.prepareKeyValueMessage = prepareKeyValueMessage;
//# sourceMappingURL=file-command.js.map

/***/ }),

/***/ 653:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {

"use strict";

var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.OidcClient = void 0;
const http_client_1 = __nccwpck_require__(506);
const auth_1 = __nccwpck_require__(966);
const core_1 = __nccwpck_require__(255);
class OidcClient {
    static createHttpClient(allowRetry = true, maxRetry = 10) {
        const requestOptions = {
            allowRetries: allowRetry,
            maxRetries: maxRetry
        };
        return new http_client_1.HttpClient('actions/oidc-client', [new auth_1.BearerCredentialHandler(OidcClient.getRequestToken())], requestOptions);
    }
    static getRequestToken() {
        const token = process.env['ACTIONS_ID_TOKEN_REQUEST_TOKEN'];
        if (!token) {
            throw new Error('Unable to get ACTIONS_ID_TOKEN_REQUEST_TOKEN env variable');
        }
        return token;
    }
    static getIDTokenUrl() {
        const runtimeUrl = process.env['ACTIONS_ID_TOKEN_REQUEST_URL'];
        if (!runtimeUrl) {
            throw new Error('Unable to get ACTIONS_ID_TOKEN_REQUEST_URL env variable');
        }
        return runtimeUrl;
    }
    static getCall(id_token_url) {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const httpclient = OidcClient.createHttpClient();
            const res = yield httpclient
                .getJson(id_token_url)
                .catch(error => {
                throw new Error(`Failed to get ID Token. \n 
        Error Code : ${error.statusCode}\n 
        Error Message: ${error.message}`);
            });
            const id_token = (_a = res.result) === null || _a === void 0 ? void 0 : _a.value;
            if (!id_token) {
                throw new Error('Response json body do not have ID Token field');
            }
            return id_token;
        });
    }
    static getIDToken(audience) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // New ID Token is requested from action service
                let id_token_url = OidcClient.getIDTokenUrl();
                if (audience) {
                    const encodedAudience = encodeURIComponent(audience);
                    id_token_url = `${id_token_url}&audience=${encodedAudience}`;
                }
                (0, core_1.debug)(`ID token url is ${id_token_url}`);
                const id_token = yield OidcClient.getCall(id_token_url);
                (0, core_1.setSecret)(id_token);
                return id_token;
            }
            catch (error) {
                throw new Error(`Error message: ${error.message}`);
            }
        });
    }
}
exports.OidcClient = OidcClient;
//# sourceMappingURL=oidc-utils.js.map

/***/ }),

/***/ 699:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.toPlatformPath = exports.toWin32Path = exports.toPosixPath = void 0;
const path = __importStar(__nccwpck_require__(928));
/**
 * toPosixPath converts the given path to the posix form. On Windows, \\ will be
 * replaced with /.
 *
 * @param pth. Path to transform.
 * @return string Posix path.
 */
function toPosixPath(pth) {
    return pth.replace(/[\\]/g, '/');
}
exports.toPosixPath = toPosixPath;
/**
 * toWin32Path converts the given path to the win32 form. On Linux, / will be
 * replaced with \\.
 *
 * @param pth. Path to transform.
 * @return string Win32 path.
 */
function toWin32Path(pth) {
    return pth.replace(/[/]/g, '\\');
}
exports.toWin32Path = toWin32Path;
/**
 * toPlatformPath converts the given path to a platform-specific path. It does
 * this by replacing instances of / and \ with the platform-specific path
 * separator.
 *
 * @param pth The path to platformize.
 * @return string The platform-specific path.
 */
function toPlatformPath(pth) {
    return pth.replace(/[/\\]/g, path.sep);
}
exports.toPlatformPath = toPlatformPath;
//# sourceMappingURL=path-utils.js.map

/***/ }),

/***/ 19:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getDetails = exports.isLinux = exports.isMacOS = exports.isWindows = exports.arch = exports.platform = void 0;
const os_1 = __importDefault(__nccwpck_require__(857));
const exec = __importStar(__nccwpck_require__(943));
const getWindowsInfo = () => __awaiter(void 0, void 0, void 0, function* () {
    const { stdout: version } = yield exec.getExecOutput('powershell -command "(Get-CimInstance -ClassName Win32_OperatingSystem).Version"', undefined, {
        silent: true
    });
    const { stdout: name } = yield exec.getExecOutput('powershell -command "(Get-CimInstance -ClassName Win32_OperatingSystem).Caption"', undefined, {
        silent: true
    });
    return {
        name: name.trim(),
        version: version.trim()
    };
});
const getMacOsInfo = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const { stdout } = yield exec.getExecOutput('sw_vers', undefined, {
        silent: true
    });
    const version = (_b = (_a = stdout.match(/ProductVersion:\s*(.+)/)) === null || _a === void 0 ? void 0 : _a[1]) !== null && _b !== void 0 ? _b : '';
    const name = (_d = (_c = stdout.match(/ProductName:\s*(.+)/)) === null || _c === void 0 ? void 0 : _c[1]) !== null && _d !== void 0 ? _d : '';
    return {
        name,
        version
    };
});
const getLinuxInfo = () => __awaiter(void 0, void 0, void 0, function* () {
    const { stdout } = yield exec.getExecOutput('lsb_release', ['-i', '-r', '-s'], {
        silent: true
    });
    const [name, version] = stdout.trim().split('\n');
    return {
        name,
        version
    };
});
exports.platform = os_1.default.platform();
exports.arch = os_1.default.arch();
exports.isWindows = exports.platform === 'win32';
exports.isMacOS = exports.platform === 'darwin';
exports.isLinux = exports.platform === 'linux';
function getDetails() {
    return __awaiter(this, void 0, void 0, function* () {
        return Object.assign(Object.assign({}, (yield (exports.isWindows
            ? getWindowsInfo()
            : exports.isMacOS
                ? getMacOsInfo()
                : getLinuxInfo()))), { platform: exports.platform,
            arch: exports.arch,
            isWindows: exports.isWindows,
            isMacOS: exports.isMacOS,
            isLinux: exports.isLinux });
    });
}
exports.getDetails = getDetails;
//# sourceMappingURL=platform.js.map

/***/ }),

/***/ 750:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {

"use strict";

var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.summary = exports.markdownSummary = exports.SUMMARY_DOCS_URL = exports.SUMMARY_ENV_VAR = void 0;
const os_1 = __nccwpck_require__(857);
const fs_1 = __nccwpck_require__(896);
const { access, appendFile, writeFile } = fs_1.promises;
exports.SUMMARY_ENV_VAR = 'GITHUB_STEP_SUMMARY';
exports.SUMMARY_DOCS_URL = 'https://docs.github.com/actions/using-workflows/workflow-commands-for-github-actions#adding-a-job-summary';
class Summary {
    constructor() {
        this._buffer = '';
    }
    /**
     * Finds the summary file path from the environment, rejects if env var is not found or file does not exist
     * Also checks r/w permissions.
     *
     * @returns step summary file path
     */
    filePath() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._filePath) {
                return this._filePath;
            }
            const pathFromEnv = process.env[exports.SUMMARY_ENV_VAR];
            if (!pathFromEnv) {
                throw new Error(`Unable to find environment variable for $${exports.SUMMARY_ENV_VAR}. Check if your runtime environment supports job summaries.`);
            }
            try {
                yield access(pathFromEnv, fs_1.constants.R_OK | fs_1.constants.W_OK);
            }
            catch (_a) {
                throw new Error(`Unable to access summary file: '${pathFromEnv}'. Check if the file has correct read/write permissions.`);
            }
            this._filePath = pathFromEnv;
            return this._filePath;
        });
    }
    /**
     * Wraps content in an HTML tag, adding any HTML attributes
     *
     * @param {string} tag HTML tag to wrap
     * @param {string | null} content content within the tag
     * @param {[attribute: string]: string} attrs key-value list of HTML attributes to add
     *
     * @returns {string} content wrapped in HTML element
     */
    wrap(tag, content, attrs = {}) {
        const htmlAttrs = Object.entries(attrs)
            .map(([key, value]) => ` ${key}="${value}"`)
            .join('');
        if (!content) {
            return `<${tag}${htmlAttrs}>`;
        }
        return `<${tag}${htmlAttrs}>${content}</${tag}>`;
    }
    /**
     * Writes text in the buffer to the summary buffer file and empties buffer. Will append by default.
     *
     * @param {SummaryWriteOptions} [options] (optional) options for write operation
     *
     * @returns {Promise<Summary>} summary instance
     */
    write(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const overwrite = !!(options === null || options === void 0 ? void 0 : options.overwrite);
            const filePath = yield this.filePath();
            const writeFunc = overwrite ? writeFile : appendFile;
            yield writeFunc(filePath, this._buffer, { encoding: 'utf8' });
            return this.emptyBuffer();
        });
    }
    /**
     * Clears the summary buffer and wipes the summary file
     *
     * @returns {Summary} summary instance
     */
    clear() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.emptyBuffer().write({ overwrite: true });
        });
    }
    /**
     * Returns the current summary buffer as a string
     *
     * @returns {string} string of summary buffer
     */
    stringify() {
        return this._buffer;
    }
    /**
     * If the summary buffer is empty
     *
     * @returns {boolen} true if the buffer is empty
     */
    isEmptyBuffer() {
        return this._buffer.length === 0;
    }
    /**
     * Resets the summary buffer without writing to summary file
     *
     * @returns {Summary} summary instance
     */
    emptyBuffer() {
        this._buffer = '';
        return this;
    }
    /**
     * Adds raw text to the summary buffer
     *
     * @param {string} text content to add
     * @param {boolean} [addEOL=false] (optional) append an EOL to the raw text (default: false)
     *
     * @returns {Summary} summary instance
     */
    addRaw(text, addEOL = false) {
        this._buffer += text;
        return addEOL ? this.addEOL() : this;
    }
    /**
     * Adds the operating system-specific end-of-line marker to the buffer
     *
     * @returns {Summary} summary instance
     */
    addEOL() {
        return this.addRaw(os_1.EOL);
    }
    /**
     * Adds an HTML codeblock to the summary buffer
     *
     * @param {string} code content to render within fenced code block
     * @param {string} lang (optional) language to syntax highlight code
     *
     * @returns {Summary} summary instance
     */
    addCodeBlock(code, lang) {
        const attrs = Object.assign({}, (lang && { lang }));
        const element = this.wrap('pre', this.wrap('code', code), attrs);
        return this.addRaw(element).addEOL();
    }
    /**
     * Adds an HTML list to the summary buffer
     *
     * @param {string[]} items list of items to render
     * @param {boolean} [ordered=false] (optional) if the rendered list should be ordered or not (default: false)
     *
     * @returns {Summary} summary instance
     */
    addList(items, ordered = false) {
        const tag = ordered ? 'ol' : 'ul';
        const listItems = items.map(item => this.wrap('li', item)).join('');
        const element = this.wrap(tag, listItems);
        return this.addRaw(element).addEOL();
    }
    /**
     * Adds an HTML table to the summary buffer
     *
     * @param {SummaryTableCell[]} rows table rows
     *
     * @returns {Summary} summary instance
     */
    addTable(rows) {
        const tableBody = rows
            .map(row => {
            const cells = row
                .map(cell => {
                if (typeof cell === 'string') {
                    return this.wrap('td', cell);
                }
                const { header, data, colspan, rowspan } = cell;
                const tag = header ? 'th' : 'td';
                const attrs = Object.assign(Object.assign({}, (colspan && { colspan })), (rowspan && { rowspan }));
                return this.wrap(tag, data, attrs);
            })
                .join('');
            return this.wrap('tr', cells);
        })
            .join('');
        const element = this.wrap('table', tableBody);
        return this.addRaw(element).addEOL();
    }
    /**
     * Adds a collapsable HTML details element to the summary buffer
     *
     * @param {string} label text for the closed state
     * @param {string} content collapsable content
     *
     * @returns {Summary} summary instance
     */
    addDetails(label, content) {
        const element = this.wrap('details', this.wrap('summary', label) + content);
        return this.addRaw(element).addEOL();
    }
    /**
     * Adds an HTML image tag to the summary buffer
     *
     * @param {string} src path to the image you to embed
     * @param {string} alt text description of the image
     * @param {SummaryImageOptions} options (optional) addition image attributes
     *
     * @returns {Summary} summary instance
     */
    addImage(src, alt, options) {
        const { width, height } = options || {};
        const attrs = Object.assign(Object.assign({}, (width && { width })), (height && { height }));
        const element = this.wrap('img', null, Object.assign({ src, alt }, attrs));
        return this.addRaw(element).addEOL();
    }
    /**
     * Adds an HTML section heading element
     *
     * @param {string} text heading text
     * @param {number | string} [level=1] (optional) the heading level, default: 1
     *
     * @returns {Summary} summary instance
     */
    addHeading(text, level) {
        const tag = `h${level}`;
        const allowedTag = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)
            ? tag
            : 'h1';
        const element = this.wrap(allowedTag, text);
        return this.addRaw(element).addEOL();
    }
    /**
     * Adds an HTML thematic break (<hr>) to the summary buffer
     *
     * @returns {Summary} summary instance
     */
    addSeparator() {
        const element = this.wrap('hr', null);
        return this.addRaw(element).addEOL();
    }
    /**
     * Adds an HTML line break (<br>) to the summary buffer
     *
     * @returns {Summary} summary instance
     */
    addBreak() {
        const element = this.wrap('br', null);
        return this.addRaw(element).addEOL();
    }
    /**
     * Adds an HTML blockquote to the summary buffer
     *
     * @param {string} text quote text
     * @param {string} cite (optional) citation url
     *
     * @returns {Summary} summary instance
     */
    addQuote(text, cite) {
        const attrs = Object.assign({}, (cite && { cite }));
        const element = this.wrap('blockquote', text, attrs);
        return this.addRaw(element).addEOL();
    }
    /**
     * Adds an HTML anchor tag to the summary buffer
     *
     * @param {string} text link text/content
     * @param {string} href hyperlink
     *
     * @returns {Summary} summary instance
     */
    addLink(text, href) {
        const element = this.wrap('a', text, { href });
        return this.addRaw(element).addEOL();
    }
}
const _summary = new Summary();
/**
 * @deprecated use `core.summary`
 */
exports.markdownSummary = _summary;
exports.summary = _summary;
//# sourceMappingURL=summary.js.map

/***/ }),

/***/ 859:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

// We use any as a valid input type
/* eslint-disable @typescript-eslint/no-explicit-any */
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.toCommandProperties = exports.toCommandValue = void 0;
/**
 * Sanitizes an input into a string so it can be passed into issueCommand safely
 * @param input input to sanitize into a string
 */
function toCommandValue(input) {
    if (input === null || input === undefined) {
        return '';
    }
    else if (typeof input === 'string' || input instanceof String) {
        return input;
    }
    return JSON.stringify(input);
}
exports.toCommandValue = toCommandValue;
/**
 *
 * @param annotationProperties
 * @returns The command properties to send with the actual annotation command
 * See IssueCommandProperties: https://github.com/actions/runner/blob/main/src/Runner.Worker/ActionCommandManager.cs#L646
 */
function toCommandProperties(annotationProperties) {
    if (!Object.keys(annotationProperties).length) {
        return {};
    }
    return {
        title: annotationProperties.title,
        file: annotationProperties.file,
        line: annotationProperties.startLine,
        endLine: annotationProperties.endLine,
        col: annotationProperties.startColumn,
        endColumn: annotationProperties.endColumn
    };
}
exports.toCommandProperties = toCommandProperties;
//# sourceMappingURL=utils.js.map

/***/ }),

/***/ 966:
/***/ (function(__unused_webpack_module, exports) {

"use strict";

var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.PersonalAccessTokenCredentialHandler = exports.BearerCredentialHandler = exports.BasicCredentialHandler = void 0;
class BasicCredentialHandler {
    constructor(username, password) {
        this.username = username;
        this.password = password;
    }
    prepareRequest(options) {
        if (!options.headers) {
            throw Error('The request has no headers');
        }
        options.headers['Authorization'] = `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`;
    }
    // This handler cannot handle 401
    canHandleAuthentication() {
        return false;
    }
    handleAuthentication() {
        return __awaiter(this, void 0, void 0, function* () {
            throw new Error('not implemented');
        });
    }
}
exports.BasicCredentialHandler = BasicCredentialHandler;
class BearerCredentialHandler {
    constructor(token) {
        this.token = token;
    }
    // currently implements pre-authorization
    // TODO: support preAuth = false where it hooks on 401
    prepareRequest(options) {
        if (!options.headers) {
            throw Error('The request has no headers');
        }
        options.headers['Authorization'] = `Bearer ${this.token}`;
    }
    // This handler cannot handle 401
    canHandleAuthentication() {
        return false;
    }
    handleAuthentication() {
        return __awaiter(this, void 0, void 0, function* () {
            throw new Error('not implemented');
        });
    }
}
exports.BearerCredentialHandler = BearerCredentialHandler;
class PersonalAccessTokenCredentialHandler {
    constructor(token) {
        this.token = token;
    }
    // currently implements pre-authorization
    // TODO: support preAuth = false where it hooks on 401
    prepareRequest(options) {
        if (!options.headers) {
            throw Error('The request has no headers');
        }
        options.headers['Authorization'] = `Basic ${Buffer.from(`PAT:${this.token}`).toString('base64')}`;
    }
    // This handler cannot handle 401
    canHandleAuthentication() {
        return false;
    }
    handleAuthentication() {
        return __awaiter(this, void 0, void 0, function* () {
            throw new Error('not implemented');
        });
    }
}
exports.PersonalAccessTokenCredentialHandler = PersonalAccessTokenCredentialHandler;
//# sourceMappingURL=auth.js.map

/***/ }),

/***/ 506:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {

"use strict";

/* eslint-disable @typescript-eslint/no-explicit-any */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.HttpClient = exports.isHttps = exports.HttpClientResponse = exports.HttpClientError = exports.getProxyUrl = exports.MediaTypes = exports.Headers = exports.HttpCodes = void 0;
const http = __importStar(__nccwpck_require__(611));
const https = __importStar(__nccwpck_require__(692));
const pm = __importStar(__nccwpck_require__(958));
const tunnel = __importStar(__nccwpck_require__(129));
var HttpCodes;
(function (HttpCodes) {
    HttpCodes[HttpCodes["OK"] = 200] = "OK";
    HttpCodes[HttpCodes["MultipleChoices"] = 300] = "MultipleChoices";
    HttpCodes[HttpCodes["MovedPermanently"] = 301] = "MovedPermanently";
    HttpCodes[HttpCodes["ResourceMoved"] = 302] = "ResourceMoved";
    HttpCodes[HttpCodes["SeeOther"] = 303] = "SeeOther";
    HttpCodes[HttpCodes["NotModified"] = 304] = "NotModified";
    HttpCodes[HttpCodes["UseProxy"] = 305] = "UseProxy";
    HttpCodes[HttpCodes["SwitchProxy"] = 306] = "SwitchProxy";
    HttpCodes[HttpCodes["TemporaryRedirect"] = 307] = "TemporaryRedirect";
    HttpCodes[HttpCodes["PermanentRedirect"] = 308] = "PermanentRedirect";
    HttpCodes[HttpCodes["BadRequest"] = 400] = "BadRequest";
    HttpCodes[HttpCodes["Unauthorized"] = 401] = "Unauthorized";
    HttpCodes[HttpCodes["PaymentRequired"] = 402] = "PaymentRequired";
    HttpCodes[HttpCodes["Forbidden"] = 403] = "Forbidden";
    HttpCodes[HttpCodes["NotFound"] = 404] = "NotFound";
    HttpCodes[HttpCodes["MethodNotAllowed"] = 405] = "MethodNotAllowed";
    HttpCodes[HttpCodes["NotAcceptable"] = 406] = "NotAcceptable";
    HttpCodes[HttpCodes["ProxyAuthenticationRequired"] = 407] = "ProxyAuthenticationRequired";
    HttpCodes[HttpCodes["RequestTimeout"] = 408] = "RequestTimeout";
    HttpCodes[HttpCodes["Conflict"] = 409] = "Conflict";
    HttpCodes[HttpCodes["Gone"] = 410] = "Gone";
    HttpCodes[HttpCodes["TooManyRequests"] = 429] = "TooManyRequests";
    HttpCodes[HttpCodes["InternalServerError"] = 500] = "InternalServerError";
    HttpCodes[HttpCodes["NotImplemented"] = 501] = "NotImplemented";
    HttpCodes[HttpCodes["BadGateway"] = 502] = "BadGateway";
    HttpCodes[HttpCodes["ServiceUnavailable"] = 503] = "ServiceUnavailable";
    HttpCodes[HttpCodes["GatewayTimeout"] = 504] = "GatewayTimeout";
})(HttpCodes = exports.HttpCodes || (exports.HttpCodes = {}));
var Headers;
(function (Headers) {
    Headers["Accept"] = "accept";
    Headers["ContentType"] = "content-type";
})(Headers = exports.Headers || (exports.Headers = {}));
var MediaTypes;
(function (MediaTypes) {
    MediaTypes["ApplicationJson"] = "application/json";
})(MediaTypes = exports.MediaTypes || (exports.MediaTypes = {}));
/**
 * Returns the proxy URL, depending upon the supplied url and proxy environment variables.
 * @param serverUrl  The server URL where the request will be sent. For example, https://api.github.com
 */
function getProxyUrl(serverUrl) {
    const proxyUrl = pm.getProxyUrl(new URL(serverUrl));
    return proxyUrl ? proxyUrl.href : '';
}
exports.getProxyUrl = getProxyUrl;
const HttpRedirectCodes = [
    HttpCodes.MovedPermanently,
    HttpCodes.ResourceMoved,
    HttpCodes.SeeOther,
    HttpCodes.TemporaryRedirect,
    HttpCodes.PermanentRedirect
];
const HttpResponseRetryCodes = [
    HttpCodes.BadGateway,
    HttpCodes.ServiceUnavailable,
    HttpCodes.GatewayTimeout
];
const RetryableHttpVerbs = ['OPTIONS', 'GET', 'DELETE', 'HEAD'];
const ExponentialBackoffCeiling = 10;
const ExponentialBackoffTimeSlice = 5;
class HttpClientError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.name = 'HttpClientError';
        this.statusCode = statusCode;
        Object.setPrototypeOf(this, HttpClientError.prototype);
    }
}
exports.HttpClientError = HttpClientError;
class HttpClientResponse {
    constructor(message) {
        this.message = message;
    }
    readBody() {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
                let output = Buffer.alloc(0);
                this.message.on('data', (chunk) => {
                    output = Buffer.concat([output, chunk]);
                });
                this.message.on('end', () => {
                    resolve(output.toString());
                });
            }));
        });
    }
    readBodyBuffer() {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
                const chunks = [];
                this.message.on('data', (chunk) => {
                    chunks.push(chunk);
                });
                this.message.on('end', () => {
                    resolve(Buffer.concat(chunks));
                });
            }));
        });
    }
}
exports.HttpClientResponse = HttpClientResponse;
function isHttps(requestUrl) {
    const parsedUrl = new URL(requestUrl);
    return parsedUrl.protocol === 'https:';
}
exports.isHttps = isHttps;
class HttpClient {
    constructor(userAgent, handlers, requestOptions) {
        this._ignoreSslError = false;
        this._allowRedirects = true;
        this._allowRedirectDowngrade = false;
        this._maxRedirects = 50;
        this._allowRetries = false;
        this._maxRetries = 1;
        this._keepAlive = false;
        this._disposed = false;
        this.userAgent = userAgent;
        this.handlers = handlers || [];
        this.requestOptions = requestOptions;
        if (requestOptions) {
            if (requestOptions.ignoreSslError != null) {
                this._ignoreSslError = requestOptions.ignoreSslError;
            }
            this._socketTimeout = requestOptions.socketTimeout;
            if (requestOptions.allowRedirects != null) {
                this._allowRedirects = requestOptions.allowRedirects;
            }
            if (requestOptions.allowRedirectDowngrade != null) {
                this._allowRedirectDowngrade = requestOptions.allowRedirectDowngrade;
            }
            if (requestOptions.maxRedirects != null) {
                this._maxRedirects = Math.max(requestOptions.maxRedirects, 0);
            }
            if (requestOptions.keepAlive != null) {
                this._keepAlive = requestOptions.keepAlive;
            }
            if (requestOptions.allowRetries != null) {
                this._allowRetries = requestOptions.allowRetries;
            }
            if (requestOptions.maxRetries != null) {
                this._maxRetries = requestOptions.maxRetries;
            }
        }
    }
    options(requestUrl, additionalHeaders) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.request('OPTIONS', requestUrl, null, additionalHeaders || {});
        });
    }
    get(requestUrl, additionalHeaders) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.request('GET', requestUrl, null, additionalHeaders || {});
        });
    }
    del(requestUrl, additionalHeaders) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.request('DELETE', requestUrl, null, additionalHeaders || {});
        });
    }
    post(requestUrl, data, additionalHeaders) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.request('POST', requestUrl, data, additionalHeaders || {});
        });
    }
    patch(requestUrl, data, additionalHeaders) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.request('PATCH', requestUrl, data, additionalHeaders || {});
        });
    }
    put(requestUrl, data, additionalHeaders) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.request('PUT', requestUrl, data, additionalHeaders || {});
        });
    }
    head(requestUrl, additionalHeaders) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.request('HEAD', requestUrl, null, additionalHeaders || {});
        });
    }
    sendStream(verb, requestUrl, stream, additionalHeaders) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.request(verb, requestUrl, stream, additionalHeaders);
        });
    }
    /**
     * Gets a typed object from an endpoint
     * Be aware that not found returns a null.  Other errors (4xx, 5xx) reject the promise
     */
    getJson(requestUrl, additionalHeaders = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            additionalHeaders[Headers.Accept] = this._getExistingOrDefaultHeader(additionalHeaders, Headers.Accept, MediaTypes.ApplicationJson);
            const res = yield this.get(requestUrl, additionalHeaders);
            return this._processResponse(res, this.requestOptions);
        });
    }
    postJson(requestUrl, obj, additionalHeaders = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            const data = JSON.stringify(obj, null, 2);
            additionalHeaders[Headers.Accept] = this._getExistingOrDefaultHeader(additionalHeaders, Headers.Accept, MediaTypes.ApplicationJson);
            additionalHeaders[Headers.ContentType] = this._getExistingOrDefaultHeader(additionalHeaders, Headers.ContentType, MediaTypes.ApplicationJson);
            const res = yield this.post(requestUrl, data, additionalHeaders);
            return this._processResponse(res, this.requestOptions);
        });
    }
    putJson(requestUrl, obj, additionalHeaders = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            const data = JSON.stringify(obj, null, 2);
            additionalHeaders[Headers.Accept] = this._getExistingOrDefaultHeader(additionalHeaders, Headers.Accept, MediaTypes.ApplicationJson);
            additionalHeaders[Headers.ContentType] = this._getExistingOrDefaultHeader(additionalHeaders, Headers.ContentType, MediaTypes.ApplicationJson);
            const res = yield this.put(requestUrl, data, additionalHeaders);
            return this._processResponse(res, this.requestOptions);
        });
    }
    patchJson(requestUrl, obj, additionalHeaders = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            const data = JSON.stringify(obj, null, 2);
            additionalHeaders[Headers.Accept] = this._getExistingOrDefaultHeader(additionalHeaders, Headers.Accept, MediaTypes.ApplicationJson);
            additionalHeaders[Headers.ContentType] = this._getExistingOrDefaultHeader(additionalHeaders, Headers.ContentType, MediaTypes.ApplicationJson);
            const res = yield this.patch(requestUrl, data, additionalHeaders);
            return this._processResponse(res, this.requestOptions);
        });
    }
    /**
     * Makes a raw http request.
     * All other methods such as get, post, patch, and request ultimately call this.
     * Prefer get, del, post and patch
     */
    request(verb, requestUrl, data, headers) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this._disposed) {
                throw new Error('Client has already been disposed.');
            }
            const parsedUrl = new URL(requestUrl);
            let info = this._prepareRequest(verb, parsedUrl, headers);
            // Only perform retries on reads since writes may not be idempotent.
            const maxTries = this._allowRetries && RetryableHttpVerbs.includes(verb)
                ? this._maxRetries + 1
                : 1;
            let numTries = 0;
            let response;
            do {
                response = yield this.requestRaw(info, data);
                // Check if it's an authentication challenge
                if (response &&
                    response.message &&
                    response.message.statusCode === HttpCodes.Unauthorized) {
                    let authenticationHandler;
                    for (const handler of this.handlers) {
                        if (handler.canHandleAuthentication(response)) {
                            authenticationHandler = handler;
                            break;
                        }
                    }
                    if (authenticationHandler) {
                        return authenticationHandler.handleAuthentication(this, info, data);
                    }
                    else {
                        // We have received an unauthorized response but have no handlers to handle it.
                        // Let the response return to the caller.
                        return response;
                    }
                }
                let redirectsRemaining = this._maxRedirects;
                while (response.message.statusCode &&
                    HttpRedirectCodes.includes(response.message.statusCode) &&
                    this._allowRedirects &&
                    redirectsRemaining > 0) {
                    const redirectUrl = response.message.headers['location'];
                    if (!redirectUrl) {
                        // if there's no location to redirect to, we won't
                        break;
                    }
                    const parsedRedirectUrl = new URL(redirectUrl);
                    if (parsedUrl.protocol === 'https:' &&
                        parsedUrl.protocol !== parsedRedirectUrl.protocol &&
                        !this._allowRedirectDowngrade) {
                        throw new Error('Redirect from HTTPS to HTTP protocol. This downgrade is not allowed for security reasons. If you want to allow this behavior, set the allowRedirectDowngrade option to true.');
                    }
                    // we need to finish reading the response before reassigning response
                    // which will leak the open socket.
                    yield response.readBody();
                    // strip authorization header if redirected to a different hostname
                    if (parsedRedirectUrl.hostname !== parsedUrl.hostname) {
                        for (const header in headers) {
                            // header names are case insensitive
                            if (header.toLowerCase() === 'authorization') {
                                delete headers[header];
                            }
                        }
                    }
                    // let's make the request with the new redirectUrl
                    info = this._prepareRequest(verb, parsedRedirectUrl, headers);
                    response = yield this.requestRaw(info, data);
                    redirectsRemaining--;
                }
                if (!response.message.statusCode ||
                    !HttpResponseRetryCodes.includes(response.message.statusCode)) {
                    // If not a retry code, return immediately instead of retrying
                    return response;
                }
                numTries += 1;
                if (numTries < maxTries) {
                    yield response.readBody();
                    yield this._performExponentialBackoff(numTries);
                }
            } while (numTries < maxTries);
            return response;
        });
    }
    /**
     * Needs to be called if keepAlive is set to true in request options.
     */
    dispose() {
        if (this._agent) {
            this._agent.destroy();
        }
        this._disposed = true;
    }
    /**
     * Raw request.
     * @param info
     * @param data
     */
    requestRaw(info, data) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                function callbackForResult(err, res) {
                    if (err) {
                        reject(err);
                    }
                    else if (!res) {
                        // If `err` is not passed, then `res` must be passed.
                        reject(new Error('Unknown error'));
                    }
                    else {
                        resolve(res);
                    }
                }
                this.requestRawWithCallback(info, data, callbackForResult);
            });
        });
    }
    /**
     * Raw request with callback.
     * @param info
     * @param data
     * @param onResult
     */
    requestRawWithCallback(info, data, onResult) {
        if (typeof data === 'string') {
            if (!info.options.headers) {
                info.options.headers = {};
            }
            info.options.headers['Content-Length'] = Buffer.byteLength(data, 'utf8');
        }
        let callbackCalled = false;
        function handleResult(err, res) {
            if (!callbackCalled) {
                callbackCalled = true;
                onResult(err, res);
            }
        }
        const req = info.httpModule.request(info.options, (msg) => {
            const res = new HttpClientResponse(msg);
            handleResult(undefined, res);
        });
        let socket;
        req.on('socket', sock => {
            socket = sock;
        });
        // If we ever get disconnected, we want the socket to timeout eventually
        req.setTimeout(this._socketTimeout || 3 * 60000, () => {
            if (socket) {
                socket.end();
            }
            handleResult(new Error(`Request timeout: ${info.options.path}`));
        });
        req.on('error', function (err) {
            // err has statusCode property
            // res should have headers
            handleResult(err);
        });
        if (data && typeof data === 'string') {
            req.write(data, 'utf8');
        }
        if (data && typeof data !== 'string') {
            data.on('close', function () {
                req.end();
            });
            data.pipe(req);
        }
        else {
            req.end();
        }
    }
    /**
     * Gets an http agent. This function is useful when you need an http agent that handles
     * routing through a proxy server - depending upon the url and proxy environment variables.
     * @param serverUrl  The server URL where the request will be sent. For example, https://api.github.com
     */
    getAgent(serverUrl) {
        const parsedUrl = new URL(serverUrl);
        return this._getAgent(parsedUrl);
    }
    _prepareRequest(method, requestUrl, headers) {
        const info = {};
        info.parsedUrl = requestUrl;
        const usingSsl = info.parsedUrl.protocol === 'https:';
        info.httpModule = usingSsl ? https : http;
        const defaultPort = usingSsl ? 443 : 80;
        info.options = {};
        info.options.host = info.parsedUrl.hostname;
        info.options.port = info.parsedUrl.port
            ? parseInt(info.parsedUrl.port)
            : defaultPort;
        info.options.path =
            (info.parsedUrl.pathname || '') + (info.parsedUrl.search || '');
        info.options.method = method;
        info.options.headers = this._mergeHeaders(headers);
        if (this.userAgent != null) {
            info.options.headers['user-agent'] = this.userAgent;
        }
        info.options.agent = this._getAgent(info.parsedUrl);
        // gives handlers an opportunity to participate
        if (this.handlers) {
            for (const handler of this.handlers) {
                handler.prepareRequest(info.options);
            }
        }
        return info;
    }
    _mergeHeaders(headers) {
        if (this.requestOptions && this.requestOptions.headers) {
            return Object.assign({}, lowercaseKeys(this.requestOptions.headers), lowercaseKeys(headers || {}));
        }
        return lowercaseKeys(headers || {});
    }
    _getExistingOrDefaultHeader(additionalHeaders, header, _default) {
        let clientHeader;
        if (this.requestOptions && this.requestOptions.headers) {
            clientHeader = lowercaseKeys(this.requestOptions.headers)[header];
        }
        return additionalHeaders[header] || clientHeader || _default;
    }
    _getAgent(parsedUrl) {
        let agent;
        const proxyUrl = pm.getProxyUrl(parsedUrl);
        const useProxy = proxyUrl && proxyUrl.hostname;
        if (this._keepAlive && useProxy) {
            agent = this._proxyAgent;
        }
        if (this._keepAlive && !useProxy) {
            agent = this._agent;
        }
        // if agent is already assigned use that agent.
        if (agent) {
            return agent;
        }
        const usingSsl = parsedUrl.protocol === 'https:';
        let maxSockets = 100;
        if (this.requestOptions) {
            maxSockets = this.requestOptions.maxSockets || http.globalAgent.maxSockets;
        }
        // This is `useProxy` again, but we need to check `proxyURl` directly for TypeScripts's flow analysis.
        if (proxyUrl && proxyUrl.hostname) {
            const agentOptions = {
                maxSockets,
                keepAlive: this._keepAlive,
                proxy: Object.assign(Object.assign({}, ((proxyUrl.username || proxyUrl.password) && {
                    proxyAuth: `${proxyUrl.username}:${proxyUrl.password}`
                })), { host: proxyUrl.hostname, port: proxyUrl.port })
            };
            let tunnelAgent;
            const overHttps = proxyUrl.protocol === 'https:';
            if (usingSsl) {
                tunnelAgent = overHttps ? tunnel.httpsOverHttps : tunnel.httpsOverHttp;
            }
            else {
                tunnelAgent = overHttps ? tunnel.httpOverHttps : tunnel.httpOverHttp;
            }
            agent = tunnelAgent(agentOptions);
            this._proxyAgent = agent;
        }
        // if reusing agent across request and tunneling agent isn't assigned create a new agent
        if (this._keepAlive && !agent) {
            const options = { keepAlive: this._keepAlive, maxSockets };
            agent = usingSsl ? new https.Agent(options) : new http.Agent(options);
            this._agent = agent;
        }
        // if not using private agent and tunnel agent isn't setup then use global agent
        if (!agent) {
            agent = usingSsl ? https.globalAgent : http.globalAgent;
        }
        if (usingSsl && this._ignoreSslError) {
            // we don't want to set NODE_TLS_REJECT_UNAUTHORIZED=0 since that will affect request for entire process
            // http.RequestOptions doesn't expose a way to modify RequestOptions.agent.options
            // we have to cast it to any and change it directly
            agent.options = Object.assign(agent.options || {}, {
                rejectUnauthorized: false
            });
        }
        return agent;
    }
    _performExponentialBackoff(retryNumber) {
        return __awaiter(this, void 0, void 0, function* () {
            retryNumber = Math.min(ExponentialBackoffCeiling, retryNumber);
            const ms = ExponentialBackoffTimeSlice * Math.pow(2, retryNumber);
            return new Promise(resolve => setTimeout(() => resolve(), ms));
        });
    }
    _processResponse(res, options) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                const statusCode = res.message.statusCode || 0;
                const response = {
                    statusCode,
                    result: null,
                    headers: {}
                };
                // not found leads to null obj returned
                if (statusCode === HttpCodes.NotFound) {
                    resolve(response);
                }
                // get the result from the body
                function dateTimeDeserializer(key, value) {
                    if (typeof value === 'string') {
                        const a = new Date(value);
                        if (!isNaN(a.valueOf())) {
                            return a;
                        }
                    }
                    return value;
                }
                let obj;
                let contents;
                try {
                    contents = yield res.readBody();
                    if (contents && contents.length > 0) {
                        if (options && options.deserializeDates) {
                            obj = JSON.parse(contents, dateTimeDeserializer);
                        }
                        else {
                            obj = JSON.parse(contents);
                        }
                        response.result = obj;
                    }
                    response.headers = res.message.headers;
                }
                catch (err) {
                    // Invalid resource (contents not json);  leaving result obj null
                }
                // note that 3xx redirects are handled by the http layer.
                if (statusCode > 299) {
                    let msg;
                    // if exception/error in body, attempt to get better error
                    if (obj && obj.message) {
                        msg = obj.message;
                    }
                    else if (contents && contents.length > 0) {
                        // it may be the case that the exception is in the body message as string
                        msg = contents;
                    }
                    else {
                        msg = `Failed request: (${statusCode})`;
                    }
                    const err = new HttpClientError(msg, statusCode);
                    err.result = response.result;
                    reject(err);
                }
                else {
                    resolve(response);
                }
            }));
        });
    }
}
exports.HttpClient = HttpClient;
const lowercaseKeys = (obj) => Object.keys(obj).reduce((c, k) => ((c[k.toLowerCase()] = obj[k]), c), {});
//# sourceMappingURL=index.js.map

/***/ }),

/***/ 958:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.checkBypass = exports.getProxyUrl = void 0;
function getProxyUrl(reqUrl) {
    const usingSsl = reqUrl.protocol === 'https:';
    if (checkBypass(reqUrl)) {
        return undefined;
    }
    const proxyVar = (() => {
        if (usingSsl) {
            return process.env['https_proxy'] || process.env['HTTPS_PROXY'];
        }
        else {
            return process.env['http_proxy'] || process.env['HTTP_PROXY'];
        }
    })();
    if (proxyVar) {
        try {
            return new URL(proxyVar);
        }
        catch (_a) {
            if (!proxyVar.startsWith('http://') && !proxyVar.startsWith('https://'))
                return new URL(`http://${proxyVar}`);
        }
    }
    else {
        return undefined;
    }
}
exports.getProxyUrl = getProxyUrl;
function checkBypass(reqUrl) {
    if (!reqUrl.hostname) {
        return false;
    }
    const reqHost = reqUrl.hostname;
    if (isLoopbackAddress(reqHost)) {
        return true;
    }
    const noProxy = process.env['no_proxy'] || process.env['NO_PROXY'] || '';
    if (!noProxy) {
        return false;
    }
    // Determine the request port
    let reqPort;
    if (reqUrl.port) {
        reqPort = Number(reqUrl.port);
    }
    else if (reqUrl.protocol === 'http:') {
        reqPort = 80;
    }
    else if (reqUrl.protocol === 'https:') {
        reqPort = 443;
    }
    // Format the request hostname and hostname with port
    const upperReqHosts = [reqUrl.hostname.toUpperCase()];
    if (typeof reqPort === 'number') {
        upperReqHosts.push(`${upperReqHosts[0]}:${reqPort}`);
    }
    // Compare request host against noproxy
    for (const upperNoProxyItem of noProxy
        .split(',')
        .map(x => x.trim().toUpperCase())
        .filter(x => x)) {
        if (upperNoProxyItem === '*' ||
            upperReqHosts.some(x => x === upperNoProxyItem ||
                x.endsWith(`.${upperNoProxyItem}`) ||
                (upperNoProxyItem.startsWith('.') &&
                    x.endsWith(`${upperNoProxyItem}`)))) {
            return true;
        }
    }
    return false;
}
exports.checkBypass = checkBypass;
function isLoopbackAddress(host) {
    const hostLower = host.toLowerCase();
    return (hostLower === 'localhost' ||
        hostLower.startsWith('127.') ||
        hostLower.startsWith('[::1]') ||
        hostLower.startsWith('[0:0:0:0:0:0:0:1]'));
}
//# sourceMappingURL=proxy.js.map

/***/ }),

/***/ 943:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getExecOutput = exports.exec = void 0;
const string_decoder_1 = __nccwpck_require__(193);
const tr = __importStar(__nccwpck_require__(314));
/**
 * Exec a command.
 * Output will be streamed to the live console.
 * Returns promise with return code
 *
 * @param     commandLine        command to execute (can include additional args). Must be correctly escaped.
 * @param     args               optional arguments for tool. Escaping is handled by the lib.
 * @param     options            optional exec options.  See ExecOptions
 * @returns   Promise<number>    exit code
 */
function exec(commandLine, args, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const commandArgs = tr.argStringToArray(commandLine);
        if (commandArgs.length === 0) {
            throw new Error(`Parameter 'commandLine' cannot be null or empty.`);
        }
        // Path to tool to execute should be first arg
        const toolPath = commandArgs[0];
        args = commandArgs.slice(1).concat(args || []);
        const runner = new tr.ToolRunner(toolPath, args, options);
        return runner.exec();
    });
}
exports.exec = exec;
/**
 * Exec a command and get the output.
 * Output will be streamed to the live console.
 * Returns promise with the exit code and collected stdout and stderr
 *
 * @param     commandLine           command to execute (can include additional args). Must be correctly escaped.
 * @param     args                  optional arguments for tool. Escaping is handled by the lib.
 * @param     options               optional exec options.  See ExecOptions
 * @returns   Promise<ExecOutput>   exit code, stdout, and stderr
 */
function getExecOutput(commandLine, args, options) {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function* () {
        let stdout = '';
        let stderr = '';
        //Using string decoder covers the case where a mult-byte character is split
        const stdoutDecoder = new string_decoder_1.StringDecoder('utf8');
        const stderrDecoder = new string_decoder_1.StringDecoder('utf8');
        const originalStdoutListener = (_a = options === null || options === void 0 ? void 0 : options.listeners) === null || _a === void 0 ? void 0 : _a.stdout;
        const originalStdErrListener = (_b = options === null || options === void 0 ? void 0 : options.listeners) === null || _b === void 0 ? void 0 : _b.stderr;
        const stdErrListener = (data) => {
            stderr += stderrDecoder.write(data);
            if (originalStdErrListener) {
                originalStdErrListener(data);
            }
        };
        const stdOutListener = (data) => {
            stdout += stdoutDecoder.write(data);
            if (originalStdoutListener) {
                originalStdoutListener(data);
            }
        };
        const listeners = Object.assign(Object.assign({}, options === null || options === void 0 ? void 0 : options.listeners), { stdout: stdOutListener, stderr: stdErrListener });
        const exitCode = yield exec(commandLine, args, Object.assign(Object.assign({}, options), { listeners }));
        //flush any remaining characters
        stdout += stdoutDecoder.end();
        stderr += stderrDecoder.end();
        return {
            exitCode,
            stdout,
            stderr
        };
    });
}
exports.getExecOutput = getExecOutput;
//# sourceMappingURL=exec.js.map

/***/ }),

/***/ 314:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.argStringToArray = exports.ToolRunner = void 0;
const os = __importStar(__nccwpck_require__(857));
const events = __importStar(__nccwpck_require__(434));
const child = __importStar(__nccwpck_require__(317));
const path = __importStar(__nccwpck_require__(928));
const io = __importStar(__nccwpck_require__(145));
const ioUtil = __importStar(__nccwpck_require__(862));
const timers_1 = __nccwpck_require__(557);
/* eslint-disable @typescript-eslint/unbound-method */
const IS_WINDOWS = process.platform === 'win32';
/*
 * Class for running command line tools. Handles quoting and arg parsing in a platform agnostic way.
 */
class ToolRunner extends events.EventEmitter {
    constructor(toolPath, args, options) {
        super();
        if (!toolPath) {
            throw new Error("Parameter 'toolPath' cannot be null or empty.");
        }
        this.toolPath = toolPath;
        this.args = args || [];
        this.options = options || {};
    }
    _debug(message) {
        if (this.options.listeners && this.options.listeners.debug) {
            this.options.listeners.debug(message);
        }
    }
    _getCommandString(options, noPrefix) {
        const toolPath = this._getSpawnFileName();
        const args = this._getSpawnArgs(options);
        let cmd = noPrefix ? '' : '[command]'; // omit prefix when piped to a second tool
        if (IS_WINDOWS) {
            // Windows + cmd file
            if (this._isCmdFile()) {
                cmd += toolPath;
                for (const a of args) {
                    cmd += ` ${a}`;
                }
            }
            // Windows + verbatim
            else if (options.windowsVerbatimArguments) {
                cmd += `"${toolPath}"`;
                for (const a of args) {
                    cmd += ` ${a}`;
                }
            }
            // Windows (regular)
            else {
                cmd += this._windowsQuoteCmdArg(toolPath);
                for (const a of args) {
                    cmd += ` ${this._windowsQuoteCmdArg(a)}`;
                }
            }
        }
        else {
            // OSX/Linux - this can likely be improved with some form of quoting.
            // creating processes on Unix is fundamentally different than Windows.
            // on Unix, execvp() takes an arg array.
            cmd += toolPath;
            for (const a of args) {
                cmd += ` ${a}`;
            }
        }
        return cmd;
    }
    _processLineBuffer(data, strBuffer, onLine) {
        try {
            let s = strBuffer + data.toString();
            let n = s.indexOf(os.EOL);
            while (n > -1) {
                const line = s.substring(0, n);
                onLine(line);
                // the rest of the string ...
                s = s.substring(n + os.EOL.length);
                n = s.indexOf(os.EOL);
            }
            return s;
        }
        catch (err) {
            // streaming lines to console is best effort.  Don't fail a build.
            this._debug(`error processing line. Failed with error ${err}`);
            return '';
        }
    }
    _getSpawnFileName() {
        if (IS_WINDOWS) {
            if (this._isCmdFile()) {
                return process.env['COMSPEC'] || 'cmd.exe';
            }
        }
        return this.toolPath;
    }
    _getSpawnArgs(options) {
        if (IS_WINDOWS) {
            if (this._isCmdFile()) {
                let argline = `/D /S /C "${this._windowsQuoteCmdArg(this.toolPath)}`;
                for (const a of this.args) {
                    argline += ' ';
                    argline += options.windowsVerbatimArguments
                        ? a
                        : this._windowsQuoteCmdArg(a);
                }
                argline += '"';
                return [argline];
            }
        }
        return this.args;
    }
    _endsWith(str, end) {
        return str.endsWith(end);
    }
    _isCmdFile() {
        const upperToolPath = this.toolPath.toUpperCase();
        return (this._endsWith(upperToolPath, '.CMD') ||
            this._endsWith(upperToolPath, '.BAT'));
    }
    _windowsQuoteCmdArg(arg) {
        // for .exe, apply the normal quoting rules that libuv applies
        if (!this._isCmdFile()) {
            return this._uvQuoteCmdArg(arg);
        }
        // otherwise apply quoting rules specific to the cmd.exe command line parser.
        // the libuv rules are generic and are not designed specifically for cmd.exe
        // command line parser.
        //
        // for a detailed description of the cmd.exe command line parser, refer to
        // http://stackoverflow.com/questions/4094699/how-does-the-windows-command-interpreter-cmd-exe-parse-scripts/7970912#7970912
        // need quotes for empty arg
        if (!arg) {
            return '""';
        }
        // determine whether the arg needs to be quoted
        const cmdSpecialChars = [
            ' ',
            '\t',
            '&',
            '(',
            ')',
            '[',
            ']',
            '{',
            '}',
            '^',
            '=',
            ';',
            '!',
            "'",
            '+',
            ',',
            '`',
            '~',
            '|',
            '<',
            '>',
            '"'
        ];
        let needsQuotes = false;
        for (const char of arg) {
            if (cmdSpecialChars.some(x => x === char)) {
                needsQuotes = true;
                break;
            }
        }
        // short-circuit if quotes not needed
        if (!needsQuotes) {
            return arg;
        }
        // the following quoting rules are very similar to the rules that by libuv applies.
        //
        // 1) wrap the string in quotes
        //
        // 2) double-up quotes - i.e. " => ""
        //
        //    this is different from the libuv quoting rules. libuv replaces " with \", which unfortunately
        //    doesn't work well with a cmd.exe command line.
        //
        //    note, replacing " with "" also works well if the arg is passed to a downstream .NET console app.
        //    for example, the command line:
        //          foo.exe "myarg:""my val"""
        //    is parsed by a .NET console app into an arg array:
        //          [ "myarg:\"my val\"" ]
        //    which is the same end result when applying libuv quoting rules. although the actual
        //    command line from libuv quoting rules would look like:
        //          foo.exe "myarg:\"my val\""
        //
        // 3) double-up slashes that precede a quote,
        //    e.g.  hello \world    => "hello \world"
        //          hello\"world    => "hello\\""world"
        //          hello\\"world   => "hello\\\\""world"
        //          hello world\    => "hello world\\"
        //
        //    technically this is not required for a cmd.exe command line, or the batch argument parser.
        //    the reasons for including this as a .cmd quoting rule are:
        //
        //    a) this is optimized for the scenario where the argument is passed from the .cmd file to an
        //       external program. many programs (e.g. .NET console apps) rely on the slash-doubling rule.
        //
        //    b) it's what we've been doing previously (by deferring to node default behavior) and we
        //       haven't heard any complaints about that aspect.
        //
        // note, a weakness of the quoting rules chosen here, is that % is not escaped. in fact, % cannot be
        // escaped when used on the command line directly - even though within a .cmd file % can be escaped
        // by using %%.
        //
        // the saving grace is, on the command line, %var% is left as-is if var is not defined. this contrasts
        // the line parsing rules within a .cmd file, where if var is not defined it is replaced with nothing.
        //
        // one option that was explored was replacing % with ^% - i.e. %var% => ^%var^%. this hack would
        // often work, since it is unlikely that var^ would exist, and the ^ character is removed when the
        // variable is used. the problem, however, is that ^ is not removed when %* is used to pass the args
        // to an external program.
        //
        // an unexplored potential solution for the % escaping problem, is to create a wrapper .cmd file.
        // % can be escaped within a .cmd file.
        let reverse = '"';
        let quoteHit = true;
        for (let i = arg.length; i > 0; i--) {
            // walk the string in reverse
            reverse += arg[i - 1];
            if (quoteHit && arg[i - 1] === '\\') {
                reverse += '\\'; // double the slash
            }
            else if (arg[i - 1] === '"') {
                quoteHit = true;
                reverse += '"'; // double the quote
            }
            else {
                quoteHit = false;
            }
        }
        reverse += '"';
        return reverse
            .split('')
            .reverse()
            .join('');
    }
    _uvQuoteCmdArg(arg) {
        // Tool runner wraps child_process.spawn() and needs to apply the same quoting as
        // Node in certain cases where the undocumented spawn option windowsVerbatimArguments
        // is used.
        //
        // Since this function is a port of quote_cmd_arg from Node 4.x (technically, lib UV,
        // see https://github.com/nodejs/node/blob/v4.x/deps/uv/src/win/process.c for details),
        // pasting copyright notice from Node within this function:
        //
        //      Copyright Joyent, Inc. and other Node contributors. All rights reserved.
        //
        //      Permission is hereby granted, free of charge, to any person obtaining a copy
        //      of this software and associated documentation files (the "Software"), to
        //      deal in the Software without restriction, including without limitation the
        //      rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
        //      sell copies of the Software, and to permit persons to whom the Software is
        //      furnished to do so, subject to the following conditions:
        //
        //      The above copyright notice and this permission notice shall be included in
        //      all copies or substantial portions of the Software.
        //
        //      THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
        //      IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
        //      FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
        //      AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
        //      LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
        //      FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
        //      IN THE SOFTWARE.
        if (!arg) {
            // Need double quotation for empty argument
            return '""';
        }
        if (!arg.includes(' ') && !arg.includes('\t') && !arg.includes('"')) {
            // No quotation needed
            return arg;
        }
        if (!arg.includes('"') && !arg.includes('\\')) {
            // No embedded double quotes or backslashes, so I can just wrap
            // quote marks around the whole thing.
            return `"${arg}"`;
        }
        // Expected input/output:
        //   input : hello"world
        //   output: "hello\"world"
        //   input : hello""world
        //   output: "hello\"\"world"
        //   input : hello\world
        //   output: hello\world
        //   input : hello\\world
        //   output: hello\\world
        //   input : hello\"world
        //   output: "hello\\\"world"
        //   input : hello\\"world
        //   output: "hello\\\\\"world"
        //   input : hello world\
        //   output: "hello world\\" - note the comment in libuv actually reads "hello world\"
        //                             but it appears the comment is wrong, it should be "hello world\\"
        let reverse = '"';
        let quoteHit = true;
        for (let i = arg.length; i > 0; i--) {
            // walk the string in reverse
            reverse += arg[i - 1];
            if (quoteHit && arg[i - 1] === '\\') {
                reverse += '\\';
            }
            else if (arg[i - 1] === '"') {
                quoteHit = true;
                reverse += '\\';
            }
            else {
                quoteHit = false;
            }
        }
        reverse += '"';
        return reverse
            .split('')
            .reverse()
            .join('');
    }
    _cloneExecOptions(options) {
        options = options || {};
        const result = {
            cwd: options.cwd || process.cwd(),
            env: options.env || process.env,
            silent: options.silent || false,
            windowsVerbatimArguments: options.windowsVerbatimArguments || false,
            failOnStdErr: options.failOnStdErr || false,
            ignoreReturnCode: options.ignoreReturnCode || false,
            delay: options.delay || 10000
        };
        result.outStream = options.outStream || process.stdout;
        result.errStream = options.errStream || process.stderr;
        return result;
    }
    _getSpawnOptions(options, toolPath) {
        options = options || {};
        const result = {};
        result.cwd = options.cwd;
        result.env = options.env;
        result['windowsVerbatimArguments'] =
            options.windowsVerbatimArguments || this._isCmdFile();
        if (options.windowsVerbatimArguments) {
            result.argv0 = `"${toolPath}"`;
        }
        return result;
    }
    /**
     * Exec a tool.
     * Output will be streamed to the live console.
     * Returns promise with return code
     *
     * @param     tool     path to tool to exec
     * @param     options  optional exec options.  See ExecOptions
     * @returns   number
     */
    exec() {
        return __awaiter(this, void 0, void 0, function* () {
            // root the tool path if it is unrooted and contains relative pathing
            if (!ioUtil.isRooted(this.toolPath) &&
                (this.toolPath.includes('/') ||
                    (IS_WINDOWS && this.toolPath.includes('\\')))) {
                // prefer options.cwd if it is specified, however options.cwd may also need to be rooted
                this.toolPath = path.resolve(process.cwd(), this.options.cwd || process.cwd(), this.toolPath);
            }
            // if the tool is only a file name, then resolve it from the PATH
            // otherwise verify it exists (add extension on Windows if necessary)
            this.toolPath = yield io.which(this.toolPath, true);
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                this._debug(`exec tool: ${this.toolPath}`);
                this._debug('arguments:');
                for (const arg of this.args) {
                    this._debug(`   ${arg}`);
                }
                const optionsNonNull = this._cloneExecOptions(this.options);
                if (!optionsNonNull.silent && optionsNonNull.outStream) {
                    optionsNonNull.outStream.write(this._getCommandString(optionsNonNull) + os.EOL);
                }
                const state = new ExecState(optionsNonNull, this.toolPath);
                state.on('debug', (message) => {
                    this._debug(message);
                });
                if (this.options.cwd && !(yield ioUtil.exists(this.options.cwd))) {
                    return reject(new Error(`The cwd: ${this.options.cwd} does not exist!`));
                }
                const fileName = this._getSpawnFileName();
                const cp = child.spawn(fileName, this._getSpawnArgs(optionsNonNull), this._getSpawnOptions(this.options, fileName));
                let stdbuffer = '';
                if (cp.stdout) {
                    cp.stdout.on('data', (data) => {
                        if (this.options.listeners && this.options.listeners.stdout) {
                            this.options.listeners.stdout(data);
                        }
                        if (!optionsNonNull.silent && optionsNonNull.outStream) {
                            optionsNonNull.outStream.write(data);
                        }
                        stdbuffer = this._processLineBuffer(data, stdbuffer, (line) => {
                            if (this.options.listeners && this.options.listeners.stdline) {
                                this.options.listeners.stdline(line);
                            }
                        });
                    });
                }
                let errbuffer = '';
                if (cp.stderr) {
                    cp.stderr.on('data', (data) => {
                        state.processStderr = true;
                        if (this.options.listeners && this.options.listeners.stderr) {
                            this.options.listeners.stderr(data);
                        }
                        if (!optionsNonNull.silent &&
                            optionsNonNull.errStream &&
                            optionsNonNull.outStream) {
                            const s = optionsNonNull.failOnStdErr
                                ? optionsNonNull.errStream
                                : optionsNonNull.outStream;
                            s.write(data);
                        }
                        errbuffer = this._processLineBuffer(data, errbuffer, (line) => {
                            if (this.options.listeners && this.options.listeners.errline) {
                                this.options.listeners.errline(line);
                            }
                        });
                    });
                }
                cp.on('error', (err) => {
                    state.processError = err.message;
                    state.processExited = true;
                    state.processClosed = true;
                    state.CheckComplete();
                });
                cp.on('exit', (code) => {
                    state.processExitCode = code;
                    state.processExited = true;
                    this._debug(`Exit code ${code} received from tool '${this.toolPath}'`);
                    state.CheckComplete();
                });
                cp.on('close', (code) => {
                    state.processExitCode = code;
                    state.processExited = true;
                    state.processClosed = true;
                    this._debug(`STDIO streams have closed for tool '${this.toolPath}'`);
                    state.CheckComplete();
                });
                state.on('done', (error, exitCode) => {
                    if (stdbuffer.length > 0) {
                        this.emit('stdline', stdbuffer);
                    }
                    if (errbuffer.length > 0) {
                        this.emit('errline', errbuffer);
                    }
                    cp.removeAllListeners();
                    if (error) {
                        reject(error);
                    }
                    else {
                        resolve(exitCode);
                    }
                });
                if (this.options.input) {
                    if (!cp.stdin) {
                        throw new Error('child process missing stdin');
                    }
                    cp.stdin.end(this.options.input);
                }
            }));
        });
    }
}
exports.ToolRunner = ToolRunner;
/**
 * Convert an arg string to an array of args. Handles escaping
 *
 * @param    argString   string of arguments
 * @returns  string[]    array of arguments
 */
function argStringToArray(argString) {
    const args = [];
    let inQuotes = false;
    let escaped = false;
    let arg = '';
    function append(c) {
        // we only escape double quotes.
        if (escaped && c !== '"') {
            arg += '\\';
        }
        arg += c;
        escaped = false;
    }
    for (let i = 0; i < argString.length; i++) {
        const c = argString.charAt(i);
        if (c === '"') {
            if (!escaped) {
                inQuotes = !inQuotes;
            }
            else {
                append(c);
            }
            continue;
        }
        if (c === '\\' && escaped) {
            append(c);
            continue;
        }
        if (c === '\\' && inQuotes) {
            escaped = true;
            continue;
        }
        if (c === ' ' && !inQuotes) {
            if (arg.length > 0) {
                args.push(arg);
                arg = '';
            }
            continue;
        }
        append(c);
    }
    if (arg.length > 0) {
        args.push(arg.trim());
    }
    return args;
}
exports.argStringToArray = argStringToArray;
class ExecState extends events.EventEmitter {
    constructor(options, toolPath) {
        super();
        this.processClosed = false; // tracks whether the process has exited and stdio is closed
        this.processError = '';
        this.processExitCode = 0;
        this.processExited = false; // tracks whether the process has exited
        this.processStderr = false; // tracks whether stderr was written to
        this.delay = 10000; // 10 seconds
        this.done = false;
        this.timeout = null;
        if (!toolPath) {
            throw new Error('toolPath must not be empty');
        }
        this.options = options;
        this.toolPath = toolPath;
        if (options.delay) {
            this.delay = options.delay;
        }
    }
    CheckComplete() {
        if (this.done) {
            return;
        }
        if (this.processClosed) {
            this._setResult();
        }
        else if (this.processExited) {
            this.timeout = timers_1.setTimeout(ExecState.HandleTimeout, this.delay, this);
        }
    }
    _debug(message) {
        this.emit('debug', message);
    }
    _setResult() {
        // determine whether there is an error
        let error;
        if (this.processExited) {
            if (this.processError) {
                error = new Error(`There was an error when attempting to execute the process '${this.toolPath}'. This may indicate the process failed to start. Error: ${this.processError}`);
            }
            else if (this.processExitCode !== 0 && !this.options.ignoreReturnCode) {
                error = new Error(`The process '${this.toolPath}' failed with exit code ${this.processExitCode}`);
            }
            else if (this.processStderr && this.options.failOnStdErr) {
                error = new Error(`The process '${this.toolPath}' failed because one or more lines were written to the STDERR stream`);
            }
        }
        // clear the timeout
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }
        this.done = true;
        this.emit('done', error, this.processExitCode);
    }
    static HandleTimeout(state) {
        if (state.done) {
            return;
        }
        if (!state.processClosed && state.processExited) {
            const message = `The STDIO streams did not close within ${state.delay /
                1000} seconds of the exit event from process '${state.toolPath}'. This may indicate a child process inherited the STDIO streams and has not yet exited.`;
            state._debug(message);
        }
        state._setResult();
    }
}
//# sourceMappingURL=toolrunner.js.map

/***/ }),

/***/ 862:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var _a;
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getCmdPath = exports.tryGetExecutablePath = exports.isRooted = exports.isDirectory = exports.exists = exports.READONLY = exports.UV_FS_O_EXLOCK = exports.IS_WINDOWS = exports.unlink = exports.symlink = exports.stat = exports.rmdir = exports.rm = exports.rename = exports.readlink = exports.readdir = exports.open = exports.mkdir = exports.lstat = exports.copyFile = exports.chmod = void 0;
const fs = __importStar(__nccwpck_require__(896));
const path = __importStar(__nccwpck_require__(928));
_a = fs.promises
// export const {open} = 'fs'
, exports.chmod = _a.chmod, exports.copyFile = _a.copyFile, exports.lstat = _a.lstat, exports.mkdir = _a.mkdir, exports.open = _a.open, exports.readdir = _a.readdir, exports.readlink = _a.readlink, exports.rename = _a.rename, exports.rm = _a.rm, exports.rmdir = _a.rmdir, exports.stat = _a.stat, exports.symlink = _a.symlink, exports.unlink = _a.unlink;
// export const {open} = 'fs'
exports.IS_WINDOWS = process.platform === 'win32';
// See https://github.com/nodejs/node/blob/d0153aee367422d0858105abec186da4dff0a0c5/deps/uv/include/uv/win.h#L691
exports.UV_FS_O_EXLOCK = 0x10000000;
exports.READONLY = fs.constants.O_RDONLY;
function exists(fsPath) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield exports.stat(fsPath);
        }
        catch (err) {
            if (err.code === 'ENOENT') {
                return false;
            }
            throw err;
        }
        return true;
    });
}
exports.exists = exists;
function isDirectory(fsPath, useStat = false) {
    return __awaiter(this, void 0, void 0, function* () {
        const stats = useStat ? yield exports.stat(fsPath) : yield exports.lstat(fsPath);
        return stats.isDirectory();
    });
}
exports.isDirectory = isDirectory;
/**
 * On OSX/Linux, true if path starts with '/'. On Windows, true for paths like:
 * \, \hello, \\hello\share, C:, and C:\hello (and corresponding alternate separator cases).
 */
function isRooted(p) {
    p = normalizeSeparators(p);
    if (!p) {
        throw new Error('isRooted() parameter "p" cannot be empty');
    }
    if (exports.IS_WINDOWS) {
        return (p.startsWith('\\') || /^[A-Z]:/i.test(p) // e.g. \ or \hello or \\hello
        ); // e.g. C: or C:\hello
    }
    return p.startsWith('/');
}
exports.isRooted = isRooted;
/**
 * Best effort attempt to determine whether a file exists and is executable.
 * @param filePath    file path to check
 * @param extensions  additional file extensions to try
 * @return if file exists and is executable, returns the file path. otherwise empty string.
 */
function tryGetExecutablePath(filePath, extensions) {
    return __awaiter(this, void 0, void 0, function* () {
        let stats = undefined;
        try {
            // test file exists
            stats = yield exports.stat(filePath);
        }
        catch (err) {
            if (err.code !== 'ENOENT') {
                // eslint-disable-next-line no-console
                console.log(`Unexpected error attempting to determine if executable file exists '${filePath}': ${err}`);
            }
        }
        if (stats && stats.isFile()) {
            if (exports.IS_WINDOWS) {
                // on Windows, test for valid extension
                const upperExt = path.extname(filePath).toUpperCase();
                if (extensions.some(validExt => validExt.toUpperCase() === upperExt)) {
                    return filePath;
                }
            }
            else {
                if (isUnixExecutable(stats)) {
                    return filePath;
                }
            }
        }
        // try each extension
        const originalFilePath = filePath;
        for (const extension of extensions) {
            filePath = originalFilePath + extension;
            stats = undefined;
            try {
                stats = yield exports.stat(filePath);
            }
            catch (err) {
                if (err.code !== 'ENOENT') {
                    // eslint-disable-next-line no-console
                    console.log(`Unexpected error attempting to determine if executable file exists '${filePath}': ${err}`);
                }
            }
            if (stats && stats.isFile()) {
                if (exports.IS_WINDOWS) {
                    // preserve the case of the actual file (since an extension was appended)
                    try {
                        const directory = path.dirname(filePath);
                        const upperName = path.basename(filePath).toUpperCase();
                        for (const actualName of yield exports.readdir(directory)) {
                            if (upperName === actualName.toUpperCase()) {
                                filePath = path.join(directory, actualName);
                                break;
                            }
                        }
                    }
                    catch (err) {
                        // eslint-disable-next-line no-console
                        console.log(`Unexpected error attempting to determine the actual case of the file '${filePath}': ${err}`);
                    }
                    return filePath;
                }
                else {
                    if (isUnixExecutable(stats)) {
                        return filePath;
                    }
                }
            }
        }
        return '';
    });
}
exports.tryGetExecutablePath = tryGetExecutablePath;
function normalizeSeparators(p) {
    p = p || '';
    if (exports.IS_WINDOWS) {
        // convert slashes on Windows
        p = p.replace(/\//g, '\\');
        // remove redundant slashes
        return p.replace(/\\\\+/g, '\\');
    }
    // remove redundant slashes
    return p.replace(/\/\/+/g, '/');
}
// on Mac/Linux, test the execute bit
//     R   W  X  R  W X R W X
//   256 128 64 32 16 8 4 2 1
function isUnixExecutable(stats) {
    return ((stats.mode & 1) > 0 ||
        ((stats.mode & 8) > 0 && stats.gid === process.getgid()) ||
        ((stats.mode & 64) > 0 && stats.uid === process.getuid()));
}
// Get the path of cmd.exe in windows
function getCmdPath() {
    var _a;
    return (_a = process.env['COMSPEC']) !== null && _a !== void 0 ? _a : `cmd.exe`;
}
exports.getCmdPath = getCmdPath;
//# sourceMappingURL=io-util.js.map

/***/ }),

/***/ 145:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.findInPath = exports.which = exports.mkdirP = exports.rmRF = exports.mv = exports.cp = void 0;
const assert_1 = __nccwpck_require__(613);
const path = __importStar(__nccwpck_require__(928));
const ioUtil = __importStar(__nccwpck_require__(862));
/**
 * Copies a file or folder.
 * Based off of shelljs - https://github.com/shelljs/shelljs/blob/9237f66c52e5daa40458f94f9565e18e8132f5a6/src/cp.js
 *
 * @param     source    source path
 * @param     dest      destination path
 * @param     options   optional. See CopyOptions.
 */
function cp(source, dest, options = {}) {
    return __awaiter(this, void 0, void 0, function* () {
        const { force, recursive, copySourceDirectory } = readCopyOptions(options);
        const destStat = (yield ioUtil.exists(dest)) ? yield ioUtil.stat(dest) : null;
        // Dest is an existing file, but not forcing
        if (destStat && destStat.isFile() && !force) {
            return;
        }
        // If dest is an existing directory, should copy inside.
        const newDest = destStat && destStat.isDirectory() && copySourceDirectory
            ? path.join(dest, path.basename(source))
            : dest;
        if (!(yield ioUtil.exists(source))) {
            throw new Error(`no such file or directory: ${source}`);
        }
        const sourceStat = yield ioUtil.stat(source);
        if (sourceStat.isDirectory()) {
            if (!recursive) {
                throw new Error(`Failed to copy. ${source} is a directory, but tried to copy without recursive flag.`);
            }
            else {
                yield cpDirRecursive(source, newDest, 0, force);
            }
        }
        else {
            if (path.relative(source, newDest) === '') {
                // a file cannot be copied to itself
                throw new Error(`'${newDest}' and '${source}' are the same file`);
            }
            yield copyFile(source, newDest, force);
        }
    });
}
exports.cp = cp;
/**
 * Moves a path.
 *
 * @param     source    source path
 * @param     dest      destination path
 * @param     options   optional. See MoveOptions.
 */
function mv(source, dest, options = {}) {
    return __awaiter(this, void 0, void 0, function* () {
        if (yield ioUtil.exists(dest)) {
            let destExists = true;
            if (yield ioUtil.isDirectory(dest)) {
                // If dest is directory copy src into dest
                dest = path.join(dest, path.basename(source));
                destExists = yield ioUtil.exists(dest);
            }
            if (destExists) {
                if (options.force == null || options.force) {
                    yield rmRF(dest);
                }
                else {
                    throw new Error('Destination already exists');
                }
            }
        }
        yield mkdirP(path.dirname(dest));
        yield ioUtil.rename(source, dest);
    });
}
exports.mv = mv;
/**
 * Remove a path recursively with force
 *
 * @param inputPath path to remove
 */
function rmRF(inputPath) {
    return __awaiter(this, void 0, void 0, function* () {
        if (ioUtil.IS_WINDOWS) {
            // Check for invalid characters
            // https://docs.microsoft.com/en-us/windows/win32/fileio/naming-a-file
            if (/[*"<>|]/.test(inputPath)) {
                throw new Error('File path must not contain `*`, `"`, `<`, `>` or `|` on Windows');
            }
        }
        try {
            // note if path does not exist, error is silent
            yield ioUtil.rm(inputPath, {
                force: true,
                maxRetries: 3,
                recursive: true,
                retryDelay: 300
            });
        }
        catch (err) {
            throw new Error(`File was unable to be removed ${err}`);
        }
    });
}
exports.rmRF = rmRF;
/**
 * Make a directory.  Creates the full path with folders in between
 * Will throw if it fails
 *
 * @param   fsPath        path to create
 * @returns Promise<void>
 */
function mkdirP(fsPath) {
    return __awaiter(this, void 0, void 0, function* () {
        assert_1.ok(fsPath, 'a path argument must be provided');
        yield ioUtil.mkdir(fsPath, { recursive: true });
    });
}
exports.mkdirP = mkdirP;
/**
 * Returns path of a tool had the tool actually been invoked.  Resolves via paths.
 * If you check and the tool does not exist, it will throw.
 *
 * @param     tool              name of the tool
 * @param     check             whether to check if tool exists
 * @returns   Promise<string>   path to tool
 */
function which(tool, check) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!tool) {
            throw new Error("parameter 'tool' is required");
        }
        // recursive when check=true
        if (check) {
            const result = yield which(tool, false);
            if (!result) {
                if (ioUtil.IS_WINDOWS) {
                    throw new Error(`Unable to locate executable file: ${tool}. Please verify either the file path exists or the file can be found within a directory specified by the PATH environment variable. Also verify the file has a valid extension for an executable file.`);
                }
                else {
                    throw new Error(`Unable to locate executable file: ${tool}. Please verify either the file path exists or the file can be found within a directory specified by the PATH environment variable. Also check the file mode to verify the file is executable.`);
                }
            }
            return result;
        }
        const matches = yield findInPath(tool);
        if (matches && matches.length > 0) {
            return matches[0];
        }
        return '';
    });
}
exports.which = which;
/**
 * Returns a list of all occurrences of the given tool on the system path.
 *
 * @returns   Promise<string[]>  the paths of the tool
 */
function findInPath(tool) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!tool) {
            throw new Error("parameter 'tool' is required");
        }
        // build the list of extensions to try
        const extensions = [];
        if (ioUtil.IS_WINDOWS && process.env['PATHEXT']) {
            for (const extension of process.env['PATHEXT'].split(path.delimiter)) {
                if (extension) {
                    extensions.push(extension);
                }
            }
        }
        // if it's rooted, return it if exists. otherwise return empty.
        if (ioUtil.isRooted(tool)) {
            const filePath = yield ioUtil.tryGetExecutablePath(tool, extensions);
            if (filePath) {
                return [filePath];
            }
            return [];
        }
        // if any path separators, return empty
        if (tool.includes(path.sep)) {
            return [];
        }
        // build the list of directories
        //
        // Note, technically "where" checks the current directory on Windows. From a toolkit perspective,
        // it feels like we should not do this. Checking the current directory seems like more of a use
        // case of a shell, and the which() function exposed by the toolkit should strive for consistency
        // across platforms.
        const directories = [];
        if (process.env.PATH) {
            for (const p of process.env.PATH.split(path.delimiter)) {
                if (p) {
                    directories.push(p);
                }
            }
        }
        // find all matches
        const matches = [];
        for (const directory of directories) {
            const filePath = yield ioUtil.tryGetExecutablePath(path.join(directory, tool), extensions);
            if (filePath) {
                matches.push(filePath);
            }
        }
        return matches;
    });
}
exports.findInPath = findInPath;
function readCopyOptions(options) {
    const force = options.force == null ? true : options.force;
    const recursive = Boolean(options.recursive);
    const copySourceDirectory = options.copySourceDirectory == null
        ? true
        : Boolean(options.copySourceDirectory);
    return { force, recursive, copySourceDirectory };
}
function cpDirRecursive(sourceDir, destDir, currentDepth, force) {
    return __awaiter(this, void 0, void 0, function* () {
        // Ensure there is not a run away recursive copy
        if (currentDepth >= 255)
            return;
        currentDepth++;
        yield mkdirP(destDir);
        const files = yield ioUtil.readdir(sourceDir);
        for (const fileName of files) {
            const srcFile = `${sourceDir}/${fileName}`;
            const destFile = `${destDir}/${fileName}`;
            const srcFileStat = yield ioUtil.lstat(srcFile);
            if (srcFileStat.isDirectory()) {
                // Recurse
                yield cpDirRecursive(srcFile, destFile, currentDepth, force);
            }
            else {
                yield copyFile(srcFile, destFile, force);
            }
        }
        // Change the mode for the newly created directory
        yield ioUtil.chmod(destDir, (yield ioUtil.stat(sourceDir)).mode);
    });
}
// Buffered file copy
function copyFile(srcFile, destFile, force) {
    return __awaiter(this, void 0, void 0, function* () {
        if ((yield ioUtil.lstat(srcFile)).isSymbolicLink()) {
            // unlink/re-link it
            try {
                yield ioUtil.lstat(destFile);
                yield ioUtil.unlink(destFile);
            }
            catch (e) {
                // Try to override file permission
                if (e.code === 'EPERM') {
                    yield ioUtil.chmod(destFile, '0666');
                    yield ioUtil.unlink(destFile);
                }
                // other errors = it doesn't exist, no work to do
            }
            // Copy over symlink
            const symlinkFull = yield ioUtil.readlink(srcFile);
            yield ioUtil.symlink(symlinkFull, destFile, ioUtil.IS_WINDOWS ? 'junction' : null);
        }
        else if (!(yield ioUtil.exists(destFile)) || force) {
            yield ioUtil.copyFile(srcFile, destFile);
        }
    });
}
//# sourceMappingURL=io.js.map

/***/ }),

/***/ 129:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

module.exports = __nccwpck_require__(907);


/***/ }),

/***/ 907:
/***/ ((__unused_webpack_module, exports, __nccwpck_require__) => {

"use strict";


var net = __nccwpck_require__(278);
var tls = __nccwpck_require__(756);
var http = __nccwpck_require__(611);
var https = __nccwpck_require__(692);
var events = __nccwpck_require__(434);
var assert = __nccwpck_require__(613);
var util = __nccwpck_require__(23);


exports.httpOverHttp = httpOverHttp;
exports.httpsOverHttp = httpsOverHttp;
exports.httpOverHttps = httpOverHttps;
exports.httpsOverHttps = httpsOverHttps;


function httpOverHttp(options) {
  var agent = new TunnelingAgent(options);
  agent.request = http.request;
  return agent;
}

function httpsOverHttp(options) {
  var agent = new TunnelingAgent(options);
  agent.request = http.request;
  agent.createSocket = createSecureSocket;
  agent.defaultPort = 443;
  return agent;
}

function httpOverHttps(options) {
  var agent = new TunnelingAgent(options);
  agent.request = https.request;
  return agent;
}

function httpsOverHttps(options) {
  var agent = new TunnelingAgent(options);
  agent.request = https.request;
  agent.createSocket = createSecureSocket;
  agent.defaultPort = 443;
  return agent;
}


function TunnelingAgent(options) {
  var self = this;
  self.options = options || {};
  self.proxyOptions = self.options.proxy || {};
  self.maxSockets = self.options.maxSockets || http.Agent.defaultMaxSockets;
  self.requests = [];
  self.sockets = [];

  self.on('free', function onFree(socket, host, port, localAddress) {
    var options = toOptions(host, port, localAddress);
    for (var i = 0, len = self.requests.length; i < len; ++i) {
      var pending = self.requests[i];
      if (pending.host === options.host && pending.port === options.port) {
        // Detect the request to connect same origin server,
        // reuse the connection.
        self.requests.splice(i, 1);
        pending.request.onSocket(socket);
        return;
      }
    }
    socket.destroy();
    self.removeSocket(socket);
  });
}
util.inherits(TunnelingAgent, events.EventEmitter);

TunnelingAgent.prototype.addRequest = function addRequest(req, host, port, localAddress) {
  var self = this;
  var options = mergeOptions({request: req}, self.options, toOptions(host, port, localAddress));

  if (self.sockets.length >= this.maxSockets) {
    // We are over limit so we'll add it to the queue.
    self.requests.push(options);
    return;
  }

  // If we are under maxSockets create a new one.
  self.createSocket(options, function(socket) {
    socket.on('free', onFree);
    socket.on('close', onCloseOrRemove);
    socket.on('agentRemove', onCloseOrRemove);
    req.onSocket(socket);

    function onFree() {
      self.emit('free', socket, options);
    }

    function onCloseOrRemove(err) {
      self.removeSocket(socket);
      socket.removeListener('free', onFree);
      socket.removeListener('close', onCloseOrRemove);
      socket.removeListener('agentRemove', onCloseOrRemove);
    }
  });
};

TunnelingAgent.prototype.createSocket = function createSocket(options, cb) {
  var self = this;
  var placeholder = {};
  self.sockets.push(placeholder);

  var connectOptions = mergeOptions({}, self.proxyOptions, {
    method: 'CONNECT',
    path: options.host + ':' + options.port,
    agent: false,
    headers: {
      host: options.host + ':' + options.port
    }
  });
  if (options.localAddress) {
    connectOptions.localAddress = options.localAddress;
  }
  if (connectOptions.proxyAuth) {
    connectOptions.headers = connectOptions.headers || {};
    connectOptions.headers['Proxy-Authorization'] = 'Basic ' +
        new Buffer(connectOptions.proxyAuth).toString('base64');
  }

  debug('making CONNECT request');
  var connectReq = self.request(connectOptions);
  connectReq.useChunkedEncodingByDefault = false; // for v0.6
  connectReq.once('response', onResponse); // for v0.6
  connectReq.once('upgrade', onUpgrade);   // for v0.6
  connectReq.once('connect', onConnect);   // for v0.7 or later
  connectReq.once('error', onError);
  connectReq.end();

  function onResponse(res) {
    // Very hacky. This is necessary to avoid http-parser leaks.
    res.upgrade = true;
  }

  function onUpgrade(res, socket, head) {
    // Hacky.
    process.nextTick(function() {
      onConnect(res, socket, head);
    });
  }

  function onConnect(res, socket, head) {
    connectReq.removeAllListeners();
    socket.removeAllListeners();

    if (res.statusCode !== 200) {
      debug('tunneling socket could not be established, statusCode=%d',
        res.statusCode);
      socket.destroy();
      var error = new Error('tunneling socket could not be established, ' +
        'statusCode=' + res.statusCode);
      error.code = 'ECONNRESET';
      options.request.emit('error', error);
      self.removeSocket(placeholder);
      return;
    }
    if (head.length > 0) {
      debug('got illegal response body from proxy');
      socket.destroy();
      var error = new Error('got illegal response body from proxy');
      error.code = 'ECONNRESET';
      options.request.emit('error', error);
      self.removeSocket(placeholder);
      return;
    }
    debug('tunneling connection has established');
    self.sockets[self.sockets.indexOf(placeholder)] = socket;
    return cb(socket);
  }

  function onError(cause) {
    connectReq.removeAllListeners();

    debug('tunneling socket could not be established, cause=%s\n',
          cause.message, cause.stack);
    var error = new Error('tunneling socket could not be established, ' +
                          'cause=' + cause.message);
    error.code = 'ECONNRESET';
    options.request.emit('error', error);
    self.removeSocket(placeholder);
  }
};

TunnelingAgent.prototype.removeSocket = function removeSocket(socket) {
  var pos = this.sockets.indexOf(socket)
  if (pos === -1) {
    return;
  }
  this.sockets.splice(pos, 1);

  var pending = this.requests.shift();
  if (pending) {
    // If we have pending requests and a socket gets closed a new one
    // needs to be created to take over in the pool for the one that closed.
    this.createSocket(pending, function(socket) {
      pending.request.onSocket(socket);
    });
  }
};

function createSecureSocket(options, cb) {
  var self = this;
  TunnelingAgent.prototype.createSocket.call(self, options, function(socket) {
    var hostHeader = options.request.getHeader('host');
    var tlsOptions = mergeOptions({}, self.options, {
      socket: socket,
      servername: hostHeader ? hostHeader.replace(/:.*$/, '') : options.host
    });

    // 0 is dummy port for v0.6
    var secureSocket = tls.connect(0, tlsOptions);
    self.sockets[self.sockets.indexOf(socket)] = secureSocket;
    cb(secureSocket);
  });
}


function toOptions(host, port, localAddress) {
  if (typeof host === 'string') { // since v0.10
    return {
      host: host,
      port: port,
      localAddress: localAddress
    };
  }
  return host; // for v0.11 or later
}

function mergeOptions(target) {
  for (var i = 1, len = arguments.length; i < len; ++i) {
    var overrides = arguments[i];
    if (typeof overrides === 'object') {
      var keys = Object.keys(overrides);
      for (var j = 0, keyLen = keys.length; j < keyLen; ++j) {
        var k = keys[j];
        if (overrides[k] !== undefined) {
          target[k] = overrides[k];
        }
      }
    }
  }
  return target;
}


var debug;
if (process.env.NODE_DEBUG && /\btunnel\b/.test(process.env.NODE_DEBUG)) {
  debug = function() {
    var args = Array.prototype.slice.call(arguments);
    if (typeof args[0] === 'string') {
      args[0] = 'TUNNEL: ' + args[0];
    } else {
      args.unshift('TUNNEL:');
    }
    console.error.apply(console, args);
  }
} else {
  debug = function() {};
}
exports.debug = debug; // for test


/***/ }),

/***/ 53:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {

"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.Task = void 0;
const core = __importStar(__nccwpck_require__(255));
const submit_signing_request_core_1 = __nccwpck_require__(590);
const version_1 = __nccwpck_require__(908);
// output variables
// signing-request-id - the id of the newly created signing request
// signing-request-web-url - the url of the signing request in SignPath
// signed-artifact-download-url - the url of the signed artifact to retrieve via the connector
// adapts the CI system independent workflow to GitHub Actions
class Task {
    helperInputOutput;
    config;
    userAgent;
    constructor(helperInputOutput, config = new submit_signing_request_core_1.Config()) {
        this.helperInputOutput = helperInputOutput;
        this.config = config;
        this.userAgent = `SignPath.SubmitSigningRequestGitHubAction/${version_1.taskVersion}(NodeJS/${process.version}; ${process.platform} ${process.arch})`;
    }
    async run() {
        try {
            const workflow = new submit_signing_request_core_1.SubmitSigningRequestWorkflow(this.buildOptions(), this.createCiSystem(), this.config);
            await workflow.run();
        }
        catch (err) {
            core.debug(err?.stack || 'no stack trace available');
            core.setFailed(err.message);
        }
    }
    buildOptions() {
        return {
            connectorUrl: this.helperInputOutput.signPathConnectorUrl,
            organizationId: this.helperInputOutput.organizationId,
            apiToken: this.helperInputOutput.signPathApiToken,
            userAgent: this.userAgent,
            payload: this.buildSigningRequestPayload(),
            artifactIdOrName: this.helperInputOutput.githubArtifactId,
            serviceUnavailableTimeoutInSeconds: this.helperInputOutput.serviceUnavailableTimeoutInSeconds,
            waitForCompletion: this.helperInputOutput.waitForCompletion,
            waitForCompletionTimeoutInSeconds: this.helperInputOutput.waitForCompletionTimeoutInSeconds,
            outputArtifactDirectory: this.helperInputOutput.outputArtifactDirectory,
            downloadSignedArtifactTimeoutInSeconds: this.helperInputOutput.downloadSignedArtifactTimeoutInSeconds,
            skipDecompress: this.helperInputOutput.skipDecompress,
            workingDirectory: process.env.GITHUB_WORKSPACE,
            tempDirectory: process.env.RUNNER_TEMP
        };
    }
    buildSigningRequestPayload() {
        return {
            artifactId: this.helperInputOutput.githubArtifactId,
            gitHubWorkflowRunId: process.env.GITHUB_RUN_ID,
            gitHubRepository: process.env.GITHUB_REPOSITORY,
            gitHubToken: this.helperInputOutput.gitHubToken,
            signPathProjectSlug: this.helperInputOutput.projectSlug,
            signPathSigningPolicySlug: this.helperInputOutput.signingPolicySlug,
            signPathArtifactConfigurationSlug: this.helperInputOutput.artifactConfigurationSlug,
            parameters: this.helperInputOutput.parameters
        };
    }
    createCiSystem() {
        return {
            logger: {
                debug: message => core.debug(message),
                info: message => core.info(message),
                warning: message => core.warning(message),
                error: message => core.error(message),
                startGroup: name => core.startGroup(name),
                endGroup: () => core.endGroup()
            },
            setOutputs: outputs => {
                this.helperInputOutput.setSigningRequestId(outputs.signingRequestId);
                this.helperInputOutput.setSigningRequestWebUrl(outputs.signingRequestWebUrl);
                this.helperInputOutput.setSignedArtifactDownloadUrl(outputs.signedArtifactDownloadUrl);
            }
        };
    }
}
exports.Task = Task;


/***/ }),

/***/ 908:
/***/ ((__unused_webpack_module, exports) => {

"use strict";

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.taskVersion = void 0;
const taskVersion = '3.0.0';
exports.taskVersion = taskVersion;


/***/ }),

/***/ 613:
/***/ ((module) => {

"use strict";
module.exports = require("assert");

/***/ }),

/***/ 317:
/***/ ((module) => {

"use strict";
module.exports = require("child_process");

/***/ }),

/***/ 982:
/***/ ((module) => {

"use strict";
module.exports = require("crypto");

/***/ }),

/***/ 434:
/***/ ((module) => {

"use strict";
module.exports = require("events");

/***/ }),

/***/ 896:
/***/ ((module) => {

"use strict";
module.exports = require("fs");

/***/ }),

/***/ 611:
/***/ ((module) => {

"use strict";
module.exports = require("http");

/***/ }),

/***/ 692:
/***/ ((module) => {

"use strict";
module.exports = require("https");

/***/ }),

/***/ 278:
/***/ ((module) => {

"use strict";
module.exports = require("net");

/***/ }),

/***/ 857:
/***/ ((module) => {

"use strict";
module.exports = require("os");

/***/ }),

/***/ 928:
/***/ ((module) => {

"use strict";
module.exports = require("path");

/***/ }),

/***/ 203:
/***/ ((module) => {

"use strict";
module.exports = require("stream");

/***/ }),

/***/ 786:
/***/ ((module) => {

"use strict";
module.exports = require("stream/promises");

/***/ }),

/***/ 193:
/***/ ((module) => {

"use strict";
module.exports = require("string_decoder");

/***/ }),

/***/ 557:
/***/ ((module) => {

"use strict";
module.exports = require("timers");

/***/ }),

/***/ 756:
/***/ ((module) => {

"use strict";
module.exports = require("tls");

/***/ }),

/***/ 23:
/***/ ((module) => {

"use strict";
module.exports = require("util");

/***/ }),

/***/ 106:
/***/ ((module) => {

"use strict";
module.exports = require("zlib");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId].call(module.exports, module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/asset-relocator-loader */
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be in strict mode.
(() => {
"use strict";
var exports = __webpack_exports__;

Object.defineProperty(exports, "__esModule", ({ value: true }));
const submit_signing_request_core_1 = __nccwpck_require__(590);
const task_1 = __nccwpck_require__(53);
const helper_input_output_1 = __nccwpck_require__(754);
const helperInputOutput = new helper_input_output_1.HelperInputOutput();
const config = new submit_signing_request_core_1.Config();
const task = new task_1.Task(helperInputOutput, config);
task.run();

})();

module.exports = __webpack_exports__;
/******/ })()
;